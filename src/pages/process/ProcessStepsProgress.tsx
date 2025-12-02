import { useCallback, useEffect, useMemo, useState, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, CornerUpLeft, MapPin, Save } from 'lucide-react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useAuth } from '@/context/AuthContext'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { supabase } from '@/lib/supabaseClient'

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

interface ProcessStep {
  id: number
  process_id: number
  seq: number
  step_code?: string
  step_name?: string
  default_location_id?: number | null
  [key: string]: unknown
}

interface StepProgress {
  step_id: number
  seq: number
  step_code: string
  step_name: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  started_at: string | null
  completed_at: string | null
  operator: string
  quantity_in: string
  quantity_out: string
  notes: string
}

interface LotRun {
  id: number
  supply_batch_id: number
  process_id: number
  step_progress: StepProgress[]
  status: string
  started_at: string | null
  completed_at: string | null
  [key: string]: unknown
}

const PROCESS_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'] as const

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

function normalizeQuantityValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }
  return String(value)
}

function getLotInitialQuantity(lot: Lot | null): string {
  if (!lot) return ''
  return normalizeQuantityValue(lot.current_qty ?? lot.received_qty ?? '')
}

function applySequentialQuantities(progress: StepProgress[], lotQuantity: string | number | null | undefined): StepProgress[] {
  if (!Array.isArray(progress) || progress.length === 0) return progress
  const initialQuantity = normalizeQuantityValue(lotQuantity)

  return progress.map((step: StepProgress, index: number, array: StepProgress[]) => {
    if (index === 0) {
      return { ...step, quantity_in: initialQuantity }
    }

    const previousOut = normalizeQuantityValue(array[index - 1]?.quantity_out ?? '')
    return { ...step, quantity_in: previousOut }
  })
}

