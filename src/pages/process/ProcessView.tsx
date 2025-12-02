import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Clock, X, CheckCircle, Activity } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { PostgrestError } from '@supabase/supabase-js'

interface StepProgress {
  step_id: number
  seq: number
  step_name?: string
  status?: string
  started_at?: string | null
  completed_at?: string | null
  operator?: string
  quantity_in?: string | number
  quantity_out?: string | number
  notes?: string
  [key: string]: unknown
}

interface SupplyBatch {
  id: number
  lot_no: string
  process_status: string
  current_qty: number
  received_qty: number
  product_id: number
  unit_id: number
  supply_id: number
  products?: {
    name?: string
    sku?: string
  } | null
  supplies?: {
    doc_no?: string
    received_at?: string
  } | null
  units?: {
    name?: string
    symbol?: string
  } | null
}

interface Process {
  id: number
  code: string
  name: string
  description?: string | null
}

interface ProcessRun {
  id: number
  status: string
  step_progress: StepProgress[]
  started_at: string | null
  completed_at: string | null
  created_at: string
  supply_batches: SupplyBatch | SupplyBatch[] | null
  processes: Process | Process[] | null
}

interface TimelineItem {
  id: string
  seq: number
  name: string
  status: string
  started_at: string | null | undefined
  completed_at: string | null | undefined
  operator: string | undefined
  quantity_in: string | number | undefined
  quantity_out: string | number | undefined
  notes: string | undefined
}

