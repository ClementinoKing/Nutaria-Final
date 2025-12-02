import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const DEFAULT_LOW_STOCK_THRESHOLD = Number.isFinite(
  Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD as string)
)
  ? Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD as string)
  : 100

const INVENTORY_SOURCE_FALLBACKS = ['stock_levels', 'supply_batches']

const envConfiguredSources = import.meta.env.VITE_SUPABASE_INVENTORY_SOURCES as string | undefined
const inventorySources = Array.from(
  new Set(
    [
      ...(envConfiguredSources
        ? envConfiguredSources
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : []),
      ...INVENTORY_SOURCE_FALLBACKS,
    ].filter(Boolean)
  )
)

function coalesceNumber(...values: (unknown)[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue
    }
    const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value))
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }
  return null
}

interface Product {
  id: number
  name?: string
  sku?: string
  reorder_point?: number
  safety_stock?: number
  base_unit_id?: number
  unit_symbol?: string
  unit_name?: string
}

interface Warehouse {
  id: number
  name?: string
}

interface Unit {
  id: number
  name?: string
  symbol?: string
}

interface InventoryRow {
  id?: string | number
  product_id?: number | null
  productId?: number
  product?: Product
  products?: Product
  product_id_fk?: number
  item_id?: number
  warehouse_id?: number | null
  warehouseId?: number
  location_id?: number
  locationId?: number
  warehouse?: Warehouse
  warehouses?: Warehouse
  site_id?: number
  unit_id?: number | null
  unitId?: number
  base_unit_id?: number
  baseUnitId?: number
  on_hand?: number
  qty_on_hand?: number
  quantity_on_hand?: number
  onhand_qty?: number
  quantity?: number
  qty?: number
  current_qty?: number
  qty_available?: number
  quantity_available?: number
  available_qty?: number
  available?: number
  allocated?: number
  qty_allocated?: number
  quantity_allocated?: number
  reserved_qty?: number
  qty_reserved?: number
  reserved?: number
  allocated_qty?: number
  quality_hold?: number
  qty_quality_hold?: number
  quantity_quality_hold?: number
  quality_holds?: number
  on_quality_hold?: number
  quarantine_qty?: number
  in_transit?: number
  qty_in_transit?: number
  quantity_in_transit?: number
  transit_qty?: number
  pending_qty?: number
  in_transit_qty?: number
  reorder_point?: number
  minimum_qty?: number
  min_qty?: number
  safety_stock?: number
  safety_qty?: number
  last_updated?: string | Date
  updated_at?: string | Date
  last_counted_at?: string | Date
  counted_at?: string | Date
  verified_at?: string | Date
  created_at?: string | Date
  recorded_at?: string | Date
  timestamp?: string | Date
  unit?: string
  unit_name?: string
  unit_symbol?: string
  uom?: string
  product_name?: string
  product_sku?: string
  warehouse_name?: string
}

interface NormalizedInventoryRow {
  id: string
  product_id: number | null
  product_name: string
  product_sku: string
  warehouse_name: string
  unit: string
  available: number
  on_hand: number
  allocated: number
  in_transit: number
  reorder_point: number | null
  safety_stock: number | null
  quality_hold: number
  last_updated: Date | null
}

