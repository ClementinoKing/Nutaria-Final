import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  Warehouse,
  Ruler,
  Package2,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ArrowDownCircle,
  Truck,
  Users as UsersIcon,
  Layers,
  Cog,
  Settings,
  Building2,
  UserCheck,
  BadgeCheck,
  CheckCircle2,
  Eye,
  ListChecks,
  ShieldCheck,
  Sun,
  Moon,
  FileText,
  HelpCircle,
  Tag,
  Banknote,
} from 'lucide-react'
import { useDailyChecks } from '@/context/DailyChecksContext'
import { useTheme } from '@/context/ThemeContext'
import { User } from '@supabase/supabase-js'
import { LucideIcon } from 'lucide-react'

interface NavigationSubItem {
  name: string
  icon: LucideIcon
  key: string
  path: string
}

interface NavigationItem {
  name: string
  icon: LucideIcon
  key: string
  path?: string
  submenu?: NavigationSubItem[]
  badge?: number
}

interface SidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeItem?: string
  user: User | null
  onLogout: () => Promise<{ error?: Error }>
  isDesktop?: boolean
}

function Sidebar({ sidebarOpen, setSidebarOpen, activeItem, user, onLogout, isDesktop = false }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { remainingCount: dailyRemainingCount } = useDailyChecks()
  const { theme, toggleTheme } = useTheme()
  type ExpandedMenuKey = 'inventory' | 'process' | 'suppliersCustomers' | 'settings' | 'users' | 'checks'
  
  const [expandedMenus, setExpandedMenus] = useState<Record<ExpandedMenuKey, boolean>>({
    inventory: false,
    process: false,
    suppliersCustomers: false,
    settings: false,
    users: false,
    checks: false,
  })

  const navigationItems: NavigationItem[] = [
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
    { name: 'Payments', icon: Banknote, key: 'payments', path: '/payments' },
    { 
      name: 'Process', 
      icon: Cog, 
      key: 'process',
      submenu: [
        { name: 'Process View', icon: Eye, key: 'process-view', path: '/process/view' },
        { name: 'Process Steps', icon: Layers, key: 'process-steps', path: '/process/process-steps' },
        { name: 'Completed Processes', icon: CheckCircle2, key: 'completed-processes', path: '/process/completed' },
      ]
    },
    { 
      name: 'Partner', 
      icon: Building2, 
      key: 'suppliersCustomers',
      submenu: [
        { name: 'Suppliers', icon: Building2, key: 'suppliers', path: '/suppliers-customers/suppliers' },
        { name: 'Customers', icon: UsersIcon, key: 'customers', path: '/suppliers-customers/customers' },
      ]
    },
    { name: 'Shipments', icon: Truck, key: 'shipments', path: '/shipments' },
    {
      name: 'Checks',
      icon: ListChecks,
      key: 'checks',
      submenu: [
        { name: 'Metal Detector Checks', icon: ShieldCheck, key: 'metal-detector-checks', path: '/checks/metal-detector' },
        { name: 'Daily Checks', icon: ListChecks, key: 'daily-checks', path: '/checks/daily' },
      ],
      badge: dailyRemainingCount,
    },
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
        { name: 'Supplier Types', icon: Tag, key: 'supplier-types', path: '/settings/supplier-types' },
        { name: 'Document Types', icon: FileText, key: 'document-types', path: '/settings/document-types' },
        { name: 'Quality Parameters', icon: BadgeCheck, key: 'quality-parameters', path: '/settings/quality-parameters' },
        { name: 'Process Step Names', icon: Layers, key: 'process-step-names', path: '/settings/process-step-names' },
      ],
    },
    { name: 'Audit Logs', icon: FileText, key: 'audit', path: '/audit' },
    { name: 'Help', icon: HelpCircle, key: 'help', path: '/help' },
  ]

  const closeSidebarOnMobile = () => {
    if (!isDesktop) {
      setSidebarOpen(false)
    }
  }

  const handleNavigation = (item: NavigationItem) => {
    if (item.path) {
      navigate(item.path)
      closeSidebarOnMobile()
    }
  }

  const inventoryPaths = ['/inventory/stock-levels', '/inventory/stock-movements']
  const settingsPaths = ['/inventory/units', '/inventory/warehouses', '/inventory/products', '/process/processes', '/settings/supplier-types', '/settings/document-types', '/settings/quality-parameters']
  const processPaths = ['/process/view', '/process/process-steps']
  const checksPaths = ['/checks/metal-detector', '/checks/daily', '/daily-checks']
  const isInventoryActive = inventoryPaths.some(path => location.pathname.startsWith(path))
  const isSettingsActive = settingsPaths.some(path => location.pathname.startsWith(path))
  const isProcessActive = processPaths.some(path => location.pathname.startsWith(path))
  const isChecksActive = checksPaths.some(path => location.pathname.startsWith(path))
  const isSuppliersCustomersActive = location.pathname.startsWith('/suppliers-customers')
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
    if (isChecksActive) {
      setExpandedMenus(prev => ({ ...prev, checks: true }))
    }
  }, [isInventoryActive, isSettingsActive, isProcessActive, isSuppliersCustomersActive, isUsersActive, isChecksActive])

  const toggleMenu = (menuKey: ExpandedMenuKey) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuKey]: !prev[menuKey]
    }))
  }

  const isMenuActive = (menuKey: string): boolean => {
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
      case 'checks':
        return isChecksActive
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
      <div className="border-b border-olive-light/20 p-4">
        <div className="flex items-center justify-between">
          <img
            src="/img/logos/Nutaria_logo.svg"
            alt="Nutaria logo"
            className={cn(
              'transition-all',
              sidebarOpen ? 'h-20 w-auto' : 'hidden'
            )}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-white hover:bg-white/10"
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 overflow-y-auto p-4">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = item.submenu ? isMenuActive(item.key) : (activeItem === item.key || location.pathname === item.path)
          const isExpanded = item.submenu && (item.key as ExpandedMenuKey) in expandedMenus 
            ? expandedMenus[item.key as ExpandedMenuKey] 
            : false
          const showBadge = item.key === 'checks' && item.badge !== undefined && Number.isFinite(item.badge) && item.badge > 0
          
          if (item.submenu) {
            return (
              <div key={item.key}>
                <button
                  onClick={() => {
                    if (sidebarOpen && (item.key as ExpandedMenuKey) in expandedMenus) {
                      toggleMenu(item.key as ExpandedMenuKey)
                    }
                  }}
                  className={cn(
                    'flex w-full items-center space-x-3 rounded-lg px-4 py-3 transition-colors',
                    isActive ? 'bg-olive text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-6 w-6 flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-medium flex-1 text-left">{item.name}</span>
                      {showBadge && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold text-white">
                          {item.badge}
                        </span>
                      )}
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
                          className={cn(
                            'flex w-full items-center space-x-3 rounded-lg px-4 py-2 text-sm transition-colors',
                            isSubActive
                              ? 'bg-olive/50 text-white'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )}
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
              className={cn(
                'relative flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-left transition-colors',
                isActive ? 'bg-olive text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-6 w-6 flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">{item.name}</span>}
              </div>
              {showBadge && (
                sidebarOpen ? (
                <span className="ml-auto inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center rounded-full bg-orange-500 px-2 text-xs font-semibold text-white">
                    {item.badge}
                  </span>
                ) : (
                <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-orange-500" />
                )
              )}
            </button>
          )
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-olive-light/20 p-4">
        <div className="mb-3 flex items-center space-x-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-olive text-white">
            <span className="text-sm font-medium">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-white">{user?.email || 'User'}</p>
              <p className="text-xs text-white/70">Admin</p>
            </div>
          )}
        </div>
        <div className={cn('flex w-full gap-2', !sidebarOpen && 'flex-col')}>
          <Button
            variant="outline"
            onClick={onLogout}
            className={cn(
              'flex-[3] border-white/20 bg-white/10 text-white hover:bg-white/20',
              !sidebarOpen && 'w-full px-2'
            )}
          >
            <LogOut className={`h-5 w-5 ${sidebarOpen ? 'mr-2' : ''}`} />
            {sidebarOpen && <span>Logout</span>}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={toggleTheme}
            className={cn(
              'flex-1 border-white/20 bg-white/10 text-white hover:bg-white/20',
              !sidebarOpen && 'w-full px-2'
            )}
            title="Toggle theme"
            aria-label="Toggle theme"
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
