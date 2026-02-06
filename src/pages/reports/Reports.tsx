import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Banknote, FileText, Package, Users, Truck, Download, RefreshCcw } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const reportCards = [
  {
    title: 'Supplies Overview',
    description: 'Track received quantities, acceptance rates, and stock status by supply batch.',
    icon: Package,
    link: '/supplies',
    cta: 'Open Supplies',
  },
  {
    title: 'Supplier Performance',
    description: 'Review supplier quality checks, delivery consistency, and compliance trends.',
    icon: Users,
    link: '/suppliers-customers/suppliers',
    cta: 'Open Suppliers',
  },
  {
    title: 'Payments Summary',
    description: 'Monitor payment status, outstanding balances, and vendor payment timelines.',
    icon: Banknote,
    link: '/payments',
    cta: 'Open Payments',
  },
  {
    title: 'Shipment Activity',
    description: 'See shipment volume, packing activity, and delivery records.',
    icon: Truck,
    link: '/shipments',
    cta: 'Open Shipments',
  },
]

interface SupplyRow {
  id: number
  doc_no?: string | null
  supplier_id?: number | null
  received_at?: string | null
}

interface SupplyLineRow {
  id: number
  supply_id: number
  accepted_qty: number
  unit_price?: number | null
}

interface SupplyBatchRow {
  id: number
  supply_id: number
  received_qty?: number | null
  accepted_qty?: number | null
  rejected_qty?: number | null
  current_qty?: number | null
  quality_status?: string | null
}

interface SupplierRow {
  id: number
  name: string
  supplier_type?: string | null
  country?: string | null
  created_at?: string | null
}

interface PaymentRow {
  id: number
  supply_id: number
  amount: number
  paid_at?: string | null
  reference?: string | null
}

