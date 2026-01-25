import { useCallback, useEffect, useMemo, useState, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, CornerUpLeft, MapPin, Save, Plus } from 'lucide-react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useAuth } from '@/context/AuthContext'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { useProcessLotRun } from '@/hooks/useProcessLotRun'
import { useProcessStepRuns } from '@/hooks/useProcessStepRuns'
import { useProcessMeasurements } from '@/hooks/useProcessMeasurements'
import { useNonConformances } from '@/hooks/useNonConformances'
import { supabase } from '@/lib/supabaseClient'
import {
  updateProcessStepRun,
  createNonConformance,
  completeProcessLotRun,
  createProcessSignoff,
  createProcessLotRun,
  createProcessStepRuns,
} from '@/lib/processExecution'
import { MeasurementsCapture } from '@/components/process/MeasurementsCapture'
import { NonConformanceList } from '@/components/process/NonConformanceList'
import { NonConformanceForm } from '@/components/process/NonConformanceForm'
import { StepQCCheck } from '@/components/process/StepQCCheck'
import { ProcessSignoffs } from '@/components/process/ProcessSignoffs'
import type { ProcessStepRun } from '@/types/processExecution'

interface Lot {
  id: number
  lot_no: string
  supply_id: number
  product_id: number
  unit_id: number
  received_qty: number
  accepted_qty: number
  rejected_qty: number
  current_qty: number
  process_status: string
  quality_status: string
  expiry_date?: string | null
  created_at: string
  supplies?: {
    doc_no?: string
    received_at?: string
    supplier_id?: number
    warehouse_id?: number
  } | null
  products?: {
    name?: string
    sku?: string
  } | null
  units?: {
    name?: string
    symbol?: string
  } | null
}

const PROCESS_STATUSES: Array<ProcessStepRun['status']> = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const tzOffsetMinutes = date.getTimezoneOffset()
  const localMillis = date.getTime() - tzOffsetMinutes * 60 * 1000
  return new Date(localMillis).toISOString().slice(0, 16)
}

