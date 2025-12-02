/// <reference types="../vite-env" />
import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Package, Truck, Users } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { useDashboardData } from '@/hooks/useDashboardData'

const FALLBACK_LOW_STOCK_THRESHOLD = Number.isFinite(
  Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD || '')
)
  ? Number.parseFloat(import.meta.env.VITE_DASHBOARD_LOW_STOCK_THRESHOLD || '')
  : 100

interface ThresholdEntry {
  reorder_point?: number | null
  safety_stock?: number | null
  product?: {
    reorder_point?: number | null
    safety_stock?: number | null
  }
}

function resolveThreshold(entry: ThresholdEntry) {
  const candidates = [
    entry.reorder_point,
    entry.safety_stock,
    entry?.product?.reorder_point,
    entry?.product?.safety_stock,
    FALLBACK_LOW_STOCK_THRESHOLD,
  ]

  for (const value of candidates) {
    if (value === undefined || value === null) continue
    const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  return FALLBACK_LOW_STOCK_THRESHOLD
}

function Dashboard() {
  const { user, profile } = useAuth()
  const { stats, recentStock, loading, errors, refresh } = useDashboardData()

  const integerFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-ZA', {
        maximumFractionDigits: 0,
      }),
    []
  )
  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-ZA', {
        maximumFractionDigits: 2,
      }),
    []
  )

  const statCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      description: 'SKUs in catalog',
      icon: Package,
      color: 'bg-olive-dark',
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStockCount,
      description: 'Below safety levels',
      icon: AlertCircle,
      color: 'bg-orange-500',
    },
    {
      title: 'Open Shipments',
      value: stats.openShipments,
      description: 'Pending dispatch',
      icon: Truck,
      color: 'bg-brown',
    },
    {
      title: 'Halal Suppliers',
      value: stats.halalSuppliers,
      description: 'Certified partners',
      icon: Users,
      color: 'bg-olive',
    },
  ]

  const displayName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.fullName ||
    user?.email ||
    user?.phone ||
    'User'

  return (
    <PageLayout title="Dashboard" activeItem="dashboard" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="mb-2 text-3xl font-bold text-foreground">Welcome back, {displayName}!</h2>
        <p className="text-muted-foreground">Here's an overview of your inventory.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="border border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.color} rounded-md p-2 text-white`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {loading ? '—' : integerFormatter.format(stat.value ?? 0)}
                </div>
                <CardDescription className="mt-1 text-xs text-muted-foreground">
                  {stat.description}
                  {stat.title === 'Low Stock Items' && !loading && stat.value === 0 ? ' (all clear)' : ''}
                </CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {errors.length > 0 ? (
        <div className="mb-6 rounded-md border border-orange-500/40 bg-orange-500/10 p-4 text-sm text-orange-900 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <div>
              <p className="font-semibold text-foreground">
                Some dashboard metrics could not be loaded
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {errors.map((error, index) => (
                  <li key={index} className="text-muted-foreground">
                    {error}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-3 inline-flex items-center rounded-md border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-900 hover:bg-orange-500/10 dark:border-orange-500/30 dark:text-orange-200 dark:hover:bg-orange-500/25"
                onClick={refresh}
              >
                Retry loading data
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Inventory</CardTitle>
          <CardDescription className="text-muted-foreground">
            {loading ? 'Loading the latest activity from Supabase…' : 'Latest stock across your warehouses'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/60">
            {loading ? (
              <div className="py-6 text-sm text-muted-foreground">
                Loading recent inventory…
              </div>
            ) : recentStock.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">
                No inventory activity has been recorded yet. Capture supplies or stock movements to populate this view.
              </div>
            ) : (
              recentStock.map((stock) => {
                const effectiveAvailable = Number.isFinite(stock.available) ? stock.available : stock.on_hand ?? 0
                const threshold = resolveThreshold(stock)
                const isLow = effectiveAvailable < threshold
                const displayQty = quantityFormatter.format(effectiveAvailable ?? 0)
                const timestamp = stock.last_updated ? new Date(stock.last_updated) : null
                const timestampLabel =
                  timestamp instanceof Date && !Number.isNaN(timestamp.valueOf())
                    ? timestamp.toLocaleString()
                    : 'Timestamp unavailable'

                return (
                  <div
                    key={stock.id}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {stock.product_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {stock.product_sku || 'Not captured'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stock.warehouse_name || 'Warehouse not set'}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span className="text-sm font-semibold text-foreground">
                        {displayQty} {stock.unit || ''}
                      </span>
                      <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:items-end">
                        <span>{timestampLabel}</span>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-1 font-medium text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">
                            <AlertCircle className="h-3 w-3" />
                            Low Stock (threshold {quantityFormatter.format(threshold)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default Dashboard

