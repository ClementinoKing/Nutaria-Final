import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Units from './pages/inventory/Units'
import Warehouses from './pages/inventory/Warehouses'
import Products from './pages/inventory/Products'
import StockLevels from './pages/inventory/StockLevels'
import StockMovements from './pages/inventory/StockMovements'
import Supplies from './pages/supplies/Supplies'
import SupplyDetail from './pages/supplies/SupplyDetail'
import ProcessView from './pages/process/ProcessView'
import Processes from './pages/process/Processes'
import ProcessDetail from './pages/process/ProcessDetail'
import ProcessSteps from './pages/process/ProcessSteps'
import Customers from './pages/suppliers-customers/Customers'
import Suppliers from './pages/suppliers-customers/Suppliers'
import SupplierDetail from './pages/suppliers-customers/SupplierDetail'
import SupplierEdit from './pages/suppliers-customers/SupplierEdit'
import Shipments from './pages/shipments/Shipments'
import ShipmentDetail from './pages/shipments/ShipmentDetail'
import UserManagement from './pages/users/UserManagement'
import RoleManagement from './pages/users/RoleManagement'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-beige">
        <div className="text-text-dark">Loading...</div>
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
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
        path="/process/process-steps"
        element={
          <ProtectedRoute>
            <ProcessSteps />
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
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