function toISOString(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function getLotStatusStyles(status: string | null | undefined): string {
  switch ((status ?? '').toUpperCase()) {
    case 'PROCESSING':
      return 'border-orange-300 bg-orange-100 text-orange-800'
    case 'PROCESSED':
      return 'border-green-200 bg-green-100 text-green-800'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-700'
  }
}

function formatLotStatus(status: string | null | undefined): string {
  const value = (status ?? '').toLowerCase()
  if (!value) return 'Unknown'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ProcessStepsProgress() {
  const { lotId: lotIdParam } = useParams()
  const lotId = Number.parseInt(lotIdParam ?? '', 10)
  const navigate = useNavigate()

  const { user } = useAuth()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showNCForm, setShowNCForm] = useState(false)
  const [showSignoffs, setShowSignoffs] = useState(false)
  const [creatingLotRun, setCreatingLotRun] = useState(false)

  const {
    lots,
    loading: loadingDefinitions,
    error: definitionsError,
    refresh,
  } = useProcessDefinitions({ includeProcessedLots: true })

  const selectedLot = useMemo(
    () => (Number.isFinite(lotId) ? lots.find((lot: Lot) => lot.id === lotId) ?? null : null),
    [lotId, lots],
  )

  const [lotRunId, setLotRunId] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedLot) {
      setLotRunId(null)
      return
    }

    // Check if process lot run exists
    supabase
      .from('process_lot_runs')
      .select('id')
      .eq('supply_batch_id', selectedLot.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data) {
          setLotRunId(data.id)
        } else {
          setLotRunId(null)
        }
      })
  }, [selectedLot])

  const { lotRun, loading: loadingLotRun, refresh: refreshLotRun } = useProcessLotRun({
    lotRunId,
    enabled: lotRunId !== null,
  })

  const { stepRuns, loading: loadingStepRuns, refresh: refreshStepRuns, updateStepRun } = useProcessStepRuns({
    lotRunId,
    enabled: lotRunId !== null,
  })

  const activeStepRun = stepRuns[currentStepIndex] ?? null
  const activeStep = activeStepRun?.process_step

  const { measurements, addMeasurement, deleteMeasurement } = useProcessMeasurements({
    stepRunId: activeStepRun?.id ?? null,
    enabled: activeStepRun !== null,
  })

  const { nonConformances, addNonConformance, resolveNonConformance } = useNonConformances({
    stepRunId: activeStepRun?.id ?? null,
    enabled: activeStepRun !== null,
  })

  const allStepsCompleted = stepRuns.length > 0 && stepRuns.every((step) => step.status === 'COMPLETED')
  const canStartNextStep = useMemo(() => {
    if (currentStepIndex === 0) return true
    const previousStep = stepRuns[currentStepIndex - 1]
    return previousStep?.status === 'COMPLETED'
  }, [currentStepIndex, stepRuns])

  const unresolvedNCs = useMemo(
    () => nonConformances.filter((nc) => !nc.resolved),
    [nonConformances]
  )

  const handleBack = () => {
    navigate('/process/process-steps')
  }

  const handleCreateLotRun = async () => {
    if (!selectedLot) {
      toast.error('No lot selected')
      return
    }

    setCreatingLotRun(true)
    try {
      const lotRun = await createProcessLotRun(selectedLot.id)
      if (lotRun) {
        setLotRunId(lotRun.id)
        toast.success('Process lot run created successfully')
        await refresh() // Refresh the lots list
      } else {
        toast.info('Process lot run already exists for this batch')
        // Refresh to get the existing lot run ID
        const { data } = await supabase
          .from('process_lot_runs')
          .select('id')
          .eq('supply_batch_id', selectedLot.id)
          .maybeSingle()
        if (data) {
          setLotRunId(data.id)
        }
      }
    } catch (error) {
      console.error('Error creating process lot run:', error)
      let errorMessage = 'Failed to create process lot run'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null && 'message' in error) {
        errorMessage = String(error.message)
      }
      // Log full error details for debugging
      console.error('Full error details:', JSON.stringify(error, null, 2))
      toast.error(errorMessage)
    } finally {
      setCreatingLotRun(false)
    }
  }

  const goToStep = (index: number) => {
    if (index < 0 || index >= stepRuns.length) return
    // Check if previous step is completed
    if (index > 0) {
      const previousStep = stepRuns[index - 1]
      if (previousStep?.status !== 'COMPLETED') {
        toast.warning('Please complete the previous step before proceeding')
        return
      }
    }
    setCurrentStepIndex(index)
  }

  const nextStep = () => {
    if (currentStepIndex < stepRuns.length - 1) {
      goToStep(currentStepIndex + 1)
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
    }
  }

  const handleStepStatusChange = async (status: ProcessStepRun['status']) => {
    if (!activeStepRun) return

    const updates: Partial<ProcessStepRun> = { status }

    if (status === 'IN_PROGRESS' && !activeStepRun.started_at) {
      updates.started_at = new Date().toISOString()
    }

    if (status === 'COMPLETED' && !activeStepRun.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    if (status === 'COMPLETED' && !activeStepRun.performed_by && user?.id) {
      updates.performed_by = user.id
    }

    setSaving(true)
    try {
      await updateProcessStepRun(activeStepRun.id, updates)
      await refreshStepRuns()
      toast.success('Step status updated')
    } catch (error) {
      console.error('Error updating step status:', error)
      toast.error('Failed to update step status')
    } finally {
      setSaving(false)
    }
  }

  const [stepFormData, setStepFormData] = useState<{
    started_at: string
    completed_at: string
    location_id: string
    notes: string
  }>({
    started_at: '',
    completed_at: '',
    location_id: '',
    notes: '',
  })

  useEffect(() => {
    if (activeStepRun) {
      setStepFormData({
        started_at: toLocalDateTimeInput(activeStepRun.started_at),
        completed_at: toLocalDateTimeInput(activeStepRun.completed_at),
        location_id: String(activeStepRun.location_id ?? activeStep?.default_location_id ?? ''),
        notes: activeStepRun.notes ?? '',
      })
    }
  }, [activeStepRun, activeStep])

  const handleSaveStep = async () => {
    if (!activeStepRun) return

    const updates: Partial<ProcessStepRun> = {
      started_at: stepFormData.started_at ? toISOString(stepFormData.started_at) : activeStepRun.started_at,
      completed_at: stepFormData.completed_at ? toISOString(stepFormData.completed_at) : activeStepRun.completed_at,
      location_id: stepFormData.location_id ? parseInt(stepFormData.location_id, 10) : null,
      notes: stepFormData.notes,
    }

    if (!activeStepRun.performed_by && user?.id) {
      updates.performed_by = user.id
    }

    setSaving(true)
    try {
      await updateProcessStepRun(activeStepRun.id, updates)
      await refreshStepRuns()
      toast.success('Step details saved')
    } catch (error) {
      console.error('Error saving step:', error)
      toast.error('Failed to save step details')
    } finally {
      setSaving(false)
    }
  }

  const handleQCPass = async () => {
    toast.success('QC check passed')
  }

  const handleQCFail = async (failedParameters: Array<{ code: string; name: string; remarks: string }>) => {
    if (!activeStepRun) return

    try {
      for (const param of failedParameters) {
        await createNonConformance(activeStepRun.id, {
          nc_type: `QC Failure: ${param.name}`,
          description: param.remarks || `Quality parameter ${param.name} failed QC check`,
          severity: 'MEDIUM',
          corrective_action: null,
        })
      }
      await refreshStepRuns()
      toast.warning(`${failedParameters.length} non-conformance(s) created from QC failures`)
    } catch (error) {
      console.error('Error creating non-conformances:', error)
      toast.error('Failed to create non-conformances')
    }
  }

  const handleCompleteProcess = async () => {
    if (!lotRunId || !allStepsCompleted) {
      toast.error('All steps must be completed before finishing the process')
      return
    }

    // Check for unresolved NCs
    if (unresolvedNCs.length > 0) {
      const proceed = confirm(
        `There are ${unresolvedNCs.length} unresolved non-conformances. Do you want to proceed anyway?`
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      const result = await completeProcessLotRun(lotRunId)
      toast.success('Process completed successfully. Production batch created.')
      await refresh()
      navigate('/process/process-steps', { replace: true })
    } catch (error) {
      console.error('Error completing process:', error)
      toast.error('Failed to complete process')
    } finally {
      setSaving(false)
    }
  }

  const handleSignoff = async (role: 'operator' | 'supervisor' | 'qa') => {
    if (!lotRunId || !user?.id) {
      toast.error('You must be logged in to sign off')
      return
    }

    try {
      await createProcessSignoff(lotRunId, {
        role,
        signed_by: user.id,
      })
      await refreshLotRun()
      toast.success(`${role} signoff recorded`)
    } catch (error) {
      console.error('Error recording signoff:', error)
      toast.error('Failed to record signoff')
    }
  }

  // Get warehouses for location selection
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setWarehouses(data as Array<{ id: number; name: string }>)
        }
      })
  }, [])

  return (
    <PageLayout
      title="Process Steps Progress"
      activeItem="process"
      stickyHeader={false}
      contentClassName="py-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={handleBack} className="flex items-center gap-2">
          <CornerUpLeft className="h-4 w-4" />
          Back to Available Lots
        </Button>
        {selectedLot && (
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getLotStatusStyles(
              selectedLot.process_status,
            )}`}
          >
            {formatLotStatus(selectedLot.process_status)}
          </span>
        )}
      </div>

      {definitionsError && (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <CardContent className="py-4">
            We could not load process definitions. Please try refreshing the page.
          </CardContent>
        </Card>
      )}

      {loadingDefinitions || loadingLotRun ? (
        <Card className="bg-white border-olive-light/30">
          <CardContent className="py-5 text-center text-sm text-text-dark/60">Loading lot details…</CardContent>
        </Card>
      ) : !Number.isFinite(lotId) || !selectedLot ? (
        <Card className="border-red-200 bg-red-50 text-red-700">
          <CardContent className="space-y-2 py-3">
            <CardTitle className="text-base">Lot not found</CardTitle>
            <p className="text-sm text-red-700/80">
              We could not locate the requested lot. It may have been processed already or the link is invalid.
            </p>
            <Button variant="outline" onClick={handleBack}>
              Return to Available Lots
            </Button>
          </CardContent>
        </Card>
      ) : !lotRunId ? (
        <Card className="border-yellow-200 bg-yellow-50 text-yellow-800">
          <CardContent className="space-y-4 py-4">
            <div className="space-y-2">
              <CardTitle className="text-base">No Process Lot Run</CardTitle>
              <p className="text-sm text-yellow-800/80">
                No process lot run exists for this batch. Process lot runs are automatically created when supply batches
                are created with quality status PASSED. You can create one manually if the batch is ready for processing.
              </p>
            </div>
            <Button
              onClick={handleCreateLotRun}
              disabled={creatingLotRun || !selectedLot}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
            >
              {creatingLotRun ? 'Creating...' : 'Create Process Lot Run'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">{selectedLot.lot_no}</CardTitle>
              <CardDescription>
                {selectedLot.supplies?.doc_no ?? 'Unknown document'} ·{' '}
                {selectedLot.products?.name ?? 'Unknown product'} ({selectedLot.products?.sku ?? 'N/A'})
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Qty</p>
                <p className="text-base font-semibold text-text-dark">
                  {selectedLot.current_qty ?? selectedLot.received_qty ?? '—'} {selectedLot.units?.symbol ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Received On</p>
                <p className="text-base font-semibold text-text-dark">
                  {selectedLot.supplies?.received_at
                    ? new Date(selectedLot.supplies.received_at).toLocaleString()
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Expiry</p>
                <p className="text-base font-semibold text-text-dark">
                  {selectedLot.expiry_date ? new Date(selectedLot.expiry_date).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Process Status</p>
                <p className="text-base font-semibold text-text-dark">{formatLotStatus(selectedLot.process_status)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">Process Steps Progress</CardTitle>
              <CardDescription>
                {selectedLot
                  ? `Tracking: ${selectedLot.lot_no} — ${selectedLot.products?.name ?? 'Unknown product'}`
                  : 'Select a lot to capture process execution data'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingStepRuns ? (
                <div className="py-5 text-center text-sm text-text-dark/60">Loading step runs…</div>
              ) : stepRuns.length === 0 && lotRunId ? (
                <div className="text-sm text-text-dark/60 py-4 text-center space-y-3">
                  <p>No process steps defined yet. Steps are automatically created when the process lot run is created.</p>
                  <Button
                    onClick={async () => {
                      if (!lotRunId) return
                      setSaving(true)
                      try {
                        await createProcessStepRuns(lotRunId)
                        await refreshStepRuns()
                        toast.success('Process step runs created successfully')
                      } catch (error) {
                        console.error('Error creating step runs:', error)
                        const errorMessage = error instanceof Error ? error.message : 'Failed to create step runs'
                        toast.error(errorMessage)
                      } finally {
                        setSaving(false)
                      }
                    }}
                    disabled={saving || !lotRunId}
                    className="bg-olive hover:bg-olive-dark"
                  >
                    {saving ? 'Creating...' : 'Create Process Step Runs'}
                  </Button>
                </div>
              ) : stepRuns.length === 0 ? (
                <div className="text-sm text-text-dark/60 py-4 text-center">
                  No process lot run exists yet. Please create one first.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    {stepRuns.map((stepRun, index: number) => {
                      const step = stepRun.process_step
                      const isCompleted = stepRun.status === 'COMPLETED'
                      const isInProgress = stepRun.status === 'IN_PROGRESS'
                      const isCurrent = index === currentStepIndex
                      const canAccess = index === 0 || stepRuns[index - 1]?.status === 'COMPLETED'

                      return (
                        <div key={stepRun.id} className="flex flex-1 items-center">
                          <button
                            type="button"
                            onClick={() => canAccess && goToStep(index)}
                            disabled={!canAccess || loadingStepRuns}
                            className={`flex flex-1 flex-col items-center ${
                              isCurrent
                                ? 'text-olive'
                                : isCompleted
                                ? 'text-green-600'
                                : canAccess
                                ? 'text-text-dark/60'
                                : 'text-text-dark/30 cursor-not-allowed'
                            }`}
                          >
                            <div
                              className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                                isCurrent
                                  ? 'border-olive bg-olive-light/20'
                                  : isCompleted
                                  ? 'border-green-600 bg-green-100'
                                  : isInProgress
                                  ? 'border-orange-400 bg-orange-100'
                                  : 'border-text-dark/20 bg-white'
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                              ) : (
                                <span className="text-sm font-semibold">{index + 1}</span>
                              )}
                            </div>
                            <span className="text-xs font-medium text-center">
                              {step?.step_name ?? 'Unnamed step'}
                            </span>
                          </button>
                          {index < stepRuns.length - 1 && (
                            <div
                              className={`mx-2 mb-3 flex-1 h-0.5 ${
                                isCompleted ? 'bg-green-600' : 'bg-text-dark/20'
                              }`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {activeStepRun && activeStep && (
                    <div className="border-t border-olive-light/20 pt-4 space-y-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-text-dark">{activeStep.step_name}</h3>
                          <p className="text-sm text-text-dark/60">
                            Step {activeStep.seq} · {activeStep.step_code}
                          </p>
                        </div>
                        {activeStep.default_location_id && (
                          <div className="flex items-center gap-2 rounded-md bg-olive-light/20 px-3 py-2 text-sm text-text-dark">
                            <MapPin className="h-4 w-4 text-olive" />
                            <span>
                              Default location:{' '}
                              {warehouses.find((w) => w.id === activeStep.default_location_id)?.name ??
                                `#${activeStep.default_location_id}`}
                            </span>
                          </div>
                        )}
                        <span
                          className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                            activeStepRun.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : activeStepRun.status === 'IN_PROGRESS'
                              ? 'bg-orange-100 text-orange-800'
                              : activeStepRun.status === 'FAILED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-olive-light/40 text-olive-dark'
                          }`}
                        >
                          {activeStepRun.status}
                        </span>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="step_status">Status</Label>
                          <select
                            id="step_status"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={activeStepRun.status}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                              handleStepStatusChange(e.target.value as ProcessStepRun['status'])
                            }
                            disabled={saving || loadingStepRuns}
                          >
                            {PROCESS_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_location">Location</Label>
                          <select
                            id="step_location"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={stepFormData.location_id}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                              setStepFormData({ ...stepFormData, location_id: e.target.value })
                            }
                            disabled={saving || loadingStepRuns}
                          >
                            <option value="">Select location</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_started_at">Started at</Label>
                          <Input
                            id="step_started_at"
                            type="datetime-local"
                            value={stepFormData.started_at}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setStepFormData({ ...stepFormData, started_at: e.target.value })
                            }
                            disabled={saving || loadingStepRuns}
                            className="bg-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_completed_at">Completed at</Label>
                          <Input
                            id="step_completed_at"
                            type="datetime-local"
                            value={stepFormData.completed_at}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setStepFormData({ ...stepFormData, completed_at: e.target.value })
                            }
                            disabled={saving || loadingStepRuns}
                            className="bg-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="step_notes">Notes</Label>
                        <textarea
                          id="step_notes"
                          className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={stepFormData.notes}
                          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setStepFormData({ ...stepFormData, notes: e.target.value })
                          }
                          placeholder="Add context, QC remarks or deviations…"
                          disabled={saving || loadingStepRuns}
                        />
                      </div>

                      {/* Measurements */}
                      <div className="border-t border-olive-light/20 pt-4">
                        <MeasurementsCapture
                          stepRunId={activeStepRun.id}
                          measurements={measurements}
                          onAdd={addMeasurement}
                          onDelete={deleteMeasurement}
                          loading={saving}
                        />
                      </div>

                      {/* QC Check */}
                      {activeStep.requires_qc && (
                        <div className="border-t border-olive-light/20 pt-4">
                          <StepQCCheck
                            stepRunId={activeStepRun.id}
                            onPass={handleQCPass}
                            onFail={handleQCFail}
                            loading={saving}
                          />
                        </div>
                      )}

                      {/* Non-Conformances */}
                      <div className="border-t border-olive-light/20 pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm font-semibold text-text-dark">Non-Conformances</h4>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowNCForm(!showNCForm)}
                            disabled={saving}
                            className="border-olive-light/30"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add NC
                          </Button>
                        </div>
                        {showNCForm && (
                          <div className="mb-4">
                            <NonConformanceForm
                              stepRunId={activeStepRun.id}
                              onSubmit={async (nc) => {
                                await addNonConformance(nc)
                                setShowNCForm(false)
                              }}
                              onCancel={() => setShowNCForm(false)}
                              loading={saving}
                            />
                          </div>
                        )}
                        <NonConformanceList
                          stepRunId={activeStepRun.id}
                          nonConformances={nonConformances}
                          onResolve={resolveNonConformance}
                          loading={saving}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSaveStep}
                          disabled={saving || loadingStepRuns}
                          className="border-olive-light/30"
                        >
                          <Save className="mr-2 h-4 w-4" />
                          Save Step Details
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Signoffs and Completion */}
                  {allStepsCompleted && (
                    <div className="border-t border-olive-light/20 pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-dark">Process Completion</h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSignoffs(!showSignoffs)}
                          className="border-olive-light/30"
                        >
                          {showSignoffs ? 'Hide' : 'Show'} Signoffs
                        </Button>
                      </div>

                      {showSignoffs && lotRunId && (
                        <ProcessSignoffs
                          lotRunId={lotRunId}
                          signoffs={lotRun?.signoffs ?? []}
                          onSign={handleSignoff}
                          loading={saving}
                        />
                      )}

                      {unresolvedNCs.length > 0 && (
                        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                          <p className="text-sm text-yellow-800">
                            Warning: There are {unresolvedNCs.length} unresolved non-conformance(s). You can still
                            complete the process, but it is recommended to resolve them first.
                          </p>
                        </div>
                      )}

                      <Button
                        type="button"
                        onClick={handleCompleteProcess}
                        disabled={!allStepsCompleted || saving}
                        className="w-full bg-olive-dark text-white hover:bg-olive"
                      >
                        <Activity className="mr-2 h-4 w-4" />
                        Complete Process & Create Production Batch
                      </Button>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-olive-light/20 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={currentStepIndex === 0 || loadingStepRuns}
                      className="flex items-center"
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      type="button"
                      onClick={nextStep}
                      disabled={currentStepIndex >= stepRuns.length - 1 || loadingStepRuns || !canStartNextStep}
                      className="flex items-center bg-olive hover:bg-olive-dark"
                    >
                      Next
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  )
}

export default ProcessStepsProgress
