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
  suppliersCount: number
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
    suppliersCount: 0,
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

      // Fetch supplies data for supply_batches warehouse lookup (only if supply_batches is in sources)
      let suppliesMap = new Map<number, { warehouse_id: number | null }>()
      if (inventorySources.includes('supply_batches')) {
        const suppliesResult = await runQuerySafely(
          supabase.from('supplies').select('id, warehouse_id').limit(1000),
          'supplies for warehouse lookup'
        )
        if (suppliesResult.data && !(suppliesResult as { error?: string }).error) {
          const suppliesData = (suppliesResult.data as { data?: Array<{ id: number; warehouse_id: number | null }> })?.data ?? []
          suppliesMap = new Map(suppliesData.map((s) => [s.id, { warehouse_id: s.warehouse_id }]))
        }
      }

      // Try tables in order, return first successful result
      // Limit to 100 rows for dashboard (reduced from 200)
      for (const table of inventorySources) {
        // Build column list based on table structure
        let columns = 'id, product_id'
        
        if (table === 'supply_batches') {
          columns = 'id, supply_id, product_id, unit_id, received_qty, accepted_qty, rejected_qty, current_qty, quality_status'
        } else if (table === 'stock_levels') {
          columns = 'id, product_id, warehouse_id, on_hand, available, allocated, quality_hold, in_transit, reorder_point, safety_stock, last_updated, updated_at, created_at'
        } else {
          columns = 'id, product_id, warehouse_id, unit_id, on_hand, available, allocated, quality_hold, in_transit, reorder_point, safety_stock, last_updated, updated_at, created_at'
        }

        // Query without ordering to avoid column errors
        // Sorting will be done in-memory after fetching
        const { data: queryResult, error } = await runQuerySafely(
          supabase.from(table).select(columns).limit(100),
          `${table} inventory`
        )

        if (error) {
          // Skip tables that don't exist or have column mismatches
          if (error.includes('does not exist') || error.includes('column')) {
            continue
          }
          inventoryFetchErrors.push(error)
          continue
        }

        let rows = Array.isArray((queryResult as { data?: unknown })?.data)
          ? (queryResult as { data: InventoryRow[] }).data
          : (queryResult as { data?: InventoryRow[] })?.data ?? []

        // For supply_batches, enrich rows with warehouse_id from supplies
        if (table === 'supply_batches' && rows.length > 0) {
          rows = rows.map((row: InventoryRow & { supply_id?: number }) => {
            if (row.supply_id && suppliesMap.has(row.supply_id)) {
              return { ...row, warehouse_id: suppliesMap.get(row.supply_id)?.warehouse_id ?? null }
            }
            return row
          })
        }

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

    // Fetch all data in parallel for faster loading
    // Optimize: Only fetch products that might appear in recent stock (limit to 500)
    // For total count, use count query separately if needed
    const [productsResult, productsCountResult, suppliersResult, openShipmentsResult, warehousesResult, unitsResult] =
      await Promise.all([
        runQuerySafely(
          supabase
            .from('products')
            .select('id, name, sku, reorder_point, safety_stock, base_unit_id')
            .limit(500), // Reduced limit - only products that might appear in recent stock
          'products'
        ),
        runQuerySafely(
          supabase.from('products').select('id', { count: 'exact', head: true }),
          'products count'
        ),
        runQuerySafely(
          supabase.from('suppliers').select('id', { count: 'exact', head: true }),
          'suppliers'
        ),
        runQuerySafely(
          supabase
            .from('shipments')
            .select('id', { count: 'exact', head: true })
            .in('doc_status', ['PENDING', 'READY']),
          'open shipments'
        ),
        runQuerySafely(supabase.from('warehouses').select('id, name').limit(100), 'warehouses'),
        runQuerySafely(supabase.from('units').select('id, name, symbol').limit(100), 'units'),
      ])

    let products: Product[] = []
    let totalProducts = 0

    // Get total products count from dedicated count query
    if ((productsCountResult as { error?: string }).error) {
      collectedErrors.push((productsCountResult as { error: string }).error)
    } else if (productsCountResult.data) {
      const countData = productsCountResult.data as { count?: number }
      totalProducts = countData.count ?? 0
    }

    // Get products for inventory normalization (limited set)
    if ((productsResult as { error?: string }).error) {
      collectedErrors.push((productsResult as { error: string }).error)
    } else if (productsResult.data) {
      const data = (productsResult.data as { data?: Product[] })
      products = Array.isArray(data.data) ? data.data : []
    }

    const productMap = new Map<number, Product>()
    products.forEach((product) => {
      if (product?.id !== undefined && product?.id !== null) {
        productMap.set(product.id, product)
      }
    })

    let suppliersCount = 0
    if ((suppliersResult as { error?: string }).error) {
      collectedErrors.push((suppliersResult as { error: string }).error)
    } else if (suppliersResult.data) {
      const data = suppliersResult.data as { count?: number; data?: unknown[] }
      suppliersCount =
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
      suppliersCount,
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

