import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight, Plus, ArrowDown, ArrowUp, Filter } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

type MovementType = 'IN_RECEIPT' | 'OUT_SHIPMENT' | 'QUALITY_HOLD' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'PROCESS_START'

interface StockMovement {
  id: string
  created_at: string
  movement_type: MovementType
  ref_table: string | null
  ref_id: number | null
  product_id: number
  product_name: string
  product_sku: string
  warehouse_id: number
  warehouse_name: string
  batch_id: string
  qty: number
  unit: string
  actor: string
  note: string | null
  target_warehouse_id?: number
  target_warehouse_name?: string
  source_warehouse_id?: number
  source_warehouse_name?: string
  runningBalance?: number
}

const movementTypeLabels: Record<MovementType, string> = {
  IN_RECEIPT: 'Inbound Receipt',
  OUT_SHIPMENT: 'Outbound Shipment',
  QUALITY_HOLD: 'Quality Hold',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
  PROCESS_START: 'Sent to process',
}

const movementTypeFamilies = [
  { value: 'ALL', label: 'All movements' },
  { value: 'INBOUND', label: 'Inbound' },
  { value: 'OUTBOUND', label: 'Outbound' },
  { value: 'PROCESS', label: 'Process' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'TRANSFER', label: 'Transfers' },
]

