import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowLeft, ArrowUpRight, BarChart3 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

const QUALITY_HOLD_STATUSES = new Set(['PENDING', 'HOLD'])

interface SupplyBatch {
  id: number
  supply_id: number | null
  product_id: number | null
  unit_id: number | null
  received_qty: number | null
  accepted_qty: number | null
  rejected_qty: number | null
  current_qty: number | null
  quality_status: string | null
}

interface Product {
  id: number
  name: string | null
  sku: string | null
  reorder_point: number | null
  safety_stock: number | null
  target_stock: number | null
  base_unit_id: number | null
  pack_size: number | null
  status: string | null
  certifications?: unknown
}

interface Supply {
  id: number
  warehouse_id: number | null
}

interface Warehouse {
  id: number
  name: string | null
}

interface Unit {
  id: number
  name: string | null
  symbol: string | null
}

interface StockLevel {
  id: string
  product_id: number
  product_name: string
  product_sku: string
  warehouse_id: number | null
  warehouse_name: string
  on_hand: number
  allocated: number
  quality_hold: number
  in_transit: number
  unit: string
  reorder_point: number | null
  safety_stock: number | null
  cycle_count_due_at: string | null
  low_stock_reason: string | null
  notes: string | null
  packSize: number | null
  status: string | null
}

interface EnrichedStockLevel extends StockLevel {
  available: number
  reorderTarget: number
  safetyStock: number
  totalDemand: number
  productStatus: string | null
  packSize: number | null
  daysOfCover: number | null
  isBelowReorder: boolean
  isBelowSafety: boolean
  complianceFlags?: unknown
}

function parseNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const numeric = Number.parseFloat(String(value))
  return Number.isFinite(numeric) ? numeric : 0
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const numeric = Number.parseFloat(String(value))
  return Number.isFinite(numeric) ? numeric : null
}

function roundNumber(value: number | string | null | undefined): number {
  const numeric = Number.isFinite(value) ? Number(value) : parseNumber(value)
  return Math.round(numeric * 100) / 100
}

