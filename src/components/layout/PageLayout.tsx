import { useCallback, useEffect, useMemo, useState } from 'react'
import { Menu, Timer } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  clearActiveTimerFromStorage,
  clearTimerFromStorage,
  formatSecondsToHms,
  getTimerUpdatedEventName,
  loadAnyRunningTimerFromStorage,
  type MetalDetectorTimerState,
} from '@/lib/metalDetectorTimer'
import {
  getActiveGlobalMetalDetectorSession,
  stopGlobalMetalDetectorSession,
} from '@/lib/processExecution'

interface PageLayoutProps {
  title: string
  activeItem?: string
  leadingActions?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
  headerClassName?: string
  mainClassName?: string
  stickyHeader?: boolean
}

interface HeaderMetalTimerState {
  lotId: number
  endAtMs: number
  source: 'db' | 'local'
}

function PageLayout({
  title,
  activeItem,
  leadingActions = null,
  actions = null,
  children,
  contentClassName,
  headerClassName,
  mainClassName,
  stickyHeader = true,
}: PageLayoutProps) {
  const { user, logout } = useAuth()
  const getIsDesktop = () => (typeof window !== 'undefined' ? window.innerWidth >= 1024 : false)
  const [isDesktop, setIsDesktop] = useState(() => getIsDesktop())
  const [sidebarOpen, setSidebarOpen] = useState(() => getIsDesktop())
  const [globalMetalTimer, setGlobalMetalTimer] = useState<HeaderMetalTimerState | null>(null)
  const [metalTimerNowMs, setMetalTimerNowMs] = useState(() => Date.now())

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

  const refreshGlobalMetalTimer = useCallback(async () => {
    const now = Date.now()
    setMetalTimerNowMs(now)
    const activeDbSession = await getActiveGlobalMetalDetectorSession()
    if (activeDbSession) {
      setGlobalMetalTimer({
        lotId: activeDbSession.started_from_process_lot_run_id ?? 0,
        endAtMs: new Date(activeDbSession.ends_at).getTime(),
        source: 'db',
      })
      return
    }

    const localTimer = loadAnyRunningTimerFromStorage(now)
    if (localTimer) {
      setGlobalMetalTimer({
        ...localTimer,
        source: 'local',
      })
    } else {
      setGlobalMetalTimer(null)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const timerUpdatedEventName = getTimerUpdatedEventName()
    const runRefresh = () => {
      void refreshGlobalMetalTimer()
    }
    runRefresh()
    const refreshInterval = window.setInterval(runRefresh, 15000)
    window.addEventListener('storage', runRefresh)
    window.addEventListener('focus', runRefresh)
    window.addEventListener(timerUpdatedEventName, runRefresh)
    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('storage', runRefresh)
      window.removeEventListener('focus', runRefresh)
      window.removeEventListener(timerUpdatedEventName, runRefresh)
    }
  }, [refreshGlobalMetalTimer])

  useEffect(() => {
    if (!globalMetalTimer) return undefined
    const timerId = window.setInterval(() => {
      setMetalTimerNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(timerId)
    }
  }, [globalMetalTimer])

  const metalTimerRemainingSeconds = useMemo(() => {
    if (!globalMetalTimer) return 0
    return Math.max(0, Math.ceil((globalMetalTimer.endAtMs - metalTimerNowMs) / 1000))
  }, [globalMetalTimer, metalTimerNowMs])

  const isGlobalMetalTimerVisible = globalMetalTimer != null && metalTimerRemainingSeconds > 0

  useEffect(() => {
    if (!globalMetalTimer) return
    if (metalTimerRemainingSeconds > 0) return
    if (globalMetalTimer.source === 'local') {
      clearTimerFromStorage(globalMetalTimer.lotId)
      clearActiveTimerFromStorage()
    }
    setGlobalMetalTimer(null)
  }, [globalMetalTimer, metalTimerRemainingSeconds])

  const handleStopGlobalMetalTimer = useCallback(async () => {
    if (!globalMetalTimer) return
    if (globalMetalTimer.source === 'db') {
      await stopGlobalMetalDetectorSession(user?.id ?? null)
    } else {
      clearTimerFromStorage(globalMetalTimer.lotId)
      clearActiveTimerFromStorage()
    }
    setGlobalMetalTimer(null)
  }, [globalMetalTimer, user?.id])

  const headerClasses = cn(
    'border-b border-border bg-card text-foreground shadow-sm transition-colors',
    stickyHeader && 'sticky top-0 z-20',
    headerClassName
  )

  const mainContainerClasses = cn(
    'flex min-h-dvh flex-col bg-background transition-[margin] duration-300 md:min-h-screen',
    isDesktop && sidebarOpen ? 'md:ml-80' : isDesktop ? 'md:ml-20' : '',
    mainClassName
  )

  const contentClasses = cn(
    'flex-1 px-4 py-6 text-foreground transition-colors sm:px-6 lg:px-8',
    contentClassName
  )

  const actionsWrapperClasses = 'flex flex-wrap items-center gap-2'

  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300">
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
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity md:hidden"
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
                {leadingActions && <div className={actionsWrapperClasses}>{leadingActions}</div>}
                <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
                {isGlobalMetalTimerVisible && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
                    <Timer className="h-3.5 w-3.5" />
                    <span>Metal Detector: {formatSecondsToHms(metalTimerRemainingSeconds)}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleStopGlobalMetalTimer}
                      className="h-6 px-2 text-amber-900 hover:bg-amber-100"
                    >
                      Stop
                    </Button>
                  </div>
                )}
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