function normaliseInventoryRows(
  rows: InventoryRow[],
  { productMap, warehouseMap, unitMap }: {
    productMap: Map<number, Product>
    warehouseMap: Map<number, Warehouse>
    unitMap: Map<number, Unit>
  }
): NormalizedInventoryRow[] {
  return rows.map((row, index) => {
    const productId =
      row.product_id ??
      row.productId ??
      row.product?.id ??
      row.products?.id ??
      row.product_id_fk ??
      row.item_id ??
      null

    const warehouseId =
      row.warehouse_id ??
      row.warehouseId ??
      row.location_id ??
      row.locationId ??
      row.warehouse?.id ??
      row.warehouses?.id ??
      row.site_id ??
      null

    const product = productId !== null ? productMap.get(productId) : undefined
    const warehouse = warehouseId !== null ? warehouseMap.get(warehouseId) : undefined

    const unitId =
      row.unit_id ??
      row.unitId ??
      row.base_unit_id ??
      row.baseUnitId ??
      product?.base_unit_id ??
      null

    const unitRecord = unitId !== null ? unitMap.get(unitId) : undefined

    const onHand = coalesceNumber(
      row.on_hand,
      row.qty_on_hand,
      row.quantity_on_hand,
      row.onhand_qty,
      row.quantity,
      row.qty,
      row.current_qty,
      row.qty_available,
      row.quantity_available,
      row.available_qty,
      row.available
    )

    const allocated = coalesceNumber(
      row.allocated,
      row.qty_allocated,
      row.quantity_allocated,
      row.reserved_qty,
      row.qty_reserved,
      row.reserved,
      row.allocated_qty
    )

    const qualityHold = coalesceNumber(
      row.quality_hold,
      row.qty_quality_hold,
      row.quantity_quality_hold,
      row.quality_holds,
      row.on_quality_hold,
      row.quarantine_qty
    ) ?? 0

    const inTransit = coalesceNumber(
      row.in_transit,
      row.qty_in_transit,
      row.quantity_in_transit,
      row.transit_qty,
      row.pending_qty,
      row.in_transit_qty
    )

    const available = coalesceNumber(row.available, row.qty_available, row.available_qty)
    const effectiveOnHand = onHand ?? available ?? 0
    const effectiveAllocated = allocated ?? 0
    const calculatedAvailable =
      available !== null && available !== undefined
        ? available
        : Math.max(effectiveOnHand - effectiveAllocated - qualityHold, 0)

    const reorderPoint = coalesceNumber(row.reorder_point, row.minimum_qty, row.min_qty, product?.reorder_point)
    const safetyStock = coalesceNumber(row.safety_stock, row.safety_qty, product?.safety_stock)

    const timestampCandidates = [
      row.last_updated,
      row.updated_at,
      row.last_counted_at,
      row.counted_at,
      row.verified_at,
      row.created_at,
      row.recorded_at,
      row.timestamp,
    ]
    const lastUpdatedValue = timestampCandidates.find((value) => {
      const date = value instanceof Date ? value : value ? new Date(value) : null
      return date instanceof Date && !Number.isNaN(date.valueOf())
    })
    const lastUpdated: Date | null = lastUpdatedValue
      ? lastUpdatedValue instanceof Date
        ? lastUpdatedValue
        : new Date(lastUpdatedValue)
      : null

    const unitLabel =
      row.unit ??
      row.unit_name ??
      row.unit_symbol ??
      row.uom ??
      unitRecord?.symbol ??
      unitRecord?.name ??
      product?.unit_symbol ??
      product?.unit_name ??
      ''

    return {
      id: String(row.id ?? `${productId ?? 'product'}-${warehouseId ?? 'warehouse'}-${index}`),
      product_id: productId ?? null,
      product_name: row.product_name ?? product?.name ?? 'Unknown product',
      product_sku: row.product_sku ?? product?.sku ?? '',
      warehouse_name: row.warehouse_name ?? warehouse?.name ?? '—',
      unit: unitLabel,
      available: calculatedAvailable,
      on_hand: effectiveOnHand,
      allocated: effectiveAllocated,
      in_transit: inTransit ?? 0,
      reorder_point: reorderPoint,
      safety_stock: safetyStock,
      quality_hold: qualityHold,
      last_updated: lastUpdated,
    }
  })
}

interface DashboardStats {
  totalProducts: number
  lowStockCount: number
  openShipments: number
  halalSuppliers: number
}

interface UseDashboardDataReturn {
  stats: DashboardStats
  recentStock: NormalizedInventoryRow[]
  loading: boolean
  errors: string[]
  refresh: () => Promise<void>
}

