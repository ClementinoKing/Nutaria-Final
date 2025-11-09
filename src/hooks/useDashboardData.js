import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const DEFAULT_LOW_STOCK_THRESHOLD = Number.isFinite(
  Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD)
)
  ? Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD)
  : 100

const INVENTORY_SOURCE_FALLBACKS = ['stock_levels', 'supply_batches']

const envConfiguredSources = import.meta.env.VITE_SUPABASE_INVENTORY_SOURCES
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

function coalesceNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue
    }
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }
  return null
}

function normaliseInventoryRows(rows, { productMap, warehouseMap, unitMap }) {
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
      product?.baseUnitId ??
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
    const lastUpdated =
      timestampCandidates.find((value) => {
        const date = value instanceof Date ? value : value ? new Date(value) : null
        return date instanceof Date && !Number.isNaN(date.valueOf())
      }) ?? null

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
      id: row.id ?? `${productId ?? 'product'}-${warehouseId ?? 'warehouse'}-${index}`,
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

export function useDashboardData() {
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState([])
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    openShipments: 0,
    halalSuppliers: 0,
  })
  const [recentStock, setRecentStock] = useState([])

  const runQuerySafely = useCallback(async (queryPromise, label) => {
    try {
      const result = await queryPromise
      if (result.error) {
        const message = result.error?.message ?? `Unknown error while fetching ${label}`
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
    async ({ productMap, warehouseMap, unitMap }) => {
      const inventoryFetchErrors = []

      for (const table of inventorySources) {
        const { data: queryResult, error } = await runQuerySafely(
          supabase.from(table).select('*').limit(200),
          `${table} inventory`
        )

        if (error) {
          inventoryFetchErrors.push(error)
          continue
        }

        const rows = Array.isArray(queryResult.data) ? queryResult.data : queryResult.data ?? []

        if (rows.length > 0) {
          const normalised = normaliseInventoryRows(rows, { productMap, warehouseMap, unitMap })

          return { rows: normalised, errors: inventoryFetchErrors }
        }
      }

      return { rows: [], errors: inventoryFetchErrors }
    },
    [runQuerySafely]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrors([])

    const collectedErrors = []

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

    let products = []
    let totalProducts = 0

    if (productsResult.error) {
      collectedErrors.push(productsResult.error)
    } else if (productsResult.data) {
      products = Array.isArray(productsResult.data.data) ? productsResult.data.data : []
      totalProducts = productsResult.data.count ?? products.length
    }

    const productMap = new Map()
    products.forEach((product) => {
      if (product?.id !== undefined && product?.id !== null) {
        productMap.set(product.id, product)
      }
    })

    let halalSuppliers = 0
    if (halalSuppliersResult.error) {
      collectedErrors.push(halalSuppliersResult.error)
    } else if (halalSuppliersResult.data) {
      halalSuppliers =
        halalSuppliersResult.data.count ??
        (Array.isArray(halalSuppliersResult.data.data) ? halalSuppliersResult.data.data.length : 0)
    }

    const warehouses =
      warehousesResult.data && Array.isArray(warehousesResult.data.data) ? warehousesResult.data.data : []
    if (warehousesResult.error) {
      collectedErrors.push(warehousesResult.error)
    }

    const units = unitsResult.data && Array.isArray(unitsResult.data.data) ? unitsResult.data.data : []
    if (unitsResult.error) {
      collectedErrors.push(unitsResult.error)
    }

    const warehouseMap = new Map()
    warehouses.forEach((warehouse) => {
      if (warehouse?.id !== undefined && warehouse?.id !== null) {
        warehouseMap.set(warehouse.id, warehouse)
      }
    })

    const unitMap = new Map()
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
        productMap.get(entry.product_id)?.reorder_point ??
        productMap.get(entry.product_id)?.safety_stock ??
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
    if (openShipmentsResult.error) {
      collectedErrors.push(openShipmentsResult.error)
    } else if (openShipmentsResult.data) {
      openShipments = openShipmentsResult.data.count ?? 0
      if (Number.isNaN(openShipments)) {
        openShipments = Array.isArray(openShipmentsResult.data.data)
          ? openShipmentsResult.data.data.length
          : Number.parseInt(openShipmentsResult.data.data, 10) || 0
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