function ProcessView() {
  const [runs, setRuns] = useState<ProcessRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [selectedRun, setSelectedRun] = useState<ProcessRun | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { processSteps } = useProcessDefinitions({ includeProcessedLots: true })

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_lot_runs')
      .select(`
        id,
        status,
        step_progress,
        started_at,
        completed_at,
        created_at,
        supply_batches: supply_batch_id (
          id,
          lot_no,
          process_status,
          current_qty,
          received_qty,
          product_id,
          unit_id,
          supply_id,
          products: product_id (
            name,
            sku
          ),
          supplies: supply_id (
            doc_no,
            received_at
          ),
          units: unit_id (
            name,
            symbol
          )
        ),
        processes: process_id (
          id,
          code,
          name,
          description
        )
      `)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return
    }

    setRuns((data as unknown as ProcessRun[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const getProcess = (run: ProcessRun): Process | null => {
    if (!run.processes) return null
    if (Array.isArray(run.processes)) return run.processes[0] ?? null
    return run.processes
  }

  const getSupplyBatch = (run: ProcessRun): SupplyBatch | null => {
    if (!run.supply_batches) return null
    if (Array.isArray(run.supply_batches)) return run.supply_batches[0] ?? null
    return run.supply_batches
  }

  const timelineByRunId = useMemo(() => {
    const mapping = new Map<number, TimelineItem[]>()

    runs.forEach((run: ProcessRun) => {
      const steps = Array.isArray(run.step_progress) ? run.step_progress : []
      const orderedSteps = [...steps].sort((a: StepProgress, b: StepProgress) => (a.seq ?? 0) - (b.seq ?? 0))
      const process = getProcess(run)

      const timelineItems: TimelineItem[] = orderedSteps.map((step: StepProgress, index: number) => {
        const processStep = processSteps.get(process?.id ?? -1)?.find((s: { id: number; [key: string]: unknown }) => s.id === step.step_id)
        const stepName = (processStep as { step_name?: string } | undefined)?.step_name
        const label = stepName ?? step.step_name ?? `Step ${step.seq ?? index + 1}`

        return {
          id: `${run.id}-${step.step_id ?? index}`,
          seq: step.seq ?? index + 1,
          name: label,
          status: (step.status ?? 'PENDING').toUpperCase(),
          started_at: step.started_at,
          completed_at: step.completed_at,
          operator: step.operator,
          quantity_in: step.quantity_in,
          quantity_out: step.quantity_out,
          notes: step.notes,
        }
      })

      mapping.set(run.id, timelineItems)
    })

    return mapping
  }, [processSteps, runs])

  const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  const getStatusBadge = (status: string | null | undefined): string => {
    switch ((status ?? '').toUpperCase()) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'IN_PROGRESS':
        return 'bg-brown/10 text-brown border-brown/30'
      default:
        return 'bg-olive-light/30 text-olive-dark border-olive-light/40'
    }
  }

  const columns = [
    {
      key: 'lot',
      header: 'Lot',
      render: (run: ProcessRun) => {
        const batch = getSupplyBatch(run)
        return (
          <div>
            <div className="font-medium text-text-dark">{batch?.lot_no ?? 'Unknown lot'}</div>
            <div className="text-xs text-text-dark/60">
              {batch?.supplies?.doc_no ?? 'No document number'}
            </div>
          </div>
        )
      },
      mobileRender: (run: ProcessRun) => {
        const batch = getSupplyBatch(run)
        return (
          <div className="text-right">
            <div className="font-medium text-text-dark">{batch?.lot_no ?? 'Unknown lot'}</div>
            <div className="text-xs text-text-dark/60">
              {batch?.supplies?.doc_no ?? 'No document number'}
            </div>
          </div>
        )
      },
    },
    {
      key: 'product',
      header: 'Product',
      render: (run: ProcessRun) => {
        const batch = getSupplyBatch(run)
        return (
          <div>
            <div className="text-text-dark font-medium">{batch?.products?.name ?? 'Unknown product'}</div>
            <div className="text-xs text-text-dark/60">{batch?.products?.sku ?? '—'}</div>
          </div>
        )
      },
      mobileRender: (run: ProcessRun) => {
        const batch = getSupplyBatch(run)
        return (
          <div className="text-right">
            <div className="text-text-dark font-medium">{batch?.products?.name ?? 'Unknown product'}</div>
            <div className="text-xs text-text-dark/60">{batch?.products?.sku ?? '—'}</div>
          </div>
        )
      },
    },
    {
      key: 'process',
      header: 'Process',
      render: (run: ProcessRun) => {
        const process = getProcess(run)
        return (
          <div>
            <div className="text-sm font-medium text-text-dark">{process?.name ?? 'Unknown process'}</div>
            <div className="text-xs text-text-dark/60">{process?.code ?? '—'}</div>
          </div>
        )
      },
      mobileRender: (run: ProcessRun) => {
        const process = getProcess(run)
        return (
          <div className="text-right text-sm text-text-dark">{process?.name ?? 'Unknown process'}</div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (run: ProcessRun) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border ${getStatusBadge(
            run.status,
          )}`}
        >
          {run.status ?? 'UNKNOWN'}
        </span>
      ),
      mobileRender: (run: ProcessRun) => run.status ?? 'UNKNOWN',
    },
    {
      key: 'started_at',
      header: 'Started',
      render: (run: ProcessRun) => formatDateTime(run.started_at),
      mobileRender: (run: ProcessRun) => formatDateTime(run.started_at),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark',
    },
    {
      key: 'completed_at',
      header: 'Completed',
      render: (run: ProcessRun) => formatDateTime(run.completed_at),
      mobileRender: (run: ProcessRun) => formatDateTime(run.completed_at),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-sm text-text-dark',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'flex w-full justify-end',
      render: (run: ProcessRun) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRun(run)
              setIsModalOpen(true)
            }}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
        </div>
      ),
      mobileRender: (run: ProcessRun) => (
        <div className="flex w-full justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRun(run)
              setIsModalOpen(true)
            }}
            className="text-olive hover:text-olive-dark"
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
        </div>
      ),
      mobileHeader: 'Actions',
    },
  ]

  const timelineItems = selectedRun ? timelineByRunId.get(selectedRun.id) ?? [] : []

  const getTimelineAccent = (status: string | null | undefined) => {
    switch ((status ?? '').toUpperCase()) {
      case 'COMPLETED':
        return {
          ring: 'bg-olive/30',
          icon: 'bg-olive border-olive-dark text-white',
          pill: 'bg-olive-light/30 text-olive-dark',
          border: 'border-olive-light/30',
        }
      case 'IN_PROGRESS':
        return {
          ring: 'bg-brown/20',
          icon: 'bg-brown border-brown text-white',
          pill: 'bg-brown/20 text-brown',
          border: 'border-brown/20',
        }
      default:
        return {
          ring: 'bg-olive-light/30',
          icon: 'bg-olive-light border-olive text-white',
          pill: 'bg-beige text-brown',
          border: 'border-olive-light/20',
        }
    }
  }

  const getTimelineLabel = (status: string | null | undefined): string => {
    switch ((status ?? '').toUpperCase()) {
      case 'COMPLETED':
        return 'Completed'
      case 'IN_PROGRESS':
        return 'In Progress'
      default:
        return 'Pending'
    }
  }

  const getTimelineIcon = (status: string | null | undefined) => {
    switch ((status ?? '').toUpperCase()) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4" />
      case 'IN_PROGRESS':
        return <Activity className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  return (
    <PageLayout
      title="Process View"
      activeItem="process"
      stickyHeader={false}
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Process View</CardTitle>
          <CardDescription>
            Review lots that are currently being processed or have been completed, with step-by-step progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Failed to load process data. Please refresh.
            </div>
          )}
          {loading ? (
            <div className="py-6 text-sm text-text-dark/60">Loading process runs…</div>
          ) : (
            <ResponsiveTable 
              columns={columns as any} 
              data={runs as any} 
              rowKey="id" 
              emptyMessage="No process runs yet."
              tableClassName={undefined as any}
              mobileCardClassName={undefined as any}
              getRowClassName={undefined as any}
              onRowClick={undefined as any}
            />
          )}
        </CardContent>
      </Card>

      {isModalOpen && selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-olive-light/20 p-4 sm:p-6">
              <div>
                <h2 className="text-xl font-bold text-text-dark sm:text-2xl">Process Timeline</h2>
                <p className="mt-1 text-sm text-text-dark/70">
                  {getSupplyBatch(selectedRun)?.lot_no ?? 'Unknown lot'} ·{' '}
                  {getSupplyBatch(selectedRun)?.products?.name ?? 'Unknown product'}
                </p>
                <p className="text-xs text-text-dark/50">
                  Process: {getProcess(selectedRun)?.name ?? 'Unknown'} ({getProcess(selectedRun)?.code ?? '—'})
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsModalOpen(false)
                  setSelectedRun(null)
                }}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-beige/30 to-white p-4 sm:p-8">
              <div className="relative mx-auto max-w-3xl">
                <div className="absolute left-6 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-olive/20 via-olive/30 to-olive/20 sm:left-8" />

                <div className="space-y-8">
                  {timelineItems.length === 0 && (
                    <div className="text-sm text-text-dark/60">
                      This process does not have any recorded steps yet.
                    </div>
                  )}

                  {timelineItems.map((item: TimelineItem) => {
                    const accent = getTimelineAccent(item.status)
                    return (
                      <div key={item.id} className="relative flex items-start group">
                        <div className="relative z-10 flex-shrink-0 pl-2 sm:pl-0">
                          <div
                            className={`absolute inset-0 rounded-full transition-all duration-300 ${accent.ring}`}
                            style={{ width: '56px', height: '56px', marginLeft: '-4px', marginTop: '-4px' }}
                          />
                          <div
                            className={`relative flex items-center justify-center w-12 h-12 rounded-full border-3 shadow-lg transition-all duration-300 ${accent.icon} group-hover:scale-110`}
                          >
                            {getTimelineIcon(item.status)}
                          </div>
                        </div>

                        <div className="ml-6 flex-1 pb-8 sm:ml-8">
                          <div
                            className={`rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden bg-white border ${accent.border}`}
                          >
                            <div className="px-6 py-4 border-b border-olive-light/20 bg-gradient-to-r from-beige/50 to-white">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="text-lg font-semibold text-text-dark">
                                    {item.seq}. {item.name}
                                  </h3>
                                  <div className="mt-1 text-xs text-text-dark/60">
                                    Started: {formatDateTime(item.started_at ?? null)} · Completed: {formatDateTime(item.completed_at ?? null)}
                                  </div>
                                </div>
                                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${accent.pill}`}>
                                  {getTimelineLabel(item.status)}
                                </span>
                              </div>
                            </div>

                            <div className="px-6 py-5 space-y-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="text-sm text-text-dark/70">
                                  <span className="font-medium text-text-dark">Operator:</span>{' '}
                                  {item.operator || '—'}
                                </div>
                                <div className="text-sm text-text-dark/70">
                                  <span className="font-medium text-text-dark">Quantity in:</span>{' '}
                                  {item.quantity_in ?? '—'}
                                </div>
                                <div className="text-sm text-text-dark/70">
                                  <span className="font-medium text-text-dark">Quantity out:</span>{' '}
                                  {item.quantity_out ?? '—'}
                                </div>
                                <div className="text-sm text-text-dark/70">
                                  <span className="font-medium text-text-dark">Duration:</span>{' '}
                                  {item.started_at && item.completed_at
                                    ? `${Math.round(
                                        (new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) /
                                          60000,
                                      )} min`
                                    : '—'}
                                </div>
                              </div>

                              {item.notes && (
                                <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-4 py-3 text-sm text-text-dark/80">
                                  <span className="font-medium text-text-dark">Notes:</span> {item.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-olive-light/20 p-4 sm:p-6">
              <Button
                onClick={() => {
                  setIsModalOpen(false)
                  setSelectedRun(null)
                }}
                className="bg-olive hover:bg-olive-dark"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default ProcessView

