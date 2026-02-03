import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, Clock, X, CheckCircle, Activity, AlertCircle, MapPin, Shield } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { PostgrestError } from '@supabase/supabase-js'
import type { ProcessNonConformance } from '@/types/processExecution'

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

interface ProcessStepRun {
  id: number
  process_step_id: number
  status: string
  started_at: string | null
  completed_at: string | null
  performed_by: string | null
  location_id: number | null
  notes: string | null
  process_steps?: {
    id: number
    seq: number
    step_code: string
    step_name: string
  }
  warehouses?: {
    id: number
    name: string
  } | null
  performed_by_user?: {
    id: string
    full_name?: string
    email?: string
  } | null
  process_non_conformances?: ProcessNonConformance[]
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

interface ProcessSignoff {
  id: number
  process_lot_run_id: number
  role: 'operator' | 'supervisor' | 'qa'
  signed_by: string
  signed_at: string
  signed_by_user?: {
    id: string
    full_name?: string
    email?: string
  } | null
}

interface ProcessRun {
  id: number
  status: string
  step_progress?: StepProgress[] // Legacy JSONB - kept for backward compatibility
  step_runs?: ProcessStepRun[] // New relational data
  started_at: string | null
  completed_at: string | null
  created_at: string
  supply_batches: SupplyBatch | SupplyBatch[] | null
  processes: Process | Process[] | null
  process_signoffs?: ProcessSignoff[]
  is_rework?: boolean
  original_process_lot_run_id?: number | null
  original_lot_run?: {
    id: number
    supply_batches?: {
      lot_no?: string
    } | null
  } | null
}

interface TimelineItem {
  id: string
  seq: number
  name: string
  status: string
  started_at: string | null | undefined
  completed_at: string | null | undefined
  operator: string | undefined
  operatorName?: string | undefined
  location?: string | undefined
  quantity_in: string | number | undefined
  quantity_out: string | number | undefined
  notes: string | undefined
  nonConformances?: ProcessNonConformance[]
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

