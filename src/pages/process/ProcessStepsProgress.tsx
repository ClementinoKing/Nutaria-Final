import { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Activity, CheckCircle2, ChevronLeft, ChevronRight, CornerUpLeft, MapPin, PlayCircle, Plus, SkipForward, Timer } from 'lucide-react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useAuth } from '@/context/AuthContext'
import { useProcessLotRun } from '@/hooks/useProcessLotRun'
import { useProcessStepRuns } from '@/hooks/useProcessStepRuns'
import { useNonConformances } from '@/hooks/useNonConformances'
import { useQualityParameters, type QualityParameter } from '@/hooks/useQualityParameters'
import { supabase } from '@/lib/supabaseClient'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  updateProcessStepRun,
  createNonConformance,
  completeProcessLotRun,
  createProcessSignoff,
  createProcessLotRun,
  createProcessStepRuns,
  skipProcessStep,
  getActiveGlobalMetalDetectorSession,
  startGlobalMetalDetectorSession,
  stopGlobalMetalDetectorSession,
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
import { Skeleton } from '@/components/ui/skeleton'
import type { ProcessStepRun, ProcessStep } from '@/types/processExecution'
import { formatSecondsToHms } from '@/lib/metalDetectorTimer'

function ProcessStepsProgressSkeleton() {
  return (
    <>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="mb-1 h-3 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-2 h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-1 flex-col items-center">
                <Skeleton className="mb-2 h-10 w-10 rounded-full" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-1 h-2.5 w-12" />
              </div>
            ))}
          </div>
          <div className="border-t border-olive-light/20 pt-4 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
            </div>
            <div className="border-t border-olive-light/20 pt-4">
              <Skeleton className="mb-4 h-4 w-48" />
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

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
  const { lotId: lotIdParam, lotRunId: lotRunIdParam } = useParams()
  const lotId = Number.parseInt(lotIdParam ?? '', 10)
  const routeLotRunId = Number.parseInt(lotRunIdParam ?? '', 10)
  const navigate = useNavigate()

  const { user } = useAuth()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [skipAlertOpen, setSkipAlertOpen] = useState(false)
  const [finishWithNCAlertOpen, setFinishWithNCAlertOpen] = useState(false)
  const [completeStepAlertOpen, setCompleteStepAlertOpen] = useState(false)
  const [startProcessAlertOpen, setStartProcessAlertOpen] = useState(false)
  const [showNCForm, setShowNCForm] = useState(false)
  const [showSignoffs, setShowSignoffs] = useState(false)
  const [creatingLotRun, setCreatingLotRun] = useState(false)
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null)
  const [selectedLots, setSelectedLots] = useState<Lot[]>([])
  const [loadingSelectedLot, setLoadingSelectedLot] = useState(true)
  const [selectedLotError, setSelectedLotError] = useState<string | null>(null)
  const [globalMetalSession, setGlobalMetalSession] = useState<{ ends_at: string } | null>(null)
  const [metalTimerNowMs, setMetalTimerNowMs] = useState(() => Date.now())

  const [lotRunId, setLotRunId] = useState<number | null>(Number.isFinite(routeLotRunId) ? routeLotRunId : null)
  const [checkingLotRun, setCheckingLotRun] = useState(false)
  const lotRunLookupRequestId = useRef(0)
  const [checkedLotId, setCheckedLotId] = useState<number | null>(null)
  const [initialLoadCompleted, setInitialLoadCompleted] = useState(false)

  const refreshSelectedLot = useCallback(async () => {
    setLoadingSelectedLot(true)
    setSelectedLotError(null)

    if (lotRunId) {
      const { data: rows, error: rowsError } = await supabase
        .from('process_lot_run_batches')
        .select(
          `
          id,
          is_primary,
          supply_batches:supply_batch_id (
            id,
            lot_no,
            supply_id,
            product_id,
            unit_id,
            received_qty,
            accepted_qty,
            rejected_qty,
            current_qty,
            process_status,
            quality_status,
            expiry_date,
            created_at,
            supplies (
              doc_no,
              received_at,
              supplier_id,
              warehouse_id
            ),
            products (
              name,
              sku
            ),
            units (
              name,
              symbol
            )
          )
        `
        )
        .eq('process_lot_run_id', lotRunId)

      if (rowsError) {
        setSelectedLot(null)
        setSelectedLots([])
        setSelectedLotError(rowsError.message ?? 'Failed to load run lots')
      } else {
        const lotsInRun: Lot[] = ((rows || []) as any[])
          .map((row) => (Array.isArray(row.supply_batches) ? row.supply_batches[0] : row.supply_batches))
          .filter((row) => row != null) as Lot[]
        setSelectedLots(lotsInRun)
        const primary = ((rows || []) as any[])
          .find((row) => row.is_primary)?.supply_batches
        const fallback = lotsInRun[0] ?? null
        setSelectedLot((Array.isArray(primary) ? primary[0] : primary) ?? fallback)
      }
      setLoadingSelectedLot(false)
      return
    }

    if (!Number.isFinite(lotId)) {
      setSelectedLot(null)
      setSelectedLots([])
      setLoadingSelectedLot(false)
      return
    }

    const { data, error } = await supabase
      .from('supply_batches')
      .select(
        `
        id,
        lot_no,
        supply_id,
        product_id,
        unit_id,
        received_qty,
        accepted_qty,
        rejected_qty,
        current_qty,
        process_status,
        quality_status,
        expiry_date,
        created_at,
        supplies (
          doc_no,
          received_at,
          supplier_id,
          warehouse_id
        ),
        products (
          name,
          sku
        ),
        units (
          name,
          symbol
        )
      `
      )
      .eq('id', lotId)
      .maybeSingle()

    if (error) {
      setSelectedLot(null)
      setSelectedLots([])
      setSelectedLotError(error.message ?? 'Failed to load lot details')
    } else {
      const lot = (data as Lot | null) ?? null
      setSelectedLot(lot)
      setSelectedLots(lot ? [lot] : [])
    }

    setLoadingSelectedLot(false)
  }, [lotId, lotRunId])

  useEffect(() => {
    if (Number.isFinite(routeLotRunId)) {
      setLotRunId(routeLotRunId)
      return
    }
    if (!Number.isFinite(lotId)) {
      setLotRunId(null)
      return
    }

    let isCancelled = false
    const requestId = ++lotRunLookupRequestId.current
    setCheckingLotRun(true)

    supabase
      .from('process_lot_run_batches')
      .select('process_lot_run_id')
      .eq('supply_batch_id', lotId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (isCancelled || requestId !== lotRunLookupRequestId.current) return
        if (data?.process_lot_run_id) {
          setLotRunId(data.process_lot_run_id)
          return
        }
        const fallback = await supabase
          .from('process_lot_runs')
          .select('id')
          .eq('supply_batch_id', lotId)
          .maybeSingle()
        if (isCancelled || requestId !== lotRunLookupRequestId.current) return
        setLotRunId(fallback.data?.id ?? null)
      })
      .finally(() => {
        if (isCancelled || requestId !== lotRunLookupRequestId.current) return
        setCheckedLotId(lotId)
        setCheckingLotRun(false)
      })

    return () => {
      isCancelled = true
    }
  }, [lotId, routeLotRunId])

  useEffect(() => {
    refreshSelectedLot()
  }, [refreshSelectedLot])

  const { lotRun, loading: loadingLotRun, refresh: refreshLotRun } = useProcessLotRun({
    lotRunId,
    enabled: lotRunId !== null,
  })

  useEffect(() => {
    if (!lotRunId) return
    if (Number.isFinite(routeLotRunId)) return
    navigate(`/process/process-steps/run/${lotRunId}`, { replace: true })
  }, [lotRunId, routeLotRunId, navigate])

  const { stepRuns, loading: loadingStepRuns, refresh: refreshStepRuns } = useProcessStepRuns({
    lotRunId,
    enabled: lotRunId !== null,
  })

  const activeStepRun = stepRuns[currentStepIndex] ?? null
  const activeStep: ProcessStep | undefined = activeStepRun?.process_step
  const isActiveStepSkippable = activeStep?.can_be_skipped === true

  const { nonConformances, addNonConformance, resolveNonConformance } = useNonConformances({
    stepRunId: activeStepRun?.id ?? null,
    enabled: activeStepRun !== null,
  })

  const { qualityParameters } = useQualityParameters()
  const [stepQualityParameters, setStepQualityParameters] = useState<QualityParameter[]>([])
  const [loadingStepQPs, setLoadingStepQPs] = useState(false)
  const [sortingAvailableQty, setSortingAvailableQty] = useState<{
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null>(null)

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

  // Fetch available quantity for sorting step so outputs + waste cannot exceed it
  useEffect(() => {
    const isSortStep = activeStep?.step_code?.toUpperCase() === 'SORT'
    if (!isSortStep || !lotRunId || !activeStepRun?.id) {
      setSortingAvailableQty(null)
      return
    }
    let cancelled = false
    calculateAvailableQuantity(lotRunId, activeStepRun.id)
      .then((result) => {
        if (!cancelled) {
          setSortingAvailableQty({
            availableQty: result.availableQty,
            initialQty: result.initialQty,
            totalWaste: result.totalWaste,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setSortingAvailableQty(null)
      })
    return () => {
      cancelled = true
    }
  }, [lotRunId, activeStepRun?.id, activeStep?.step_code])

  const allStepsCompleted = stepRuns.length > 0 && stepRuns.every((step) => step.status === 'COMPLETED' || step.status === 'SKIPPED')
  const isLastCompletableStep = useMemo(() => {
    if (!activeStepRun) return false
    if (activeStepRun.status === 'COMPLETED' || activeStepRun.status === 'SKIPPED') return false
    return stepRuns.every(
      (step) =>
        step.id === activeStepRun.id ||
        step.status === 'COMPLETED' ||
        step.status === 'SKIPPED'
    )
  }, [stepRuns, activeStepRun])
  const canStartNextStep = useMemo(() => {
    const currentStep = stepRuns[currentStepIndex]
    return currentStep?.status === 'COMPLETED' || currentStep?.status === 'SKIPPED'
  }, [currentStepIndex, stepRuns])

  const unresolvedNCs = useMemo(
    () => nonConformances.filter((nc) => !nc.resolved),
    [nonConformances]
  )

  const runTotalAvailableQty = useMemo(
    () => selectedLots.reduce((sum, lot) => sum + (Number(lot.current_qty ?? lot.received_qty) || 0), 0),
    [selectedLots]
  )
  const runUnitSymbol = useMemo(() => {
    const symbols = Array.from(new Set(selectedLots.map((lot) => lot.units?.symbol).filter(Boolean)))
    if (symbols.length === 1) return symbols[0] as string
    return symbols[0] ?? 'kg'
  }, [selectedLots])
  const isSortingStep = (activeStep?.step_code ?? '').toUpperCase() === 'SORT'

  const handleBack = () => {
    navigate('/process/process-steps')
  }

  const performCreateLotRun = async () => {
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
        await refreshSelectedLot()
      } else {
        toast.info('Process lot run already exists for this batch')
        // Refresh to get the existing lot run ID
        const { data } = await supabase
          .from('process_lot_run_batches')
          .select('process_lot_run_id')
          .eq('supply_batch_id', selectedLot.id)
          .maybeSingle()
        if (data?.process_lot_run_id) {
          setLotRunId(data.process_lot_run_id)
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

  const handleCreateLotRun = () => {
    if (!selectedLot) {
      toast.error('No lot selected')
      return
    }
    setStartProcessAlertOpen(true)
  }

  const goToStep = (index: number) => {
    if (index < 0 || index >= stepRuns.length) return
    if (index > 0) {
      const previousStep = stepRuns[index - 1]
      if (previousStep?.status !== 'COMPLETED' && previousStep?.status !== 'SKIPPED') {
        toast.warning('Please complete or skip the previous step before proceeding')
        return
      }
    }
    setCurrentStepIndex(index)
  }

  // When user opens a step that is PENDING, auto-set to IN_PROGRESS and set started_at
  const hasAutoStartedRef = useRef<number | null>(null)
  useEffect(() => {
    if (!activeStepRun || !user?.id || activeStepRun.status !== 'PENDING') return
    if (hasAutoStartedRef.current === activeStepRun.id) return

    hasAutoStartedRef.current = activeStepRun.id
    const updates: Partial<ProcessStepRun> = {
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
    }
    if (!activeStepRun.performed_by) {
      updates.performed_by = user.id
    }
    updateProcessStepRun(activeStepRun.id, updates)
      .then(() => refreshStepRuns())
      .catch((err) => {
        console.error('Error auto-starting step:', err)
        hasAutoStartedRef.current = null
      })
  }, [activeStepRun?.id, activeStepRun?.status, user?.id])

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

    if (status === 'COMPLETED' && activeStep?.step_code?.toUpperCase() === 'SORT') {
      if (!selectedLot?.id) {
        toast.error('Unable to validate sorting quantity. Please refresh and try again.')
        return
      }

      try {
        let baseAvailable = sortingAvailableQty?.availableQty ?? null
        if (baseAvailable === null) {
          const recalculated = await calculateAvailableQuantity(lotRunId, activeStepRun.id)
          baseAvailable = recalculated.availableQty
        }

        const [{ data: outputsData, error: outputsError }, { data: reworksData, error: reworksError }] =
          await Promise.all([
            supabase
              .from('process_sorting_outputs')
              .select('id, quantity_kg')
              .eq('process_step_run_id', activeStepRun.id),
            supabase
              .from('reworked_lots')
              .select('quantity_kg')
              .eq('original_supply_batch_id', selectedLot.id),
          ])

        if (outputsError || reworksError) {
          toast.error('Failed to validate sorting quantities before completion')
          return
        }

        const outputRows = outputsData || []
        const outputIds = outputRows.map((row) => row.id)
        const outputTotal = outputRows.reduce((sum, row) => sum + (Number(row.quantity_kg) || 0), 0)
        const reworkTotal = (reworksData || []).reduce((sum, row) => sum + (Number(row.quantity_kg) || 0), 0)

        let wasteTotal = 0
        if (outputIds.length > 0) {
          const { data: wasteData, error: wasteError } = await supabase
            .from('process_sorting_waste')
            .select('quantity_kg')
            .in('sorting_run_id', outputIds)

          if (wasteError) {
            toast.error('Failed to validate sorting waste before completion')
            return
          }

          wasteTotal = (wasteData || []).reduce((sum, row) => sum + (Number(row.quantity_kg) || 0), 0)
        }

        const remaining = Number(baseAvailable) - outputTotal - reworkTotal - wasteTotal
        if (remaining > 0.0001) {
          toast.error(
            `Sorting is incomplete. Remaining quantity is ${remaining.toFixed(2)} kg. Allocate all kgs to outputs, reworks, or waste before completing this step.`
          )
          return
        }
      } catch (error) {
        console.error('Error validating sorting completion:', error)
        toast.error('Failed to validate sorting completion')
        return
      }
    }

    const updates: Partial<ProcessStepRun> = { status }
    const previousStatus = activeStepRun.status

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
      toast.success('Step status updated')
    } catch (error) {
      console.error('Error updating step status:', error)
      toast.error('Failed to update step status')
    } finally {
      setSaving(false)
    }
  }

  const performSkipStep = async () => {
    if (!activeStepRun || !user?.id) return

    if (!activeStep?.can_be_skipped) {
      toast.error('This step cannot be skipped')
      return
    }

    if (activeStepRun.status !== 'PENDING' && activeStepRun.status !== 'IN_PROGRESS') {
      toast.error(`Cannot skip step with status ${activeStepRun.status}`)
      return
    }

    setSaving(true)
    try {
      await skipProcessStep(activeStepRun.id, user.id)

      try {
        const { createBatchStepTransition } = await import('@/lib/processExecution')
        const fromStep = activeStepRun.status === 'PENDING' ? null : activeStep?.step_code || null
        const toStep = activeStep?.step_code || 'SKIPPED'
        const reason = 'Step skipped'

        await createBatchStepTransition(lotRunId!, fromStep, toStep, reason, user.id)
      } catch (transitionError) {
        console.warn('Failed to record batch step transition:', transitionError)
      }

      await refreshStepRuns()
      toast.success('Step skipped successfully')

      if (currentStepIndex < stepRuns.length - 1) {
        setCurrentStepIndex(currentStepIndex + 1)
      }
      setSkipAlertOpen(false)
    } catch (error) {
      console.error('Error skipping step:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to skip step'
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleSkipStep = () => {
    if (!activeStepRun || !user?.id) return
    if (!activeStep?.can_be_skipped) {
      toast.error('This step cannot be skipped')
      return
    }
    if (activeStepRun.status !== 'PENDING' && activeStepRun.status !== 'IN_PROGRESS') {
      toast.error(`Cannot skip step with status ${activeStepRun.status}`)
      return
    }
    setSkipAlertOpen(true)
  }

  const [stepFormData, setStepFormData] = useState<{ location_id: string }>({
    location_id: '',
  })

  const stepFormInitialized = useRef(false)
  const stepFormSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (activeStepRun) {
      setStepFormData({
        location_id: String(activeStepRun.location_id ?? activeStep?.default_location_id ?? ''),
      })
      stepFormInitialized.current = true
      stepFormSaveSkippedFirst.current = false
    }
  }, [activeStepRun, activeStep])

  const stepFormSaveSkippedFirst = useRef(false)
  // Auto-save step details in background, 10s after last field change.
  useEffect(() => {
    if (!activeStepRun || !stepFormInitialized.current) return
    if (!stepFormSaveSkippedFirst.current) {
      stepFormSaveSkippedFirst.current = true
      return
    }

    if (stepFormSaveTimeout.current) {
      clearTimeout(stepFormSaveTimeout.current)
    }

    stepFormSaveTimeout.current = setTimeout(() => {
      stepFormSaveTimeout.current = null
      const updates: Partial<ProcessStepRun> = {
        location_id: stepFormData.location_id ? parseInt(stepFormData.location_id, 10) : null,
      }
      if (!activeStepRun.performed_by && user?.id) {
        updates.performed_by = user.id
      }
      updateProcessStepRun(activeStepRun.id, updates)
        .catch((error) => {
          console.error('Error saving step in background:', error)
        })
    }, 10000)

    return () => {
      if (stepFormSaveTimeout.current) clearTimeout(stepFormSaveTimeout.current)
    }
  }, [stepFormData.location_id, activeStepRun?.id, user?.id])

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

  const performCompleteProcess = async () => {
    if (!lotRunId) return
    setSaving(true)
    try {
      await completeProcessLotRun(lotRunId)
      toast.success('Process completed successfully. Production batch created.')
      await refreshSelectedLot()
      navigate('/process/process-steps', { replace: true })
      setFinishWithNCAlertOpen(false)
    } catch (error) {
      console.error('Error completing process:', error)
      toast.error('Failed to complete process')
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteProcess = () => {
    if (!lotRunId || !allStepsCompleted) {
      toast.error('All steps must be completed before finishing the process')
      return
    }

    if (unresolvedNCs.length > 0) {
      setFinishWithNCAlertOpen(true)
      return
    }

    performCompleteProcess()
  }

  const handleCompleteStep = async () => {
    if (!activeStepRun) return

    const shouldCompleteProcessAfterStep = stepRuns.every(
      (step) =>
        step.id === activeStepRun.id ||
        step.status === 'COMPLETED' ||
        step.status === 'SKIPPED'
    )

    await handleStepStatusChange('COMPLETED')
    setCompleteStepAlertOpen(false)

    if (!shouldCompleteProcessAfterStep) return

    if (unresolvedNCs.length > 0) {
      setFinishWithNCAlertOpen(true)
      return
    }

    await performCompleteProcess()
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
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)

  useEffect(() => {
    setLoadingWarehouses(true)
    supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setWarehouses(data as Array<{ id: number; name: string }>)
        }
        setLoadingWarehouses(false)
      })
  }, [])

  const lotRunCheckPending =
    !loadingSelectedLot &&
    Number.isFinite(lotId) &&
    selectedLot !== null &&
    (checkingLotRun || checkedLotId !== selectedLot.id)

  const initialLoadReady =
    !loadingSelectedLot &&
    !lotRunCheckPending &&
    (!lotRunId || (!loadingLotRun && !loadingStepRuns && !loadingWarehouses))

  useEffect(() => {
    if (initialLoadCompleted) return
    if (initialLoadReady) {
      setInitialLoadCompleted(true)
    }
  }, [initialLoadCompleted, initialLoadReady])

  const isPageLoading = !initialLoadCompleted
  const metalTimerRemainingSeconds = useMemo(() => {
    if (!globalMetalSession?.ends_at) return 0
    return Math.max(0, Math.ceil((new Date(globalMetalSession.ends_at).getTime() - metalTimerNowMs) / 1000))
  }, [globalMetalSession, metalTimerNowMs])
  const isMetalTimerRunning = globalMetalSession != null && metalTimerRemainingSeconds > 0
  const isMetalTimerExpired = globalMetalSession != null && metalTimerRemainingSeconds === 0

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMetalTimerNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    const refreshSession = async () => {
      const active = await getActiveGlobalMetalDetectorSession()
      if (active) {
        setGlobalMetalSession({ ends_at: active.ends_at })
      } else {
        setGlobalMetalSession(null)
      }
    }

    refreshSession().catch(() => undefined)
    const refreshId = window.setInterval(() => {
      refreshSession().catch(() => undefined)
    }, 15000)

    return () => {
      window.clearInterval(refreshId)
    }
  }, [])

  const handleStartMetalDetectorChecks = useCallback(async () => {
    try {
      const started = await startGlobalMetalDetectorSession({
        durationMinutes: 60,
        startedBy: user?.id ?? null,
        startedFromProcessLotRunId: lotRunId ?? null,
      })
      setGlobalMetalSession({ ends_at: started.ends_at })
      setMetalTimerNowMs(Date.now())
      toast.success('Metal detector checks started (global).')
    } catch (error) {
      console.error('Failed to start metal detector checks:', error)
      toast.error('Failed to start metal detector checks')
    }
  }, [lotRunId, user?.id])

  const handleStopMetalDetectorChecks = useCallback(async () => {
    try {
      await stopGlobalMetalDetectorSession(user?.id ?? null)
      setGlobalMetalSession(null)
      toast.success('Metal detector timer stopped.')
    } catch (error) {
      console.error('Failed to stop metal detector checks:', error)
      toast.error('Failed to stop metal detector checks')
    }
  }, [user?.id])

  return (
    <PageLayout
      title="Process Steps Progress"
      activeItem="process"
      stickyHeader={false}
      contentClassName="py-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleBack} className="flex items-center gap-2">
            <CornerUpLeft className="h-4 w-4" />
            Back to Available Lots
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {!isMetalTimerRunning && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleStartMetalDetectorChecks}
              disabled={!selectedLot}
              className="border-olive-light/40"
            >
              Start Metal Detector Checks
            </Button>
          )}
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
      </div>

      {selectedLots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedLots.map((lot) => (
            <span
              key={lot.id}
              className="inline-flex items-center rounded-full border border-olive-light/40 bg-olive-light/15 px-3 py-1 text-xs text-text-dark/80"
            >
              {lot.lot_no} · {lot.current_qty ?? lot.received_qty ?? '—'} {lot.units?.symbol ?? ''}
            </span>
          ))}
        </div>
      )}

      {selectedLotError && (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <CardContent className="py-4">
            We could not load this lot. Please try refreshing the page.
          </CardContent>
        </Card>
      )}

      {isPageLoading ? (
        <ProcessStepsProgressSkeleton />
      ) : !selectedLot ? (
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
        <div className="flex min-h-[calc(100vh-12rem)] flex-col items-center justify-center gap-6 px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-olive/10 text-olive">
            <PlayCircle className="h-10 w-10" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <Button
              size="lg"
              onClick={handleCreateLotRun}
              disabled={creatingLotRun || !selectedLot}
              className="w-full bg-olive hover:bg-olive-dark text-white px-8 text-base font-medium"
            >
              {creatingLotRun ? 'Starting…' : 'Start Process'}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={handleStartMetalDetectorChecks}
              disabled={!selectedLot}
              className="w-full border-olive-light/40 text-base font-medium"
            >
              Start Metal Detector Checks
            </Button>
            {(isMetalTimerRunning || isMetalTimerExpired) && (
              <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">Metal detector timer</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className={`text-lg font-semibold ${isMetalTimerRunning ? 'text-amber-800' : 'text-red-700'}`}>
                    {formatSecondsToHms(metalTimerRemainingSeconds)}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleStopMetalDetectorChecks}
                    className="border-amber-300"
                  >
                    Stop
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">
                {selectedLots.length > 1 ? `Combined Process Run (${selectedLots.length} lots)` : selectedLot.lot_no}
              </CardTitle>
              <CardDescription>
                {selectedLot.supplies?.doc_no ?? 'Unknown document'} ·{' '}
                {selectedLot.products?.name ?? 'Unknown product'} ({selectedLot.products?.sku ?? 'N/A'})
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Qty</p>
                <p className="text-base font-semibold text-text-dark">
                  {runTotalAvailableQty.toFixed(2)} {runUnitSymbol}
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
                  ? `Tracking: ${selectedLots.length > 1 ? `${selectedLots.length} combined lots` : selectedLot.lot_no} — ${selectedLot.products?.name ?? 'Unknown product'}`
                  : 'Select a lot to capture process execution data'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isSortingStep && sortingAvailableQty && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Sorting available</p>
                  <p className="text-2xl font-bold text-emerald-900">
                    {sortingAvailableQty.availableQty.toFixed(2)} {runUnitSymbol}
                  </p>
                  <p className="text-xs text-emerald-800">
                    Initial: {sortingAvailableQty.initialQty.toFixed(2)} {runUnitSymbol} · Deducted waste/rejections:{' '}
                    {sortingAvailableQty.totalWaste.toFixed(2)} {runUnitSymbol}
                  </p>
                </div>
              )}
              {loadingStepRuns && stepRuns.length === 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex flex-1 flex-col items-center">
                        <Skeleton className="mb-2 h-10 w-10 rounded-full" />
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="mt-1 h-2.5 w-12" />
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-olive-light/20 pt-4 space-y-4">
                    <div className="flex justify-between">
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-6 w-32" />
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-6 w-32" />
                      </div>
                    </div>
                    <div className="border-t border-olive-light/20 pt-4">
                      <Skeleton className="mb-4 h-4 w-48" />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    </div>
                  </div>
                </div>
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
                      const isSkipped = stepRun.status === 'SKIPPED'
                      const isCurrent = index === currentStepIndex
                      const canAccess = index === 0 || stepRuns[index - 1]?.status === 'COMPLETED' || stepRuns[index - 1]?.status === 'SKIPPED'
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
                                : isSkipped
                                ? 'text-gray-600'
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
                                  : isSkipped
                                  ? 'border-gray-400 bg-gray-100'
                                  : isInProgress
                                  ? 'border-orange-400 bg-orange-100'
                                  : 'border-text-dark/20 bg-white'
                              }`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                              ) : isSkipped ? (
                                <SkipForward className="h-5 w-5 text-gray-600" />
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
                                isCompleted || isSkipped ? 'bg-green-600' : 'bg-text-dark/20'
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
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ${
                              activeStepRun.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800'
                                : activeStepRun.status === 'IN_PROGRESS'
                                ? 'bg-orange-100 text-orange-800'
                                : activeStepRun.status === 'FAILED'
                                ? 'bg-red-100 text-red-800'
                                : activeStepRun.status === 'SKIPPED'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-olive-light/40 text-olive-dark'
                            }`}
                          >
                            {activeStepRun.status}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        <div className="rounded-xl border border-olive-light/35 bg-olive-light/10 p-4">
                          <Label
                            htmlFor="step_location"
                            className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-dark/70"
                          >
                            <MapPin className="h-4 w-4 text-olive" aria-hidden />
                            Location
                          </Label>
                          <select
                            id="step_location"
                            className="flex h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 py-2 text-sm font-medium text-text-dark shadow-sm transition focus:outline-none focus:ring-2 focus:ring-olive-light/50"
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

                        <div className="rounded-xl border border-olive-light/35 bg-white p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                              <Timer className="h-4 w-4 text-olive" aria-hidden />
                              Started at
                            </Label>
                            {activeStepRun.status !== 'COMPLETED' && activeStepRun.status !== 'SKIPPED' && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  if (!activeStepRun) return
                                  setSaving(true)
                                  try {
                                    await updateProcessStepRun(activeStepRun.id, {
                                      started_at: new Date().toISOString(),
                                    })
                                    await refreshStepRuns()
                                    toast.success('Start time recorded')
                                  } catch (err) {
                                    console.error(err)
                                    toast.error('Failed to record start time')
                                  } finally {
                                    setSaving(false)
                                  }
                                }}
                                disabled={saving || loadingStepRuns}
                                className="shrink-0 border-olive-light/50"
                                title="Record current time as start"
                              >
                                <Timer className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <p className="text-lg font-semibold text-text-dark">
                            {activeStepRun.started_at ? new Date(activeStepRun.started_at).toLocaleString() : '—'}
                          </p>
                        </div>

                        <div className="rounded-xl border border-olive-light/35 bg-white p-4">
                          <Label className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                            <CheckCircle2 className="h-4 w-4 text-olive" aria-hidden />
                            Completed at
                          </Label>
                          <p className="text-lg font-semibold text-text-dark">
                            {activeStepRun.completed_at
                              ? new Date(activeStepRun.completed_at).toLocaleString()
                              : '—'}
                          </p>
                        </div>
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
                            return <WashingStep stepRun={activeStepRun} loading={saving || loadingStepRuns} />
                          }
                          if (stepCode === 'DRY' || stepCode === 'DRYI') {
                            return <DryingStep stepRun={activeStepRun} loading={saving || loadingStepRuns} />
                          }
                          if (stepCode === 'SORT') {
                            return (
                              <SortingStep
                                stepRun={activeStepRun}
                                loading={saving || loadingStepRuns}
                                originalSupplyBatchId={selectedLot?.id ?? null}
                                lotProductName={selectedLot?.products?.name ?? null}
                                lotProductId={selectedLot?.product_id ?? null}
                                availableQuantity={sortingAvailableQty}
                                onQuantityChange={() => {
                                  // Refetch available qty so remaining stays accurate after add/edit/delete
                                  if (lotRunId && activeStepRun?.id) {
                                    calculateAvailableQuantity(lotRunId, activeStepRun.id)
                                      .then((result) =>
                                        setSortingAvailableQty({
                                          availableQty: result.availableQty,
                                          initialQty: result.initialQty,
                                          totalWaste: result.totalWaste,
                                        })
                                      )
                                      .catch(() => {})
                                  }
                                }}
                              />
                            )
                          }
                          if (stepCode === 'METAL' || stepCode === 'META') {
                            return <MetalDetectionStep stepRun={activeStepRun} loading={saving || loadingStepRuns} />
                          }
                          if (stepCode === 'PACK') {
                            return <PackagingStep stepRun={activeStepRun} loading={saving || loadingStepRuns} />
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
                                  <p>Available codes: WASH, DRY/DRYI, SORT, METAL/META, PACK</p>
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
                    <div className="flex flex-wrap items-center gap-2">
                      {activeStepRun &&
                        activeStepRun.status !== 'COMPLETED' &&
                        activeStepRun.status !== 'SKIPPED' && (
                          <>
                            {isActiveStepSkippable && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleSkipStep}
                                disabled={saving || loadingStepRuns}
                                className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                              >
                                <SkipForward className="mr-2 h-4 w-4" />
                                Skip
                              </Button>
                            )}
                            <Button
                              type="button"
                              onClick={() => setCompleteStepAlertOpen(true)}
                              disabled={saving || loadingStepRuns}
                              className="bg-olive hover:bg-olive-dark"
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Complete
                            </Button>
                          </>
                        )}
                      <Button
                        type="button"
                        onClick={nextStep}
                        disabled={
                          currentStepIndex >= stepRuns.length - 1 ||
                          loadingStepRuns ||
                          !canStartNextStep
                        }
                        className="flex items-center"
                      >
                        Next
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <AlertDialog open={skipAlertOpen} onOpenChange={setSkipAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip this step?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeStep
                ? `Are you sure you want to skip "${activeStep.step_name || 'this step'}"? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => performSkipStep()}
            >
              Skip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={finishWithNCAlertOpen} onOpenChange={setFinishWithNCAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unresolved non-conformances</AlertDialogTitle>
            <AlertDialogDescription>
              There {unresolvedNCs.length === 1 ? 'is' : 'are'} {unresolvedNCs.length} unresolved
              non-conformance{unresolvedNCs.length === 1 ? '' : 's'}. Do you want to proceed anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-olive hover:bg-olive-dark"
              onClick={() => performCompleteProcess()}
            >
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={startProcessAlertOpen} onOpenChange={setStartProcessAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start process for this lot?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm the lot details before starting. Once the process starts, the kilograms cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 rounded-md border border-olive-light/30 bg-olive-light/10 p-3 text-sm">
            <p>
              <span className="font-semibold text-text-dark">Supply Document:</span>{' '}
              <span className="text-text-dark/80">{selectedLot?.supplies?.doc_no ?? 'Unknown document'}</span>
            </p>
            <p>
              <span className="font-semibold text-text-dark">Product:</span>{' '}
              <span className="text-text-dark/80">{selectedLot?.products?.name ?? 'Unknown product'}</span>
            </p>
            <p>
              <span className="font-semibold text-text-dark">Available Qty:</span>{' '}
              <span className="text-text-dark/80">
                {selectedLot ? `${runTotalAvailableQty.toFixed(2)} ${runUnitSymbol}` : '—'}
              </span>
            </p>
          </div>

          <p className="text-xs text-amber-700">
            Important: After starting the process, the kg value is locked and cannot be edited.
          </p>

          <AlertDialogFooter className="grid w-full grid-cols-2 gap-3 sm:grid-cols-2">
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="w-full bg-olive hover:bg-olive-dark"
              onClick={() => {
                setStartProcessAlertOpen(false)
                void performCreateLotRun()
              }}
            >
              {creatingLotRun ? 'Starting…' : 'Confirm & Start'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={completeStepAlertOpen} onOpenChange={setCompleteStepAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isLastCompletableStep
                ? 'Complete process and create production batch?'
                : 'Complete this step?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isLastCompletableStep
                ? 'This will mark the current step complete, finish the process, and create the production batch.'
                : 'This will mark the current step as completed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-olive hover:bg-olive-dark"
              onClick={() => handleCompleteStep()}
            >
              {isLastCompletableStep ? 'Complete & Create Batch' : 'Complete Step'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default ProcessStepsProgress
