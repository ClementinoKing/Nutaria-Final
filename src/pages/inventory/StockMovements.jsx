import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowRight, Plus, ArrowDown, ArrowUp, Filter } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'

// Mock data for stock movements
const mockStockMovements = [
  {
    id: 1,
    created_at: '2024-01-24T08:00:00Z',
    movement_type: 'IN_RECEIPT',
    ref_table: 'purchasing_receipts',
    ref_id: 5001,
    product_id: 1,
    product_name: 'Pecan Wholes',
    product_sku: 'PEC001',
    warehouse_id: 1,
    warehouse_name: 'Mpumalanga Warehouse',
    batch_id: 'LOT-240124-A',
    qty: 220,
    unit: 'Kg',
    actor: 'Thabo Nkosi',
    note: 'PO 4500012456 Receipt',
  },
  {
    id: 2,
    created_at: '2024-01-24T11:30:00Z',
    movement_type: 'QUALITY_HOLD',
    ref_table: 'quality_events',
    ref_id: 302,
    product_id: 1,
    product_name: 'Pecan Wholes',
    product_sku: 'PEC001',
    warehouse_id: 1,
    warehouse_name: 'Mpumalanga Warehouse',
    batch_id: 'LOT-240124-A',
    qty: 30,
    unit: 'Kg',
    actor: 'QA: Lerato M.',
    note: 'Moisture retest required',
  },
  {
    id: 3,
    created_at: '2024-01-25T09:45:00Z',
    movement_type: 'IN_RECEIPT',
    ref_table: 'production_orders',
    ref_id: 701,
    product_id: 3,
    product_name: 'Mac Halves',
    product_sku: 'MAC002',
    warehouse_id: 1,
    warehouse_name: 'Mpumalanga Warehouse',
    batch_id: 'FH-20240125-1',
    qty: 180,
    unit: 'Kg',
    actor: 'Production Line 2',
    note: 'Finished goods receipt',
  },
  {
    id: 4,
    created_at: '2024-01-26T14:30:00Z',
    movement_type: 'OUT_SHIPMENT',
    ref_table: 'shipments',
    ref_id: 101,
    product_id: 1,
    product_name: 'Pecan Wholes',
    product_sku: 'PEC001',
    warehouse_id: 1,
    warehouse_name: 'Mpumalanga Warehouse',
    batch_id: 'LOT-240124-A',
    qty: 120,
    unit: 'Kg',
    actor: 'Shipping Desk',
    note: 'Shipment SHIP-2024-001',
  },
  {
    id: 5,
    created_at: '2024-01-26T16:10:00Z',
    movement_type: 'TRANSFER_OUT',
    ref_table: 'transfer_orders',
    ref_id: 205,
    product_id: 4,
    product_name: 'Mac Pieces',
    product_sku: 'MAC003',
    warehouse_id: 1,
    warehouse_name: 'Mpumalanga Warehouse',
    target_warehouse_id: 3,
    target_warehouse_name: 'Durban Export Terminal',
    batch_id: 'MP-240126',
    qty: 140,
    unit: 'Kg',
    actor: 'Warehouse Ops',
    note: 'Transfer to Durban for export staging',
  },
  {
    id: 6,
    created_at: '2024-01-27T09:20:00Z',
    movement_type: 'TRANSFER_IN',
    ref_table: 'transfer_orders',
    ref_id: 205,
    product_id: 4,
    product_name: 'Mac Pieces',
    product_sku: 'MAC003',
    warehouse_id: 3,
    warehouse_name: 'Durban Export Terminal',
    source_warehouse_id: 1,
    source_warehouse_name: 'Mpumalanga Warehouse',
    batch_id: 'MP-240126',
    qty: 140,
    unit: 'Kg',
    actor: 'Durban Receiving',
    note: 'Inbound transfer from Mpumalanga',
  },
]

const movementTypeLabels = {
  IN_RECEIPT: 'Inbound Receipt',
  OUT_SHIPMENT: 'Outbound Shipment',
  QUALITY_HOLD: 'Quality Hold',
  TRANSFER_OUT: 'Transfer Out',
  TRANSFER_IN: 'Transfer In',
}

const movementTypeFamilies = [
  { value: 'ALL', label: 'All movements' },
  { value: 'INBOUND', label: 'Inbound' },
  { value: 'OUTBOUND', label: 'Outbound' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'TRANSFER', label: 'Transfers' },
]

