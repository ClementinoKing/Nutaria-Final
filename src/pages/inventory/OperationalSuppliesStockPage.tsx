import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Briefcase, ExternalLink } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'

interface SupplyRow {
  id: number
  doc_no: string | null
  warehouse_id: number | null
  received_at: string | null
}

interface SupplyLineRow {
  supply_id: number
  product_id: number | null
  unit_id: number | null
  accepted_qty: number | null
  rejected_qty: number | null
}

interface ProductRow {
  id: number
  name: string | null
  sku: string | null
  product_type: string | null
  reorder_point: number | null
  safety_stock: number | null
}

interface WarehouseRow {
  id: number
  name: string | null
}

interface UnitRow {
  id: number
  name: string | null
  symbol: string | null
}

interface OperationalStockRow {
  id: string
  product_id: number
  product_name: string
  product_sku: string
  warehouse_id: number | null
  warehouse_name: string
  unit: string
  on_hand: number
  rejected: number
  receipt_count: number
  last_received_at: string | null
  latest_supply_id: number | null
  latest_doc_no: string | null
  reorder_point: number | null
  safety_stock: number | null
  is_below_reorder: boolean
  is_below_safety: boolean
}

interface AggregateRecord {
  id: string
  product_id: number
  warehouse_id: number | null
  unit_id: number | null
  on_hand: number
  rejected: number
  receipt_ids: Set<number>
  last_received_at: string | null
  latest_supply_id: number | null
  latest_doc_no: string | null
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function formatQty(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(value: string | null): string {
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

function OperationalSuppliesStockPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [rows, setRows] = useState<OperationalStockRow[]>([])
  const [productOptions, setProductOptions] = useState<Array<{ value: string; label: string }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [monthFilter, setMonthFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    let isMounted = true

    async function loadOperationalStock() {
      setLoading(true)
      const collectedErrors: string[] = []

      try {
        let suppliesQuery = supabase
          .from('supplies')
          .select('id, doc_no, warehouse_id, received_at')
          .eq('category_code', 'SERVICE')

        if (monthFilter) {
          const [year, month] = monthFilter.split('-')
          const startDate = `${year}-${month}-01`
          const endDate = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10), 0)
            .toISOString()
            .split('T')[0]
          suppliesQuery = suppliesQuery.gte('received_at', startDate).lte('received_at', `${endDate}T23:59:59`)
        }

        const { data: supplyData, error: supplyError } = await suppliesQuery
        if (supplyError) {
          collectedErrors.push(`supplies: ${supplyError.message}`)
          if (isMounted) {
            setRows([])
            setProductOptions([])
          }
          return
        }

        const supplies = (Array.isArray(supplyData) ? supplyData : []) as SupplyRow[]
        if (supplies.length === 0) {
          if (isMounted) {
            setRows([])
            setProductOptions([])
          }
          return
        }

        const supplyIds = supplies.map((supply) => supply.id)
        const { data: lineData, error: lineError } = await supabase
          .from('supply_lines')
          .select('supply_id, product_id, unit_id, accepted_qty, rejected_qty')
          .in('supply_id', supplyIds)

        if (lineError) {
          collectedErrors.push(`supply_lines: ${lineError.message}`)
          if (isMounted) {
            setRows([])
            setProductOptions([])
          }
          return
        }

        const lines = (Array.isArray(lineData) ? lineData : []) as SupplyLineRow[]
        if (lines.length === 0) {
          if (isMounted) {
            setRows([])
            setProductOptions([])
          }
          return
        }

        const lineProductIds = Array.from(
          new Set(
            lines
              .map((line) => line.product_id)
              .filter((productId): productId is number => productId !== null && productId !== undefined)
          )
        )

        if (lineProductIds.length === 0) {
          if (isMounted) {
            setRows([])
            setProductOptions([])
          }
          return
        }

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('id, name, sku, product_type, reorder_point, safety_stock')
          .in('id', lineProductIds)
          .eq('product_type', 'OP')

        if (productError) {
          collectedErrors.push(`products: ${productError.message}`)
        }

        const operationalProducts = (Array.isArray(productData) ? productData : []) as ProductRow[]
        const productMap = new Map<number, ProductRow>(operationalProducts.map((product) => [product.id, product]))

        const warehouseIds = Array.from(
          new Set(
            supplies
              .map((supply) => supply.warehouse_id)
              .filter((warehouseId): warehouseId is number => warehouseId !== null && warehouseId !== undefined)
          )
        )

        const unitIds = Array.from(
          new Set(
            lines
              .map((line) => line.unit_id)
              .filter((unitId): unitId is number => unitId !== null && unitId !== undefined)
          )
        )

        const [warehouseResult, unitResult] = await Promise.all([
          warehouseIds.length > 0
            ? supabase.from('warehouses').select('id, name').in('id', warehouseIds)
            : Promise.resolve({ data: [], error: null }),
          unitIds.length > 0
            ? supabase.from('units').select('id, name, symbol').in('id', unitIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (warehouseResult.error) {
          collectedErrors.push(`warehouses: ${warehouseResult.error.message}`)
        }
        if (unitResult.error) {
          collectedErrors.push(`units: ${unitResult.error.message}`)
        }

        const warehouseMap = new Map<number, WarehouseRow>(
          ((warehouseResult.data ?? []) as WarehouseRow[]).map((warehouse) => [warehouse.id, warehouse])
        )
        const unitMap = new Map<number, UnitRow>(((unitResult.data ?? []) as UnitRow[]).map((unit) => [unit.id, unit]))
        const supplyMap = new Map<number, SupplyRow>(supplies.map((supply) => [supply.id, supply]))

        const aggregated = new Map<string, AggregateRecord>()
        lines.forEach((line) => {
          if (!line.product_id || !productMap.has(line.product_id)) {
            return
          }
          if (productFilter && String(line.product_id) !== productFilter) {
            return
          }

          const supply = supplyMap.get(line.supply_id)
          if (!supply) {
            return
          }

          const warehouseId = supply.warehouse_id ?? null
          const key = `${line.product_id}-${warehouseId ?? 'none'}`

          if (!aggregated.has(key)) {
            aggregated.set(key, {
              id: key,
              product_id: line.product_id,
              warehouse_id: warehouseId,
              unit_id: line.unit_id ?? null,
              on_hand: 0,
              rejected: 0,
              receipt_ids: new Set<number>(),
              last_received_at: null,
              latest_supply_id: null,
              latest_doc_no: null,
            })
          }

          const record = aggregated.get(key)
          if (!record) return

          record.on_hand += toNumber(line.accepted_qty)
          record.rejected += toNumber(line.rejected_qty)
          record.receipt_ids.add(line.supply_id)

          const receivedAt = supply.received_at
          if (!record.last_received_at || (receivedAt && new Date(receivedAt).getTime() > new Date(record.last_received_at).getTime())) {
            record.last_received_at = receivedAt
            record.latest_supply_id = supply.id
            record.latest_doc_no = supply.doc_no
          }
        })

        const stockRows: OperationalStockRow[] = Array.from(aggregated.values()).map((record) => {
          const product = productMap.get(record.product_id)
          const warehouse = record.warehouse_id ? warehouseMap.get(record.warehouse_id) : null
          const unit = record.unit_id ? unitMap.get(record.unit_id) : null
          const reorderPoint = product?.reorder_point ?? null
          const safetyStock = product?.safety_stock ?? null
          const onHand = Math.max(record.on_hand, 0)

          return {
            id: record.id,
            product_id: record.product_id,
            product_name: product?.name ?? 'Unknown product',
            product_sku: product?.sku ?? '',
            warehouse_id: record.warehouse_id,
            warehouse_name: warehouse?.name ?? '—',
            unit: unit?.symbol ?? unit?.name ?? '',
            on_hand: Math.round(onHand * 100) / 100,
            rejected: Math.round(Math.max(record.rejected, 0) * 100) / 100,
            receipt_count: record.receipt_ids.size,
            last_received_at: record.last_received_at,
            latest_supply_id: record.latest_supply_id,
            latest_doc_no: record.latest_doc_no,
            reorder_point: reorderPoint,
            safety_stock: safetyStock,
            is_below_reorder: reorderPoint !== null && onHand < reorderPoint,
            is_below_safety: safetyStock !== null && onHand < safetyStock,
          }
        })

        stockRows.sort((a, b) => {
          const nameCompare = a.product_name.localeCompare(b.product_name)
          if (nameCompare !== 0) return nameCompare
          return a.warehouse_name.localeCompare(b.warehouse_name)
        })

        const options = operationalProducts
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
          .map((product) => ({
            value: String(product.id),
            label: `${product.name ?? 'Unknown'}${product.sku ? ` (${product.sku})` : ''}`,
          }))

        if (isMounted) {
          setRows(stockRows)
          setProductOptions(options)
        }
      } catch (error) {
        collectedErrors.push(error instanceof Error ? error.message : 'Failed to load operational stock.')
      } finally {
        if (isMounted) {
          setErrors(Array.from(new Set(collectedErrors.filter(Boolean))))
          setLoading(false)
        }
      }
    }

    loadOperationalStock()

    return () => {
      isMounted = false
    }
  }, [monthFilter, productFilter])

  const warehouseOptions = useMemo(() => {
    const warehouses = Array.from(
      new Set(rows.map((row) => row.warehouse_name).filter((name) => Boolean(name) && name !== '—'))
    ).sort((a, b) => a.localeCompare(b))
    return [{ value: 'ALL', label: 'All warehouses' }, ...warehouses.map((name) => ({ value: name, label: name }))]
  }, [rows])

  const monthOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [{ value: '', label: 'All months' }]
    const now = new Date()
    for (let index = 0; index < 12; index += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      options.push({
        value: `${year}-${month}`,
        label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
      })
    }
    return options
  }, [])

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch =
        !query ||
        row.product_name.toLowerCase().includes(query) ||
        row.product_sku.toLowerCase().includes(query) ||
        row.latest_doc_no?.toLowerCase().includes(query)
      const matchesWarehouse = warehouseFilter === 'ALL' || row.warehouse_name === warehouseFilter
      return matchesSearch && matchesWarehouse
    })
  }, [rows, searchTerm, warehouseFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize]
  )

  useEffect(() => {
    setPage(1)
  }, [searchTerm, warehouseFilter, monthFilter, productFilter])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const totalOnHand = useMemo(() => filteredRows.reduce((sum, row) => sum + row.on_hand, 0), [filteredRows])
  const totalRejected = useMemo(() => filteredRows.reduce((sum, row) => sum + row.rejected, 0), [filteredRows])
  const receiptCount = useMemo(() => filteredRows.reduce((sum, row) => sum + row.receipt_count, 0), [filteredRows])
  const lowStockCount = useMemo(
    () => filteredRows.filter((row) => row.is_below_reorder || row.is_below_safety).length,
    [filteredRows]
  )

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: 'Product',
        render: (row: OperationalStockRow) => (
          <div>
            <div className="font-medium text-text-dark">{row.product_name}</div>
            <div className="text-xs text-text-dark/60">{row.product_sku || '—'}</div>
          </div>
        ),
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        accessor: 'warehouse_name',
        cellClassName: 'text-text-dark/70',
      },
      {
        key: 'on_hand',
        header: 'Available Pool',
        render: (row: OperationalStockRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">
              {formatQty(row.on_hand)} {row.unit}
            </div>
            <div className="text-[11px] text-text-dark/60">Across {row.receipt_count} receipts</div>
          </div>
        ),
      },
      {
        key: 'rejected',
        header: 'Rejected',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/70',
        render: (row: OperationalStockRow) => `${formatQty(row.rejected)} ${row.unit}`,
      },
      {
        key: 'thresholds',
        header: 'Min / Safety',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/80',
        render: (row: OperationalStockRow) => `${row.reorder_point ?? '—'} / ${row.safety_stock ?? '—'}`,
      },
      {
        key: 'receipts',
        header: 'Receipts',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/70',
        accessor: 'receipt_count',
      },
      {
        key: 'last',
        header: 'Last Receipt',
        render: (row: OperationalStockRow) => (
          <div>
            <div className="text-sm text-text-dark/80">{formatDate(row.last_received_at)}</div>
            <div className="text-xs text-text-dark/60">{row.latest_doc_no ?? '—'}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: OperationalStockRow) => {
          const attention = row.is_below_reorder || row.is_below_safety
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                attention ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
              }`}
            >
              {attention ? 'Attention' : 'Healthy'}
            </span>
          )
        },
      },
      {
        key: 'open',
        header: '',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (row: OperationalStockRow) =>
          row.latest_supply_id ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation()
                navigate(`/supplies/operational/${row.latest_supply_id}`)
              }}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Detail
            </Button>
          ) : (
            '—'
          ),
      },
    ],
    [navigate]
  )

  if (loading) {
    return (
      <PageLayout
        title="Operational Supplies Stock"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading operational supplies stock..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Operational Supplies Stock"
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-4">
        <Link to="/inventory/stock-levels" className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to Stock Levels
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Available Pool (Aggregated)</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{formatQty(totalOnHand)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-rose-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Rejected Qty</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{formatQty(totalRejected)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-sky-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Receipt Lines</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{receiptCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-amber-200/70">
          <CardHeader className="pb-2">
            <CardDescription>Items Requiring Action</CardDescription>
            <CardTitle className="inline-flex items-center gap-2 text-2xl font-semibold text-text-dark">
              {lowStockCount}
              <ArrowUpRight className="h-4 w-4 text-orange-600" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Operational Supplies Inventory</CardTitle>
              <CardDescription>
                Shows stock based on recorded operational deliveries and the quantities received.
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-2 rounded-md border border-sky-200/70 bg-sky-50 px-3 py-1 text-xs text-sky-800">
              <Briefcase className="h-4 w-4" />
              Inventory view
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {errors.length > 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              <p className="font-medium">Some data could not be loaded:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Label htmlFor="op-stock-search">Search</Label>
              <Input
                id="op-stock-search"
                placeholder="Search by product, SKU, or document number"
                value={searchTerm}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="op-product-filter">Product</Label>
              <SearchableSelect
                id="op-product-filter"
                options={[{ value: '', label: 'All products' }, ...productOptions]}
                value={productFilter}
                onChange={setProductFilter}
                placeholder="All products"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="op-month-filter">Month</Label>
              <SearchableSelect
                id="op-month-filter"
                options={monthOptions}
                value={monthFilter}
                onChange={setMonthFilter}
                placeholder="All months"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="op-warehouse-filter">Warehouse</Label>
              <SearchableSelect
                id="op-warehouse-filter"
                options={warehouseOptions}
                value={warehouseFilter}
                onChange={setWarehouseFilter}
                placeholder="All warehouses"
                className="mt-1"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No operational stock records found for the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              <ResponsiveTable
                columns={columns}
                data={pagedRows}
                rowKey="id"
                onRowClick={(row: OperationalStockRow) => {
                  if (row.latest_supply_id) {
                    navigate(`/supplies/operational/${row.latest_supply_id}`)
                  }
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2">
                <div className="text-sm text-text-dark/70">
                  Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredRows.length)} of {filteredRows.length}
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="op-page-size" className="text-sm text-text-dark/70">
                    Per page
                  </label>
                  <select
                    id="op-page-size"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value))
                      setPage(1)
                    }}
                    className="rounded-md border border-olive-light/60 bg-white px-2 py-1 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default OperationalSuppliesStockPage
