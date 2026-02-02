import { useEffect, useMemo, useState, ChangeEvent, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, CornerUpLeft, MapPin, Plus } from 'lucide-react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useAuth } from '@/context/AuthContext'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { useProcessLotRun } from '@/hooks/useProcessLotRun'
import { useProcessStepRuns } from '@/hooks/useProcessStepRuns'
import { useNonConformances } from '@/hooks/useNonConformances'
import { useQualityParameters, type QualityParameter } from '@/hooks/useQualityParameters'
import { supabase } from '@/lib/supabaseClient'
import {
  updateProcessStepRun,
  createNonConformance,
  completeProcessLotRun,
  createProcessSignoff,
  createProcessLotRun,
  createProcessStepRuns,
  saveProcessStepQualityCheck,
} from '@/lib/processExecution'
import { calculateAvailableQuantity } from '@/lib/processQuantityTracking'
import { NonConformanceList } from '@/components/process/NonConformanceList'
import { NonConformanceForm } from '@/components/process/NonConformanceForm'
import { StepQCCheck } from '@/components/process/StepQCCheck'
import { ProcessSignoffs } from '@/components/process/ProcessSignoffs'
import { WashingStep } from '@/components/process/steps/WashingStep'
import { DryingStep } from '@/components/process/steps/DryingStep'
import { SortingStep } from '@/components/process/steps/SortingStep'
import { MetalDetectionStep } from '@/components/process/steps/MetalDetectionStep'
import { PackagingStep } from '@/components/process/steps/PackagingStep'
import type { ProcessStepRun, ProcessStep } from '@/types/processExecution'

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

  const { stepRuns, loading: loadingStepRuns, refresh: refreshStepRuns } = useProcessStepRuns({
    lotRunId,
    enabled: lotRunId !== null,
  })

  // Auto-navigate to first incomplete step on load
  const [hasAutoNavigated, setHasAutoNavigated] = useState(false)
  
  useEffect(() => {
    // Only auto-navigate once when stepRuns are first loaded
    if (stepRuns.length > 0 && !loadingStepRuns && !hasAutoNavigated) {
      const firstIncompleteIndex = stepRuns.findIndex((step) => step.status !== 'COMPLETED')
      
      if (firstIncompleteIndex !== -1 && firstIncompleteIndex !== currentStepIndex) {
        setCurrentStepIndex(firstIncompleteIndex)
      }
      
      setHasAutoNavigated(true)
    }
  }, [stepRuns, loadingStepRuns, hasAutoNavigated, currentStepIndex])

  // Reset auto-navigation flag when lotRunId changes (new process)
  useEffect(() => {
    setHasAutoNavigated(false)
  }, [lotRunId])

  const activeStepRun = stepRuns[currentStepIndex] ?? null
  const activeStep: ProcessStep | undefined = activeStepRun?.process_step

  // Calculate available quantity for the current step
  const [availableQuantity, setAvailableQuantity] = useState<{
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null>(null)
  const [loadingQuantity, setLoadingQuantity] = useState(false)

  useEffect(() => {
    const fetchAvailableQuantity = async () => {
      if (!lotRunId || !activeStepRun) {
        setAvailableQuantity(null)
        return
      }

      setLoadingQuantity(true)
      try {
        const qty = await calculateAvailableQuantity(lotRunId, activeStepRun.id)
        setAvailableQuantity(qty)
      } catch (error) {
        console.error('Error calculating available quantity:', error)
        setAvailableQuantity(null)
      } finally {
        setLoadingQuantity(false)
      }
    }

    fetchAvailableQuantity()
  }, [lotRunId, activeStepRun?.id, stepRuns])

  const { nonConformances, addNonConformance, resolveNonConformance } = useNonConformances({
    stepRunId: activeStepRun?.id ?? null,
    enabled: activeStepRun !== null,
  })

  const { qualityParameters } = useQualityParameters()
  const [stepQualityParameters, setStepQualityParameters] = useState<QualityParameter[]>([])
  const [loadingStepQPs, setLoadingStepQPs] = useState(false)

  // Fetch quality parameters for the active step
  useEffect(() => {
    const fetchStepQualityParameters = async () => {
      if (!activeStep?.id) {
        setStepQualityParameters([])
        return
      }

      setLoadingStepQPs(true)
      try {
        // Fetch the quality parameter IDs for this step
        const { data: stepQPsData, error } = await supabase
          .from('process_step_quality_parameters')
          .select('quality_parameter_id')
          .eq('process_step_id', activeStep.id)

        if (error) {
          console.error('Error fetching step quality parameters:', error)
          setStepQualityParameters([])
          return
        }

        // Get the quality parameter IDs
        const qpIds = (stepQPsData || []).map((item) => item.quality_parameter_id)

        // Filter quality parameters to only include those selected for this step
        const selectedQPs = qualityParameters.filter((qp) => qpIds.includes(qp.id))
        setStepQualityParameters(selectedQPs)
      } catch (error) {
        console.error('Error fetching step quality parameters:', error)
        setStepQualityParameters([])
      } finally {
        setLoadingStepQPs(false)
      }
    }

    fetchStepQualityParameters()
  }, [activeStep?.id, qualityParameters])

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
    if (!activeStepRun || !lotRunId || !user?.id) return

    const updates: Partial<ProcessStepRun> = { status }
    const previousStatus = activeStepRun.status

    if (status === 'IN_PROGRESS' && !activeStepRun.started_at) {
      updates.started_at = new Date().toISOString()
      // Auto-update form data
      setStepFormData((prev) => ({
        ...prev,
        started_at: toLocalDateTimeInput(updates.started_at || ''),
      }))
    }

    if (status === 'COMPLETED' && !activeStepRun.completed_at) {
      updates.completed_at = new Date().toISOString()
      // Auto-update form data
      setStepFormData((prev) => ({
        ...prev,
        completed_at: toLocalDateTimeInput(updates.completed_at || ''),
      }))
    }

    if (status === 'COMPLETED' && !activeStepRun.performed_by && user?.id) {
      updates.performed_by = user.id
    }

    setSaving(true)
    try {
      await updateProcessStepRun(activeStepRun.id, updates)
      
      // Record batch step transition
      try {
        const { createBatchStepTransition } = await import('@/lib/processExecution')
        const fromStep = previousStatus === 'PENDING' ? null : activeStep?.step_code || null
        const toStep = status === 'COMPLETED' ? 'COMPLETED' : activeStep?.step_code || status
        const reason = status === 'COMPLETED' ? 'Step completed' : status === 'IN_PROGRESS' ? 'Step started' : null
        
        await createBatchStepTransition(lotRunId, fromStep, toStep, reason, user.id)
      } catch (transitionError) {
        // Log but don't fail the status update
        console.warn('Failed to record batch step transition:', transitionError)
      }
      
      await refreshStepRuns()
      
      // Auto-advance to next step when completing (if not last step)
      if (status === 'COMPLETED' && currentStepIndex < stepRuns.length - 1) {
        setTimeout(() => {
          nextStep()
          toast.success('Step completed - moved to next step')
        }, 500)
      } else {
        toast.success('Step status updated')
      }
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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  // Auto-save step details with debouncing
  const autoSaveStep = async () => {
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

    try {
      await updateProcessStepRun(activeStepRun.id, updates)
      await refreshStepRuns()
      // Silent save - no toast to reduce noise
    } catch (error) {
      console.error('Error auto-saving step:', error)
      // Only show error toast, not success
      toast.error('Failed to save step details')
    }
  }

  // Debounced auto-save - only save when form data actually changes from initial load
  useEffect(() => {
    if (!activeStepRun) return

    // Skip auto-save on initial load
    const initialData = {
      started_at: toLocalDateTimeInput(activeStepRun.started_at),
      completed_at: toLocalDateTimeInput(activeStepRun.completed_at),
      location_id: String(activeStepRun.location_id ?? activeStep?.default_location_id ?? ''),
      notes: activeStepRun.notes ?? '',
    }

    // Check if data has actually changed
    const hasChanged =
      stepFormData.started_at !== initialData.started_at ||
      stepFormData.completed_at !== initialData.completed_at ||
      stepFormData.location_id !== initialData.location_id ||
      stepFormData.notes !== initialData.notes

    if (!hasChanged) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for auto-save (1.5 seconds after last change)
    saveTimeoutRef.current = setTimeout(() => {
      autoSaveStep()
    }, 1500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepFormData])

  const handleQCPass = async (qcData: {
    scores: Record<string, number>
    results: Record<string, string>
    remarks: Record<string, string>
  }) => {
    if (!activeStepRun || !user?.id) return

    try {
      // Save QC check data
      await saveProcessStepQualityCheck(activeStepRun.id, {
        scores: qcData.scores,
        results: qcData.results,
        remarks: qcData.remarks,
        qualityParameters: stepQualityParameters.map((qp) => ({ id: qp.id, code: qp.code })),
        evaluatedBy: user.id,
      })

      await refreshStepRuns()
      toast.success('QC check passed and saved')
    } catch (error) {
      console.error('Error saving QC check:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save QC check'
      toast.error(errorMessage)
    }
  }

  const handleQCFail = async (
    failedParameters: Array<{ code: string; name: string; remarks: string }>,
    qcData: {
      scores: Record<string, number>
      results: Record<string, string>
      remarks: Record<string, string>
    }
  ) => {
    if (!activeStepRun || !user?.id) return

    try {
      // Save QC check data first
      await saveProcessStepQualityCheck(activeStepRun.id, {
        scores: qcData.scores,
        results: qcData.results,
        remarks: qcData.remarks,
        qualityParameters: stepQualityParameters.map((qp) => ({ id: qp.id, code: qp.code })),
        evaluatedBy: user.id,
      })

      // Create non-conformances for failed parameters
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
      console.error('Error saving QC check or creating non-conformances:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save QC check'
      toast.error(errorMessage)
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
      await completeProcessLotRun(lotRunId)
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
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Initial Qty</p>
                <p className="text-base font-semibold text-text-dark">
                  {selectedLot.current_qty ?? selectedLot.received_qty ?? '—'} {selectedLot.units?.symbol ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">
                  Available Qty {loadingQuantity && '(calculating...)'}
                </p>
                <p className="text-base font-semibold text-text-dark">
                  {availableQuantity !== null
                    ? `${availableQuantity.availableQty.toFixed(2)} ${selectedLot.units?.symbol ?? ''}`
                    : '—'}
                </p>
                {availableQuantity !== null && availableQuantity.totalWaste > 0 && (
                  <p className="text-xs text-text-dark/50 mt-0.5">
                    Waste: {availableQuantity.totalWaste.toFixed(2)} {selectedLot.units?.symbol ?? ''}
                  </p>
                )}
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
                      const stepName = step?.step_name || `Step ${index + 1}`
                      const stepCode = step?.step_code || ''

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
                            <span className="text-xs font-medium text-center max-w-[100px] break-words">
                              {stepName}
                            </span>
                            {stepCode && (
                              <span className="text-[10px] text-text-dark/50 text-center mt-0.5 block">
                                ({stepCode})
                              </span>
                            )}
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
                          <Label htmlFor="step_status">
                            Status
                            <span className="ml-2 text-xs text-text-dark/50 font-normal">(auto-saved)</span>
                          </Label>
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
                          <Label htmlFor="step_location">
                            Location
                            <span className="ml-2 text-xs text-text-dark/50 font-normal">(auto-saved)</span>
                          </Label>
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
                          <Label htmlFor="step_started_at">
                            Started at
                            <span className="ml-2 text-xs text-text-dark/50 font-normal">(auto-saved)</span>
                          </Label>
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
                          <Label htmlFor="step_completed_at">
                            Completed at
                            <span className="ml-2 text-xs text-text-dark/50 font-normal">(auto-saved)</span>
                          </Label>
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
                        <Label htmlFor="step_notes">
                          Notes
                          <span className="ml-2 text-xs text-text-dark/50 font-normal">(auto-saved)</span>
                        </Label>
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

                      {/* Step-Specific Components */}
                      <div className="border-t border-olive-light/20 pt-4">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-text-dark mb-1">
                            {activeStep.step_name || 'Step Data Entry'} - Step Data Entry
                          </h4>
                          <p className="text-xs text-text-dark/60">
                            Step Code: {activeStep.step_code || 'N/A'}
                          </p>
                        </div>
                        {(() => {
                          const stepCode = activeStep.step_code?.toUpperCase() || ''
                          
                          if (stepCode === 'WASH') {
                            return (
                              <WashingStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                availableQuantity={availableQuantity}
                                onQuantityChange={() => {
                                  // Refresh quantity when waste is added/removed
                                  if (lotRunId && activeStepRun) {
                                    calculateAvailableQuantity(lotRunId, activeStepRun.id).then(setAvailableQuantity).catch(console.error)
                                  }
                                }}
                              />
                            )
                          }
                          if (stepCode === 'DRY') {
                            return (
                              <DryingStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                availableQuantity={availableQuantity}
                              />
                            )
                          }
                          if (stepCode === 'SORT') {
                            return (
                              <SortingStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                availableQuantity={availableQuantity}
                                onQuantityChange={() => {
                                  // Refresh quantity when outputs/waste are added/removed
                                  if (lotRunId && activeStepRun) {
                                    calculateAvailableQuantity(lotRunId, activeStepRun.id).then(setAvailableQuantity).catch(console.error)
                                  }
                                }}
                              />
                            )
                          }
                          if (stepCode === 'METAL') {
                            return (
                              <MetalDetectionStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                availableQuantity={availableQuantity}
                                onQuantityChange={() => {
                                  // Refresh quantity when rejections are added/removed
                                  if (lotRunId && activeStepRun) {
                                    calculateAvailableQuantity(lotRunId, activeStepRun.id).then(setAvailableQuantity).catch(console.error)
                                  }
                                }}
                              />
                            )
                          }
                          if (stepCode === 'PACK') {
                            // Find the sorting step run ID from stepRuns array
                            const sortingStepRun = stepRuns.find(
                              (sr) => sr.process_step?.step_code?.toUpperCase() === 'SORT'
                            )
                            
                            return (
                              <PackagingStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                availableQuantity={availableQuantity}
                                sortingStepRunId={sortingStepRun?.id ?? null}
                                onQuantityChange={() => {
                                  // Refresh quantity when waste is added/removed
                                  if (lotRunId && activeStepRun) {
                                    calculateAvailableQuantity(lotRunId, activeStepRun.id).then(setAvailableQuantity).catch(console.error)
                                  }
                                }}
                              />
                            )
                          }
                          return (
                            <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
                              <p className="text-sm text-text-dark/60 text-center">
                                No specific component available for step code: <strong>{activeStep.step_code || 'N/A'}</strong>
                              </p>
                              <p className="text-xs text-text-dark/50 text-center mt-2">
                                Step Name: {activeStep.step_name || 'Unnamed step'}
                              </p>
                              {process.env.NODE_ENV === 'development' && activeStep && (
                                <div className="text-xs text-text-dark/40 text-center mt-2 font-mono space-y-1">
                                  <p>Debug Info:</p>
                                  <p>step_code: {JSON.stringify(activeStep.step_code)}</p>
                                  <p>step_name: {JSON.stringify(activeStep.step_name)}</p>
                                  <p>step_name_id: {JSON.stringify(activeStep.step_name_id)}</p>
                                  <p>Available codes: WASH, DRY, SORT, METAL, PACK</p>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>

                      {/* QC Check */}
                      {activeStep.requires_qc && (
                        <div className="border-t border-olive-light/20 pt-4">
                          <StepQCCheck
                            stepRunId={activeStepRun.id}
                            qualityParameters={stepQualityParameters}
                            loading={saving || loadingStepQPs}
                            onPass={handleQCPass}
                            onFail={handleQCFail}
                          />
                        </div>
                      )}

                      {/* Non-Conformances */}
                      <div className="border-t border-olive-light/20 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-text-dark">
                            Non-Conformances
                            {nonConformances.length > 0 && (
                              <span className="ml-2 text-xs font-normal text-text-dark/60">
                                ({nonConformances.length})
                              </span>
                            )}
                          </h4>
                          <button
                            type="button"
                            onClick={() => setShowNCForm(!showNCForm)}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-text-dark/70 hover:bg-olive-light/20 hover:text-text-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Add Non-Conformance"
                          >
                            <Plus className="h-4 w-4" />
                            {showNCForm ? 'Cancel' : 'Add'}
                          </button>
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
                    </div>
                  )}

                  {/* Signoffs and Completion */}
                  {allStepsCompleted && (
                    <div className="border-t border-olive-light/20 pt-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-text-dark mb-3">Process Completion</h4>
                        {lotRunId && (
                          <ProcessSignoffs
                            lotRunId={lotRunId}
                            signoffs={lotRun?.signoffs ?? []}
                            onSign={handleSignoff}
                            loading={saving}
                          />
                        )}
                      </div>

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

                  {/* Navigation - Only show if not on first/last step */}
                  {stepRuns.length > 1 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-olive-light/20 pt-4">
                      <button
                        type="button"
                        onClick={prevStep}
                        disabled={currentStepIndex === 0 || loadingStepRuns}
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-dark/70 hover:bg-olive-light/20 hover:text-text-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </button>
                      <div className="text-xs text-text-dark/50">
                        Step {currentStepIndex + 1} of {stepRuns.length}
                      </div>
                      <button
                        type="button"
                        onClick={nextStep}
                        disabled={currentStepIndex >= stepRuns.length - 1 || loadingStepRuns || !canStartNextStep}
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-olive text-white hover:bg-olive-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
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