function StockMovements() {
  const [searchTerm, setSearchTerm] = useState('')
  const [movementFamily, setMovementFamily] = useState('ALL')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [sortDirection, setSortDirection] = useState('desc')
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const allMovements: StockMovement[] = []

      // 1) Inbound receipts from supply_batches
      const { data: batchRows, error: batchesError } = await supabase
        .from('supply_batches')
        .select('id, supply_id, product_id, unit_id, lot_no, accepted_qty, received_qty, created_at')
        .order('created_at', { ascending: true })

      if (batchesError) {
        setError(batchesError.message)
        setMovements([])
        setLoading(false)
        return
      }

      const batchList = (batchRows ?? []) as Array<{
        id: number
        supply_id: number
        product_id: number
        unit_id: number | null
        lot_no: string
        accepted_qty: number | null
        received_qty: number | null
        created_at: string
      }>

      // Fetch process_lot_runs early so we can include their supply/product ids in the lookup
      const { data: lotRunRows } = await supabase
        .from('process_lot_runs')
        .select('id, supply_batch_id, started_at')
        .order('started_at', { ascending: true })

      let runBatchesMap = new Map<number, { supply_id: number; product_id: number; unit_id: number | null; lot_no: string; accepted_qty: number | null }>()
      if (lotRunRows?.length) {
        const batchIds = (lotRunRows as Array<{ supply_batch_id: number }>).map((r) => r.supply_batch_id).filter(Boolean)
        const { data: runBatches } = await supabase
          .from('supply_batches')
          .select('id, supply_id, product_id, unit_id, lot_no, accepted_qty')
          .in('id', batchIds)
        runBatchesMap = new Map(
          (runBatches ?? []).map((b: any) => [b.id, { supply_id: b.supply_id, product_id: b.product_id, unit_id: b.unit_id ?? null, lot_no: b.lot_no, accepted_qty: b.accepted_qty }])
        )
      }

      const supplyIds = [...new Set([
        ...batchList.map((b) => b.supply_id).filter(Boolean),
        ...Array.from(runBatchesMap.values()).map((b) => b.supply_id).filter(Boolean),
      ])]
      const productIds = [...new Set([
        ...batchList.map((b) => b.product_id).filter(Boolean),
        ...Array.from(runBatchesMap.values()).map((b) => b.product_id).filter(Boolean),
      ])]
      const unitIds = [...new Set([
        ...batchList.map((b) => b.unit_id).filter((id): id is number => id != null),
        ...Array.from(runBatchesMap.values()).map((b) => b.unit_id).filter((id): id is number => id != null),
      ])]

      const [suppliesRes, productsRes, unitsRes, warehousesRes] = await Promise.all([
        supplyIds.length > 0 ? supabase.from('supplies').select('id, warehouse_id, received_at, doc_no').in('id', supplyIds) : { data: [] },
        productIds.length > 0 ? supabase.from('products').select('id, name, sku').in('id', productIds) : { data: [] },
        unitIds.length > 0 ? supabase.from('units').select('id, symbol, name').in('id', unitIds) : { data: [] },
        supabase.from('warehouses').select('id, name'),
      ])

      const suppliesMap = new Map<number, { warehouse_id: number | null; received_at: string | null; doc_no: string | null }>(
        (suppliesRes.data ?? []).map((s: any) => [s.id, { warehouse_id: s.warehouse_id ?? null, received_at: s.received_at ?? null, doc_no: s.doc_no ?? null }])
      )
      const productsMap = new Map<number, { name: string; sku: string }>(
        (productsRes.data ?? []).map((p: any) => [p.id, { name: p.name ?? 'Unknown', sku: p.sku ?? '' }])
      )
      const unitsMap = new Map<number, { symbol: string; name: string }>(
        (unitsRes.data ?? []).map((u: any) => [u.id, { symbol: u.symbol ?? u.name ?? 'Kg', name: u.name ?? 'Kg' }])
      )
      const warehouseMap = new Map<number, string>(
        (warehousesRes.data ?? []).map((w: any) => [w.id, w.name ?? '—'])
      )

      for (const b of batchList) {
        const supply = suppliesMap.get(b.supply_id)
        const product = productsMap.get(b.product_id)
        const unit = b.unit_id ? unitsMap.get(b.unit_id) : null
        const warehouseId = supply?.warehouse_id ?? 0
        const qty = Number(b.accepted_qty ?? b.received_qty ?? 0)
        if (qty <= 0 || !product) continue
        allMovements.push({
          id: `receipt-${b.id}`,
          created_at: supply?.received_at ?? b.created_at ?? new Date().toISOString(),
          movement_type: 'IN_RECEIPT',
          ref_table: 'supply_batches',
          ref_id: b.id,
          product_id: b.product_id,
          product_name: product.name,
          product_sku: product.sku,
          warehouse_id: warehouseId,
          warehouse_name: warehouseMap.get(warehouseId) ?? '—',
          batch_id: b.lot_no,
          qty: Math.round(qty * 100) / 100,
          unit: unit?.symbol ?? unit?.name ?? 'Kg',
          actor: supply?.doc_no ? `Supply ${supply.doc_no}` : 'Supply receipt',
          note: b.lot_no ? `Lot ${b.lot_no}` : null,
          runningBalance: undefined,
        })
      }

      // 2) Sent to process from process_lot_runs (lotRunRows and runBatchesMap already loaded above)
      if (lotRunRows?.length) {
        for (const run of lotRunRows as Array<{ id: number; supply_batch_id: number; started_at: string | null }>) {
          const batch = runBatchesMap.get(run.supply_batch_id)
          if (!batch) continue
          const supply = suppliesMap.get(batch.supply_id)
          const product = productsMap.get(batch.product_id)
          const unit = batch.unit_id ? unitsMap.get(batch.unit_id) : null
          const warehouseId = supply?.warehouse_id ?? 0
          const qty = Number(batch.accepted_qty ?? 0)
          if (qty <= 0 || !product) continue
          allMovements.push({
            id: `process-${run.id}`,
            created_at: run.started_at ?? new Date().toISOString(),
            movement_type: 'PROCESS_START',
            ref_table: 'process_lot_runs',
            ref_id: run.id,
            product_id: batch.product_id,
            product_name: product.name,
            product_sku: product.sku,
            warehouse_id: warehouseId,
            warehouse_name: warehouseMap.get(warehouseId) ?? '—',
            batch_id: batch.lot_no,
            qty: Math.round(qty * 100) / 100,
            unit: unit?.symbol ?? unit?.name ?? 'Kg',
            actor: 'Process',
            note: `Lot ${batch.lot_no} sent to process`,
            runningBalance: undefined,
          })
        }
      }

      allMovements.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      setMovements(allMovements)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock movements')
      setMovements([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const warehouses = useMemo(
    () => Array.from(new Set(movements.map((m) => m.warehouse_name).filter(Boolean))).sort(),
    [movements]
  )

  const filteredMovements = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    const isMovementInFamily = (movement: StockMovement) => {
      if (movementFamily === 'ALL') return true
      if (movementFamily === 'INBOUND') return movement.movement_type === 'IN_RECEIPT' || movement.movement_type === 'TRANSFER_IN'
      if (movementFamily === 'OUTBOUND') return movement.movement_type.startsWith('OUT') || movement.movement_type === 'TRANSFER_OUT'
      if (movementFamily === 'PROCESS') return movement.movement_type === 'PROCESS_START'
      if (movementFamily === 'QUALITY') return movement.movement_type.includes('QUALITY')
      if (movementFamily === 'TRANSFER') return movement.movement_type.includes('TRANSFER')
      return true
    }

    const sorted = [...movements].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return aTime - bTime
    })

    const runningBalances = new Map<string, number>()

    const annotated = sorted
      .filter((movement) => {
        const matchesSearch =
          normalisedSearch.length === 0 ||
          movement.product_name.toLowerCase().includes(normalisedSearch) ||
          movement.product_sku.toLowerCase().includes(normalisedSearch) ||
          movement.note?.toLowerCase().includes(normalisedSearch) ||
          movement.movement_type.toLowerCase().includes(normalisedSearch) ||
          movement.batch_id.toLowerCase().includes(normalisedSearch)

        const matchesWarehouse = warehouseFilter === 'ALL' || movement.warehouse_name === warehouseFilter

        return matchesSearch && matchesWarehouse && isMovementInFamily(movement)
      })
      .map((movement) => {
        const key = `${movement.product_id}-${movement.warehouse_id}`
        const previousBalance = runningBalances.get(key) ?? 0
        const delta =
          movement.movement_type === 'IN_RECEIPT' || movement.movement_type === 'TRANSFER_IN'
            ? movement.qty
            : -movement.qty
        const newBalance = previousBalance + delta
        runningBalances.set(key, newBalance)

        return {
          ...movement,
          runningBalance: newBalance,
        }
      })

    if (sortDirection === 'desc') {
      return [...annotated].reverse()
    }

    return annotated
  }, [movements, movementFamily, searchTerm, sortDirection, warehouseFilter])

  const totalInbound = filteredMovements
    .filter((movement) => movement.movement_type === 'IN_RECEIPT' || movement.movement_type === 'TRANSFER_IN')
    .reduce((accumulator, movement) => accumulator + movement.qty, 0)

  const totalOutbound = filteredMovements
    .filter(
      (movement) =>
        movement.movement_type.startsWith('OUT') ||
        movement.movement_type.includes('TRANSFER_OUT') ||
        movement.movement_type === 'PROCESS_START'
    )
    .reduce((accumulator, movement) => accumulator + movement.qty, 0)

  const uniqueProducts = new Set(filteredMovements.map((movement) => movement.product_id)).size

  const getMovementIcon = (movementType: MovementType) => {
    if (movementType === 'IN_RECEIPT' || movementType === 'TRANSFER_IN') {
      return <ArrowDown className="h-4 w-4 text-green-600" />
    }
    if (movementType.startsWith('OUT') || movementType === 'TRANSFER_OUT' || movementType === 'PROCESS_START') {
      return <ArrowUp className="h-4 w-4 text-red-600" />
    }
    return <ArrowRight className="h-4 w-4 text-gray-600" />
  }

  const getMovementBadgeColor = (movementType: MovementType) => {
    if (movementType === 'IN_RECEIPT' || movementType === 'TRANSFER_IN') {
      return 'bg-green-100 text-green-800'
    }
    if (movementType.startsWith('OUT') || movementType === 'TRANSFER_OUT') {
      return 'bg-red-100 text-red-800'
    }
    if (movementType === 'PROCESS_START') {
      return 'bg-amber-100 text-amber-800'
    }
    if (movementType.includes('QUALITY')) {
      return 'bg-orange-100 text-orange-800'
    }
    return 'bg-gray-100 text-gray-800'
  }

  const columns = [
    {
      key: 'datetime',
      header: 'Date & Time',
      render: (movement: StockMovement) => new Date(movement.created_at).toLocaleString(),
      mobileRender: (movement: StockMovement) => new Date(movement.created_at).toLocaleString(),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
    {
      key: 'type',
      header: 'Type',
      render: (movement: StockMovement) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getMovementBadgeColor(
            movement.movement_type
          )}`}
        >
          {getMovementIcon(movement.movement_type)}
          <span className="ml-1">
            {movementTypeLabels[movement.movement_type] ?? movement.movement_type}
          </span>
        </span>
      ),
      mobileRender: (movement: StockMovement) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getMovementBadgeColor(
            movement.movement_type
          )}`}
        >
          {getMovementIcon(movement.movement_type)}
          <span className="ml-1">
            {movementTypeLabels[movement.movement_type] ?? movement.movement_type}
          </span>
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: (movement: StockMovement) => (
        <div>
          <div className="font-medium text-text-dark">{movement.product_name}</div>
          <div className="text-xs text-text-dark/60">{movement.product_sku}</div>
        </div>
      ),
      mobileRender: (movement: StockMovement) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{movement.product_name}</div>
          <div className="text-xs text-text-dark/60">{movement.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (movement: StockMovement) => (
        <div className="text-sm text-text-dark/80">
          <div>{movement.warehouse_name}</div>
          {movement.target_warehouse_name ? (
            <div className="text-xs text-text-dark/60">→ {movement.target_warehouse_name}</div>
          ) : null}
        </div>
      ),
      mobileRender: (movement: StockMovement) => (
        <div className="text-right text-sm text-text-dark/80">
          <div>{movement.warehouse_name}</div>
          {movement.target_warehouse_name ? (
            <div className="text-xs text-text-dark/60">→ {movement.target_warehouse_name}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Quantity',
      headerClassName: 'text-right',
      cellClassName: 'text-right font-medium text-text-dark',
      mobileValueClassName: 'text-text-dark',
      render: (movement: StockMovement) => `${movement.qty} ${movement.unit}`,
      mobileRender: (movement: StockMovement) => `${movement.qty} ${movement.unit}`,
    },
    {
      key: 'runningBalance',
      header: 'Running Balance',
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark/80',
      render: (movement: StockMovement) => `${movement.runningBalance ?? 0} ${movement.unit}`,
      mobileRender: (movement: StockMovement) => `${movement.runningBalance ?? 0} ${movement.unit}`,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (movement: StockMovement) =>
        movement.ref_table && movement.ref_id ? `${movement.ref_table} #${movement.ref_id}` : '—',
      mobileRender: (movement: StockMovement) =>
        movement.ref_table && movement.ref_id ? `${movement.ref_table} #${movement.ref_id}` : '—',
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
    {
      key: 'note',
      header: 'Note',
      render: (movement: StockMovement) => movement.note || '—',
      mobileRender: (movement: StockMovement) => movement.note || '—',
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
  ]

  if (loading) {
    return (
      <PageLayout
        title="Stock Movements"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading stock movements..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Stock Movements"
      activeItem="inventory"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" disabled>
          <Plus className="mr-2 h-4 w-4" />
          Record Movement
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      {error ? (
        <div className="mb-6 rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          {error}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Inbound Volume</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalInbound.toLocaleString()} Kg
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Outbound Volume / Transfers</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalOutbound.toLocaleString()} Kg
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Products touched</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{uniqueProducts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-text-dark">Stock Movements</CardTitle>
              <CardDescription>Journal of all inventory changes with running balances.</CardDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="border border-olive-light/60 px-3 py-1 text-xs text-text-dark/80"
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            >
              <Filter className="mr-2 h-3.5 w-3.5" />
              Sort {sortDirection === 'desc' ? 'Newest' : 'Oldest'} first
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="movement-search">Search movements</Label>
              <Input
                id="movement-search"
                placeholder="Search by product, SKU, note, or type"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="movement-family">Movement family</Label>
              <select
                id="movement-family"
                value={movementFamily}
                onChange={(event) => setMovementFamily(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                {movementTypeFamilies.map((family) => (
                  <option key={family.value} value={family.value}>
                    {family.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="movement-warehouse">Warehouse</Label>
              <select
                id="movement-warehouse"
                value={warehouseFilter}
                onChange={(event) => setWarehouseFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All warehouses</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse} value={warehouse}>
                    {warehouse}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredMovements.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              {movements.length === 0
                ? 'No stock movements yet. Receipts from supplies and batches sent to process will appear here.'
                : 'No movements match the current filters.'}
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={filteredMovements}
              rowKey="id"
              tableClassName={undefined}
              mobileCardClassName={undefined}
              getRowClassName={undefined}
              onRowClick={undefined}
            />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default StockMovements

