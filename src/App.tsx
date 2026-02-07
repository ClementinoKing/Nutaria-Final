import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { Location as RouterLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DailyChecks = lazy(() => import('./pages/daily/DailyChecks'))
const MetalDetectorChecks = lazy(() => import('./pages/checks/MetalDetectorChecks'))
const Units = lazy(() => import('./pages/inventory/Units'))
const Warehouses = lazy(() => import('./pages/inventory/Warehouses'))
const Products = lazy(() => import('./pages/inventory/Products'))
const StockLevels = lazy(() => import('./pages/inventory/StockLevels'))
const SupplyStockPage = lazy(() => import('./pages/inventory/SupplyStockPage'))
const WIPStockPage = lazy(() => import('./pages/inventory/WIPStockPage'))
const WIPProductDetailPage = lazy(() => import('./pages/inventory/WIPProductDetailPage'))
const AllocationPage = lazy(() => import('./pages/inventory/AllocationPage'))
const AllocationDetailsPage = lazy(() => import('./pages/inventory/AllocationDetailsPage'))
const RemaindersPage = lazy(() => import('./pages/inventory/RemaindersPage'))
const StockMovements = lazy(() => import('./pages/inventory/StockMovements'))
const Supplies = lazy(() => import('./pages/supplies/Supplies'))
const SupplyDetail = lazy(() => import('./pages/supplies/SupplyDetail'))
const Payments = lazy(() => import('./pages/payments/Payments'))
const Reports = lazy(() => import('./pages/reports/Reports'))
const ProcessView = lazy(() => import('./pages/process/ProcessView'))
const Processes = lazy(() => import('./pages/process/Processes'))
const ProcessDetail = lazy(() => import('./pages/process/ProcessDetail'))
const ProcessSteps = lazy(() => import('./pages/process/ProcessSteps'))
const ProcessStepsProgress = lazy(() => import('./pages/process/ProcessStepsProgress'))
const CompletedProcessesList = lazy(() => import('./pages/process/CompletedProcessesList'))
const CompletedProcessDetail = lazy(() => import('./pages/process/CompletedProcessDetail'))
const Customers = lazy(() => import('./pages/suppliers-customers/Customers'))
const Suppliers = lazy(() => import('./pages/suppliers-customers/Suppliers'))
const SupplierDetail = lazy(() => import('./pages/suppliers-customers/SupplierDetail'))
const SupplierEdit = lazy(() => import('./pages/suppliers-customers/SupplierEdit'))
const Shipments = lazy(() => import('./pages/shipments/Shipments'))
const ShipmentDetail = lazy(() => import('./pages/shipments/ShipmentDetail'))
const UserManagement = lazy(() => import('./pages/users/UserManagement'))
const RoleManagement = lazy(() => import('./pages/users/RoleManagement'))
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs'))
const Help = lazy(() => import('./pages/help/Help'))
const SupplierTypes = lazy(() => import('./pages/settings/SupplierTypes'))
const DocumentTypes = lazy(() => import('./pages/settings/DocumentTypes'))
const QualityParameters = lazy(() => import('./pages/settings/QualityParameters'))
const ProcessStepNames = lazy(() => import('./pages/settings/ProcessStepNames'))
const PackagingManagement = lazy(() => import('./pages/settings/PackagingManagement'))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-beige">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-olive border-t-transparent"></div>
        <div className="text-text-dark">Loading...</div>
      </div>
    </div>
  )
}

