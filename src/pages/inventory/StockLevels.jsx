import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, ArrowUpRight, BarChart3 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mockProducts, mockStockLevels } from '@/data/mockDashboardData'

function StockLevels() {
  const [stockLevels] = useState(mockStockLevels)
  const [searchTerm, setSearchTerm] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [showLowStockOnly, setShowLowStockOnly] = useState(false)
  const [coverageThreshold, setCoverageThreshold] = useState(14)

  const productLookup = useMemo(
    () =>
      mockProducts.reduce((accumulator, product) => {
        accumulator[product.id] = product
        return accumulator
      }, {}),
    []
  )

  const warehouses = useMemo(
    () => Array.from(new Set(stockLevels.map((entry) => entry.warehouse_name))).sort(),
    [stockLevels]
  )

  const enrichedStockLevels = useMemo(() => {
    return stockLevels.map((entry) => {
      const product = productLookup[entry.product_id] ?? {}
      const totalDemand = (entry.allocated ?? 0) + (entry.quality_hold ?? 0)
      const available = Math.max((entry.on_hand ?? 0) - totalDemand, 0)
      const reorderPoint = entry.reorder_point ?? product.reorder_point ?? 0
      const safetyStock = entry.safety_stock ?? product.safety_stock ?? 0
      const reorderTarget = Math.max(reorderPoint, safetyStock)

      const dailyAverageDemand = (product.target_stock ?? 0) > 0 ? product.target_stock / 30 : 0
      const daysOfCover =
        dailyAverageDemand > 0 ? Math.round((available + (entry.in_transit ?? 0)) / dailyAverageDemand) : null

      return {
        ...entry,
        available,
        reorderTarget,
        safetyStock,
        totalDemand,
        productStatus: product.status,
        packSize: product.pack_size,
        daysOfCover,
        isBelowReorder: available < reorderTarget,
        isBelowSafety: available < safetyStock,
        complianceFlags: product.certifications,
      }
    })
  }, [productLookup, stockLevels])

  const filteredStockLevels = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    return enrichedStockLevels.filter((entry) => {
      const matchesSearch =
        normalisedSearch.length === 0 ||
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

  const totalAvailable = filteredStockLevels.reduce((total, entry) => total + entry.available, 0)
  const totalAllocated = filteredStockLevels.reduce((total, entry) => total + (entry.allocated ?? 0), 0)
  const totalOnHand = filteredStockLevels.reduce((total, entry) => total + (entry.on_hand ?? 0), 0)

  const lowStockCount = filteredStockLevels.filter((entry) => entry.isBelowReorder).length

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: (stock) => (
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
      mobileRender: (stock) => (
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
      render: (stock) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">
            {stock.on_hand} {stock.unit}
          </div>
          <div className="text-xs text-text-dark/60">Allocated: {stock.allocated}</div>
        </div>
      ),
      mobileRender: (stock) => (
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
      render: (stock) => `${stock.quality_hold ?? 0} ${stock.unit}`,
      mobileRender: (stock) => `${stock.quality_hold ?? 0} ${stock.unit}`,
    },
    {
      key: 'available',
      header: 'Available',
      headerClassName: 'text-right',
      cellClassName: 'text-right font-semibold',
      render: (stock) => (
        <div className="text-right">
          <div className="font-semibold text-text-dark">
            {stock.available} {stock.unit}
          </div>
          <div className="text-xs text-text-dark/60">In transit: {stock.in_transit ?? 0}</div>
        </div>
      ),
      mobileRender: (stock) => (
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
      render: (stock) => (
        <div className="text-right">
          <div>Min: {stock.reorder_point}</div>
          <div>Safety: {stock.safetyStock}</div>
        </div>
      ),
      mobileRender: (stock) => (
        <div className="text-right">
          <div>Min: {stock.reorder_point}</div>
          <div>Safety: {stock.safetyStock}</div>
        </div>
      ),
    },
    {
      key: 'coverage',
      header: 'Days of Cover',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (stock) =>
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
      mobileRender: (stock) =>
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
      render: (stock) => {
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
      mobileRender: (stock) => {
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
      render: (stock) => (
        <div className="text-sm text-text-dark/70">
          {stock.cycle_count_due_at
            ? new Date(stock.cycle_count_due_at).toLocaleDateString()
            : 'Not scheduled'}
        </div>
      ),
      mobileRender: (stock) => (
        <div className="text-right text-sm text-text-dark/70">
          {stock.cycle_count_due_at
            ? new Date(stock.cycle_count_due_at).toLocaleDateString()
            : 'Not scheduled'}
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Stock Levels"
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
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
              <CardTitle className="text-text-dark">Stock Levels</CardTitle>
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
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label htmlFor="stock-search">Search</Label>
              <Input
                id="stock-search"
                placeholder="Search by product, SKU, or note"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="warehouse-filter">Warehouse</Label>
              <select
                id="warehouse-filter"
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
            <div>
              <Label htmlFor="coverage-threshold">Coverage threshold (days)</Label>
              <Input
                id="coverage-threshold"
                type="number"
                min={1}
                value={coverageThreshold}
                onChange={(event) => setCoverageThreshold(Number(event.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-text-dark/80">
                <input
                  type="checkbox"
                  checked={showLowStockOnly}
                  onChange={(event) => setShowLowStockOnly(event.target.checked)}
                  className="h-4 w-4 rounded border border-olive-light/50 text-olive focus:ring-olive"
                />
                Focus on risk items
              </label>
            </div>
          </div>

          <ResponsiveTable columns={columns} data={filteredStockLevels} rowKey="id" />
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default StockLevels

