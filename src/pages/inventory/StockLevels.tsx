import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/layout/PageLayout'
import { Package, Layers, Box, Scale, Trash2 } from 'lucide-react'

const SEGMENTS = [
  {
    key: 'supply',
    title: 'Supply Stock',
    description: 'Raw and received stock from supplies, by product and warehouse.',
    path: '/inventory/stock-levels/supply',
    icon: Package,
    className: 'border-olive-light/40 hover:border-olive/60 hover:bg-olive-light/5',
  },
  {
    key: 'wip',
    title: 'Work In Progress Stock',
    description: 'Stock currently in process (e.g. sorted WIP outputs before packaging).',
    path: '/inventory/stock-levels/wip',
    icon: Layers,
    className: 'border-amber-200/60 hover:border-amber-400/80 hover:bg-amber-50/50',
  },
  {
    key: 'packed',
    title: 'Allocations',
    description: 'Storage allocations created during packaging, grouped by product and pack.',
    path: '/inventory/stock-levels/allocation',
    icon: Box,
    className: 'border-emerald-200/60 hover:border-emerald-400/80 hover:bg-emerald-50/50',
  },
  {
    key: 'remainders',
    title: 'Remainders',
    description: 'Leftover partial quantities from packaging, with source process traceability.',
    path: '/inventory/stock-levels/remainders',
    icon: Scale,
    className: 'border-orange-200/70 hover:border-orange-400/80 hover:bg-orange-50/60',
  },
  {
    key: 'waste',
    title: 'Waste',
    description: 'Waste and foreign-object losses by lot run, with lost kg totals.',
    path: '/inventory/stock-levels/waste',
    icon: Trash2,
    className: 'border-rose-200/70 hover:border-rose-400/80 hover:bg-rose-50/60',
  },
] as const

function StockLevels() {
  const navigate = useNavigate()

  return (
    <PageLayout
      title="Stock Levels"
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6">
        <p className="text-muted-foreground">
          View stock by stage: supply, work in progress, allocations, remainders, or waste.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map((segment) => {
          const Icon = segment.icon
          return (
            <Card
              key={segment.key}
              className={`cursor-pointer transition-all duration-200 ${segment.className}`}
              onClick={() => navigate(segment.path)}
            >
              <CardHeader className="pb-2">
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-text-dark">{segment.title}</CardTitle>
                <CardDescription className="text-text-dark/70">
                  {segment.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-olive">View {segment.title} →</span>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </PageLayout>
  )
}

export default StockLevels