    // First, fetch process_lot_runs with basic joins that work
    const { data: lotRunsData, error: lotRunsError } = await supabase
      .from('process_lot_runs')
      .select(`
        id,
        status,
        step_progress,
        started_at,
        completed_at,
        created_at,
        supply_batch_id,
        process_id,
        is_rework,
        original_process_lot_run_id,
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
        ),
        process_signoffs (
          id,
          process_lot_run_id,
          role,
          signed_by,
          signed_at
        ),
        original_lot_run:original_process_lot_run_id (
          id,
          supply_batches:supply_batch_id (
            lot_no
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (lotRunsError) {
      setError(lotRunsError)
      setLoading(false)
      return
    }

    const runsData = (lotRunsData as unknown as ProcessRun[]) ?? []
    
    if (runsData.length === 0) {
      setRuns([])
      setLoading(false)
      return
    }

    // Fetch process_step_runs separately
    const lotRunIds = runsData.map((run) => run.id)
    const { data: stepRunsData, error: stepRunsError } = await supabase
      .from('process_step_runs')
      .select('id, process_lot_run_id, process_step_id, status, started_at, completed_at, performed_by, location_id, notes')
      .in('process_lot_run_id', lotRunIds)

    if (stepRunsError) {
      console.error('Error fetching step runs:', stepRunsError)
      // Continue without step runs rather than failing completely
    }

    // Fetch related data separately
    const stepIds = (stepRunsData || []).map((sr: any) => sr.process_step_id).filter(Boolean)
    const locationIds = (stepRunsData || []).map((sr: any) => sr.location_id).filter(Boolean)
    const stepRunIds = (stepRunsData || []).map((sr: any) => sr.id).filter(Boolean)

    const [processStepsResult, warehousesResult, nonConformancesResult] = await Promise.all([
      stepIds.length > 0
        ? supabase
            .from('process_steps')
            .select('id, seq, step_name_id')
            .in('id', stepIds)
        : Promise.resolve({ data: [], error: null }),
      locationIds.length > 0
        ? supabase
            .from('warehouses')
            .select('id, name')
            .in('id', locationIds)
        : Promise.resolve({ data: [], error: null }),
      stepRunIds.length > 0
        ? supabase
            .from('process_non_conformances')
            .select('id, process_step_run_id, nc_type, description, severity, corrective_action, resolved, resolved_at')
            .in('process_step_run_id', stepRunIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Resolve step names from process_step_names if step_name_id is used
    const stepNameIds = (processStepsResult.data || [])
      .map((ps: any) => ps.step_name_id)
      .filter((id: unknown): id is number => id != null && typeof id === 'number')
    let stepNamesMap = new Map<number, { code: string; name: string }>()
    if (stepNameIds.length > 0) {
      const { data: namesData } = await supabase
        .from('process_step_names')
        .select('id, code, name')
        .in('id', stepNameIds)
      ;(namesData || []).forEach((n: any) => {
        stepNamesMap.set(n.id, { code: n.code ?? '', name: n.name ?? '' })
      })
    }

    // Create maps for efficient lookup (attach step_code/step_name from process_step_names)
    const processStepsMap = new Map(
      (processStepsResult.data || []).map((ps: any) => {
        const stepName = ps.step_name_id ? stepNamesMap.get(ps.step_name_id) : null
        return [
          ps.id,
          {
            ...ps,
            step_code: stepName?.code ?? null,
            step_name: stepName?.name ?? null,
          },
        ]
      })
    )
    const warehousesMap = new Map((warehousesResult.data || []).map((wh: any) => [wh.id, wh]))
    const nonConformancesMap = new Map<number, any[]>()

    ;(nonConformancesResult.data || []).forEach((nc: any) => {
      const stepRunId = nc.process_step_run_id
      if (!nonConformancesMap.has(stepRunId)) {
        nonConformancesMap.set(stepRunId, [])
      }
      nonConformancesMap.get(stepRunId)!.push(nc)
    })

    // Combine step runs with related data
    const stepRunsByLotRunId = new Map<number, any[]>()
    ;(stepRunsData || []).forEach((sr: any) => {
      const lotRunId = sr.process_lot_run_id
      if (!stepRunsByLotRunId.has(lotRunId)) {
        stepRunsByLotRunId.set(lotRunId, [])
      }
      stepRunsByLotRunId.get(lotRunId)!.push({
        ...sr,
        process_steps: processStepsMap.get(sr.process_step_id) || null,
        warehouses: sr.location_id ? warehousesMap.get(sr.location_id) || null : null,
        process_non_conformances: nonConformancesMap.get(sr.id) || [],
      })
    })

    // Attach step runs to lot runs
    runsData.forEach((run) => {
      run.step_runs = stepRunsByLotRunId.get(run.id) || []
    })

    // Collect all user UUIDs from step runs and signoffs
    const userIds = new Set<string>()
    runsData.forEach((run) => {
      if (run.step_runs) {
        run.step_runs.forEach((stepRun) => {
          if (stepRun.performed_by) {
            userIds.add(stepRun.performed_by)
          }
        })
      }
      if (run.process_signoffs) {
        run.process_signoffs.forEach((signoff) => {
          userIds.add(signoff.signed_by)
        })
      }
    })

    // Fetch user profiles for all UUIDs
    const userProfilesMap = new Map<string, { full_name?: string; email?: string }>()
    if (userIds.size > 0) {
      const { data: profilesData } = await supabase
        .from('user_profiles')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', Array.from(userIds))

      if (profilesData) {
        profilesData.forEach((profile) => {
          if (profile.auth_user_id) {
            userProfilesMap.set(profile.auth_user_id, {
              full_name: profile.full_name ?? undefined,
              email: profile.email ?? undefined,
            })
          }
        })
      }
    }

    // Map user profiles back to runs
    runsData.forEach((run) => {
      if (run.step_runs) {
        run.step_runs.forEach((stepRun) => {
          if (stepRun.performed_by) {
            const profile = userProfilesMap.get(stepRun.performed_by)
            if (profile) {
              stepRun.performed_by_user = {
                id: stepRun.performed_by,
                ...profile,
              }
            }
          }
        })
      }
      if (run.process_signoffs) {
        run.process_signoffs.forEach((signoff) => {
          const profile = userProfilesMap.get(signoff.signed_by)
          if (profile) {
            signoff.signed_by_user = {
              id: signoff.signed_by,
              ...profile,
            }
          }
        })
      }
    })

    setRuns(runsData)
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
      // Prefer new relational step_runs over legacy JSONB step_progress
      let timelineItems: TimelineItem[] = []

      if (run.step_runs && Array.isArray(run.step_runs) && run.step_runs.length > 0) {
        // Use new relational data
        const orderedStepRuns = [...run.step_runs].sort(
          (a: ProcessStepRun, b: ProcessStepRun) => (a.process_steps?.seq ?? 0) - (b.process_steps?.seq ?? 0)
        )

        timelineItems = orderedStepRuns.map((stepRun: ProcessStepRun, index: number) => {
          const step = stepRun.process_steps
          const operatorName = stepRun.performed_by_user?.full_name || stepRun.performed_by_user?.email || undefined
          const locationName = stepRun.warehouses?.name || undefined
          
          return {
            id: `${run.id}-${stepRun.id}`,
            seq: step?.seq ?? index + 1,
            name: step?.step_name ?? `Step ${index + 1}`,
            status: (stepRun.status ?? 'PENDING').toUpperCase(),
            started_at: stepRun.started_at ?? undefined,
            completed_at: stepRun.completed_at ?? undefined,
            operator: stepRun.performed_by ?? undefined,
            operatorName,
            location: locationName,
            quantity_in: undefined,
            quantity_out: undefined,
            notes: stepRun.notes ?? undefined,
            measurements: [],
            nonConformances: stepRun.process_non_conformances || [],
          }
        })
      } else if (Array.isArray(run.step_progress) && run.step_progress.length > 0) {
        // Fall back to legacy JSONB data
        const orderedSteps = [...run.step_progress].sort(
          (a: StepProgress, b: StepProgress) => (a.seq ?? 0) - (b.seq ?? 0)
        )
        const process = getProcess(run)

        timelineItems = orderedSteps.map((step: StepProgress, index: number) => {
          const processStep = processSteps
            .get(process?.id ?? -1)
            ?.find((s: { id: number; [key: string]: unknown }) => s.id === step.step_id)
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
      }

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
        const originalLotNo = run.original_lot_run?.supply_batches?.lot_no
        return (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-dark">{batch?.lot_no ?? 'Unknown lot'}</span>
              {run.is_rework && (
                <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-semibold border border-yellow-300">
                  Rework
                </span>
              )}
            </div>
            <div className="text-xs text-text-dark/60">
              {batch?.supplies?.doc_no ?? 'No document number'}
            </div>
            {run.is_rework && originalLotNo && (
              <div className="text-xs text-yellow-700 mt-1">
                Rework of {originalLotNo}
              </div>
            )}
          </div>
        )
      },
      mobileRender: (run: ProcessRun) => {
        const batch = getSupplyBatch(run)
        const originalLotNo = run.original_lot_run?.supply_batches?.lot_no
        return (
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="font-medium text-text-dark">{batch?.lot_no ?? 'Unknown lot'}</span>
              {run.is_rework && (
                <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs font-semibold border border-yellow-300">
                  Rework
                </span>
              )}
            </div>
            <div className="text-xs text-text-dark/60">
              {batch?.supplies?.doc_no ?? 'No document number'}
            </div>
            {run.is_rework && originalLotNo && (
              <div className="text-xs text-yellow-700 mt-1">
                Rework of {originalLotNo}
              </div>
            )}
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
  const signoffs = selectedRun?.process_signoffs || []

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

  const getSeverityColor = (severity: ProcessNonConformance['severity']): string => {
    switch (severity) {
      case 'LOW':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'MEDIUM':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'HIGH':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'CRITICAL':
        return 'bg-red-200 text-red-900 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRoleLabel = (role: ProcessSignoff['role']): string => {
    switch (role) {
      case 'operator':
        return 'Operator'
      case 'supervisor':
        return 'Supervisor'
      case 'qa':
        return 'QA'
      default:
        return role
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
                                  {item.operatorName || item.operator || '—'}
                                </div>
                                {item.location && (
                                  <div className="text-sm text-text-dark/70">
                                    <span className="font-medium text-text-dark">Location:</span>{' '}
                                    <span className="inline-flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {item.location}
                                    </span>
                                  </div>
                                )}
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

                              {item.nonConformances && item.nonConformances.length > 0 && (
                                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                    <span className="text-sm font-semibold text-red-800">Non-Conformances</span>
                                  </div>
                                  <div className="space-y-2">
                                    {item.nonConformances.map((nc) => (
                                      <div
                                        key={nc.id}
                                        className={`rounded border px-3 py-2 ${getSeverityColor(nc.severity)}`}
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="font-semibold text-sm">{nc.nc_type}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded ${getSeverityColor(nc.severity)}`}>
                                            {nc.severity}
                                          </span>
                                        </div>
                                        <p className="text-xs mb-1">{nc.description}</p>
                                        {nc.corrective_action && (
                                          <p className="text-xs italic">
                                            <span className="font-medium">Corrective action:</span> {nc.corrective_action}
                                          </p>
                                        )}
                                        <div className="flex items-center justify-between mt-1">
                                          <span className={`text-xs ${nc.resolved ? 'text-green-700' : 'text-red-700'}`}>
                                            {nc.resolved ? (
                                              <span className="flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                Resolved {nc.resolved_at ? new Date(nc.resolved_at).toLocaleString() : ''}
                                              </span>
                                            ) : (
                                              'Unresolved'
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

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

            {signoffs.length > 0 && (
              <div className="border-t border-olive-light/20 px-4 sm:px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-olive" />
                  <h3 className="text-sm font-semibold text-text-dark">Process Signoffs</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(['operator', 'supervisor', 'qa'] as const).map((role) => {
                    const roleSignoffs = signoffs.filter((s) => s.role === role)
                    return (
                      <div key={role} className="rounded-lg border border-olive-light/30 bg-white p-3">
                        <div className="text-xs font-semibold text-text-dark/70 mb-2 uppercase tracking-wide">
                          {getRoleLabel(role)}
                        </div>
                        {roleSignoffs.length > 0 ? (
                          <div className="space-y-1">
                            {roleSignoffs.map((signoff) => (
                              <div key={signoff.id} className="text-xs text-text-dark/70">
                                <div className="font-medium">
                                  {signoff.signed_by_user?.full_name || signoff.signed_by_user?.email || signoff.signed_by}
                                </div>
                                <div className="text-text-dark/50">
                                  {new Date(signoff.signed_at).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-text-dark/50">No signoffs</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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