export function useDashboardData(): UseDashboardDataReturn {
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockCount: 0,
    openShipments: 0,
    halalSuppliers: 0,
  })
  const [recentStock, setRecentStock] = useState<NormalizedInventoryRow[]>([])

  const runQuerySafely = useCallback(async (queryPromise: PromiseLike<unknown>, label: string) => {
    try {
      const result = await queryPromise
      const error = (result as { error?: { message?: string } })?.error
      if (error) {
        const message = error?.message ?? `Unknown error while fetching ${label}`
        return { data: null, error: `${label}: ${message}` }
      }
      return { data: result, error: null }
    } catch (error) {
      return {
        data: null,
        error: `${label}: ${error instanceof Error ? error.message : 'Unexpected error'}`,
      }
    }
  }, [])

  const fetchInventoryData = useCallback(
    async ({
      productMap,
      warehouseMap,
      unitMap,
    }: {
      productMap: Map<number, Product>
      warehouseMap: Map<number, Warehouse>
      unitMap: Map<number, Unit>
    }) => {
      const inventoryFetchErrors: string[] = []

      for (const table of inventorySources) {
        const { data: queryResult, error } = await runQuerySafely(
          supabase.from(table).select('*').limit(200),
          `${table} inventory`
        )

        if (error) {
          inventoryFetchErrors.push(error)
          continue
        }

        const rows = Array.isArray((queryResult as { data?: unknown })?.data)
          ? (queryResult as { data: InventoryRow[] }).data
          : (queryResult as { data?: InventoryRow[] })?.data ?? []

        if (rows.length > 0) {
          const normalised = normaliseInventoryRows(rows, { productMap, warehouseMap, unitMap })

          return { rows: normalised, errors: inventoryFetchErrors }
        }
      }

      return { rows: [] as NormalizedInventoryRow[], errors: inventoryFetchErrors }
    },
    [runQuerySafely]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrors([])

    const collectedErrors: string[] = []

    const [productsResult, halalSuppliersResult, openShipmentsResult, warehousesResult, unitsResult] =
      await Promise.all([
        runQuerySafely(
          supabase
            .from('products')
            .select('id, name, sku, reorder_point, safety_stock, target_stock, base_unit_id', { count: 'exact' }),
          'products'
        ),
        runQuerySafely(
          supabase.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_halal_certified', true),
          'halal suppliers'
        ),
        runQuerySafely(
          supabase
            .from('shipments')
            .select('id', { count: 'exact', head: true })
            .in('doc_status', ['PENDING', 'READY']),
          'open shipments'
        ),
        runQuerySafely(supabase.from('warehouses').select('id, name'), 'warehouses'),
        runQuerySafely(supabase.from('units').select('id, name, symbol'), 'units'),
      ])

    let products: Product[] = []
    let totalProducts = 0

    if ((productsResult as { error?: string }).error) {
      collectedErrors.push((productsResult as { error: string }).error)
    } else if (productsResult.data) {
      const data = (productsResult.data as { data?: Product[]; count?: number })
      products = Array.isArray(data.data) ? data.data : []
      totalProducts = data.count ?? products.length
    }

    const productMap = new Map<number, Product>()
    products.forEach((product) => {
      if (product?.id !== undefined && product?.id !== null) {
        productMap.set(product.id, product)
      }
    })

    let halalSuppliers = 0
    if ((halalSuppliersResult as { error?: string }).error) {
      collectedErrors.push((halalSuppliersResult as { error: string }).error)
    } else if (halalSuppliersResult.data) {
      const data = halalSuppliersResult.data as { count?: number; data?: unknown[] }
      halalSuppliers =
        data.count ??
        (Array.isArray(data.data) ? data.data.length : 0)
    }

    const warehouses =
      warehousesResult.data && Array.isArray((warehousesResult.data as { data?: Warehouse[] }).data)
        ? (warehousesResult.data as { data: Warehouse[] }).data
        : []
    if ((warehousesResult as { error?: string }).error) {
      collectedErrors.push((warehousesResult as { error: string }).error)
    }

    const units =
      unitsResult.data && Array.isArray((unitsResult.data as { data?: Unit[] }).data)
        ? (unitsResult.data as { data: Unit[] }).data
        : []
    if ((unitsResult as { error?: string }).error) {
      collectedErrors.push((unitsResult as { error: string }).error)
    }

    const warehouseMap = new Map<number, Warehouse>()
    warehouses.forEach((warehouse) => {
      if (warehouse?.id !== undefined && warehouse?.id !== null) {
        warehouseMap.set(warehouse.id, warehouse)
      }
    })

    const unitMap = new Map<number, Unit>()
    units.forEach((unit) => {
      if (unit?.id !== undefined && unit?.id !== null) {
        unitMap.set(unit.id, unit)
      }
    })

    const { rows: inventoryRows, errors: inventoryErrors } = await fetchInventoryData({
      productMap,
      warehouseMap,
      unitMap,
    })

    collectedErrors.push(...inventoryErrors)

    const lowStockCount = inventoryRows.reduce((total, entry) => {
      const threshold =
        entry.reorder_point ??
        entry.safety_stock ??
        productMap.get(entry.product_id ?? 0)?.reorder_point ??
        productMap.get(entry.product_id ?? 0)?.safety_stock ??
        DEFAULT_LOW_STOCK_THRESHOLD

      const availableQty = Number.isFinite(entry.available) ? entry.available : 0

      return availableQty < threshold ? total + 1 : total
    }, 0)

    const sortedStock = [...inventoryRows].sort((a, b) => {
      const aTime = a.last_updated ? new Date(a.last_updated).getTime() : 0
      const bTime = b.last_updated ? new Date(b.last_updated).getTime() : 0
      return bTime - aTime
    })

    let openShipments = 0
    if ((openShipmentsResult as { error?: string }).error) {
      collectedErrors.push((openShipmentsResult as { error: string }).error)
    } else if (openShipmentsResult.data) {
      const data = openShipmentsResult.data as { count?: number; data?: unknown[] }
      openShipments = data.count ?? 0
      if (Number.isNaN(openShipments)) {
        openShipments = Array.isArray(data.data)
          ? data.data.length
          : Number.parseInt(String(data.data), 10) || 0
      }
    }

    setStats({
      totalProducts,
      lowStockCount,
      openShipments,
      halalSuppliers,
    })
    setRecentStock(sortedStock.slice(0, 5))
    setErrors(collectedErrors.filter(Boolean))
    setLoading(false)
  }, [fetchInventoryData, runQuerySafely])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    stats,
    recentStock,
    loading,
    errors,
    refresh: fetchData,
  }
}

