import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { PanelLeft } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SIDEBAR_WIDTH = '18rem'
const SIDEBAR_WIDTH_ICON = '4.5rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'

type SidebarContextValue = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useIsMobile() {
  const getMatches = () => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false)
  const [isMobile, setIsMobile] = React.useState(getMatches)

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const onResize = () => setIsMobile(getMatches())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return isMobile
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  children,
  className,
  style,
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const [openMobile, setOpenMobile] = React.useState(defaultOpen)

  const open = openProp ?? internalOpen
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (openProp === undefined) {
        setInternalOpen(nextOpen)
      }
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, openProp]
  )

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current)
      return
    }

    setOpen(!open)
  }, [isMobile, open, setOpen])

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state: open ? 'expanded' : 'collapsed',
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-slot="sidebar-provider"
        className={cn('group/sidebar-wrapper flex min-h-0 w-full gap-4', className)}
        style={
          {
            '--sidebar-width': SIDEBAR_WIDTH,
            '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
            '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
            ...style,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = React.useContext(SidebarContext)

  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}

const sidebarVariants = cva(
  'group/sidebar flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm transition-[width,transform] duration-200 ease-linear',
  {
    variants: {
      variant: {
        sidebar: '',
        floating: 'shadow-lg',
        inset: 'bg-background',
      },
      collapsible: {
        offcanvas: '',
        icon: '',
        none: '',
      },
    },
    defaultVariants: {
      variant: 'sidebar',
      collapsible: 'icon',
    },
  }
)

export function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'icon',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
  const { isMobile, open, openMobile, state } = useSidebar()
  const expanded = isMobile ? openMobile : open

  return (
    <aside
      data-slot="sidebar"
      data-side={side}
      data-state={state}
      data-collapsible={collapsible}
      className={cn(
        sidebarVariants({ variant, collapsible }),
        'min-h-[720px] shrink-0 self-start',
        isMobile
          ? expanded
            ? 'w-full'
            : 'hidden'
          : collapsible === 'icon' && !expanded
            ? 'w-[var(--sidebar-width-icon)]'
            : 'w-[var(--sidebar-width)]',
        className
      )}
      {...props}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn('border-b border-border/70 p-4', className)}
      {...props}
    />
  )
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn('border-t border-border/70 p-4', className)}
      {...props}
    />
  )
}

export function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn('flex-1 space-y-4 overflow-y-auto p-4', className)}
      {...props}
    />
  )
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-group" className={cn('space-y-2', className)} {...props} />
}

export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        'px-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground group-data-[state=collapsed]/sidebar:hidden',
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-group-content" className={cn('space-y-1.5', className)} {...props} />
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot="sidebar-menu" className={cn('space-y-1.5', className)} {...props} />
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn('relative list-none', className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive',
  {
    variants: {
      active: {
        true: 'bg-olive/10 text-foreground shadow-sm border-olive/30',
        false: 'bg-muted/30 text-foreground/90 hover:border-border hover:bg-card',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)

export function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : 'button'
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        sidebarMenuButtonVariants({ active: isActive }),
        !expanded && 'justify-center px-2',
        className
      )}
      {...props}
    />
  )
}

export function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'span'>) {
  const { isMobile, open, openMobile } = useSidebar()
  const expanded = isMobile ? openMobile : open

  return (
    <span
      data-slot="sidebar-menu-badge"
      className={cn(
        'inline-flex min-h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-olive px-1.5 text-[11px] font-semibold text-white',
        !expanded && 'absolute right-1 top-1',
        className
      )}
      {...props}
    />
  )
}

export function SidebarInset({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sidebar-inset" className={cn('min-w-0 flex-1', className)} {...props} />
}

export function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn('h-10 w-10 shrink-0', className)}
      onClick={toggleSidebar}
      {...props}
    >
      <PanelLeft className="h-4 w-4 rtl:rotate-180" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

export function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      type="button"
      data-slot="sidebar-rail"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn(
        'hidden w-2 self-stretch rounded-full bg-transparent transition-colors hover:bg-border/80 lg:block',
        className
      )}
      {...props}
    />
  )
}
