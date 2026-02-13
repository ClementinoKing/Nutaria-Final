import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { ArrowLeft, Download } from 'lucide-react'

interface SupplyDetailRow {
  id: number
  doc_no?: string | null
  supplier_id?: number | null
  received_at?: string | null
}

interface SupplyLineRow {
  accepted_qty: number
  unit_price?: number | null
}

interface SupplyPaymentRow {
  id: number
  amount: number
  paid_at: string
  reference?: string | null
  proof_storage_path?: string | null
  proof_name?: string | null
  proof_type?: string | null
  proof_source?: 'URL' | 'FILE_PATH' | 'STORAGE' | 'MANUAL' | null
  recorded_by?: string | null
  updated_by?: string | null
  updated_at?: string | null
  created_at?: string | null
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function getProofSourceLabel(value: SupplyPaymentRow['proof_source']): string {
  if (value === 'URL') return 'URL'
  if (value === 'FILE_PATH') return 'File path'
  if (value === 'STORAGE') return 'Storage'
  if (value === 'MANUAL') return 'Manual'
  return '—'
}

function PaymentDetail() {
  const navigate = useNavigate()
  const { supplyId: supplyIdParam } = useParams()
  const supplyId = Number.parseInt(supplyIdParam ?? '', 10)

  const [loading, setLoading] = useState(true)
  const [supply, setSupply] = useState<SupplyDetailRow | null>(null)
  const [supplierName, setSupplierName] = useState<string>('—')
  const [payments, setPayments] = useState<SupplyPaymentRow[]>([])
  const [expectedTotal, setExpectedTotal] = useState<number>(0)
  const [openingProofId, setOpeningProofId] = useState<number | null>(null)
  const [userNameByAuthId, setUserNameByAuthId] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    if (!Number.isFinite(supplyId)) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [supplyRes, linesRes, paymentsRes] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, doc_no, supplier_id, received_at')
          .eq('id', supplyId)
          .maybeSingle(),
        supabase
          .from('supply_lines')
          .select('accepted_qty, unit_price')
          .eq('supply_id', supplyId),
        supabase
          .from('supply_payments')
          .select(
            'id, amount, paid_at, reference, proof_storage_path, proof_name, proof_type, proof_source, recorded_by, updated_by, updated_at, created_at'
          )
          .eq('supply_id', supplyId)
          .order('paid_at', { ascending: false }),
      ])

      if (supplyRes.error) throw supplyRes.error
      if (linesRes.error) throw linesRes.error
      if (paymentsRes.error) throw paymentsRes.error

      const supplyRow = (supplyRes.data as SupplyDetailRow | null) ?? null
      const paymentRows = (paymentsRes.data ?? []) as SupplyPaymentRow[]
      setSupply(supplyRow)
      setPayments(paymentRows)

      const lines = (linesRes.data ?? []) as SupplyLineRow[]
      const totalExpected = lines.reduce((sum, line) => {
        const qty = Number(line.accepted_qty) || 0
        const price = Number(line.unit_price ?? 0) || 0
        return sum + qty * price
      }, 0)
      setExpectedTotal(totalExpected)

      if (supplyRow?.supplier_id) {
        const { data: supplierRow } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', supplyRow.supplier_id)
          .maybeSingle()
        setSupplierName(String((supplierRow as any)?.name ?? '—'))
      } else {
        setSupplierName('—')
      }

      const userIds = Array.from(
        new Set(
          paymentRows
            .flatMap((row) => [row.recorded_by, row.updated_by])
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
        )
      )
      if (userIds.length === 0) {
        setUserNameByAuthId({})
      } else {
        const { data: profilesData } = await supabase
          .from('user_profiles')
          .select('auth_user_id, full_name, email')
          .in('auth_user_id', userIds)

        const nextMap: Record<string, string> = {}
        ;(profilesData ?? []).forEach((profile: any) => {
          if (!profile?.auth_user_id) return
          nextMap[String(profile.auth_user_id)] = String(
            profile.full_name || profile.email || profile.auth_user_id
          )
        })
        setUserNameByAuthId(nextMap)
      }
    } catch (error) {
      console.error('Error loading payment detail', error)
      toast.error('Failed to load payment details.')
    } finally {
      setLoading(false)
    }
  }, [supplyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalPaid = useMemo(
    () => payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    [payments]
  )
  const balance = Math.max(0, expectedTotal - totalPaid)

  const runningBalanceByPaymentId = useMemo(() => {
    const balances = new Map<number, number>()
    const ascending = [...payments].sort((a, b) => {
      const tA = new Date(a.paid_at).getTime()
      const tB = new Date(b.paid_at).getTime()
      if (tA === tB) return a.id - b.id
      return tA - tB
    })
    let outstanding = expectedTotal
    ascending.forEach((payment) => {
      outstanding -= Number(payment.amount) || 0
      balances.set(payment.id, outstanding)
    })
    return balances
  }, [expectedTotal, payments])

  const handleOpenProof = useCallback(async (paymentId: number, proofReference: string | null | undefined) => {
    if (!proofReference) return
    setOpeningProofId(paymentId)
    try {
      const trimmedReference = proofReference.trim()
      if (/^https?:\/\//i.test(trimmedReference)) {
        window.open(trimmedReference, '_blank', 'noopener,noreferrer')
        return
      }
      if (!trimmedReference.startsWith('payments/')) {
        toast.info(`Proof reference: ${trimmedReference}`)
        return
      }

      const { data, error } = await supabase.storage.from('documents').download(trimmedReference)
      if (error || !data) throw error ?? new Error('Proof file not found')
      const objectUrl = URL.createObjectURL(data)
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (error) {
      console.error('Failed to open payment proof', error)
      toast.error('Failed to open payment proof.')
    } finally {
      setOpeningProofId(null)
    }
  }, [])

  const handleExportPdf = useCallback(async () => {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 10
    const oliveDark: [number, number, number] = [54, 83, 20]
    const oliveLight: [number, number, number] = [231, 236, 225]
    const textDark: [number, number, number] = [30, 41, 26]
    const textMuted: [number, number, number] = [97, 113, 88]
    const lineColor: [number, number, number] = [209, 219, 201]
    let y = margin

    const drawLogo = async () => {
      const tryPaths = ['/img/logos/Nutaria_logo_alt.svg', '/img/logos/Nutaria_logo.svg']
      for (const path of tryPaths) {
        try {
          const res = await fetch(path)
          if (!res.ok) continue
          const blob = await res.blob()
          const img = new Image()
          img.src = URL.createObjectURL(blob)
          const loaded = await new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
          })
          if (!loaded) {
            URL.revokeObjectURL(img.src)
            continue
          }
          const canvas = document.createElement('canvas')
          canvas.width = img.width || 320
          canvas.height = img.height || 100
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(img.src)
            continue
          }
          ctx.drawImage(img, 0, 0)
          const logoData = canvas.toDataURL('image/png')
          URL.revokeObjectURL(img.src)
          return logoData
        } catch {
          // Ignore and try fallback logo path
        }
      }
      return null
    }

    doc.setFillColor(oliveLight[0], oliveLight[1], oliveLight[2])
    doc.roundedRect(margin, y, pageWidth - margin * 2, 30, 3, 3, 'F')
    const logoData = await drawLogo()
    if (logoData) {
      doc.addImage(logoData, 'PNG', margin + 4, y + 6, 30, 12)
    }
    doc.setTextColor(oliveDark[0], oliveDark[1], oliveDark[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('PAYMENT TRAIL REPORT', margin + 38, y + 11)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
    doc.text('Nutaria Supply & Quality System', margin + 38, y + 17)
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, pageWidth - margin - 2, y + 11, {
      align: 'right',
    })
    doc.text(`Supply: ${supply?.doc_no ?? `#${supplyId}`}`, pageWidth - margin - 2, y + 17, { align: 'right' })
    doc.text(`Supplier: ${supplierName}`, pageWidth - margin - 2, y + 23, { align: 'right' })
    y += 36

    const summaryWidth = (pageWidth - margin * 2 - 6) / 3
    const summaryItems = [
      ['Total Expected', formatCurrency(expectedTotal)],
      ['Total Paid', formatCurrency(totalPaid)],
      ['Outstanding', formatCurrency(balance)],
    ] as const
    summaryItems.forEach(([label, value], idx) => {
      const x = margin + idx * (summaryWidth + 3)
      doc.setFillColor(245, 247, 242)
      doc.roundedRect(x, y, summaryWidth, 18, 2, 2, 'F')
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.setFontSize(8)
      doc.text(label, x + 3, y + 6)
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(value, x + 3, y + 13)
      doc.setFont('helvetica', 'normal')
    })
    y += 24

    const columns = [
      { key: 'paidAt', label: 'Paid At', width: 23, align: 'left' as const },
      { key: 'amount', label: 'Amount', width: 20, align: 'right' as const },
      { key: 'balance', label: 'Run Bal', width: 20, align: 'right' as const },
      { key: 'reference', label: 'Reference', width: 30, align: 'left' as const },
      { key: 'proof', label: 'Proof', width: 30, align: 'left' as const },
      { key: 'source', label: 'Source', width: 18, align: 'left' as const },
      { key: 'recordedBy', label: 'Recorded By', width: 35, align: 'left' as const },
    ]

    const drawTableHeader = () => {
      doc.setFillColor(oliveDark[0], oliveDark[1], oliveDark[2])
      doc.rect(margin, y, pageWidth - margin * 2, 8, 'F')
      let x = margin
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      columns.forEach((col) => {
        const textX = col.align === 'right' ? x + col.width - 1.5 : x + 1.5
        doc.text(col.label, textX, y + 5.3, { align: col.align === 'right' ? 'right' : 'left' })
        x += col.width
      })
      y += 8
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(textDark[0], textDark[1], textDark[2])
    }

    const orderedPayments = [...payments].sort((a, b) => {
      const tA = new Date(a.paid_at).getTime()
      const tB = new Date(b.paid_at).getTime()
      if (tA === tB) return a.id - b.id
      return tA - tB
    })

    drawTableHeader()

    orderedPayments.forEach((payment, index) => {
      const values = {
        paidAt: formatDateTime(payment.paid_at),
        amount: formatCurrency(Number(payment.amount) || 0),
        balance: formatCurrency(Number(runningBalanceByPaymentId.get(payment.id) ?? expectedTotal)),
        reference: payment.reference || '-',
        proof: payment.proof_name || payment.proof_storage_path || '-',
        source: getProofSourceLabel(payment.proof_source),
        recordedBy: payment.recorded_by ? userNameByAuthId[payment.recorded_by] ?? payment.recorded_by : '-',
      }

      const wrapped = columns.map((col) =>
        doc.splitTextToSize(String(values[col.key as keyof typeof values]), col.width - 3).slice(0, 3)
      )
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * 4 + 4

      if (y + rowHeight > pageHeight - margin - 8) {
        doc.addPage()
        y = margin
        drawTableHeader()
      }

      if (index % 2 === 0) {
        doc.setFillColor(250, 251, 248)
        doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'F')
      }

      doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2])
      doc.rect(margin, y, pageWidth - margin * 2, rowHeight)

      let x = margin
      columns.forEach((col, colIndex) => {
        if (colIndex > 0) {
          doc.line(x, y, x, y + rowHeight)
        }
        const textX = col.align === 'right' ? x + col.width - 1.5 : x + 1.5
        doc.setFontSize(7.5)
        doc.text(wrapped[colIndex], textX, y + 4.3, {
          align: col.align === 'right' ? 'right' : 'left',
          baseline: 'top',
        })
        x += col.width
      })

      y += rowHeight
    })

    const pageCount = doc.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page)
      doc.setFontSize(7)
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2])
      doc.text('Generated by Nutaria Supply & Quality System', margin, pageHeight - 4)
      doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 4, { align: 'right' })
    }

    doc.save(`payment-trail-${supply?.doc_no ?? supplyId}.pdf`)
  }, [balance, expectedTotal, payments, runningBalanceByPaymentId, supplierName, supply?.doc_no, supplyId, totalPaid, userNameByAuthId])

  if (loading) {
    return (
      <PageLayout title="Payment Details" activeItem="payments" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading payment details..." />
      </PageLayout>
    )
  }

  if (!Number.isFinite(supplyId) || !supply) {
    return (
      <PageLayout
        title="Payment Details"
        activeItem="payments"
        leadingActions={
          <Button size="icon" variant="outline" onClick={() => navigate('/payments')} aria-label="Back to Payments">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardContent className="py-6 space-y-3">
            <p className="text-sm text-text-dark/70">Payment record not found.</p>
            <Button variant="outline" onClick={() => navigate('/payments')}>
              Back to Payments
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={`Payment Details · ${supply.doc_no ?? `#${supply.id}`}`}
      activeItem="payments"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8 space-y-6"
      leadingActions={
        <Button size="icon" variant="outline" onClick={() => navigate('/payments')} aria-label="Back to Payments">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <Button variant="outline" onClick={handleExportPdf}>
          <Download className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total expected</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{formatCurrency(expectedTotal)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total paid</CardDescription>
            <CardTitle className="text-2xl font-semibold text-green-700">{formatCurrency(totalPaid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Outstanding balance</CardDescription>
            <CardTitle className="text-2xl font-semibold text-amber-700">{formatCurrency(balance)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Supply Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <p className="text-text-dark/60">Supply</p>
            <p className="font-semibold text-text-dark">{supply.doc_no ?? `#${supply.id}`}</p>
          </div>
          <div>
            <p className="text-text-dark/60">Supplier</p>
            <p className="font-semibold text-text-dark">{supplierName}</p>
          </div>
          <div>
            <p className="text-text-dark/60">Received</p>
            <p className="font-semibold text-text-dark">{formatDateTime(supply.received_at)}</p>
          </div>
          <div>
            <p className="text-text-dark/60">Payments count</p>
            <p className="font-semibold text-text-dark">{payments.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Payment Trail</CardTitle>
          <CardDescription>Chronological history of all recorded payments for this supply.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-olive-light/40">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-olive-light/40 bg-olive-light/20 text-text-dark">
                <tr>
                  <th className="px-4 py-3 font-semibold">Paid at</th>
                  <th className="px-4 py-3 font-semibold text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold text-right">Running balance</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Proof</th>
                  <th className="px-4 py-3 font-semibold">Proof source</th>
                  <th className="px-4 py-3 font-semibold">Recorded by</th>
                  <th className="px-4 py-3 font-semibold">Recorded at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-light/30">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-text-dark/60">
                      No payments recorded for this supply.
                    </td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-olive-light/10">
                      <td className="px-4 py-3 text-text-dark/80">{formatDateTime(payment.paid_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">
                        {formatCurrency(Number(payment.amount) || 0)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-dark/80">
                        {formatCurrency(Number(runningBalanceByPaymentId.get(payment.id) ?? expectedTotal))}
                      </td>
                      <td className="px-4 py-3 text-text-dark/70">{payment.reference || '—'}</td>
                      <td className="px-4 py-3 text-text-dark/70">
                        {payment.proof_storage_path ? (
                          <div className="space-y-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-olive-light/60"
                              disabled={openingProofId === payment.id}
                              onClick={() => handleOpenProof(payment.id, payment.proof_storage_path)}
                            >
                              {openingProofId === payment.id ? 'Opening...' : 'View'}
                            </Button>
                            {payment.proof_name ? <p className="text-xs text-text-dark/60">{payment.proof_name}</p> : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-dark/70">{getProofSourceLabel(payment.proof_source)}</td>
                      <td className="px-4 py-3 text-text-dark/70">
                        {payment.recorded_by ? userNameByAuthId[payment.recorded_by] ?? payment.recorded_by : '—'}
                      </td>
                      <td className="px-4 py-3 text-text-dark/60">{formatDateTime(payment.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default PaymentDetail