interface ShipmentRow {
  id: number
  doc_status?: string | null
  planned_ship_date?: string | null
  shipped_at?: string | null
  created_at?: string | null
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDateTime(value?: string | null): string {
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
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function Reports() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [supplies, setSupplies] = useState<SupplyRow[]>([])
  const [supplyLines, setSupplyLines] = useState<SupplyLineRow[]>([])
  const [supplyBatches, setSupplyBatches] = useState<SupplyBatchRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [exporting, setExporting] = useState<string | null>(null)

  const summaryRef = useRef<HTMLDivElement>(null)
  const suppliesRef = useRef<HTMLDivElement>(null)
  const suppliersRef = useRef<HTMLDivElement>(null)
  const paymentsRef = useRef<HTMLDivElement>(null)
  const shipmentsRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [suppliesRes, linesRes, batchesRes, suppliersRes, paymentsRes, shipmentsRes] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, doc_no, supplier_id, received_at')
          .order('received_at', { ascending: false, nullsFirst: false })
          .limit(1000),
        supabase.from('supply_lines').select('id, supply_id, accepted_qty, unit_price'),
        supabase
          .from('supply_batches')
          .select('id, supply_id, received_qty, accepted_qty, rejected_qty, current_qty, quality_status'),
        supabase
          .from('suppliers')
          .select('id, name, supplier_type, country, created_at')
          .order('name', { ascending: true })
          .limit(1000),
        supabase.from('supply_payments').select('id, supply_id, amount, paid_at, reference'),
        supabase.from('shipments').select('id, doc_status, planned_ship_date, shipped_at, created_at'),
      ])

      if (suppliesRes.error) throw suppliesRes.error
      if (linesRes.error) throw linesRes.error
      if (batchesRes.error) throw batchesRes.error
      if (suppliersRes.error) throw suppliersRes.error
      if (paymentsRes.error) throw paymentsRes.error
      if (shipmentsRes.error) throw shipmentsRes.error

      setSupplies((suppliesRes.data ?? []) as SupplyRow[])
      setSupplyLines((linesRes.data ?? []) as SupplyLineRow[])
      setSupplyBatches((batchesRes.data ?? []) as SupplyBatchRow[])
      setSuppliers((suppliersRes.data ?? []) as SupplierRow[])
      setPayments((paymentsRes.data ?? []) as PaymentRow[])
      setShipments((shipmentsRes.data ?? []) as ShipmentRow[])
    } catch (err) {
      console.error('Error loading report data:', err)
      setError('Unable to load report data. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const exportToPDF = useCallback(async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return
    setExporting(filename)
    await new Promise((resolve) => requestAnimationFrame(() => resolve(true)))
    const element = ref.current
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let position = 0
    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
    } else {
      while (position < imgHeight) {
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight)
        position += pageHeight
        if (position < imgHeight) {
          pdf.addPage()
        }
      }
    }
    pdf.save(filename)
    setExporting(null)
  }, [])

  const supplierMap = useMemo(() => {
    const map = new Map<number, SupplierRow>()
    suppliers.forEach((supplier) => map.set(supplier.id, supplier))
    return map
  }, [suppliers])

  const supplyTotals = useMemo(() => {
    const totals = {
      received: 0,
      accepted: 0,
      rejected: 0,
      current: 0,
    }
    supplyBatches.forEach((batch) => {
      totals.received += Number(batch.received_qty) || 0
      totals.accepted += Number(batch.accepted_qty) || 0
      totals.rejected += Number(batch.rejected_qty) || 0
      totals.current += Number(batch.current_qty) || 0
    })
    const acceptanceRate =
      totals.accepted + totals.rejected > 0
        ? (totals.accepted / (totals.accepted + totals.rejected)) * 100
        : 0
    return { ...totals, acceptanceRate }
  }, [supplyBatches])

  const supplySpendTotals = useMemo(() => {
    let expected = 0
    supplyLines.forEach((line) => {
      const price = line.unit_price != null ? Number(line.unit_price) : 0
      const qty = Number(line.accepted_qty) || 0
      expected += price * qty
    })
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    return {
      expected,
      paid,
      balance: expected - paid,
    }
  }, [supplyLines, payments])

  const topSuppliersByAccepted = useMemo(() => {
    const totalsBySupplier = new Map<number, number>()
    const supplyToSupplier = new Map<number, number>()
    supplies.forEach((supply) => {
      if (supply.supplier_id) {
        supplyToSupplier.set(supply.id, supply.supplier_id)
      }
    })
    supplyBatches.forEach((batch) => {
      const supplierId = supplyToSupplier.get(batch.supply_id)
      if (!supplierId) return
      const accepted = Number(batch.accepted_qty) || 0
      totalsBySupplier.set(supplierId, (totalsBySupplier.get(supplierId) ?? 0) + accepted)
    })
    return Array.from(totalsBySupplier.entries())
      .map(([supplierId, qty]) => ({
        supplierId,
        supplierName: supplierMap.get(supplierId)?.name ?? 'Unknown',
        acceptedQty: qty,
      }))
      .sort((a, b) => b.acceptedQty - a.acceptedQty)
      .slice(0, 5)
  }, [supplies, supplyBatches, supplierMap])

  const supplierTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    suppliers.forEach((supplier) => {
      const type = supplier.supplier_type ?? 'UNKNOWN'
      counts.set(type, (counts.get(type) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([type, count]) => ({ type, count }))
  }, [suppliers])

  const recentSuppliers = useMemo(() => {
    return [...suppliers]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 5)
  }, [suppliers])

  const outstandingSupplies = useMemo(() => {
    const expectedBySupply = new Map<number, number>()
    supplyLines.forEach((line) => {
      const price = line.unit_price != null ? Number(line.unit_price) : 0
      const qty = Number(line.accepted_qty) || 0
      expectedBySupply.set(line.supply_id, (expectedBySupply.get(line.supply_id) ?? 0) + price * qty)
    })
    const paidBySupply = new Map<number, number>()
    payments.forEach((payment) => {
      paidBySupply.set(payment.supply_id, (paidBySupply.get(payment.supply_id) ?? 0) + Number(payment.amount || 0))
    })
    return supplies
      .map((supply) => {
        const expected = expectedBySupply.get(supply.id) ?? 0
        const paid = paidBySupply.get(supply.id) ?? 0
        return {
          supplyId: supply.id,
          docNo: supply.doc_no ?? `Supply #${supply.id}`,
          supplierName: supply.supplier_id ? supplierMap.get(supply.supplier_id)?.name ?? 'Unknown' : 'Unknown',
          expected,
          paid,
          balance: expected - paid,
          receivedAt: supply.received_at ?? null,
        }
      })
      .filter((row) => row.balance > 0.01)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 6)
  }, [supplies, supplyLines, payments, supplierMap])

  const shipmentStatusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    shipments.forEach((shipment) => {
      const status = shipment.doc_status ?? 'UNKNOWN'
      counts.set(status, (counts.get(status) ?? 0) + 1)
    })
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }))
  }, [shipments])

  const generatedAt = useMemo(() => formatDateTime(new Date().toISOString()), [])
  const isExporting = exporting !== null

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <PageLayout title="Reports" activeItem="reports" stickyHeader={false} contentClassName="py-6 space-y-6">
      <Card className="bg-white border-olive-light/30">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-text-dark">Reports Center</CardTitle>
            <CardDescription>
              Generate printable PDF summaries for key operational areas. Data shown reflects the latest synced
              records.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-olive-light/40 text-olive-dark"
              onClick={loadData}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
            <Button
              className="bg-olive hover:bg-olive-dark"
              onClick={() => exportToPDF(summaryRef, 'Nutaria-Operations-Report.pdf')}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Preparing PDF…' : 'Export Full Report'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <p className="text-xs uppercase tracking-wide text-text-dark/60">Supplies Received</p>
                <p className="text-2xl font-semibold text-text-dark">{supplyTotals.received.toFixed(2)} kg</p>
                <p className="text-xs text-text-dark/60 mt-2">
                  Acceptance rate: {supplyTotals.acceptanceRate.toFixed(1)}%
                </p>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <p className="text-xs uppercase tracking-wide text-text-dark/60">Payments</p>
                <p className="text-2xl font-semibold text-text-dark">{formatCurrency(supplySpendTotals.paid)}</p>
                <p className="text-xs text-text-dark/60 mt-2">
                  Outstanding: {formatCurrency(supplySpendTotals.balance)}
                </p>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                <p className="text-xs uppercase tracking-wide text-text-dark/60">Suppliers</p>
                <p className="text-2xl font-semibold text-text-dark">{suppliers.length}</p>
                <p className="text-xs text-text-dark/60 mt-2">
                  Shipments tracked: {shipments.length}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Operations Reporting Hub</CardTitle>
          <CardDescription>
            Quick access to reporting views across supplies, suppliers, payments, and shipments. New analytics
            dashboards will appear here as data models are finalized.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {reportCards.map((card) => {
            const Icon = card.icon
            return (
              <div
                key={card.title}
                className="flex flex-col justify-between rounded-lg border border-olive-light/30 bg-olive-light/10 p-4"
              >
                <div className="space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-olive shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-dark">{card.title}</h3>
                    <p className="text-xs text-text-dark/60 mt-1">{card.description}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="mt-4 justify-between border-olive-light/40 text-olive-dark"
                  onClick={() => navigate(card.link)}
                >
                  {card.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="space-y-6" ref={summaryRef}>
        <Card className="bg-white border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Executive Summary</CardTitle>
            <CardDescription>Snapshot of key operational metrics across supplies, suppliers, payments, and shipments.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 rounded-xl border border-olive-light/30 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <img src="/img/logos/Nutaria_logo.svg" alt="Nutaria logo" className="h-10" />
                  <p className="text-xs text-text-dark/60 mt-1">Generated: {generatedAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-dark">Operations Overview</p>
                  <p className="text-xs text-text-dark/60">All active data sources</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-text-dark/60">Loading report summary…</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Supplies Received</p>
                    <p className="text-lg font-semibold text-text-dark">{supplyTotals.received.toFixed(2)} kg</p>
                  </div>
                  <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Total Suppliers</p>
                    <p className="text-lg font-semibold text-text-dark">{suppliers.length}</p>
                  </div>
                  <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Total Paid</p>
                    <p className="text-lg font-semibold text-text-dark">{formatCurrency(supplySpendTotals.paid)}</p>
                  </div>
                  <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-text-dark/60">Shipments Tracked</p>
                    <p className="text-lg font-semibold text-text-dark">{shipments.length}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-olive-light/30">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Supplies Report</CardTitle>
              <CardDescription>Summary of received, accepted, and current supply quantities.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-olive-light/40 text-olive-dark"
              onClick={() => exportToPDF(suppliesRef, 'Nutaria-Supplies-Report.pdf')}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={suppliesRef} className="space-y-6 rounded-xl border border-olive-light/30 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <img src="/img/logos/Nutaria_logo.svg" alt="Nutaria logo" className="h-10" />
                  <p className="text-xs text-text-dark/60 mt-1">Generated: {generatedAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-dark">Supplies Overview</p>
                  <p className="text-xs text-text-dark/60">{supplies.length} supply records</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-text-dark/60">Loading supplies data…</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Received Qty</p>
                      <p className="text-lg font-semibold text-text-dark">{supplyTotals.received.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Accepted Qty</p>
                      <p className="text-lg font-semibold text-text-dark">{supplyTotals.accepted.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Rejected Qty</p>
                      <p className="text-lg font-semibold text-text-dark">{supplyTotals.rejected.toFixed(2)} kg</p>
                    </div>
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Acceptance Rate</p>
                      <p className="text-lg font-semibold text-text-dark">{supplyTotals.acceptanceRate.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-olive-light/30">
                    <table className="min-w-full divide-y divide-olive-light/30">
                      <thead className="bg-olive-light/20">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Top Suppliers (Accepted Qty)
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Quantity (kg)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-olive-light/30 bg-white">
                        {topSuppliersByAccepted.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-4 py-3 text-sm text-text-dark/60">
                              No supplier data available.
                            </td>
                          </tr>
                        ) : (
                          topSuppliersByAccepted.map((row) => (
                            <tr key={row.supplierId}>
                              <td className="px-4 py-3 text-sm text-text-dark">{row.supplierName}</td>
                              <td className="px-4 py-3 text-right text-sm text-text-dark">
                                {row.acceptedQty.toFixed(2)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-olive-light/30">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Supplier Report</CardTitle>
              <CardDescription>Supplier composition, growth, and onboarding cadence.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-olive-light/40 text-olive-dark"
              onClick={() => exportToPDF(suppliersRef, 'Nutaria-Supplier-Report.pdf')}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={suppliersRef} className="space-y-6 rounded-xl border border-olive-light/30 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <img src="/img/logos/Nutaria_logo.svg" alt="Nutaria logo" className="h-10" />
                  <p className="text-xs text-text-dark/60 mt-1">Generated: {generatedAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-dark">Supplier Summary</p>
                  <p className="text-xs text-text-dark/60">{suppliers.length} suppliers</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-text-dark/60">Loading supplier data…</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {supplierTypeCounts.map((item) => (
                      <div key={item.type} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                        <p className="text-xs uppercase tracking-wide text-text-dark/60">{item.type}</p>
                        <p className="text-lg font-semibold text-text-dark">{item.count}</p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-lg border border-olive-light/30">
                    <table className="min-w-full divide-y divide-olive-light/30">
                      <thead className="bg-olive-light/20">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Recent Suppliers
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Type
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Added
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-olive-light/30 bg-white">
                        {recentSuppliers.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-sm text-text-dark/60">
                              No supplier data available.
                            </td>
                          </tr>
                        ) : (
                          recentSuppliers.map((supplier) => (
                            <tr key={supplier.id}>
                              <td className="px-4 py-3 text-sm text-text-dark">{supplier.name}</td>
                              <td className="px-4 py-3 text-sm text-text-dark">{supplier.supplier_type ?? '—'}</td>
                              <td className="px-4 py-3 text-right text-sm text-text-dark">
                                {formatDate(supplier.created_at)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-olive-light/30">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Payments Report</CardTitle>
              <CardDescription>Expected vs. paid totals and outstanding balances.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-olive-light/40 text-olive-dark"
              onClick={() => exportToPDF(paymentsRef, 'Nutaria-Payments-Report.pdf')}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={paymentsRef} className="space-y-6 rounded-xl border border-olive-light/30 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <img src="/img/logos/Nutaria_logo.svg" alt="Nutaria logo" className="h-10" />
                  <p className="text-xs text-text-dark/60 mt-1">Generated: {generatedAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-dark">Payments Summary</p>
                  <p className="text-xs text-text-dark/60">{payments.length} payment entries</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-text-dark/60">Loading payment data…</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Total Expected</p>
                      <p className="text-lg font-semibold text-text-dark">{formatCurrency(supplySpendTotals.expected)}</p>
                    </div>
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Total Paid</p>
                      <p className="text-lg font-semibold text-text-dark">{formatCurrency(supplySpendTotals.paid)}</p>
                    </div>
                    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                      <p className="text-xs uppercase tracking-wide text-text-dark/60">Outstanding Balance</p>
                      <p className="text-lg font-semibold text-text-dark">{formatCurrency(supplySpendTotals.balance)}</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-olive-light/30">
                    <table className="min-w-full divide-y divide-olive-light/30">
                      <thead className="bg-olive-light/20">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Supply
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Supplier
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Balance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-olive-light/30 bg-white">
                        {outstandingSupplies.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-sm text-text-dark/60">
                              No outstanding balances.
                            </td>
                          </tr>
                        ) : (
                          outstandingSupplies.map((row) => (
                            <tr key={row.supplyId}>
                              <td className="px-4 py-3 text-sm text-text-dark">{row.docNo}</td>
                              <td className="px-4 py-3 text-sm text-text-dark">{row.supplierName}</td>
                              <td className="px-4 py-3 text-right text-sm text-text-dark">
                                {formatCurrency(row.balance)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-olive-light/30">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Shipment Snapshot</CardTitle>
              <CardDescription>Status distribution and recent shipping activity.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="border-olive-light/40 text-olive-dark"
              onClick={() => exportToPDF(shipmentsRef, 'Nutaria-Shipments-Report.pdf')}
              disabled={loading || isExporting}
              style={isExporting ? { display: 'none' } : undefined}
            >
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={shipmentsRef} className="space-y-6 rounded-xl border border-olive-light/30 bg-white p-6">
              <div className="flex items-start justify-between">
                <div>
                  <img src="/img/logos/Nutaria_logo.svg" alt="Nutaria logo" className="h-10" />
                  <p className="text-xs text-text-dark/60 mt-1">Generated: {generatedAt}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-dark">Shipments Overview</p>
                  <p className="text-xs text-text-dark/60">{shipments.length} shipments</p>
                </div>
              </div>

              {loading ? (
                <p className="text-sm text-text-dark/60">Loading shipment data…</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {shipmentStatusCounts.map((item) => (
                      <div key={item.status} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                        <p className="text-xs uppercase tracking-wide text-text-dark/60">{item.status}</p>
                        <p className="text-lg font-semibold text-text-dark">{item.count}</p>
                      </div>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-lg border border-olive-light/30">
                    <table className="min-w-full divide-y divide-olive-light/30">
                      <thead className="bg-olive-light/20">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Shipment
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Status
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                            Planned Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-olive-light/30 bg-white">
                        {shipments.slice(0, 6).map((shipment) => (
                          <tr key={shipment.id}>
                            <td className="px-4 py-3 text-sm text-text-dark">Shipment #{shipment.id}</td>
                            <td className="px-4 py-3 text-sm text-text-dark">{shipment.doc_status ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-sm text-text-dark">
                              {formatDate(shipment.planned_ship_date)}
                            </td>
                          </tr>
                        ))}
                        {shipments.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-3 text-sm text-text-dark/60">
                              No shipment data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Reporting Roadmap</CardTitle>
          <CardDescription>
            These reports are commonly requested by operations teams. Select any item below to prioritize a build.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            {
              title: 'Supply Acceptance Rate',
              detail: 'Accepted vs. rejected quantities per supplier and period.',
            },
            {
              title: 'Supplier Quality Trends',
              detail: 'QC results over time with pass/fail distribution.',
            },
            {
              title: 'Payment Aging',
              detail: 'Outstanding balances bucketed by due date.',
            },
            {
              title: 'Process Yield',
              detail: 'Input vs. output yield per process step.',
            },
            {
              title: 'Inventory Turns',
              detail: 'Average days on hand for key supply and finished goods.',
            },
            {
              title: 'Shipment Fulfillment',
              detail: 'On-time shipment ratio and packing throughput.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-olive-light/30 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-olive-light/30 text-olive">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-dark">{item.title}</p>
                  <p className="text-xs text-text-dark/60 mt-1">{item.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </PageLayout>
  )
}
