import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import PageLayout from '@/components/layout/PageLayout'
import { Plus, Banknote, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { useSuppliers } from '@/hooks/useSuppliers'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface Supply {
  id: number
  doc_no?: string | null
  supplier_id?: number | null
  received_at?: string | null
  [key: string]: unknown
}

interface SupplyLine {
  id: number
  supply_id: number
  product_id: number
  accepted_qty: number
  unit_price?: number | null
  [key: string]: unknown
}

interface SupplyPayment {
  id: number
  supply_id: number
  amount: number
  paid_at: string
  reference?: string | null
  created_at?: string
  [key: string]: unknown
}

interface SupplyDocument {
  supply_id: number
  document_type_code: string
  value?: string | null
  [key: string]: unknown
}

interface SupplyWithTotals extends Supply {
  supplier_name: string
  total_expected: number
  total_paid: number
  balance: number
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
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

function Payments() {
  const navigate = useNavigate()
  const { suppliers: supplierOptions } = useSuppliers({ pageSize: 500 })
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([])
  const [supplyDocuments, setSupplyDocuments] = useState<SupplyDocument[]>([])
  const [payments, setPayments] = useState<SupplyPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    supply_id: '',
    amount: '',
    paid_at: new Date().toISOString().slice(0, 10),
    reference: '',
  })
  const [lockedSupplyId, setLockedSupplyId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  type TabId = 'supplies' | 'recent'
  const [activeTab, setActiveTab] = useState<TabId>('supplies')
  const suppliesPageSize = 10
  const [suppliesPage, setSuppliesPage] = useState(1)
  const recentPageSize = 10
  const [recentPage, setRecentPage] = useState(1)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [suppliesRes, linesRes, docsRes, paymentsRes] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, doc_no, supplier_id, received_at')
          .order('received_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from('supply_lines').select('id, supply_id, product_id, accepted_qty, unit_price'),
        supabase
          .from('supply_documents')
          .select('supply_id, document_type_code, value')
          .eq('document_type_code', 'INVOICE'),
        supabase
          .from('supply_payments')
          .select('id, supply_id, amount, paid_at, reference, created_at')
          .order('paid_at', { ascending: false }),
      ])

      if (suppliesRes.error) throw suppliesRes.error
      if (linesRes.error) throw linesRes.error
      if (docsRes.error) throw docsRes.error
      if (paymentsRes.error) throw paymentsRes.error

      setSupplies((suppliesRes.data ?? []) as Supply[])
      setSupplyLines((linesRes.data ?? []) as SupplyLine[])
      setSupplyDocuments((docsRes.data ?? []) as SupplyDocument[])
      setPayments((paymentsRes.data ?? []) as SupplyPayment[])
    } catch (e) {
      console.error('Error loading payments data', e)
      toast.error('Failed to load supplies and payments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setSuppliesPage(1)
  }, [searchTerm])

  const supplierList = useMemo(() => (Array.isArray(supplierOptions) ? supplierOptions : []), [supplierOptions])
  const supplierLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    supplierList.forEach((s) => {
      const id = typeof s?.id === 'number' ? s.id : Number(s?.id)
      if (Number.isFinite(id)) map.set(id, String(s.name ?? ''))
    })
    return map
  }, [supplierList])

  const suppliesWithTotals = useMemo((): SupplyWithTotals[] => {
    const paidBySupply = new Map<number, number>()
    payments.forEach((p) => {
      paidBySupply.set(p.supply_id, (paidBySupply.get(p.supply_id) ?? 0) + Number(p.amount))
    })

    const expectedBySupply = new Map<number, number>()
    supplyLines.forEach((line) => {
      const price = line.unit_price != null ? Number(line.unit_price) : 0
      const qty = Number(line.accepted_qty) || 0
      const lineTotal = price * qty
      expectedBySupply.set(line.supply_id, (expectedBySupply.get(line.supply_id) ?? 0) + lineTotal)
    })

    return supplies.map((s) => {
      const expected = expectedBySupply.get(s.id) ?? 0
      const paid = paidBySupply.get(s.id) ?? 0
      return {
        ...s,
        supplier_name: supplierLabelMap.get(s.supplier_id as number) ?? '—',
        total_expected: expected,
        total_paid: paid,
        balance: expected - paid,
      }
    })
  }, [supplies, supplyLines, payments, supplierLabelMap])

  const filteredSupplies = useMemo(() => {
    if (!searchTerm.trim()) return suppliesWithTotals
    const term = searchTerm.toLowerCase()
    return suppliesWithTotals.filter(
      (s) =>
        String(s.doc_no ?? '').toLowerCase().includes(term) ||
        (s.supplier_name ?? '').toLowerCase().includes(term)
    )
  }, [suppliesWithTotals, searchTerm])

  const suppliesTotalPages = Math.max(1, Math.ceil(filteredSupplies.length / suppliesPageSize))
  const paginatedSupplies = useMemo(() => {
    const start = (suppliesPage - 1) * suppliesPageSize
    return filteredSupplies.slice(start, start + suppliesPageSize)
  }, [filteredSupplies, suppliesPage, suppliesPageSize])

  useEffect(() => {
    if (suppliesPage > suppliesTotalPages && suppliesTotalPages >= 1) {
      setSuppliesPage(suppliesTotalPages)
    }
  }, [suppliesPage, suppliesTotalPages])

  const totalExpected = useMemo(
    () => filteredSupplies.reduce((sum, s) => sum + s.total_expected, 0),
    [filteredSupplies]
  )
  const totalPaid = useMemo(
    () => filteredSupplies.reduce((sum, s) => sum + s.total_paid, 0),
    [filteredSupplies]
  )
  const totalBalance = useMemo(
    () => filteredSupplies.reduce((sum, s) => sum + s.balance, 0),
    [filteredSupplies]
  )

  const supplySelectOptions = useMemo(
    () =>
      suppliesWithTotals.map((s) => ({
        value: String(s.id),
        label: `${s.doc_no ?? s.id} · ${s.supplier_name}`,
      })),
    [suppliesWithTotals]
  )

  const getSupplyInvoiceReference = useCallback(
    (supplyId: string): string => {
      if (!supplyId) return ''
      const supplyIdNum = Number(supplyId)
      if (!Number.isFinite(supplyIdNum)) return ''
      const invoiceDoc = supplyDocuments.find(
        (doc) => Number(doc.supply_id) === supplyIdNum && doc.document_type_code === 'INVOICE',
      )
      return String(invoiceDoc?.value ?? '').trim()
    },
    [supplyDocuments],
  )

  const handleOpenPaymentModal = () => {
    setLockedSupplyId(null)
    setPaymentForm({
      supply_id: '',
      amount: '',
      paid_at: new Date().toISOString().slice(0, 10),
      reference: '',
    })
    setPaymentModalOpen(true)
  }

  const handleOpenPaymentModalForSupply = (supplyId: number) => {
    const supplyIdText = String(supplyId)
    setLockedSupplyId(supplyIdText)
    setPaymentForm({
      supply_id: supplyIdText,
      amount: '',
      paid_at: new Date().toISOString().slice(0, 10),
      reference: getSupplyInvoiceReference(supplyIdText),
    })
    setPaymentModalOpen(true)
  }

  const handleClosePaymentModal = () => {
    setPaymentModalOpen(false)
    setLockedSupplyId(null)
  }

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const supplyId = paymentForm.supply_id ? parseInt(paymentForm.supply_id, 10) : null
    const amount = parseFloat(paymentForm.amount)
    if (!supplyId || !Number.isFinite(supplyId)) {
      toast.error('Select a supply.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount.')
      return
    }
    const maxAllowed = selectedSupplyOutstanding
    if (maxAllowed != null && amount > maxAllowed) {
      toast.error(`Amount cannot exceed the outstanding balance (${formatCurrency(maxAllowed)}).`)
      return
    }
    setSubmitting(true)
    try {
      const { error } = await supabase.from('supply_payments').insert({
        supply_id: supplyId,
        amount,
        paid_at: new Date(paymentForm.paid_at).toISOString(),
        reference: paymentForm.reference?.trim() || null,
      })
      if (error) throw error
      toast.success('Payment recorded.')
      handleClosePaymentModal()
      loadData()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save payment.')
    } finally {
      setSubmitting(false)
    }
  }

  const recentPayments = useMemo(() => payments, [payments])
  const recentTotalPages = Math.max(1, Math.ceil(recentPayments.length / recentPageSize))
  const paginatedRecentPayments = useMemo(() => {
    const start = (recentPage - 1) * recentPageSize
    return recentPayments.slice(start, start + recentPageSize)
  }, [recentPayments, recentPage, recentPageSize])

  const getSupplyDocNo = (supplyId: number) => supplies.find((s) => s.id === supplyId)?.doc_no ?? `#${supplyId}`

  const selectedSupplyOutstanding = useMemo(() => {
    if (!paymentForm.supply_id) return null
    const supply = suppliesWithTotals.find((s) => String(s.id) === paymentForm.supply_id)
    if (!supply) return null
    return Math.max(0, supply.balance)
  }, [paymentForm.supply_id, suppliesWithTotals])

  if (loading) {
    return (
      <PageLayout title="Payments" activeItem="payments" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading payments..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Payments"
      activeItem="payments"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenPaymentModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add payment
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-olive-light/30">
            <CardHeader className="pb-2">
              <CardDescription>Total expected (filtered)</CardDescription>
              <CardTitle className="text-2xl font-semibold text-text-dark">
                {formatCurrency(totalExpected)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/30">
            <CardHeader className="pb-2">
              <CardDescription>Total paid (filtered)</CardDescription>
              <CardTitle className="text-2xl font-semibold text-text-dark">
                {formatCurrency(totalPaid)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/30">
            <CardHeader className="pb-2">
              <CardDescription>Outstanding (filtered)</CardDescription>
              <CardTitle className={`text-2xl font-semibold ${totalBalance > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-text-dark'}`}>
                {formatCurrency(totalBalance)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="bg-white border-olive-light/30">
          <div className="border-b border-olive-light/40">
            <nav className="flex gap-0" aria-label="Tabs">
              <button
                type="button"
                onClick={() => setActiveTab('supplies')}
                className={cn(
                  'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'supplies'
                    ? 'border-olive text-olive-dark text-text-dark'
                    : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
                )}
              >
                Supplies & payments
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recent')}
                className={cn(
                  'px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === 'recent'
                    ? 'border-olive text-olive-dark text-text-dark'
                    : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
                )}
              >
                Recent payments
              </button>
            </nav>
          </div>
          <CardContent className="pt-4">
            {activeTab === 'supplies' && (
              <div className="space-y-4">
                <p className="text-sm text-text-dark/70 dark:text-slate-400">
                  Each payment is linked to a supply. Track partial or full payments per supply. Expected total is from supply line unit prices × accepted quantity.
                </p>
                <div className="max-w-sm">
                  <Label htmlFor="payments-search">Search by document or supplier</Label>
                  <Input
                    id="payments-search"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="overflow-x-auto rounded-lg border border-olive-light/40">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-olive-light/40 bg-olive-light/20 text-text-dark">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Supply</th>
                        <th className="px-4 py-3 font-semibold">Supplier</th>
                        <th className="px-4 py-3 font-semibold text-right">Expected</th>
                        <th className="px-4 py-3 font-semibold text-right">Paid</th>
                        <th className="px-4 py-3 font-semibold text-right">Balance</th>
                        <th className="px-4 py-3 font-semibold">Received</th>
                        <th className="px-4 py-3 font-semibold w-28">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-olive-light/30">
                      {paginatedSupplies.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-text-dark/60">
                            No supplies match your search.
                          </td>
                        </tr>
                      ) : (
                        paginatedSupplies.map((s) => (
                          <tr
                            key={s.id}
                            className="hover:bg-olive-light/10 cursor-pointer"
                            onClick={() => navigate(`/supplies/${s.id}`, { state: { fromPayments: true } })}
                          >
                            <td className="px-4 py-3 font-medium text-text-dark">{s.doc_no ?? `#${s.id}`}</td>
                            <td className="px-4 py-3 text-text-dark/80">{s.supplier_name}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {s.total_expected > 0 ? formatCurrency(s.total_expected) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                              {s.total_paid > 0 ? formatCurrency(s.total_paid) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span className={s.balance > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
                                {s.total_expected > 0 ? formatCurrency(s.balance) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-text-dark/70">{formatDate(s.received_at)}</td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const balanceRounded = Math.round(s.balance * 100) / 100
                                const isFullyPaid = balanceRounded <= 0
                                const hasPaymentOrExpected = (s.total_paid ?? 0) > 0 || (s.total_expected ?? 0) > 0
                                const showPaid = isFullyPaid && hasPaymentOrExpected
                                return showPaid ? (
                                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                    Paid
                                  </span>
                                ) : (
                                  <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-olive-light/60"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleOpenPaymentModalForSupply(s.id)
                                  }}
                                >
                                  <Banknote className="mr-1 h-3.5 w-3.5" />
                                  Pay
                                </Button>
                                )
                              })()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-olive-light/30 pt-3">
                  <p className="text-sm text-text-dark/70">
                    {filteredSupplies.length === 0
                      ? 'Showing 0 of 0'
                      : `Showing ${(suppliesPage - 1) * suppliesPageSize + 1}–${Math.min(suppliesPage * suppliesPageSize, filteredSupplies.length)} of ${filteredSupplies.length}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-olive-light/60"
                      disabled={suppliesPage <= 1}
                      onClick={() => setSuppliesPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-text-dark/70">
                      Page {suppliesPage} of {suppliesTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-olive-light/60"
                      disabled={suppliesPage >= suppliesTotalPages}
                      onClick={() => setSuppliesPage((p) => Math.min(suppliesTotalPages, p + 1))}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'recent' && (
              <div className="space-y-4">
                <p className="text-sm text-text-dark/70 dark:text-slate-400">
                  Latest payments linked to supplies.
                </p>
                <div className="overflow-x-auto rounded-lg border border-olive-light/40">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead className="border-b border-olive-light/40 bg-olive-light/20 text-text-dark">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Supply</th>
                        <th className="px-4 py-3 font-semibold text-right">Amount</th>
                        <th className="px-4 py-3 font-semibold">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-olive-light/30">
                      {paginatedRecentPayments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-text-dark/60">
                            No payments recorded yet.
                          </td>
                        </tr>
                      ) : (
                        paginatedRecentPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-olive-light/10">
                            <td className="px-4 py-3 text-text-dark/80">{formatDateTime(p.paid_at)}</td>
                            <td className="px-4 py-3 font-medium text-text-dark">
                              {getSupplyDocNo(p.supply_id)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-green-700 dark:text-green-400">
                              {formatCurrency(Number(p.amount))}
                            </td>
                            <td className="px-4 py-3 text-text-dark/70">{p.reference ?? '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-olive-light/30 pt-3">
                  <p className="text-sm text-text-dark/70">
                    {recentPayments.length === 0
                      ? 'Showing 0 of 0'
                      : `Showing ${(recentPage - 1) * recentPageSize + 1}–${Math.min(recentPage * recentPageSize, recentPayments.length)} of ${recentPayments.length}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-olive-light/60"
                      disabled={recentPage <= 1}
                      onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-text-dark/70">
                      Page {recentPage} of {recentTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-olive-light/60"
                      disabled={recentPage >= recentTotalPages}
                      onClick={() => setRecentPage((p) => Math.min(recentTotalPages, p + 1))}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add payment modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-white shadow-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-text-dark">Record payment</CardTitle>
              <Button variant="ghost" size="icon" onClick={handleClosePaymentModal}>
                <X className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-supply">Supply *</Label>
                  <select
                    id="payment-supply"
                    required
                    className="w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark"
                    value={paymentForm.supply_id}
                    onChange={(e) => {
                      const selectedSupplyId = e.target.value
                      setPaymentForm((prev) => ({
                        ...prev,
                        supply_id: selectedSupplyId,
                        reference: getSupplyInvoiceReference(selectedSupplyId),
                      }))
                    }}
                    disabled={lockedSupplyId !== null}
                  >
                    <option value="">Select supply</option>
                    {supplySelectOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Amount *</Label>
                  {paymentForm.supply_id && selectedSupplyOutstanding !== null && (
                    <p className="text-xs text-text-dark/70 dark:text-slate-400">
                      Outstanding for this supply: {formatCurrency(selectedSupplyOutstanding)}
                      {selectedSupplyOutstanding === 0 && ' — no further payment allowed.'}
                    </p>
                  )}
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0"
                    max={selectedSupplyOutstanding != null ? selectedSupplyOutstanding : undefined}
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                    disabled={selectedSupplyOutstanding === 0}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-date">Payment date *</Label>
                  <DatePicker
                    id="payment-date"
                    required
                    value={paymentForm.paid_at}
                    onChange={(value) => setPaymentForm((prev) => ({ ...prev, paid_at: value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Reference (optional)</Label>
                  <Input
                    id="payment-reference"
                    placeholder="Auto-filled from supply invoice"
                    value={paymentForm.reference}
                    readOnly
                    disabled
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                  type="submit"
                  className="bg-olive hover:bg-olive-dark"
                  disabled={submitting || selectedSupplyOutstanding === 0}
                >
                  {submitting ? 'Saving...' : 'Save payment'}
                </Button>
                  <Button type="button" variant="outline" onClick={handleClosePaymentModal}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </PageLayout>
  )
}

export default Payments
