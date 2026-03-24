import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ArrowLeft, ChevronDown, Download, Grid2X2, Hash, Package, Plus, Search, SlidersHorizontal, Truck, X } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import SettingsTour from '@/components/tour/SettingsTour'
import { useSettingsTour, type TourStep } from '@/hooks/useSettingsTour'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'

interface AllocationRow {
  id: string
  product_id: number | null
  product_name: string
  product_sku: string
  pack_identifier: string
  storage_type: string | null
  box_unit_code: string | null
  units_count: number
  shipped_units: number
  remaining_units: number
  packs_per_unit: number
  total_packs: number
  total_quantity_kg: number
  shipped_quantity_kg: number
  remaining_quantity_kg: number
  status: 'Allocated' | 'Partially Shipped' | 'Completed'
  notes: string | null
  lot_no: string | null
  warehouse_name: string | null
  qa_status: string | null
  allocated_at: string | null
}

function AllocationPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AllocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | AllocationRow['status']>('ALL')
  const [storageFilter, setStorageFilter] = useState('ALL')
  const [productFilter, setProductFilter] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('')
  const [packFilter, setPackFilter] = useState('')
  const [lotFilter, setLotFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [qtyMin, setQtyMin] = useState('')
  const [qtyMax, setQtyMax] = useState('')
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [unitDisplay, setUnitDisplay] = useState<'units' | 'packs'>('packs')
  const [showFilters, setShowFilters] = useState(false)
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('process_packaging_storage_allocations')
        .select(`
          id,
          storage_type,
          box_unit_code,
          units_count,
          packs_per_unit,
          total_packs,
          total_quantity_kg,
          notes,
          created_at,
          pack_entry:process_packaging_pack_entries(
            product_id,
            mixed_pack_batch_id,
            pack_identifier,
            packet_unit_code,
            mixed_pack_batch:mixed_pack_batch_id(
              pack_name
            ),
            sorting_output:process_sorting_outputs(
              product_id,
              product:products(id, name, sku)
            ),
            packaging_run:process_packaging_runs(
              process_step_run_id,
              process_step_runs(
                process_lot_run_id,
                process_lot_runs(
                  supply_batch_id,
                  supply_batches(
                    lot_no,
                    quality_status,
                    supply_id,
                    supplies(
                      doc_no,
                      received_at,
                      warehouse_id,
                      warehouses(name)
                    )
                  )
                )
              )
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (entriesError) {
        setError(getUserFriendlyErrorMessage(entriesError, 'We could not load the allocations right now. Please refresh and try again.'))
        setRows([])
        return
      }

      const list = (entries ?? []) as Array<{
        id: number
        storage_type: string | null
        box_unit_code: string | null
        units_count: number | null
        packs_per_unit: number | null
        total_packs: number | null
        total_quantity_kg: number | null
        notes: string | null
        created_at: string | null
        pack_entry:
          | {
              product_id: number | null
              mixed_pack_batch_id?: number | null
              pack_identifier: string | null
              packet_unit_code: string | null
              mixed_pack_batch?: { pack_name?: string | null } | null
              sorting_output: {
                product_id: number
                product: { id: number; name: string | null; sku: string | null } | null
              } | null
              packaging_run: {
                process_step_run_id: number
                process_step_runs:
                  | {
                      process_lot_run_id: number
                      process_lot_runs: {
                        supply_batch_id: number
                        supply_batches: {
                          lot_no: string | null
                          quality_status: string | null
                          supply_id: number
                          supplies: {
                            doc_no: string | null
                            received_at: string | null
                            warehouse_id: number | null
                            warehouses: { name: string | null } | null
                          } | null
                        } | null
                      } | null
                    }
                  | Array<{
                      process_lot_run_id: number
                      process_lot_runs: {
                        supply_batch_id: number
                        supply_batches: {
                          lot_no: string | null
                          quality_status: string | null
                          supply_id: number
                          supplies: {
                            doc_no: string | null
                            received_at: string | null
                            warehouse_id: number | null
                            warehouses: { name: string | null } | null
                          } | null
                        } | null
                      } | null
                    }>
                  | null
              } | null
            }
          | Array<{
              product_id: number | null
              mixed_pack_batch_id?: number | null
              pack_identifier: string | null
              packet_unit_code: string | null
              mixed_pack_batch?: { pack_name?: string | null } | null
              sorting_output: {
                product_id: number
                product: { id: number; name: string | null; sku: string | null } | null
              } | null
              packaging_run: {
                process_step_run_id: number
                process_step_runs:
                  | {
                      process_lot_run_id: number
                      process_lot_runs: {
                        supply_batch_id: number
                        supply_batches: {
                          lot_no: string | null
                          quality_status: string | null
                          supply_id: number
                          supplies: {
                            doc_no: string | null
                            received_at: string | null
                            warehouse_id: number | null
                            warehouses: { name: string | null } | null
                          } | null
                        } | null
                      } | null
                    }
                  | Array<{
                      process_lot_run_id: number
                      process_lot_runs: {
                        supply_batch_id: number
                        supply_batches: {
                          lot_no: string | null
                          quality_status: string | null
                          supply_id: number
                          supplies: {
                            doc_no: string | null
                            received_at: string | null
                            warehouse_id: number | null
                            warehouses: { name: string | null } | null
                          } | null
                        } | null
                      } | null
                    }>
                  | null
              } | null
            }>
          | null
      }>

      const { data: shippedRows } = await supabase
        .from('shipment_pack_items')
        .select(
          `
          packaging_allocation_id,
          units_count,
          shipment:shipments(doc_status)
        `
        )

      const shippedUnitsByAllocation = new Map<number, number>()
      ;((shippedRows ?? []) as Array<{
        packaging_allocation_id: number | null
        units_count: number | null
        shipment: { doc_status?: string | null } | null
      }>).forEach((row) => {
        if (!row.packaging_allocation_id) return
        const status = row.shipment?.doc_status ?? null
        if (status !== 'SHIPPED') return
        const shippedUnits = Number(row.units_count) || 0
        shippedUnitsByAllocation.set(
          row.packaging_allocation_id,
          (shippedUnitsByAllocation.get(row.packaging_allocation_id) ?? 0) + shippedUnits
        )
      })

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const result: AllocationRow[] = list.map((entry) => {
        const packEntry = unwrap(entry.pack_entry)
        const productName = packEntry?.mixed_pack_batch?.pack_name ?? packEntry?.sorting_output?.product?.name ?? 'Unknown'
        const productSku = packEntry?.mixed_pack_batch?.pack_name ? '' : (packEntry?.sorting_output?.product?.sku ?? '')
        const stepRun = unwrap(packEntry?.packaging_run?.process_step_runs)
        const lotRun = stepRun?.process_lot_runs ?? null
        const batch = lotRun?.supply_batches ?? null
        const supply = batch?.supplies ?? null
        const warehouseName = supply?.warehouses?.name ?? null

        const unitsCount = Number(entry.units_count) || 0
        const shippedUnits = shippedUnitsByAllocation.get(entry.id) ?? 0
        const remainingUnits = Math.max(0, unitsCount - shippedUnits)
        const unitQuantityKg =
          unitsCount > 0 ? (Number(entry.total_quantity_kg) || 0) / unitsCount : 0
        const shippedQuantityKg = shippedUnits * unitQuantityKg
        const remainingQuantityKg = remainingUnits * unitQuantityKg
        const status: AllocationRow['status'] =
          shippedUnits === 0
            ? 'Allocated'
            : remainingUnits === 0
              ? 'Completed'
              : 'Partially Shipped'

        return {
          id: String(entry.id),
          product_id: packEntry?.product_id ?? packEntry?.sorting_output?.product?.id ?? null,
          product_name: productName,
          product_sku: productSku,
          pack_identifier: packEntry?.packet_unit_code ?? packEntry?.pack_identifier ?? '—',
          storage_type: entry.storage_type ?? null,
          box_unit_code: entry.box_unit_code ?? null,
          units_count: unitsCount,
          shipped_units: shippedUnits,
          remaining_units: remainingUnits,
          packs_per_unit: Number(entry.packs_per_unit) || 0,
          total_packs: Number(entry.total_packs) || 0,
          total_quantity_kg: Number(entry.total_quantity_kg) || 0,
          shipped_quantity_kg: shippedQuantityKg,
          remaining_quantity_kg: remainingQuantityKg,
          status,
          notes: entry.notes ?? null,
          lot_no: batch?.lot_no ?? null,
          warehouse_name: warehouseName ?? null,
          qa_status: batch?.quality_status ?? null,
          allocated_at: entry.created_at ?? null,
        }
      })

      setRows(result)
    } catch (e) {
      setError(getUserFriendlyErrorMessage(e, 'We could not load the allocations right now. Please refresh and try again.'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const productOptions = useMemo(() => {
    const map = new Map<string, string>()
    rows.forEach((row) => {
      if (!row.product_id) return
      const label = `${row.product_name}${row.product_sku ? ` · ${row.product_sku}` : ''}`
      map.set(String(row.product_id), label)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [rows])

  const warehouseOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((row) => {
      if (row.warehouse_name) set.add(row.warehouse_name)
    })
    return Array.from(set).sort().map((value) => ({ value, label: value }))
  }, [rows])

  const packOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((row) => {
      if (row.pack_identifier) set.add(row.pack_identifier)
    })
    return Array.from(set).sort().map((value) => ({ value, label: value }))
  }, [rows])

  const lotOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((row) => {
      if (row.lot_no) set.add(row.lot_no)
    })
    return Array.from(set).sort().map((value) => ({ value, label: value }))
  }, [rows])

  const storageOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((row) => {
      if (row.storage_type) set.add(row.storage_type)
    })
    return Array.from(set).sort().map((value) => ({ value, label: value }))
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    const minQty = qtyMin ? Number(qtyMin) : null
    const maxQty = qtyMax ? Number(qtyMax) : null
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null

    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) return false
      if (storageFilter !== 'ALL' && row.storage_type !== storageFilter) return false
      if (productFilter && String(row.product_id ?? '') !== productFilter) return false
      if (warehouseFilter && row.warehouse_name !== warehouseFilter) return false
      if (packFilter && row.pack_identifier !== packFilter) return false
      if (lotFilter && row.lot_no !== lotFilter) return false
      if (minQty !== null && row.total_packs < minQty) return false
      if (maxQty !== null && row.total_packs > maxQty) return false
      if ((fromDate || toDate) && !row.allocated_at) return false
      if (fromDate && row.allocated_at && new Date(row.allocated_at) < fromDate) return false
      if (toDate && row.allocated_at && new Date(row.allocated_at) > toDate) return false

      if (normalizedSearch) {
        const haystack = [
          row.product_name,
          row.product_sku,
          row.pack_identifier,
          row.lot_no,
          row.warehouse_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(normalizedSearch)) return false
      }

      return true
    })
  }, [
    rows,
    searchQuery,
    statusFilter,
    storageFilter,
    productFilter,
    warehouseFilter,
    packFilter,
    lotFilter,
    qtyMin,
    qtyMax,
    dateFrom,
    dateTo,
  ])

  useEffect(() => {
    setPage(1)
  }, [
    searchQuery,
    statusFilter,
    storageFilter,
    productFilter,
    warehouseFilter,
    packFilter,
    lotFilter,
    qtyMin,
    qtyMax,
    dateFrom,
    dateTo,
  ])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('ALL')
    setStorageFilter('ALL')
    setProductFilter('')
    setWarehouseFilter('')
    setPackFilter('')
    setLotFilter('')
    setDateFrom('')
    setDateTo('')
    setQtyMin('')
    setQtyMax('')
  }

  const columns = useMemo(() => {
    const unitLabel = unitDisplay === 'packs' ? 'packs' : 'units'
    const statusStyles: Record<AllocationRow['status'], string> = {
      Allocated: 'bg-slate-100 text-slate-700 border-slate-200',
      'Partially Shipped': 'bg-amber-50 text-amber-800 border-amber-200',
      Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }
    const formatValue = (value: number) => value.toLocaleString()

    const formatMetric = (row: AllocationRow) => {
      if (unitDisplay === 'packs') {
        return {
          allocated: row.total_packs,
          shipped: row.shipped_units * row.packs_per_unit,
          remaining: row.remaining_units * row.packs_per_unit,
        }
      }
      return {
        allocated: row.units_count,
        shipped: row.shipped_units,
        remaining: row.remaining_units,
      }
    }

    return [
      {
        key: 'product',
        header: 'Product',
        render: (r: AllocationRow) => (
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-text-dark">{r.product_name}</span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-dark/60">
              {r.product_sku ? <span>SKU {r.product_sku}</span> : null}
              <span className="rounded-full border border-olive-light/40 bg-white px-2 py-0.5">
                {r.pack_identifier}
              </span>
            </div>
          </div>
        ),
        mobileRender: (r: AllocationRow) => (
          <div className="text-right">
            <div className="font-semibold text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r: AllocationRow) => (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
              statusStyles[r.status]
            )}
          >
            {r.status}
          </span>
        ),
        mobileRender: (r: AllocationRow) => r.status,
      },
      {
        key: 'progress',
        header: `Shipped vs Remaining (${unitLabel})`,
        render: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          const total = metrics.allocated || 0
          const shipped = metrics.shipped || 0
          const percent = total > 0 ? Math.min(100, Math.round((shipped / total) * 100)) : 0
          return (
            <div className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-olive-light/30">
                <div className="h-full rounded-full bg-olive" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-text-dark/60">
                <span className="inline-flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-olive" />
                  {formatValue(shipped)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 text-text-dark/50" />
                  {formatValue(metrics.remaining)}
                </span>
              </div>
            </div>
          )
        },
        mobileRender: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return (
            <div className="flex items-center justify-end gap-3 text-xs text-text-dark/60">
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3.5 w-3.5 text-olive" />
                {formatValue(metrics.shipped)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-text-dark/50" />
                {formatValue(metrics.remaining)}
              </span>
            </div>
          )
        },
      },
      {
        key: 'allocated',
        header: `Allocated (${unitLabel})`,
        headerClassName: 'text-right',
        cellClassName: 'text-right font-semibold',
        render: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.allocated)
        },
        mobileRender: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.allocated)
        },
      },
      {
        key: 'shipped',
        header: `Shipped (${unitLabel})`,
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium text-text-dark/80',
        render: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.shipped)
        },
        mobileRender: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.shipped)
        },
      },
      {
        key: 'remaining',
        header: `Remaining (${unitLabel})`,
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium text-text-dark/80',
        render: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.remaining)
        },
        mobileRender: (r: AllocationRow) => {
          const metrics = formatMetric(r)
          return formatValue(metrics.remaining)
        },
      },
      {
        key: 'storage',
        header: 'Storage',
        render: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.storage_type ?? '—'}
            {r.box_unit_code ? ` · ${r.box_unit_code}` : ''}
          </div>
        ),
        mobileRender: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.storage_type ?? '—'}
            {r.box_unit_code ? ` · ${r.box_unit_code}` : ''}
          </div>
        ),
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (r: AllocationRow) => r.warehouse_name ?? '—',
        mobileRender: (r: AllocationRow) => r.warehouse_name ?? '—',
      },
      {
        key: 'lot',
        header: 'Supply lot',
        render: (r: AllocationRow) => r.lot_no ?? '—',
        mobileRender: (r: AllocationRow) => r.lot_no ?? '—',
      },
      {
        key: 'date',
        header: 'Allocated at',
        render: (r: AllocationRow) =>
          r.allocated_at ? new Date(r.allocated_at).toLocaleString() : '—',
        mobileRender: (r: AllocationRow) =>
          r.allocated_at ? new Date(r.allocated_at).toLocaleString() : '—',
      },
      {
        key: 'action',
        header: '',
        render: () => null,
        mobileRender: () => null,
        hideOnMobile: true,
      },
    ]
  }, [unitDisplay])

  const columnOptions = useMemo(
    () => [
      { key: 'status', label: 'Status' },
      { key: 'progress', label: 'Progress' },
      { key: 'allocated', label: 'Allocated' },
      { key: 'shipped', label: 'Shipped' },
      { key: 'remaining', label: 'Remaining' },
      { key: 'storage', label: 'Storage' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'lot', label: 'Supply lot' },
      { key: 'date', label: 'Allocated at' },
    ],
    []
  )

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.has(column.key ?? '')),
    [columns, hiddenColumns]
  )

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count += 1
    if (statusFilter !== 'ALL') count += 1
    if (storageFilter !== 'ALL') count += 1
    if (productFilter) count += 1
    if (warehouseFilter) count += 1
    if (packFilter) count += 1
    if (lotFilter) count += 1
    if (dateFrom || dateTo) count += 1
    if (qtyMin || qtyMax) count += 1
    return count
  }, [
    searchQuery,
    statusFilter,
    storageFilter,
    productFilter,
    warehouseFilter,
    packFilter,
    lotFilter,
    dateFrom,
    dateTo,
    qtyMin,
    qtyMax,
  ])

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'header',
        target: '[data-tour="allocations-header"]',
        title: 'Packaging Allocations',
        description: 'Access search, filters, exports, and quick actions from the header.',
        placement: 'bottom',
      },
      {
        id: 'kpis',
        target: '[data-tour="allocations-kpis"]',
        title: 'Operational KPIs',
        description: 'Track totals, shipped units, and remaining capacity at a glance.',
        placement: 'bottom',
      },
      {
        id: 'controls',
        target: '[data-tour="allocations-controls"]',
        title: 'Table controls',
        description: 'Adjust columns, density, and unit display to fit your workflow.',
        placement: 'top',
      },
      {
        id: 'table',
        target: '[data-tour="allocations-table"]',
        title: 'Allocation register',
        description: 'Review each allocation with shipped vs remaining progress.',
        placement: 'top',
      },
      {
        id: 'filters',
        target: '[data-tour="allocations-filter-button"]',
        title: 'Filter drawer',
        description: 'Open advanced filters for product, warehouse, lots, and date ranges.',
        placement: 'left',
        beforeEnter: () => setShowFilters(true),
      },
    ],
    []
  )

  const {
    closeTour,
    currentStep: currentTourStep,
    currentStepIndex: currentTourStepIndex,
    isLastStep: isTourLastStep,
    isOpen: isTourOpen,
    openTour,
    previousStep,
    nextStep,
  } = useSettingsTour(tourSteps)

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const totalUnits = useMemo(() => filteredRows.reduce((s, r) => s + r.units_count, 0), [filteredRows])
  const totalPacks = useMemo(
    () => filteredRows.reduce((s, r) => s + r.total_packs, 0),
    [filteredRows]
  )
  const totalShippedUnits = useMemo(() => filteredRows.reduce((s, r) => s + r.shipped_units, 0), [filteredRows])
  const totalRemainingUnits = useMemo(() => filteredRows.reduce((s, r) => s + r.remaining_units, 0), [filteredRows])
  const totalShippedPacks = useMemo(
    () => filteredRows.reduce((s, r) => s + r.shipped_units * r.packs_per_unit, 0),
    [filteredRows]
  )
  const totalRemainingPacks = useMemo(
    () => filteredRows.reduce((s, r) => s + r.remaining_units * r.packs_per_unit, 0),
    [filteredRows]
  )

  if (loading) {
    return (
      <PageLayout title="Allocations" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading allocations..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Packaging Allocations"
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" data-tour="allocations-header">
          <div className="space-y-2">
            <Link
              to="/inventory/stock-levels"
              className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Stock Levels
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-text-dark">Packaging Allocations</h1>
              <p className="mt-1 text-sm text-text-dark/60">
                Monitor allocation health, shipment progress, and storage distribution in one operational view.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search product, SKU, lot..."
                className="h-10 pl-9"
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(true)} data-tour="allocations-filter-button">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-2 rounded-full bg-olive px-2 py-0.5 text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={() => void openTour()}>
              Take tour
            </Button>
            <Button className="bg-olive hover:bg-olive-dark">
              <Plus className="mr-2 h-4 w-4" />
              New Allocation
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-olive-light/30 bg-white/80 px-4 py-4 shadow-sm" data-tour="allocations-kpis">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
            {[
              { label: 'Total allocations', value: filteredRows.length.toLocaleString() },
              { label: 'Total allocated packs', value: totalPacks.toLocaleString() },
              { label: 'Total allocated units', value: totalUnits.toLocaleString() },
              { label: 'Shipped packs', value: totalShippedPacks.toLocaleString() },
              { label: 'Shipped units', value: totalShippedUnits.toLocaleString() },
              { label: 'Remaining packs', value: totalRemainingPacks.toLocaleString() },
              { label: 'Remaining units', value: totalRemainingUnits.toLocaleString() },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-olive-light/30 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <p className="text-xs uppercase tracking-wide text-text-dark/50">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold text-text-dark">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-olive-light/30 bg-white px-4 py-3 shadow-sm" data-tour="allocations-controls">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-dark/60">
              Showing {paginatedRows.length.toLocaleString()} of {filteredRows.length.toLocaleString()} allocations
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Button variant="outline" onClick={() => setIsColumnMenuOpen((prev) => !prev)}>
                  Columns
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
                {isColumnMenuOpen ? (
                  <div className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-olive-light/40 bg-white p-3 shadow-lg">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                      Toggle Columns
                    </p>
                    <div className="mt-2 space-y-2">
                      {columnOptions.map((option) => (
                        <label key={option.key} className="flex items-center gap-2 text-sm text-text-dark">
                          <input
                            type="checkbox"
                            checked={!hiddenColumns.has(option.key)}
                            onChange={() => toggleColumn(option.key)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-olive-light/40 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setDensity('comfortable')}
                  className={cn(
                    'rounded-md p-2 text-xs font-semibold',
                    density === 'comfortable' ? 'bg-olive text-white' : 'text-text-dark/70'
                  )}
                  aria-label="Comfortable density"
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={cn(
                    'rounded-md p-2 text-xs font-semibold',
                    density === 'compact' ? 'bg-olive text-white' : 'text-text-dark/70'
                  )}
                  aria-label="Compact density"
                >
                  <Grid2X2 className="h-4 w-4 opacity-60" />
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-olive-light/40 bg-white p-1">
                {(['packs', 'units'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setUnitDisplay(unit)}
                    className={cn(
                      'rounded-md p-2 text-xs font-semibold uppercase',
                      unitDisplay === unit ? 'bg-olive text-white' : 'text-text-dark/70'
                    )}
                    aria-label={unit === 'packs' ? 'Show packs' : 'Show units'}
                  >
                    {unit === 'packs' ? <Package className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <Card className="border-olive-light/30 bg-white" data-tour="allocations-table">
          <CardHeader className="pb-3">
            <CardTitle className="text-text-dark">Allocation register</CardTitle>
            <CardDescription>
              A consolidated view of packaging allocations, shipment progress, and storage readiness.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                {error}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-10 text-center text-sm text-text-dark/70">
                No allocations match the current filters. Adjust filters or clear to see all records.
              </div>
            ) : (
              <>
                <ResponsiveTable
                  columns={visibleColumns}
                  data={paginatedRows}
                  rowKey="id"
                  onRowClick={(row) => {
                    if (row.product_id) {
                      navigate(`/inventory/stock-levels/allocation-details/${row.product_id}`)
                    }
                  }}
                  tableClassName="min-w-[1150px]"
                  theadClassName="sticky top-0 z-10 shadow-[0_1px_0_rgba(15,23,42,0.06)]"
                  mobileCardClassName=""
                  getRowClassName={() => ''}
                  density={density}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-text-dark/60">
                    <span>Rows per page</span>
                    <select
                      className="h-9 rounded-md border border-olive-light/40 bg-white px-2 text-sm text-text-dark"
                      value={pageSize}
                      onChange={(event) => setPageSize(Number(event.target.value))}
                    >
                      {[10, 20, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-text-dark/60">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {showFilters ? (
        <div className="fixed inset-0 z-[90]">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowFilters(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-text-dark/50">Filters</p>
                <h2 className="text-lg font-semibold text-text-dark">Refine allocations</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowFilters(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-144px)] overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Product
                  </label>
                  <SearchableSelect
                    options={productOptions}
                    value={productFilter}
                    onChange={setProductFilter}
                    placeholder="Select product"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Warehouse
                  </label>
                  <SearchableSelect
                    options={warehouseOptions}
                    value={warehouseFilter}
                    onChange={setWarehouseFilter}
                    placeholder="Select warehouse"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Storage type
                  </label>
                  <SearchableSelect
                    options={storageOptions}
                    value={storageFilter === 'ALL' ? '' : storageFilter}
                    onChange={(value) => setStorageFilter(value || 'ALL')}
                    placeholder="Select storage type"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Pack type
                  </label>
                  <SearchableSelect
                    options={packOptions}
                    value={packFilter}
                    onChange={setPackFilter}
                    placeholder="Select pack type"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Supply lot
                  </label>
                  <SearchableSelect
                    options={lotOptions}
                    value={lotFilter}
                    onChange={setLotFilter}
                    placeholder="Select supply lot"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                    Status
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'Allocated', label: 'Allocated' },
                      { value: 'Partially Shipped', label: 'Partially Shipped' },
                      { value: 'Completed', label: 'Completed' },
                    ]}
                    value={statusFilter === 'ALL' ? '' : statusFilter}
                    onChange={(value) =>
                      setStatusFilter((value as AllocationRow['status']) || 'ALL')
                    }
                    placeholder="Select status"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                      Date from
                    </label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                      Date to
                    </label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                      Quantity min (packs)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={qtyMin}
                      onChange={(e) => setQtyMin(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-text-dark/50">
                      Quantity max (packs)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={qtyMax}
                      onChange={(e) => setQtyMax(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-olive-light/30 px-5 py-4">
              <Button variant="outline" onClick={clearFilters}>
                Reset filters
              </Button>
              <Button className="bg-olive hover:bg-olive-dark" onClick={() => setShowFilters(false)}>
                Apply filters
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <SettingsTour
        open={isTourOpen}
        step={currentTourStep}
        totalSteps={tourSteps.length}
        currentStepIndex={currentTourStepIndex}
        isLastStep={isTourLastStep}
        onBack={previousStep}
        onNext={nextStep}
        onClose={() => {
          closeTour()
          setShowFilters(false)
        }}
      />
    </PageLayout>
  )
}

export default AllocationPage