interface ProtectedRouteProps {
  children: React.ReactNode
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-olive border-t-transparent"></div>
          <div className="text-text-dark">Loading...</div>
        </div>
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function App() {
  const location = useLocation()
  const state = location.state as { backgroundLocation?: RouterLocation } | null
  const isSupplyEditRoute = /^\/supplies\/\d+\/edit$/.test(location.pathname)
  const backgroundLocation = isSupplyEditRoute ? state?.backgroundLocation : undefined

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes location={backgroundLocation ?? location}>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checks/daily"
          element={
            <ProtectedRoute>
              <DailyChecks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checks/metal-detector"
          element={
            <ProtectedRoute>
              <MetalDetectorChecks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/daily-checks"
          element={
            <ProtectedRoute>
              <Navigate to="/checks/daily" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/units"
          element={
            <ProtectedRoute>
              <Units />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/warehouses"
          element={
            <ProtectedRoute>
              <Warehouses />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/products"
          element={
            <ProtectedRoute>
              <Products />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels"
          element={
            <ProtectedRoute>
              <StockLevels />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/supply"
          element={
            <ProtectedRoute>
              <SupplyStockPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/wip"
          element={
            <ProtectedRoute>
              <WIPStockPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/wip/:productId"
          element={
            <ProtectedRoute>
              <WIPProductDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/allocation"
          element={
            <ProtectedRoute>
              <AllocationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/allocation-details/:productId"
          element={
            <ProtectedRoute>
              <AllocationDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-levels/remainders"
          element={
            <ProtectedRoute>
              <RemaindersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory/stock-movements"
          element={
            <ProtectedRoute>
              <StockMovements />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplies"
          element={
            <ProtectedRoute>
              <Supplies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplies/:supplyId"
          element={
            <ProtectedRoute>
              <SupplyDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supplies/:supplyId/edit"
          element={
            <ProtectedRoute>
              <Supplies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/view"
          element={
            <ProtectedRoute>
              <ProcessView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/processes"
          element={
            <ProtectedRoute>
              <Processes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/processes/:processId"
          element={
            <ProtectedRoute>
              <ProcessDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/supplier-types"
          element={
            <ProtectedRoute>
              <SupplierTypes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/document-types"
          element={
            <ProtectedRoute>
              <DocumentTypes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/quality-parameters"
          element={
            <ProtectedRoute>
              <QualityParameters />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/process-step-names"
          element={
            <ProtectedRoute>
              <ProcessStepNames />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/packaging"
          element={
            <ProtectedRoute>
              <PackagingManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/process-steps"
          element={
            <ProtectedRoute>
              <ProcessSteps />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/process-steps/:lotId"
          element={
            <ProtectedRoute>
              <ProcessStepsProgress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/completed"
          element={
            <ProtectedRoute>
              <CompletedProcessesList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/completed/:lotRunId"
          element={
            <ProtectedRoute>
              <CompletedProcessDetail />
            </ProtectedRoute>
          }
        />
        {/* Redirect old process routes to process view */}
        <Route
          path="/process/operators"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/equipment"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/quality-checks"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/grading-results"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/packaging-profiles"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/packaging-events"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/rejects-reworks"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/process/storage-allocations"
          element={
            <ProtectedRoute>
              <Navigate to="/process/view" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers-customers/customers"
          element={
            <ProtectedRoute>
              <Customers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers-customers/suppliers"
          element={
            <ProtectedRoute>
              <Suppliers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers-customers/suppliers/:supplierId"
          element={
            <ProtectedRoute>
              <SupplierDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers-customers/suppliers/:supplierId/edit"
          element={
            <ProtectedRoute>
              <SupplierEdit />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipments"
          element={
            <ProtectedRoute>
              <Shipments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipments/:shipmentId"
          element={
            <ProtectedRoute>
              <ShipmentDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-management"
          element={
            <ProtectedRoute>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/role-management"
          element={
            <ProtectedRoute>
              <RoleManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/help"
          element={
            <ProtectedRoute>
              <Help />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      {isSupplyEditRoute && backgroundLocation && (
        <Routes>
          <Route
            path="/supplies/:supplyId/edit"
            element={
              <ProtectedRoute>
                <Supplies modalOnly />
              </ProtectedRoute>
            }
          />
        </Routes>
      )}
    </Suspense>
  )
}

export default App