function buildDefaultStepProgress(step: ProcessStep, operatorName: string = ''): StepProgress {
  return {
    step_id: step.id,
    seq: step.seq,
    step_code: step.step_code ?? '',
    step_name: step.step_name ?? '',
    status: 'PENDING',
    started_at: null,
    completed_at: null,
    operator: operatorName,
    quantity_in: '',
    quantity_out: '',
    notes: '',
  }
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

  const { user, profile } = useAuth()
  const [selectedProcessId, setSelectedProcessId] = useState<number | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [stepProgress, setStepProgress] = useState<StepProgress[]>([])
  const [lotRun, setLotRun] = useState<LotRun | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingLot, setLoadingLot] = useState(false)

  const {
    lots,
    processesByProductId,
    processSteps,
    loading: loadingDefinitions,
    error: definitionsError,
    refresh,
  } = useProcessDefinitions({ includeProcessedLots: true })

  const selectedLot = useMemo(
    () => (Number.isFinite(lotId) ? lots.find((lot: Lot) => lot.id === lotId) ?? null : null),
    [lotId, lots],
  )

  const lotQuantity = useMemo(() => getLotInitialQuantity(selectedLot), [selectedLot])

  const availableProcesses = useMemo(() => {
    if (!selectedLot) return []
    return processesByProductId.get(selectedLot.product_id) ?? []
  }, [processesByProductId, selectedLot])

  const selectedSteps = useMemo(() => (selectedProcessId ? processSteps.get(selectedProcessId) ?? [] : []), [processSteps, selectedProcessId])
  const activeStep = selectedSteps[currentStepIndex] ?? null
  const activeProgress = stepProgress[currentStepIndex] ?? null
  const allStepsCompleted = stepProgress.length > 0 && stepProgress.every((step: StepProgress) => step.status === 'COMPLETED')

  const operatorName = useMemo(() => {
    return (
      profile?.full_name?.trim() ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.fullName ||
      user?.email ||
      user?.phone ||
      ''
    )
  }, [profile?.full_name, user])

  const resetState = useCallback(() => {
    setSelectedProcessId(null)
    setStepProgress([])
    setLotRun(null)
    setCurrentStepIndex(0)
  }, [])

  const loadLotProcess = useCallback(
    async (lot: Lot, processId: number) => {
      if (!lot || !processId) return

      const steps = processSteps.get(processId) ?? []
      if (!steps.length) {
        toast.warning('No process steps are defined for the selected process yet.')
        setSelectedProcessId(processId)
        setStepProgress([])
        setLotRun(null)
        setCurrentStepIndex(0)
        return
      }

      setLoadingLot(true)
      try {
        const { data: existingRun, error: runError } = await supabase
          .from('process_lot_runs')
          .select('*')
          .eq('supply_batch_id', lot.id)
          .maybeSingle()

        if (runError) throw runError

        const lotInitialQuantity = getLotInitialQuantity(lot)

        const progress: StepProgress[] = steps.map((step: ProcessStep) => {
          const existing = (existingRun?.step_progress as StepProgress[] | undefined ?? []).find((item: StepProgress) => item.step_id === step.id)
          const defaultProgress = buildDefaultStepProgress(step, operatorName)

          if (!existing) {
            return defaultProgress
          }

          const merged: StepProgress = { ...defaultProgress, ...existing }
          if (!existing.operator || existing.operator.trim().length === 0) {
            merged.operator = operatorName
          }
          return merged
        })

        const sequentialProgress = applySequentialQuantities(progress, lotInitialQuantity)

        setSelectedProcessId(processId)
        setLotRun((existingRun as LotRun | null) ?? null)
        setStepProgress(sequentialProgress)

        const firstIncompleteIndex = sequentialProgress.findIndex((step: StepProgress) => step.status !== 'COMPLETED')
        setCurrentStepIndex(
          firstIncompleteIndex === -1 ? Math.max(sequentialProgress.length - 1, 0) : firstIncompleteIndex,
        )
      } catch (error) {
        console.error(error)
        toast.error('Failed to load process data for the selected lot.')
        resetState()
      } finally {
        setLoadingLot(false)
      }
    },
    [operatorName, processSteps, resetState],
  )

  useEffect(() => {
    resetState()
    if (!selectedLot) return

    const relatedProcesses = availableProcesses
    if (relatedProcesses.length === 1 && relatedProcesses[0]) {
      loadLotProcess(selectedLot, relatedProcesses[0].id)
    }
  }, [availableProcesses, loadLotProcess, resetState, selectedLot])

  const handleProcessChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const processId = Number.parseInt(event.target.value ?? '', 10) || null
    if (!processId || !selectedLot) {
      resetState()
      return
    }
    await loadLotProcess(selectedLot, processId)
  }

  const updateCurrentStep = (changes: Partial<StepProgress>) => {
    setStepProgress((previous: StepProgress[]) => {
      const updated = previous.map((step: StepProgress, index: number) => (index === currentStepIndex ? { ...step, ...changes } : step))
      return applySequentialQuantities(updated, lotQuantity)
    })
  }

  const goToStep = (index: number) => {
    if (index < 0 || index >= selectedSteps.length) return
    setCurrentStepIndex(index)
  }

  const nextStep = () => {
    setCurrentStepIndex((index) => Math.min(index + 1, selectedSteps.length - 1))
  }

  const prevStep = () => {
    setCurrentStepIndex((index) => Math.max(index - 1, 0))
  }

  const handleSave = useCallback(
    async ({ complete = false } = {}) => {
      if (!selectedLot?.id || !selectedProcessId) {
        toast.error('Select a process before saving progress.')
        return
      }

      setSaving(true)
      try {
        const normalizedProgress = stepProgress.map((step: StepProgress) =>
          step.operator ? step : { ...step, operator: operatorName },
        )
        const timestamp = new Date().toISOString()
        let runRecord: LotRun | null = lotRun

        if (lotRun) {
          const { data, error } = await supabase
            .from('process_lot_runs')
            .update({
              step_progress: normalizedProgress,
              status: complete ? 'COMPLETED' : lotRun.status ?? 'IN_PROGRESS',
              completed_at: complete ? timestamp : lotRun.completed_at,
            })
            .eq('id', lotRun.id)
            .select()
            .maybeSingle()

          if (error) throw error
          runRecord = (data as LotRun | null) ?? lotRun
        } else {
          const { data, error } = await supabase
            .from('process_lot_runs')
            .insert({
              supply_batch_id: selectedLot.id,
              process_id: selectedProcessId,
              step_progress: normalizedProgress,
              status: complete ? 'COMPLETED' : 'IN_PROGRESS',
              started_at: timestamp,
              completed_at: complete ? timestamp : null,
            })
            .select()
            .single()

          if (error) throw error
          runRecord = data as LotRun
        }

        setStepProgress(applySequentialQuantities(normalizedProgress, lotQuantity))

        if (complete) {
          const { error: batchError } = await supabase
            .from('supply_batches')
            .update({ process_status: 'PROCESSED' })
            .eq('id', selectedLot.id)

          if (batchError) throw batchError

          toast.success('Process completed and lot marked as processed.')
          await refresh()
          navigate('/process/process-steps', { replace: true })
        } else {
          const { error: batchError } = await supabase
            .from('supply_batches')
            .update({ process_status: 'PROCESSING' })
            .eq('id', selectedLot.id)

          if (batchError) throw batchError

          toast.success('Process progress saved.')
          setLotRun(runRecord)
          await refresh()
        }
      } catch (error) {
        console.error(error)
        toast.error('Failed to save process progress.')
      } finally {
        setSaving(false)
      }
    },
    [lotQuantity, lotRun, navigate, operatorName, refresh, selectedLot, selectedProcessId, stepProgress],
  )

  useEffect(() => {
    if (!operatorName) return

    setStepProgress((previous: StepProgress[]) => {
      const updated = previous.map((step: StepProgress) => {
        if (step.operator && step.operator.trim().length > 0) {
          return step
        }
        return { ...step, operator: operatorName }
      })
      return applySequentialQuantities(updated, lotQuantity)
    })
  }, [operatorName, lotQuantity])

  const handleBack = () => {
    navigate('/process/process-steps')
  }

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

      {loadingDefinitions ? (
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
                  {selectedLot.supplies?.received_at ? new Date(selectedLot.supplies.received_at).toLocaleString() : '—'}
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
              {selectedLot && availableProcesses.length > 1 && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="process_selector">Select process</Label>
                    <select
                      id="process_selector"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedProcessId ?? ''}
                      onChange={handleProcessChange}
                      disabled={loadingLot}
                    >
                      <option value="">Choose a process</option>
                      {availableProcesses.map((process: { id: number; name: string; code?: string }) => (
                        <option key={process.id} value={process.id}>
                          {process.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Linked products</Label>
                    <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                      {availableProcesses
                        .map((process: { id: number; name: string; code?: string }) => `${process.code ?? '—'} · ${process.name}`)
                        .join(' • ')}
                    </div>
                  </div>
                </div>
              )}

              {selectedLot && availableProcesses.length === 0 && (
                <div className="text-sm text-red-600">
                  This product does not have any process definition yet. Please configure one in the process settings.
                </div>
              )}

              {selectedLot && selectedProcessId && (
                <>
                  <div className="flex items-center justify-between">
                    {selectedSteps.map((step: ProcessStep, index: number) => (
                      <div key={step.id} className="flex flex-1 items-center">
                        <button
                          type="button"
                          onClick={() => goToStep(index)}
                          className={`flex flex-1 flex-col items-center ${
                            currentStepIndex === index
                              ? 'text-olive'
                              : currentStepIndex > index
                              ? 'text-green-600'
                              : 'text-text-dark/40'
                          }`}
                          disabled={loadingLot}
                        >
                          <div
                            className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                              currentStepIndex === index
                                ? 'border-olive bg-olive-light/20'
                                : currentStepIndex > index
                                ? 'border-green-600 bg-green-100'
                                : 'border-text-dark/20 bg-white'
                            }`}
                          >
                            {currentStepIndex > index || stepProgress[index]?.status === 'COMPLETED' ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600" />
                            ) : (
                              <span className="text-sm font-semibold">{index + 1}</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-center">{step.step_name ?? 'Unnamed step'}</span>
                        </button>
                        {index < selectedSteps.length - 1 && (
                          <div
                            className={`mx-2 mb-3 flex-1 h-0.5 ${
                              currentStepIndex > index ? 'bg-green-600' : 'bg-text-dark/20'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-olive-light/20 pt-4">
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-text-dark">
                            {activeStep ? (String(activeStep.step_name ?? 'Select a step')) : 'Select a step'}
                          </h3>
                          <p className="text-sm text-text-dark/60">
                            Step {activeStep ? activeStep.seq : currentStepIndex + 1} · {activeStep ? (String(activeStep.step_code ?? '—')) : '—'}
                          </p>
                        </div>
                        {activeStep && (activeStep.default_location_id !== null && activeStep.default_location_id !== undefined) && (
                          <div className="flex items-center gap-2 rounded-md bg-olive-light/20 px-3 py-2 text-sm text-text-dark">
                            <MapPin className="h-4 w-4 text-olive" />
                            <span>Default location #{String(activeStep.default_location_id)}</span>
                          </div>
                        )}
                        <span
                          className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                            (activeProgress?.status ?? 'PENDING') === 'COMPLETED'
                              ? 'bg-green-100 text-green-800'
                              : (activeProgress?.status ?? 'PENDING') === 'IN_PROGRESS'
                              ? 'bg-brown/10 text-brown'
                              : 'bg-olive-light/40 text-olive-dark'
                          }`}
                        >
                          {activeProgress?.status ?? 'PENDING'}
                        </span>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="step_status">Status</Label>
                          <select
                            id="step_status"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={activeProgress?.status ?? 'PENDING'}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) => updateCurrentStep({ status: event.target.value as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' })}
                            disabled={loadingLot}
                          >
                            {PROCESS_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_operator">Operator</Label>
                          <Input
                            id="step_operator"
                            value={activeProgress?.operator ?? operatorName}
                            placeholder={operatorName ? `Signed in as ${operatorName}` : 'Signed in user'}
                            disabled
                            readOnly
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_started_at">Started at</Label>
                          <Input
                            id="step_started_at"
                            type="datetime-local"
                            value={toLocalDateTimeInput(activeProgress?.started_at ?? null)}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateCurrentStep({ started_at: toISOString(event.target.value) })}
                            disabled={loadingLot}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_completed_at">Completed at</Label>
                          <Input
                            id="step_completed_at"
                            type="datetime-local"
                            value={toLocalDateTimeInput(activeProgress?.completed_at ?? null)}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateCurrentStep({ completed_at: toISOString(event.target.value) })}
                            disabled={loadingLot}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_quantity_in">Quantity in</Label>
                          <Input
                            id="step_quantity_in"
                            type="number"
                            step="0.01"
                            value={activeProgress?.quantity_in ?? ''}
                            placeholder="0.00"
                            disabled={loadingLot}
                            readOnly
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="step_quantity_out">Quantity out</Label>
                          <Input
                            id="step_quantity_out"
                            type="number"
                            step="0.01"
                            value={activeProgress?.quantity_out ?? ''}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateCurrentStep({ quantity_out: event.target.value })}
                            placeholder="0.00"
                            disabled={loadingLot}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="step_notes">Notes</Label>
                        <textarea
                          id="step_notes"
                          className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={activeProgress?.notes ?? ''}
                          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateCurrentStep({ notes: event.target.value })}
                          placeholder="Add context, QC remarks or deviations…"
                          disabled={loadingLot}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-olive-light/20 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      disabled={currentStepIndex === 0 || loadingLot}
                      className="flex items-center"
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" />
                      Previous
                    </Button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleSave({ complete: false })}
                        disabled={saving || loadingLot}
                        className="flex items-center"
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save Progress
                      </Button>
                      <Button
                        type="button"
                        onClick={nextStep}
                        disabled={currentStepIndex === selectedSteps.length - 1 || loadingLot}
                        className="flex items-center bg-olive hover:bg-olive-dark"
                      >
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        onClick={() => handleSave({ complete: true })}
                        disabled={!allStepsCompleted || saving || loadingLot}
                        className="flex items-center bg-olive-dark text-white hover:bg-olive"
                      >
                        <Activity className="mr-2 h-4 w-4" />
                        Complete Process
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {selectedLot && !selectedProcessId && availableProcesses.length > 0 && (
                <div className="text-sm text-text-dark/60">Choose a process to begin tracking progress.</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  )
}

export default ProcessStepsProgress