function StockMovements() {
  const [searchTerm, setSearchTerm] = useState('')
  const [movementFamily, setMovementFamily] = useState('ALL')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [sortDirection, setSortDirection] = useState('desc')

  const warehouses = useMemo(
    () => Array.from(new Set(mockStockMovements.map((movement) => movement.warehouse_name))).sort(),
    []
  )

  const filteredMovements = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    const isMovementInFamily = (movement) => {
      if (movementFamily === 'ALL') return true
      if (movementFamily === 'INBOUND') {
        return movement.movement_type.startsWith('IN')
      }
      if (movementFamily === 'OUTBOUND') {
        return movement.movement_type.startsWith('OUT')
      }
      if (movementFamily === 'QUALITY') {
        return movement.movement_type.includes('QUALITY')
      }
      if (movementFamily === 'TRANSFER') {
        return movement.movement_type.includes('TRANSFER')
      }
      return true
    }

    const sorted = [...mockStockMovements].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return aTime - bTime
    })

    const runningBalances = new Map()

    const annotated = sorted
      .filter((movement) => {
        const matchesSearch =
          normalisedSearch.length === 0 ||
          movement.product_name.toLowerCase().includes(normalisedSearch) ||
          movement.product_sku.toLowerCase().includes(normalisedSearch) ||
          movement.note?.toLowerCase().includes(normalisedSearch) ||
          movement.movement_type.toLowerCase().includes(normalisedSearch)

        const matchesWarehouse = warehouseFilter === 'ALL' || movement.warehouse_name === warehouseFilter

        return matchesSearch && matchesWarehouse && isMovementInFamily(movement)
      })
      .map((movement) => {
        const key = `${movement.product_id}-${movement.warehouse_id}`
        const previousBalance = runningBalances.get(key) ?? 0
        const delta =
          movement.movement_type.startsWith('IN') || movement.movement_type === 'TRANSFER_IN' ? movement.qty : -movement.qty
        const newBalance = previousBalance + delta
        runningBalances.set(key, newBalance)

        return {
          ...movement,
          runningBalance: newBalance,
        }
      })

    if (sortDirection === 'desc') {
      return annotated.reverse()
    }

    return annotated
  }, [movementFamily, searchTerm, sortDirection, warehouseFilter])

  const totalInbound = filteredMovements
    .filter((movement) => movement.movement_type.startsWith('IN'))
    .reduce((accumulator, movement) => accumulator + movement.qty, 0)

  const totalOutbound = filteredMovements
    .filter((movement) => movement.movement_type.startsWith('OUT') || movement.movement_type.includes('TRANSFER_OUT'))
    .reduce((accumulator, movement) => accumulator + movement.qty, 0)

  const uniqueProducts = new Set(filteredMovements.map((movement) => movement.product_id)).size

  const getMovementIcon = (movementType) => {
    if (movementType.startsWith('IN') || movementType === 'TRANSFER_IN') {
      return <ArrowDown className="h-4 w-4 text-green-600" />
    } else if (movementType.startsWith('OUT') || movementType === 'TRANSFER_OUT') {
      return <ArrowUp className="h-4 w-4 text-red-600" />
    }
    return <ArrowRight className="h-4 w-4 text-gray-600" />
  }

  const getMovementBadgeColor = (movementType) => {
    if (movementType.startsWith('IN') || movementType === 'TRANSFER_IN') {
      return 'bg-green-100 text-green-800'
    } else if (movementType.startsWith('OUT') || movementType === 'TRANSFER_OUT') {
      return 'bg-red-100 text-red-800'
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
      render: (movement) => new Date(movement.created_at).toLocaleString(),
      mobileRender: (movement) => new Date(movement.created_at).toLocaleString(),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
    {
      key: 'type',
      header: 'Type',
      render: (movement) => (
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
      mobileRender: (movement) => (
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
      render: (movement) => (
        <div>
          <div className="font-medium text-text-dark">{movement.product_name}</div>
          <div className="text-xs text-text-dark/60">{movement.product_sku}</div>
        </div>
      ),
      mobileRender: (movement) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{movement.product_name}</div>
          <div className="text-xs text-text-dark/60">{movement.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (movement) => (
        <div className="text-sm text-text-dark/80">
          <div>{movement.warehouse_name}</div>
          {movement.target_warehouse_name ? (
            <div className="text-xs text-text-dark/60">→ {movement.target_warehouse_name}</div>
          ) : null}
        </div>
      ),
      mobileRender: (movement) => (
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
      render: (movement) => `${movement.qty} ${movement.unit}`,
      mobileRender: (movement) => `${movement.qty} ${movement.unit}`,
    },
    {
      key: 'runningBalance',
      header: 'Running Balance',
      headerClassName: 'text-right',
      cellClassName: 'text-right text-sm text-text-dark/80',
      render: (movement) => `${movement.runningBalance} ${movement.unit}`,
      mobileRender: (movement) => `${movement.runningBalance} ${movement.unit}`,
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (movement) =>
        movement.ref_table && movement.ref_id ? `${movement.ref_table} #${movement.ref_id}` : '—',
      mobileRender: (movement) =>
        movement.ref_table && movement.ref_id ? `${movement.ref_table} #${movement.ref_id}` : '—',
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
    {
      key: 'note',
      header: 'Note',
      render: (movement) => movement.note || '—',
      mobileRender: (movement) => movement.note || '—',
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark text-right',
    },
  ]

  return (
    <PageLayout
      title="Stock Movements"
      activeItem="inventory"
      actions={
        <Button className="bg-olive hover:bg-olive-dark">
          <Plus className="mr-2 h-4 w-4" />
          Record Movement
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
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

          <ResponsiveTable columns={columns} data={filteredMovements} rowKey="id" />
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default StockMovements

