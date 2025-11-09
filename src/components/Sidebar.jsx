import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LogOut, LayoutDashboard, Menu, X, Package, Warehouse, Ruler, Package2, TrendingUp, ArrowRight, ChevronDown, ChevronRight, ArrowDownCircle, Truck, PackageSearch, Users as UsersIcon, FileText, Layers, Cog, Settings, Building2, UserCheck, FileCheck, BadgeCheck, FolderOpen, Eye, Activity } from 'lucide-react'

function Sidebar({ sidebarOpen, setSidebarOpen, activeItem, user, onLogout, isDesktop = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [expandedMenus, setExpandedMenus] = useState({
    inventory: false,
    process: false,
    suppliersCustomers: false,
    settings: false,
    users: false,
  })

  const navigationItems = [
    { name: 'Dashboard', icon: LayoutDashboard, key: 'dashboard', path: '/dashboard' },
    { 
      name: 'Inventory', 
      icon: Warehouse, 
      key: 'inventory',
      submenu: [
        { name: 'Stock Levels', icon: TrendingUp, key: 'stock-levels', path: '/inventory/stock-levels' },
        { name: 'Stock Movements', icon: ArrowRight, key: 'stock-movements', path: '/inventory/stock-movements' },
      ]
    },
    { name: 'Supplies', icon: ArrowDownCircle, key: 'supplies', path: '/supplies' },
    { 
      name: 'Process', 
      icon: Cog, 
      key: 'process',
      submenu: [
        { name: 'Process View', icon: Eye, key: 'process-view', path: '/process/view' },
        { name: 'Process Steps', icon: Layers, key: 'process-steps', path: '/process/process-steps' },
      ]
    },
    { 
      name: 'Suppliers & Customers', 
      icon: Building2, 
      key: 'suppliersCustomers',
      submenu: [
        { name: 'Suppliers', icon: Building2, key: 'suppliers', path: '/suppliers-customers/suppliers' },
        { name: 'Customers', icon: UsersIcon, key: 'customers', path: '/suppliers-customers/customers' },
      ]
    },
    { name: 'Shipments', icon: Truck, key: 'shipments', path: '/shipments' },
    {
      name: 'Users',
      icon: UsersIcon,
      key: 'users',
      submenu: [
        { name: 'User Management', icon: UserCheck, key: 'user-management', path: '/user-management' },
        { name: 'Role Management', icon: BadgeCheck, key: 'role-management', path: '/role-management' },
      ],
    },
    {
      name: 'Settings',
      icon: Settings,
      key: 'settings',
      submenu: [
        { name: 'Units', icon: Ruler, key: 'units', path: '/inventory/units' },
        { name: 'Warehouses', icon: Warehouse, key: 'warehouses', path: '/inventory/warehouses' },
        { name: 'Products', icon: Package2, key: 'products', path: '/inventory/products' },
        { name: 'Processes', icon: Cog, key: 'processes', path: '/process/processes' },
      ],
    },
  ]

  const closeSidebarOnMobile = () => {
    if (!isDesktop) {
      setSidebarOpen(false)
    }
  }

  const handleNavigation = (item) => {
    if (item.path) {
      navigate(item.path)
      closeSidebarOnMobile()
    }
  }

  const inventoryPaths = ['/inventory/stock-levels', '/inventory/stock-movements']
  const settingsPaths = ['/inventory/units', '/inventory/warehouses', '/inventory/products', '/process/processes']
  const processPaths = ['/process/view', '/process/process-steps']
  const isInventoryActive = inventoryPaths.some(path => location.pathname.startsWith(path))
  const isSettingsActive = settingsPaths.some(path => location.pathname.startsWith(path))
  const isProcessActive = processPaths.some(path => location.pathname.startsWith(path))
  const isSuppliersCustomersActive = location.pathname.startsWith('/suppliers-customers')
  const isShipmentsActive = location.pathname.startsWith('/shipments')
  const isUsersActive = ['/user-management', '/role-management'].some(path => location.pathname.startsWith(path))
 
  // Auto-expand menus if on their respective pages
  useEffect(() => {
    if (isInventoryActive) {
      setExpandedMenus(prev => ({ ...prev, inventory: true }))
    }
    if (isSettingsActive) {
      setExpandedMenus(prev => ({ ...prev, settings: true }))
    }
    if (isProcessActive) {
      setExpandedMenus(prev => ({ ...prev, process: true }))
    }
    if (isSuppliersCustomersActive) {
      setExpandedMenus(prev => ({ ...prev, suppliersCustomers: true }))
    }
    if (isUsersActive) {
      setExpandedMenus(prev => ({ ...prev, users: true }))
    }
  }, [isInventoryActive, isSettingsActive, isProcessActive, isSuppliersCustomersActive, isUsersActive])

  const toggleMenu = (menuKey) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }))
  }

  const isMenuActive = (menuKey) => {
    switch(menuKey) {
      case 'inventory':
        return isInventoryActive
      case 'settings':
        return isSettingsActive
      case 'process':
        return isProcessActive
      case 'suppliersCustomers':
        return isSuppliersCustomersActive
      case 'users':
        return isUsersActive
      default:
        return false
    }
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-full flex-col bg-olive-dark text-white transition-all duration-300 md:h-screen',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        isDesktop ? (sidebarOpen ? 'md:w-80' : 'md:w-20') : 'w-72'
      )}
    >
      {/* Sidebar Header */}
      <div className="p-4 border-b border-olive-light/20">
        <div className="flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h2 className="text-xl font-bold">Nutaria</h2>
              <p className="text-xs text-white/70">Inventory System</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-white/10 ml-auto"
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = item.submenu ? isMenuActive(item.key) : (activeItem === item.key || location.pathname === item.path)
          const isExpanded = item.submenu ? expandedMenus[item.key] : false
          
          if (item.submenu) {
            return (
              <div key={item.key}>
                <button
                  onClick={() => {
                    if (sidebarOpen) {
                      toggleMenu(item.key)
                    }
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-olive text-white'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-6 w-6 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.name}</span>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                      )}
                    </>
                  )}
                </button>
                {sidebarOpen && isExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-olive-light/20 pl-4">
                    {item.submenu.map((subItem) => {
                      const SubIcon = subItem.icon
                      const isSubActive = location.pathname === subItem.path
                      return (
                        <button
                          key={subItem.key}
                          onClick={() => handleNavigation(subItem)}
                          className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                            isSubActive
                              ? 'bg-olive/50 text-white'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <SubIcon className="h-5 w-5 flex-shrink-0" />
                          <span className="text-sm font-medium">{subItem.name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return (
            <button
              key={item.key}
              onClick={() => handleNavigation(item)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-olive text-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-6 w-6 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm font-medium">{item.name}</span>}
            </button>
          )
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-olive-light/20">
        <div className="flex items-center space-x-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-olive flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email || 'User'}</p>
              <p className="text-xs text-white/70">Admin</p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onLogout}
          className={`w-full bg-white/10 border-white/20 text-white hover:bg-white/20 ${!sidebarOpen ? 'px-2' : ''}`}
        >
          <LogOut className={`h-5 w-5 ${sidebarOpen ? 'mr-2' : ''}`} />
          {sidebarOpen && <span>Logout</span>}
        </Button>
      </div>
    </aside>
  )
}

export default Sidebar