function SupplyStockPage() {
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [coverageThreshold, setCoverageThreshold] = useState(14)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let isMounted = true

    async function loadStockLevels() {
      setLoading(true)
      const collectedErrors: string[] = []

      try {
        const {
          data: batchRows,
          error: batchError,
        } = await supabase
          .from('supply_batches')
          .select(
            'id, supply_id, product_id, unit_id, received_qty, accepted_qty, rejected_qty, current_qty, quality_status'
          )

        if (batchError) {
          collectedErrors.push(`supply_batches: ${batchError.message}`)
          if (isMounted) {
            setStockLevels([])
            setProducts([])
          }
          return
        }

        const batches = (Array.isArray(batchRows) ? batchRows : []) as SupplyBatch[]

        if (batches.length === 0) {
          if (isMounted) {
            setStockLevels([])
            setProducts([])
          }
          return
        }

        const productIds = Array.from(
          new Set(batches.map((batch: SupplyBatch) => batch.product_id).filter((value): value is number => value !== null && value !== undefined))
        )
        const supplyIds = Array.from(
          new Set(batches.map((batch: SupplyBatch) => batch.supply_id).filter((value): value is number => value !== null && value !== undefined))
        )
        const batchUnitIds = Array.from(
          new Set(batches.map((batch: SupplyBatch) => batch.unit_id).filter((value): value is number => value !== null && value !== undefined))
        )

        const [
          {
            data: productRows,
            error: productError,
          },
          {
            data: supplyRows,
            error: supplyError,
          },
        ] = await Promise.all([
          productIds.length > 0
            ? supabase
                .from('products')
                .select(
                  'id, name, sku, reorder_point, safety_stock, target_stock, base_unit_id, pack_size, status'
                )
                .in('id', productIds)
            : Promise.resolve({ data: [], error: null }),
          supplyIds.length > 0
            ? supabase.from('supplies').select('id, warehouse_id').in('id', supplyIds)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (productError) {
          collectedErrors.push(`products: ${productError.message}`)
        }
        if (supplyError) {
          collectedErrors.push(`supplies: ${supplyError.message}`)
        }

        const productsData = (Array.isArray(productRows) ? productRows : []) as Product[]
        const suppliesData = (Array.isArray(supplyRows) ? supplyRows : []) as Supply[]

        const warehouseIds = Array.from(
          new Set(suppliesData.map((supply: Supply) => supply.warehouse_id).filter((value): value is number => value !== null && value !== undefined))
        )

        const {
          data: warehouseRows,
          error: warehouseError,
        } = warehouseIds.length > 0
          ? await supabase.from('warehouses').select('id, name').in('id', warehouseIds)
          : { data: [], error: null }

        if (warehouseError) {
          collectedErrors.push(`warehouses: ${warehouseError.message}`)
        }

        const baseUnitIds = productsData
          .map((product: Product) => product.base_unit_id)
          .filter((value): value is number => value !== null && value !== undefined)

        const allUnitIds = Array.from(new Set([...batchUnitIds, ...baseUnitIds]))

        const {
          data: unitRows,
          error: unitError,
        } = allUnitIds.length > 0
          ? await supabase.from('units').select('id, name, symbol').in('id', allUnitIds)
          : { data: [], error: null }

        if (unitError) {
          collectedErrors.push(`units: ${unitError.message}`)
        }

        const productsMap = new Map<number, Product>(productsData.map((product: Product) => [product.id, product]))
        const suppliesMap = new Map<number, Supply>(suppliesData.map((supply: Supply) => [supply.id, supply]))
        const warehousesMap = new Map<number, Warehouse>((Array.isArray(warehouseRows) ? warehouseRows : []).map((warehouse: Warehouse) => [warehouse.id, warehouse]))
        const unitsMap = new Map<number, Unit>((Array.isArray(unitRows) ? unitRows : []).map((unit: Unit) => [unit.id, unit]))

        interface AggregatedRecord {
          id: string
          product_id: number
          warehouse_id: number | null
          unit_id: number | null
          received: number
          accepted: number
          rejected: number
          hold: number
        }

        const aggregated = new Map<string, AggregatedRecord>()

        batches.forEach((batch: SupplyBatch) => {
          const productId = batch.product_id
          if (productId === null || productId === undefined) {
            return
          }

          const supply = batch.supply_id ? suppliesMap.get(batch.supply_id) : null
          const warehouseId = supply?.warehouse_id ?? null
          const aggregationKey = `${productId}-${warehouseId ?? 'none'}`

          if (!aggregated.has(aggregationKey)) {
            const defaultUnitId = batch.unit_id ?? productsMap.get(productId)?.base_unit_id ?? null
            aggregated.set(aggregationKey, {
              id: aggregationKey,
              product_id: productId,
              warehouse_id: warehouseId,
              unit_id: defaultUnitId,
              received: 0,
              accepted: 0,
              rejected: 0,
              hold: 0,
            })
          }

          const record = aggregated.get(aggregationKey)
          if (!record) {
            return
          }

          const receivedQty = parseNumber(batch.received_qty)
          const acceptedQty = parseNumber(batch.accepted_qty)
          const rejectedQty = parseNumber(batch.rejected_qty)
          const status = (batch.quality_status ?? '').toUpperCase()
          const inferredPending = Math.max(receivedQty - acceptedQty - rejectedQty, 0)

          record.received += receivedQty
          record.accepted += acceptedQty
          record.rejected += rejectedQty

          if (QUALITY_HOLD_STATUSES.has(status)) {
            record.hold += inferredPending
          } else if (status === 'FAILED') {
            record.hold += Math.max(rejectedQty, 0)
          }
        })

        const rows: StockLevel[] = Array.from(aggregated.values()).map((record: AggregatedRecord) => {
          const product = productsMap.get(record.product_id)
          const warehouse = record.warehouse_id ? warehousesMap.get(record.warehouse_id) : null
          const unitRecord =
            (record.unit_id !== null && record.unit_id !== undefined && unitsMap.get(record.unit_id)) ??
            (product?.base_unit_id ? unitsMap.get(product.base_unit_id) : null)

          const reorderPoint = toNullableNumber(product?.reorder_point)
          const safetyStock = toNullableNumber(product?.safety_stock)
          const onHand = Math.max(record.accepted + record.hold, 0)
          const qualityHold = Math.max(record.hold, 0)
          const availableSnapshot = Math.max(onHand - qualityHold, 0)

          let lowStockReason: string | null = null
          if (reorderPoint !== null && availableSnapshot < reorderPoint) {
            lowStockReason = 'Below reorder point'
          } else if (safetyStock !== null && availableSnapshot < safetyStock) {
            lowStockReason = 'Below safety stock'
          }

          return {
            id: record.id,
            product_id: record.product_id,
            product_name: product?.name ?? 'Unknown product',
            product_sku: product?.sku ?? '',
            warehouse_id: record.warehouse_id,
            warehouse_name: warehouse?.name ?? '—',
            on_hand: roundNumber(onHand),
            allocated: 0,
            quality_hold: roundNumber(qualityHold),
            in_transit: 0,
            unit: unitRecord ? (unitRecord.symbol ?? unitRecord.name ?? '') : '',
            reorder_point: reorderPoint,
            safety_stock: safetyStock,
            cycle_count_due_at: null,
            low_stock_reason: lowStockReason,
            notes: null,
            packSize: product?.pack_size ?? null,
            status: product?.status ?? null,
          }
        })

        rows.sort((a, b) => {
          const nameCompare = a.product_name.localeCompare(b.product_name)
          if (nameCompare !== 0) {
            return nameCompare
          }
          return a.warehouse_name.localeCompare(b.warehouse_name)
        })

        if (isMounted) {
          setProducts(productsData)
          setStockLevels(rows)
        }
      } catch (error) {
        collectedErrors.push(
          error instanceof Error ? error.message : 'Unexpected error while loading stock levels'
        )
      } finally {
        if (isMounted) {
          setErrors(Array.from(new Set(collectedErrors.filter(Boolean))))
          setLoading(false)
        }
      }
    }

    loadStockLevels()

    return () => {
      isMounted = false
    }
  }, [])

  const warehouses = useMemo(() => {
    const names = stockLevels
      .map((entry: StockLevel) => entry.warehouse_name)
      .filter((name: string) => name && name !== '—')
    return Array.from(new Set(names)).sort()
  }, [stockLevels])

  const enrichedStockLevels = useMemo((): EnrichedStockLevel[] => {
    return stockLevels.map((entry: StockLevel): EnrichedStockLevel => {
      const available = Math.max((entry.on_hand ?? 0) - (entry.quality_hold ?? 0) - (entry.allocated ?? 0), 0)
      const reorderTarget = entry.reorder_point ?? 0
      const safetyStock = entry.safety_stock ?? 0
      const isBelowReorder = reorderTarget > 0 && available < reorderTarget
      const isBelowSafety = safetyStock > 0 && available < safetyStock
      return {
        ...entry,
        available: Math.round(available * 100) / 100,
        reorderTarget,
        safetyStock,
        totalDemand: entry.allocated ?? 0,
        productStatus: entry.status ?? null,
        daysOfCover: null,
        isBelowReorder,
        isBelowSafety,
      }
    })
  }, [stockLevels])

  const filteredStockLevels = useMemo((): EnrichedStockLevel[] => {
    const normalisedSearch = searchTerm.trim().toLowerCase()
    return enrichedStockLevels.filter((entry: EnrichedStockLevel) => {
      const matchesSearch =
        !normalisedSearch ||
        entry.product_name.toLowerCase().includes(normalisedSearch) ||
        entry.product_sku.toLowerCase().includes(normalisedSearch) ||
        entry.notes?.toLowerCase().includes(normalisedSearch)

      const matchesWarehouse = warehouseFilter === 'ALL' || entry.warehouse_name === warehouseFilter

      const matchesCoverage =
        !showLowStockOnly ||
        entry.isBelowReorder ||
        entry.isBelowSafety ||
        (entry.daysOfCover !== null && entry.daysOfCover <= coverageThreshold)

      return matchesSearch && matchesWarehouse && matchesCoverage
    })
  }, [enrichedStockLevels, searchTerm, warehouseFilter, showLowStockOnly, coverageThreshold])

  const totalAvailable = filteredStockLevels.reduce((total: number, entry: EnrichedStockLevel) => total + entry.available, 0)
  const totalAllocated = filteredStockLevels.reduce((total: number, entry: EnrichedStockLevel) => total + (entry.allocated ?? 0), 0)
  const totalOnHand = filteredStockLevels.reduce((total: number, entry: EnrichedStockLevel) => total + (entry.on_hand ?? 0), 0)
  const lowStockCount = filteredStockLevels.filter((entry: EnrichedStockLevel) => entry.isBelowReorder).length

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: 'Product',
        render: (stock: EnrichedStockLevel) => (
          <div>
            <div className="font-medium text-text-dark">{stock.product_name}</div>
            <div className="text-xs text-text-dark/60">{stock.product_sku}</div>
            {stock.packSize ? (
              <div className="mt-1 inline-flex items-center rounded bg-olive-light/20 px-2 py-0.5 text-[11px] text-text-dark/70">
                {stock.packSize}
              </div>
            ) : null}
          </div>
        ),
        mobileRender: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{stock.product_name}</div>
            <div className="text-xs text-text-dark/60">{stock.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        accessor: 'warehouse_name',
        cellClassName: 'text-text-dark/70',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'onHand',
        header: 'On Hand',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">
              {stock.on_hand} {stock.unit}
            </div>
            <div className="text-xs text-text-dark/60">Allocated: {stock.allocated}</div>
          </div>
        ),
        mobileRender: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">
              {stock.on_hand} {stock.unit}
            </div>
            <div className="text-xs text-text-dark/60">Allocated: {stock.allocated}</div>
          </div>
        ),
      },
      {
        key: 'quality',
        header: 'Quality Hold',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/70',
        render: (stock: EnrichedStockLevel) => `${stock.quality_hold ?? 0} ${stock.unit}`,
        mobileRender: (stock: EnrichedStockLevel) => `${stock.quality_hold ?? 0} ${stock.unit}`,
      },
      {
        key: 'available',
        header: 'Available',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-semibold',
        render: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div className="font-semibold text-text-dark">
              {stock.available} {stock.unit}
            </div>
            <div className="text-xs text-text-dark/60">In transit: {stock.in_transit ?? 0}</div>
          </div>
        ),
        mobileRender: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div className="font-semibold text-text-dark">
              {stock.available} {stock.unit}
            </div>
            <div className="text-xs text-text-dark/60">In transit: {stock.in_transit ?? 0}</div>
          </div>
        ),
      },
      {
        key: 'thresholds',
        header: 'Min / Safety',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-sm text-text-dark/80',
        render: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div>Min: {stock.reorder_point ?? '—'}</div>
            <div>Safety: {stock.safetyStock}</div>
          </div>
        ),
        mobileRender: (stock: EnrichedStockLevel) => (
          <div className="text-right">
            <div>Min: {stock.reorder_point ?? '—'}</div>
            <div>Safety: {stock.safetyStock}</div>
          </div>
        ),
      },
      {
        key: 'coverage',
        header: 'Days of Cover',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (stock: EnrichedStockLevel) =>
          stock.daysOfCover !== null ? (
            <span
              className={`inline-flex items-center justify-end rounded-full px-2 py-1 text-xs font-medium ${
                stock.daysOfCover <= coverageThreshold ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
              }`}
            >
              <ArrowUpRight className="mr-1 h-3 w-3" />
              {stock.daysOfCover} days
            </span>
          ) : (
            '—'
          ),
        mobileRender: (stock: EnrichedStockLevel) =>
          stock.daysOfCover !== null ? (
            <span
              className={`inline-flex items-center justify-end rounded-full px-2 py-1 text-xs font-medium ${
                stock.daysOfCover <= coverageThreshold ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
              }`}
            >
              <ArrowUpRight className="mr-1 h-3 w-3" />
              {stock.daysOfCover} days
            </span>
          ) : (
            '—'
          ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (stock: EnrichedStockLevel) => {
          const showLowStock = stock.isBelowReorder || stock.isBelowSafety
          const badgeClass = showLowStock
            ? 'bg-orange-100 text-orange-800'
            : 'bg-green-100 text-green-800'
          return (
            <div className="space-y-1 text-right sm:text-left">
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>
                {showLowStock ? 'Attention' : 'Healthy'}
              </span>
              {stock.low_stock_reason ? (
                <p className="text-xs text-orange-700">{stock.low_stock_reason}</p>
              ) : null}
            </div>
          )
        },
        mobileRender: (stock: EnrichedStockLevel) => {
          const showLowStock = stock.isBelowReorder || stock.isBelowSafety
          const badgeClass = showLowStock
            ? 'bg-orange-100 text-orange-800'
            : 'bg-green-100 text-green-800'
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>
                {showLowStock ? 'Attention' : 'Healthy'}
              </span>
              {stock.low_stock_reason ? (
                <p className="text-xs text-right text-orange-700">{stock.low_stock_reason}</p>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'nextCount',
        header: 'Next Count',
        render: (stock: EnrichedStockLevel) => (
          <div className="text-sm text-text-dark/70">
            {stock.cycle_count_due_at
              ? new Date(stock.cycle_count_due_at).toLocaleDateString()
              : 'Not scheduled'}
          </div>
        ),
        mobileRender: (stock: EnrichedStockLevel) => (
          <div className="text-right text-sm text-text-dark/70">
            {stock.cycle_count_due_at
              ? new Date(stock.cycle_count_due_at).toLocaleDateString()
              : 'Not scheduled'}
          </div>
        ),
      },
    ],
    [coverageThreshold]
  )

  if (loading) {
    return (
      <PageLayout
        title="Supply Stock"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading supply stock..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Supply Stock"
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-4">
        <Link
          to="/inventory/stock-levels"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stock Levels
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total On Hand</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl font-semibold text-text-dark">
              {totalOnHand.toLocaleString()} <span className="text-sm font-medium text-text-dark/60">Kg</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Available</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl font-semibold text-text-dark">
              {totalAvailable.toLocaleString()} <span className="text-sm font-medium text-text-dark/60">Kg</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Allocated</CardDescription>
            <CardTitle className="flex items-baseline gap-2 text-2xl font-semibold text-text-dark">
              {totalAllocated.toLocaleString()} <span className="text-sm font-medium text-text-dark/60">Kg</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Items Requiring Action</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl font-semibold text-text-dark">
              {lowStockCount}
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Supply Stock Levels</CardTitle>
              <CardDescription>
                Track available stock, quality holds, allocations, and cycle counts by warehouse.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-olive-light/50 px-3 py-1 text-xs text-text-dark/70">
              <BarChart3 className="h-4 w-4" />
              Coverage threshold: {coverageThreshold} days
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {errors.length > 0 ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              <p className="font-medium">Some data could not be loaded:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {errors.map((error: string) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label htmlFor="stock-search">Search</Label>
              <Input
                id="stock-search"
                placeholder="Search by product, SKU, or note"
                value={searchTerm}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="warehouse-filter">Warehouse</Label>
              <select
                id="warehouse-filter"
                value={warehouseFilter}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setWarehouseFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All warehouses</option>
                {warehouses.map((warehouse: string) => (
                  <option key={warehouse} value={warehouse}>
                    {warehouse}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="coverage-threshold">Coverage threshold (days)</Label>
              <Input
                id="coverage-threshold"
                type="number"
                min={1}
                value={coverageThreshold}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setCoverageThreshold(Number(event.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-dark/80">
                <input
                  type="checkbox"
                  checked={showLowStockOnly}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setShowLowStockOnly(event.target.checked)}
                  className="h-4 w-4 rounded border border-olive-light/50 text-olive focus:ring-olive"
                />
                Focus on risk items
              </label>
            </div>
          </div>

          {filteredStockLevels.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No supply stock recorded yet. Add supplies to see stock levels here.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={filteredStockLevels}
              rowKey="id"
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
              onRowClick={undefined}
            />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default SupplyStockPage
