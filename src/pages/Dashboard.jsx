import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Package, Truck, Users } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import {
  LOW_STOCK_THRESHOLD,
  mockProducts,
  mockShipments,
  mockStockLevels,
  mockSuppliers,
} from '@/data/mockDashboardData'

function Dashboard() {
  const { user } = useAuth()

  const formatter = useMemo(() => new Intl.NumberFormat(), [])

  const totalProducts = mockProducts.length
  const lowStockCount = mockStockLevels.filter((stock) => stock.qty < LOW_STOCK_THRESHOLD).length
  const openShipments = mockShipments.filter(
    (shipment) => shipment.doc_status !== 'SHIPPED' && shipment.doc_status !== 'DELIVERED'
  ).length
  const halalSuppliers = mockSuppliers.filter((supplier) => supplier.is_halal_certified).length

  const recentStock = useMemo(() => {
    return [...mockStockLevels]
      .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
      .slice(0, 5)
  }, [])

  const stats = [
    {
      title: 'Total Products',
      value: formatter.format(totalProducts),
      description: 'SKUs in catalog',
      icon: Package,
      color: 'bg-olive-dark',
    },
    {
      title: 'Low Stock Items',
      value: formatter.format(lowStockCount),
      description: 'Below safety levels',
      icon: AlertCircle,
      color: 'bg-orange-500',
    },
    {
      title: 'Open Shipments',
      value: formatter.format(openShipments),
      description: 'Pending dispatch',
      icon: Truck,
      color: 'bg-brown',
    },
    {
      title: 'Halal Suppliers',
      value: formatter.format(halalSuppliers),
      description: 'Certified partners',
      icon: Users,
      color: 'bg-olive',
    },
  ]

  return (
    <PageLayout title="Dashboard" activeItem="dashboard" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="mb-2 text-3xl font-bold text-text-dark">Welcome back, {user?.name || 'User'}!</h2>
        <p className="text-text-dark/70">Here's an overview of your inventory.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="bg-white border-olive-light/30">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-text-dark">{stat.title}</CardTitle>
                <div className={`${stat.color} rounded-md p-2`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-text-dark">{stat.value}</div>
                <CardDescription className="mt-1 text-xs text-text-dark/60">{stat.description}</CardDescription>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Recent Inventory</CardTitle>
          <CardDescription>Latest stock across your warehouses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-olive-light/20">
            {recentStock.map((stock) => {
              const isLow = stock.qty < LOW_STOCK_THRESHOLD

              return (
                <div
                  key={stock.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-dark">{stock.product_name}</p>
                    <p className="text-xs text-text-dark/60">SKU: {stock.product_sku}</p>
                    <p className="mt-1 text-xs text-text-dark/60">{stock.warehouse_name}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="text-sm font-semibold text-text-dark">
                      {stock.qty} {stock.unit}
                    </span>
                    <div className="flex flex-col items-start gap-1 text-xs text-text-dark/60 sm:items-end">
                      <span>{new Date(stock.last_updated).toLocaleString()}</span>
                      {isLow && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-1 font-medium text-orange-800">
                          <AlertCircle className="h-3 w-3" />
                          Low Stock
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default Dashboard

