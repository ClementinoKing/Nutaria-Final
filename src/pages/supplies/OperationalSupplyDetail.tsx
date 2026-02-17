import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Spinner } from '@/components/ui/spinner'
import { supabase } from '@/lib/supabaseClient'

interface ProductLookup {
  name: string
  sku: string
}

interface UnitLookup {
  name: string
  symbol: string
}

interface SupplyLineRow {
  id: number
  product: string
  unit: string
  ordered_qty: number
  received_qty: number
  accepted_qty: number
}

interface OperationalEntry {
  id: number
  delivery_reference: string
  received_condition: 'PASS' | 'HOLD' | 'REJECT'
  remarks: string | null
}

interface SupplyRecord {
  id: number
  doc_no: string | null
  supplier_id: number | null
  warehouse_id: number | null
  received_at: string | null
  doc_status: string | null
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

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0'
  return new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function OperationalSupplyDetail() {
  const { supplyId } = useParams<{ supplyId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [supply, setSupply] = useState<SupplyRecord | null>(null)
  const [operationalEntry, setOperationalEntry] = useState<OperationalEntry | null>(null)
  const [supplyLines, setSupplyLines] = useState<Record<string, unknown>[]>([])
  const [supplierLookup, setSupplierLookup] = useState<Record<string, string>>({})
  const [warehouseLookup, setWarehouseLookup] = useState<Record<string, string>>({})
  const [productLookup, setProductLookup] = useState<Record<string, ProductLookup>>({})
  const [unitLookup, setUnitLookup] = useState<Record<string, UnitLookup>>({})

  const supplyIdNumber = useMemo(() => {
    const parsed = Number.parseInt(supplyId ?? '', 10)
    return Number.isFinite(parsed) ? parsed : null
  }, [supplyId])

  useEffect(() => {
    if (!supplyIdNumber) {
      setError('Invalid supply id.')
      setLoading(false)
      return
    }

    const state = (location.state ?? {}) as Record<string, unknown>
    const stateSupply = state.supply as SupplyRecord | undefined
    const stateSupplyLines = state.supplyLines as Record<string, unknown>[] | undefined
    const stateSupplierLookup = state.supplierLookup as Record<string, string> | undefined
    const stateWarehouseLookup = state.warehouseLookup as Record<string, string> | undefined
    const stateProductLookup = state.productLookup as Record<string, ProductLookup> | undefined
    const stateUnitLookup = state.unitLookup as Record<string, UnitLookup> | undefined

    if (stateSupply?.id === supplyIdNumber) {
      setSupply(stateSupply)
      setSupplyLines(Array.isArray(stateSupplyLines) ? stateSupplyLines : [])
      setSupplierLookup(stateSupplierLookup ?? {})
      setWarehouseLookup(stateWarehouseLookup ?? {})
      setProductLookup(stateProductLookup ?? {})
      setUnitLookup(stateUnitLookup ?? {})
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      const [
        supplyResponse,
        entryResponse,
        linesResponse,
        suppliersResponse,
        warehousesResponse,
        productsResponse,
        unitsResponse,
      ] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, doc_no, supplier_id, warehouse_id, received_at, doc_status')
          .eq('id', supplyIdNumber)
          .maybeSingle(),
        supabase
          .from('operational_supply_entries')
          .select('id, delivery_reference, received_condition, remarks')
          .eq('supply_id', supplyIdNumber)
          .maybeSingle(),
        supabase
          .from('supply_lines')
          .select('id, product_id, unit_id, ordered_qty, received_qty, accepted_qty')
          .eq('supply_id', supplyIdNumber),
        supabase.from('suppliers').select('id, name'),
        supabase.from('warehouses').select('id, name'),
        supabase.from('products').select('id, name, sku'),
        supabase.from('units').select('id, name, symbol'),
      ])

      if (cancelled) return

      if (supplyResponse.error || !supplyResponse.data) {
        setError('Operational supply not found.')
        setLoading(false)
        return
      }

      if (entryResponse.error) {
        setError(entryResponse.error.message || 'Failed to load operational supply entry.')
        setLoading(false)
        return
      }

      if (linesResponse.error) {
        setError(linesResponse.error.message || 'Failed to load supply lines.')
        setLoading(false)
        return
      }

      setSupply(supplyResponse.data as SupplyRecord)
      setOperationalEntry((entryResponse.data as OperationalEntry | null) ?? null)
      setSupplyLines((linesResponse.data as Record<string, unknown>[]) ?? [])

      const supplierMap: Record<string, string> = {}
      ;(suppliersResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null }
        supplierMap[String(item.id)] = item.name ?? '—'
      })
      setSupplierLookup(supplierMap)

      const warehouseMap: Record<string, string> = {}
      ;(warehousesResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null }
        warehouseMap[String(item.id)] = item.name ?? '—'
      })
      setWarehouseLookup(warehouseMap)

      const productMap: Record<string, ProductLookup> = {}
      ;(productsResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null; sku: string | null }
        productMap[String(item.id)] = {
          name: item.name ?? 'Unknown product',
          sku: item.sku ?? '',
        }
      })
      setProductLookup(productMap)

      const unitMap: Record<string, UnitLookup> = {}
      ;(unitsResponse.data ?? []).forEach((row) => {
        const item = row as { id: number; name: string | null; symbol: string | null }
        unitMap[String(item.id)] = {
          name: item.name ?? '—',
          symbol: item.symbol ?? '',
        }
      })
      setUnitLookup(unitMap)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [location.state, supplyIdNumber])

  const rows = useMemo<SupplyLineRow[]>(
    () =>
      supplyLines.map((line) => {
        const productId = String((line.product_id as number | null) ?? '')
        const unitId = String((line.unit_id as number | null) ?? '')
        const product = productLookup[productId]
        const unit = unitLookup[unitId]
        return {
          id: Number(line.id ?? 0),
          product: product ? `${product.name}${product.sku ? ` (${product.sku})` : ''}` : '—',
          unit: unit ? `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}` : '—',
          ordered_qty: Number(line.ordered_qty ?? 0),
          received_qty: Number(line.received_qty ?? 0),
          accepted_qty: Number(line.accepted_qty ?? 0),
        }
      }),
    [productLookup, supplyLines, unitLookup]
  )

  const totalReceived = useMemo(
    () => rows.reduce((sum, row) => sum + (Number.isFinite(row.received_qty) ? row.received_qty : 0), 0),
    [rows]
  )

  if (loading) {
    return (
      <PageLayout title="Operational Supply Detail" activeItem="supplies" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading operational supply..." />
      </PageLayout>
    )
  }

  if (error || !supply) {
    return (
      <PageLayout title="Operational Supply Detail" activeItem="supplies" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-red-700">{error ?? 'Unable to load operational supply.'}</CardContent>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Operational Supply Detail"
      activeItem="supplies"
      leadingActions={
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={() => navigate('/inventory/stock-levels/operational-supplies')}
          aria-label="Back to Operational Supplies"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <Button
          type="button"
          className="bg-olive hover:bg-olive-dark"
          onClick={() =>
            navigate(`/supplies/${supply.id}/edit`, {
              state: { backgroundLocation: location },
            })
          }
        >
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Document</CardDescription>
            <CardTitle className="text-xl text-text-dark">{supply.doc_no ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-xl text-text-dark">{supply.doc_status ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Condition</CardDescription>
            <CardTitle className="text-xl text-text-dark">{operationalEntry?.received_condition ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total Received</CardDescription>
            <CardTitle className="text-xl text-text-dark">{formatNumber(totalReceived)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6 border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Operational Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-text-dark/80 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Supplier</p>
            <p className="font-medium text-text-dark">
              {supplierLookup[String(supply.supplier_id ?? '')] ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Warehouse</p>
            <p className="font-medium text-text-dark">
              {warehouseLookup[String(supply.warehouse_id ?? '')] ?? '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Received At</p>
            <p className="font-medium text-text-dark">{formatDateTime(supply.received_at)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Delivery Reference</p>
            <p className="font-medium text-text-dark">{operationalEntry?.delivery_reference || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-text-dark/60">Remarks</p>
            <p className="font-medium text-text-dark">{operationalEntry?.remarks || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Supply Lines</CardTitle>
          <CardDescription>Operational products captured for this delivery.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={[
              { key: 'product', header: 'Product', accessor: 'product' },
              { key: 'unit', header: 'Unit', accessor: 'unit' },
              {
                key: 'ordered_qty',
                header: 'Ordered',
                render: (row: SupplyLineRow) => formatNumber(row.ordered_qty),
                cellClassName: 'text-right',
                mobileValueClassName: 'text-right',
                headerClassName: 'text-right',
              },
              {
                key: 'received_qty',
                header: 'Received',
                render: (row: SupplyLineRow) => formatNumber(row.received_qty),
                cellClassName: 'text-right',
                mobileValueClassName: 'text-right',
                headerClassName: 'text-right',
              },
              {
                key: 'accepted_qty',
                header: 'Accepted',
                render: (row: SupplyLineRow) => formatNumber(row.accepted_qty),
                cellClassName: 'text-right',
                mobileValueClassName: 'text-right',
                headerClassName: 'text-right',
              },
            ]}
            data={rows}
            rowKey="id"
            emptyMessage="No operational lines captured."
          />
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default OperationalSupplyDetail
