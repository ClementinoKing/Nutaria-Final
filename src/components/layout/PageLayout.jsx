import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

function PageLayout({
  title,
  activeItem,
  actions = null,
  children,
  contentClassName,
  headerClassName,
  mainClassName,
  stickyHeader = true,
}) {
  const { user, logout } = useAuth()
  const getIsDesktop = () => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false)
  const [isDesktop, setIsDesktop] = useState(() => getIsDesktop())
  const [sidebarOpen, setSidebarOpen] = useState(() => getIsDesktop())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isDesktop) {
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }, [isDesktop])

  const headerClasses = cn(
    'bg-white border-b border-olive-light/20 shadow-sm',
    stickyHeader && 'sticky top-0 z-20',
    headerClassName
  )

  const mainContainerClasses = cn(
    'flex min-h-dvh flex-col transition-[margin] duration-300 md:min-h-screen',
    isDesktop && sidebarOpen ? 'md:ml-80' : isDesktop ? 'md:ml-20' : '',
    mainClassName
  )

  const contentClasses = cn('flex-1 px-4 py-6 sm:px-6 lg:px-8', contentClassName)

  const actionsWrapperClasses = 'flex flex-wrap items-center gap-2'

  return (
    <div className="relative min-h-screen bg-beige">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeItem={activeItem}
        user={user}
        onLogout={logout}
        isDesktop={isDesktop}
      />

      {sidebarOpen && !isDesktop && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className={mainContainerClasses}>
        <header className={headerClasses}>
          <div className="px-4 py-3 sm:px-6 sm:py-0 lg:px-8">
            <div className="flex flex-col gap-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition hover:bg-olive-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive sm:hidden"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <h1 className="text-xl font-semibold text-text-dark sm:text-2xl">{title}</h1>
              </div>
              {actions && (
                <div className={cn(actionsWrapperClasses, 'sm:items-center sm:justify-end')}>
                  {actions}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={contentClasses}>{children}</main>
      </div>
    </div>
  )
}

export default PageLayout


