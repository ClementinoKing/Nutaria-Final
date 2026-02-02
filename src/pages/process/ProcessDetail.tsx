import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { ArrowLeft, Clock, CheckCircle2, Shield, MapPin, Layers, X } from 'lucide-react'
import { toast } from 'sonner'
import { PostgrestError } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/spinner'
import { useQualityParameters, type QualityParameter } from '@/hooks/useQualityParameters'
import { useProcessStepNames, type ProcessStepName } from '@/hooks/useProcessStepNames'

interface Process {
  id: number
  code: string
  name: string
  created_at: string
  updated_at: string
  product_ids: number[] | null
}

interface ProcessStep {
  id: number
  seq: number
  step_code: string
  step_name: string
  step_name_id: number | null
  description: string | null
  raw_description: string
  requires_qc: boolean
  can_be_skipped: boolean
  default_location_id: number | null
  default_location_name: string | null
  estimated_duration: string | null
  estimated_duration_hours: number | null
  estimated_duration_raw: string | number | null
}

interface Warehouse {
  id: number
  name: string
}

interface Product {
  id: number
  sku: string | null
  name: string
}

interface ProductProcess {
  id: number
  product_id: number
  is_default: boolean
}

interface FormStep {
  clientId: string
  id: number | null
  seq: number
  step_code: string
  step_name_id: number | null
  description: string
  requires_qc: boolean
  can_be_skipped: boolean
  default_location_id: string
  duration_hours: string
  duration_minutes: string
  qualityParameterIds: number[]
}

interface FormState {
  code: string
  name: string
  productIds: number[]
  steps: FormStep[]
}

interface ParseIntervalResult {
  display: string | null
  hours: number | null
}

function parseInterval(value: string | number | null | undefined): ParseIntervalResult {
  if (!value) {
    return { display: null, hours: null }
  }

  const buildResult = (hours = 0, minutes = 0, seconds = 0) => {
    const totalHours = hours + minutes / 60 + seconds / 3600
    const parts = []
    if (hours > 0) {
      parts.push(`${hours}h`)
    }
    if (minutes > 0) {
      parts.push(`${minutes}m`)
    }
    if (seconds > 0 && parts.length === 0) {
      parts.push(`${seconds}s`)
    }
    const display = parts.join(' ') || '0m'
    return { display, hours: Number.isFinite(totalHours) ? totalHours : null }
  }

  if (typeof value === 'number') {
    const totalSeconds = Math.max(0, value)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return buildResult(hours, minutes, seconds)
  }

  if (typeof value === 'string') {
    if (value.startsWith('P')) {
      const hoursMatch = value.match(/(\d+)H/)
      const minutesMatch = value.match(/(\d+)M/)
      const secondsMatch = value.match(/(\d+)S/)
      const hours = hoursMatch ? Number(hoursMatch[1]) : 0
      const minutes = minutesMatch ? Number(minutesMatch[1]) : 0
      const seconds = secondsMatch ? Number(secondsMatch[1]) : 0
      return buildResult(hours, minutes, seconds)
    }

    const colonMatch = value.match(/^(-?\d+):(\d{2}):(\d{2})(?:\.\d+)?$/)
    if (colonMatch) {
      const hours = Number(colonMatch[1])
      const minutes = Number(colonMatch[2])
      const seconds = Number(colonMatch[3])
      return buildResult(hours, minutes, seconds)
    }

    const numericValue = Number(value)
    if (!Number.isNaN(numericValue)) {
      return buildResult(0, numericValue, 0)
    }

    return { display: value, hours: null }
  }

  return { display: null, hours: null }

}

const createClientId = (prefix: string = 'step'): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`

const generateStepCode = (sequence: number): string => `STEP-${String(sequence).padStart(2, '0')}`

function parseIntervalToDurationParts(value: string | number | null | undefined): { hours: string; minutes: string } {
  const result = parseInterval(value)
  if (typeof result.hours !== 'number' || !Number.isFinite(result.hours)) {
    return { hours: '', minutes: '' }
  }
  const totalMinutes = Math.round(result.hours * 60)
  const hours = Math.max(0, Math.floor(totalMinutes / 60))
  const minutes = Math.max(0, totalMinutes % 60)
  return {
    hours: hours > 0 ? String(hours) : '',
    minutes: minutes > 0 ? String(minutes) : '',
  }
}

function buildIntervalString(hoursValue: number | null | undefined, minutesValue: number | null | undefined): string | null {
  const hoursNumberRaw = typeof hoursValue === 'number' && Number.isFinite(hoursValue) ? hoursValue : 0
  const minutesNumberRaw = typeof minutesValue === 'number' && Number.isFinite(minutesValue) ? minutesValue : 0
  const hoursNumber = Math.max(0, Math.floor(hoursNumberRaw))
  const minutesNumber = Math.max(0, Math.floor(minutesNumberRaw))

  if (hoursNumber <= 0 && minutesNumber <= 0) {
    return null
  }

  const parts = []
  if (hoursNumber > 0) {
    parts.push(`${hoursNumber} hours`)
  }
  if (minutesNumber > 0) {
    parts.push(`${minutesNumber} minutes`)
  }
  return parts.join(' ')
}

function ProcessDetail() {
  const { processId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [process, setProcess] = useState<Process | null>(null)
  const [steps, setSteps] = useState<ProcessStep[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | PostgrestError | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [currentEditStep, setCurrentEditStep] = useState<1 | 2>(1)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsError, setProductsError] = useState<PostgrestError | null>(null)
  const [productProcesses, setProductProcesses] = useState<ProductProcess[]>([])
  const [stepQualityParameters, setStepQualityParameters] = useState<Map<number, number[]>>(new Map())
  const { qualityParameters, loading: qualityParametersLoading } = useQualityParameters()
  const { processStepNames, loading: processStepNamesLoading } = useProcessStepNames()
  const [qualityParameterSearchTerms, setQualityParameterSearchTerms] = useState<Record<string, string>>({})
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [formState, setFormState] = useState<FormState>({
    code: '',
    name: '',
    productIds: [],
    steps: [],
  })

  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true)

    const { data, error: fetchError } = await supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('Error fetching warehouses for process editor', fetchError)
      toast.error(fetchError.message ?? 'Unable to load warehouses from Supabase.')
      setWarehouses([])
      setWarehousesLoading(false)
      return
    }

    setWarehouses(Array.isArray(data) ? data : [])
    setWarehousesLoading(false)
  }, [])

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true)
    setProductsError(null)

    // Fetch all raw products
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, sku, name, product_type')
      .eq('product_type', 'RAW')
      .order('name', { ascending: true })

    if (productsError) {
      console.error('Error fetching products for process editor', productsError)
      toast.error(productsError.message ?? 'Unable to load products from Supabase.')
      setProducts([])
      setProductsError(productsError)
      setProductsLoading(false)
      return
    }

    // Fetch products that already have processes assigned (excluding current process)
    const { data: assignedProductsData, error: assignedError } = await supabase
      .from('product_processes')
      .select('product_id, process_id')

    if (assignedError) {
      console.error('Error fetching assigned products', assignedError)
      // Continue even if this fails - we'll just show all products
    }

    // Get list of product IDs that are assigned to OTHER processes (not the current one)
    const assignedProductIds = new Set<number>()
    if (Array.isArray(assignedProductsData) && processId) {
      const currentProcessId = Number(processId)
      assignedProductsData.forEach((item: { product_id: number; process_id: number }) => {
        // Only exclude products assigned to OTHER processes
        if (item.product_id && Number.isInteger(item.product_id) && 
            item.process_id !== currentProcessId) {
          assignedProductIds.add(item.product_id)
        }
      })
    } else if (Array.isArray(assignedProductsData)) {
      // If no processId (shouldn't happen in edit mode), exclude all assigned products
      assignedProductsData.forEach((item: { product_id: number }) => {
        if (item.product_id && Number.isInteger(item.product_id)) {
          assignedProductIds.add(item.product_id)
        }
      })
    }

    // Filter out products that are assigned to other processes
    // Products assigned to current process will still be available
    const availableProducts = Array.isArray(productsData)
      ? productsData.filter((product: Product) => !assignedProductIds.has(product.id))
      : []

    setProducts(availableProducts)
    setProductsLoading(false)
  }, [processId])

  useEffect(() => {
    fetchWarehouses().catch((fetchError) => {
      console.error('Unexpected error fetching warehouses for process editor', fetchError)
    })
    fetchProducts().catch((fetchError) => {
      console.error('Unexpected error fetching products for process editor', fetchError)
    })
  }, [fetchWarehouses, fetchProducts])

  const fetchProcessData = useCallback(
    async ({ signal }: { signal?: AbortSignal } = {}) => {
      if (signal?.aborted) {
        return
      }

      const numericId = Number(processId)

      if (Number.isNaN(numericId)) {
        setError(new Error('Invalid process id.'))
        setProcess(null)
        setSteps([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const [processResult, stepsResult, productProcessesResult] = await Promise.all([
        supabase
          .from('processes')
          .select('id, code, name, created_at, updated_at, product_ids')
          .eq('id', numericId)
          .maybeSingle(),
        supabase
          .from('process_steps')
          .select('id, seq, description, requires_qc, can_be_skipped, default_location_id, estimated_duration, step_name_id, process_step_names ( id, code, name ), default_location:warehouses ( id, name )')
          .eq('process_id', numericId)
          .order('seq', { ascending: true }),
        supabase
          .from('product_processes')
          .select('id, product_id, is_default')
          .eq('process_id', numericId)
          .order('is_default', { ascending: false })
          .order('product_id', { ascending: true }),
      ])

      // Fetch step quality parameters after we have step IDs
      let stepQualityParametersResult: { data: Array<{ process_step_id: number; quality_parameter_id: number }> | null; error: PostgrestError | null } = { data: [], error: null }
      if (stepsResult.data && Array.isArray(stepsResult.data) && stepsResult.data.length > 0) {
        const stepIds = stepsResult.data.map((s: any) => s.id).filter((id: any) => id != null)
        if (stepIds.length > 0) {
          stepQualityParametersResult = await supabase
            .from('process_step_quality_parameters')
            .select('process_step_id, quality_parameter_id')
            .in('process_step_id', stepIds)
        }
      }

      if (signal?.aborted) {
        return
      }

      if (processResult.error) {
        console.error('Error fetching process', processResult.error)
        setError(processResult.error)
        setProcess(null)
      } else {
        setProcess(processResult.data ?? null)
      }

      if (stepsResult.error) {
        console.error('Error fetching process steps', stepsResult.error)
        setError((prev) => prev ?? stepsResult.error)
        setSteps([])
      } else {
        const normalizedSteps: ProcessStep[] = Array.isArray(stepsResult.data)
          ? stepsResult.data.map((step: any) => {
              // Handle the joined process_step_names data (can be object or array)
              const stepNameData = step.process_step_names
              const stepName = Array.isArray(stepNameData) 
                ? (stepNameData[0] as { id?: number; name?: string; code?: string } | null)
                : (stepNameData as { id?: number; name?: string; code?: string } | null)
              return {
                id: step.id,
                seq: step.seq,
                step_code: stepName?.code || generateStepCode(step.seq),
                step_name: stepName?.name || 'Unnamed Step',
                step_name_id: step.step_name_id || stepName?.id || null,
                description: step.description ?? 'No description provided.',
                raw_description: step.description ?? '',
                requires_qc: Boolean(step.requires_qc),
                can_be_skipped: Boolean(step.can_be_skipped),
                default_location_id: step.default_location_id,
                default_location_name: (step.default_location as { name?: string } | null)?.name ?? null,
                estimated_duration_raw: step.estimated_duration,
                ...(() => {
                  const interval = parseInterval(step.estimated_duration)
                  return {
                    estimated_duration: interval.display,
                    estimated_duration_hours: interval.hours,
                  }
                })(),
              }
            })
          : []
        setSteps(normalizedSteps)
      }

      if (productProcessesResult.error) {
        console.error('Error fetching process product assignments', productProcessesResult.error)
        toast.error(productProcessesResult.error.message ?? 'Unable to load process products.')
        setProductProcesses([])
      } else {
        setProductProcesses(Array.isArray(productProcessesResult.data) ? productProcessesResult.data : [])
      }

      if (stepQualityParametersResult.error) {
        console.error('Error fetching step quality parameters', stepQualityParametersResult.error)
        toast.error(stepQualityParametersResult.error?.message ?? 'Unable to load step quality parameters.')
        setStepQualityParameters(new Map())
      } else {
        // Build a map of step_id -> quality_parameter_ids[]
        const qpMap = new Map<number, number[]>()
        if (Array.isArray(stepQualityParametersResult.data)) {
          stepQualityParametersResult.data.forEach((item: { process_step_id: number; quality_parameter_id: number }) => {
            const stepId = item.process_step_id
            const qpId = item.quality_parameter_id
            if (!qpMap.has(stepId)) {
              qpMap.set(stepId, [])
            }
            qpMap.get(stepId)!.push(qpId)
          })
        }
        setStepQualityParameters(qpMap)
      }

      setLoading(false)
    },
    [processId],
  )

  useEffect(() => {
    const controller = new AbortController()

    fetchProcessData({ signal: controller.signal }).catch((fetchError) => {
      if (controller.signal.aborted) {
        return
      }
      console.error('Unexpected error fetching process detail', fetchError)
      setError(fetchError)
      setProcess(null)
      setSteps([])
      setLoading(false)
    })

    return () => {
      controller.abort()
    }
  }, [fetchProcessData])

  const handleOpenEditModal = () => {
    if (!process) {
      return
    }

    const preparedSteps = steps.map((step) => {
      const durationParts = parseIntervalToDurationParts(step.estimated_duration_raw)
      const stepQPs = step.id ? (stepQualityParameters.get(step.id) || []) : []
      return {
        clientId: createClientId(`step-${step.id ?? 'new'}`),
        id: step.id ?? null,
        seq: step.seq,
        step_code: generateStepCode(step.seq),
        step_name_id: step.step_name_id ?? null,
        description: step.raw_description ?? '',
        requires_qc: Boolean(step.requires_qc),
        can_be_skipped: Boolean(step.can_be_skipped),
        default_location_id: step.default_location_id ? String(step.default_location_id) : '',
        duration_hours: durationParts.hours,
        duration_minutes: durationParts.minutes,
        qualityParameterIds: stepQPs,
      }
    })

    const assignedProductIds = (
      productProcesses.length > 0
        ? productProcesses.map((item: ProductProcess) => item.product_id)
        : Array.isArray(process.product_ids)
        ? process.product_ids
        : []
    ).filter((value: number) => Number.isInteger(value) && value > 0)

    setFormState({
      code: process.code ?? '',
      name: process.name ?? '',
      productIds: assignedProductIds,
      steps: preparedSteps,
    })
    setIsEditModalOpen(true)
  }

  // Auto-open edit modal if edit=true in URL
  useEffect(() => {
    const shouldEdit = searchParams.get('edit') === 'true'
    if (shouldEdit && process && !isEditModalOpen && !loading) {
      handleOpenEditModal()
      // Remove the query parameter from URL
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('edit')
      setSearchParams(newParams, { replace: true })
    }
  }, [searchParams, process, isEditModalOpen, loading, handleOpenEditModal, setSearchParams])

  const handleCloseEditModal = () => {
    if (isSaving) {
      return
    }
    setQualityParameterSearchTerms({})
    setProductSearchTerm('')
    setCurrentEditStep(1)
    setIsEditModalOpen(false)
  }

  const handleFormFieldChange = (field: keyof FormState, value: string | number[] | FormStep[]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleAddStep = () => {
    setFormState((prev) => {
      const nextSteps: FormStep[] = [
        ...prev.steps,
        {
          clientId: createClientId(),
          id: null,
          seq: prev.steps.length + 1,
          step_code: generateStepCode(prev.steps.length + 1),
          step_name_id: null,
          description: '',
          requires_qc: false,
          can_be_skipped: false,
          default_location_id: '',
          duration_hours: '',
          duration_minutes: '',
          qualityParameterIds: [],
        },
      ]
      return {
        ...prev,
        steps: nextSteps,
      }
    })
  }

  const handleRemoveStep = (clientId: string) => {
    setFormState((prev) => {
      const filtered = prev.steps.filter((step) => step.clientId !== clientId)
      return {
        ...prev,
        steps: filtered.map((step, index) => ({
          ...step,
          seq: index + 1,
          step_code: generateStepCode(index + 1),
        })),
      }
    })
  }

  const handleStepFieldChange = (clientId: string, field: keyof FormStep, value: string | boolean | number | null) => {
    setFormState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.clientId === clientId
          ? {
              ...step,
              [field]: value,
            }
          : step,
      ),
    }))
  }

  const handleToggleStepCheckbox = (clientId: string, field: keyof FormStep, checked: boolean) => {
    setFormState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.clientId === clientId
          ? {
              ...step,
              [field]: checked,
            }
          : step,
      ),
    }))
  }

  const handleToggleStepQualityParameter = (clientId: string, qualityParameterId: number) => {
    setFormState((prev) => {
      const qpIdNumber = Number(qualityParameterId)
      if (!Number.isInteger(qpIdNumber) || qpIdNumber <= 0) {
        return prev
      }

      return {
        ...prev,
        steps: prev.steps.map((step) => {
          if (step.clientId !== clientId) return step
          
          const exists = step.qualityParameterIds.includes(qpIdNumber)
          return {
            ...step,
            qualityParameterIds: exists
              ? step.qualityParameterIds.filter((id: number) => id !== qpIdNumber)
              : [...step.qualityParameterIds, qpIdNumber],
          }
        })
      }
    })
  }

  const handleToggleProductSelection = (productId: number) => {
    setFormState((prev) => {
      const productIdNumber = Number(productId)
      if (!Number.isInteger(productIdNumber) || productIdNumber <= 0) {
        return prev
      }

      const exists = prev.productIds.includes(productIdNumber)
      return {
        ...prev,
        productIds: exists
          ? prev.productIds.filter((id) => id !== productIdNumber)
          : [...prev.productIds, productIdNumber],
      }
    })
  }

  const validateStep1 = (): boolean => {
    const trimmedCode = formState.code.trim()
    const trimmedName = formState.name.trim()

    if (!trimmedCode || !trimmedName) {
      toast.error('Please provide both process code and name.')
      return false
    }

    if (!Array.isArray(formState.productIds) || formState.productIds.length === 0) {
      toast.error('Please select at least one product for this process.')
      return false
    }

    return true
  }

  const validateStep2 = (): boolean => {
    if (formState.steps.length === 0) {
      toast.error('Please add at least one process step.')
      return false
    }

    for (const step of formState.steps) {
      if (!step.step_name_id || step.step_name_id <= 0) {
        toast.error('Each step must have a step name selected.')
        return false
      }

      const hoursInput = (step.duration_hours ?? '').trim()
      const minutesInput = (step.duration_minutes ?? '').trim()

      if (hoursInput !== '') {
        const hoursValue = Number(hoursInput)
        if (!Number.isFinite(hoursValue) || hoursValue < 0 || !Number.isInteger(hoursValue)) {
          toast.error('Step durations must use whole, non-negative hours.')
          return false
        }
      }

      if (minutesInput !== '') {
        const minutesValue = Number(minutesInput)
        if (!Number.isFinite(minutesValue) || minutesValue < 0 || minutesValue >= 60 || !Number.isInteger(minutesValue)) {
          toast.error('Step durations must have whole minutes between 0 and 59.')
          return false
        }
      }
    }

    return true
  }

  const handleNextEditStep = () => {
    if (currentEditStep === 1) {
      if (validateStep1()) {
        setCurrentEditStep(2)
      }
    }
  }

  const handleBackEditStep = () => {
    if (currentEditStep === 2) {
      setCurrentEditStep(1)
    }
  }

  const handleSaveChanges = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving || !process) {
      return
    }

    // Validate current step before submission
    if (currentEditStep === 1) {
      if (!validateStep1()) {
        return
      }
      handleNextEditStep()
      return
    }

    if (currentEditStep === 2) {
      if (!validateStep2()) {
        return
      }
    }

    setIsSaving(true)

    try {
      const productIdsPayload = Array.isArray(formState.productIds)
        ? formState.productIds
            .map((value: number) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0)
        : []

      const normalizedSteps = formState.steps.map((step: FormStep, index: number) => {
        const hoursInput = (step.duration_hours ?? '').trim()
        const minutesInput = (step.duration_minutes ?? '').trim()
        const hoursValue = hoursInput === '' ? null : Number(hoursInput)
        const minutesValue = minutesInput === '' ? null : Number(minutesInput)
        const intervalString = buildIntervalString(
          hoursValue ?? 0,
          minutesValue ?? 0,
        )
        const descriptionTrimmed = (step.description ?? '').trim()

        return {
          id: step.id,
          clientId: step.clientId,
          seq: index + 1,
          step_name_id: step.step_name_id ? Number(step.step_name_id) : null,
          description: descriptionTrimmed ? descriptionTrimmed : null,
          requires_qc: Boolean(step.requires_qc),
          can_be_skipped: Boolean(step.can_be_skipped),
          default_location_id: step.default_location_id ? Number(step.default_location_id) : null,
          estimated_duration: intervalString,
          qualityParameterIds: step.qualityParameterIds || [],
        }
      })

      const stepsToUpdate = normalizedSteps.filter((step) => step.id !== null)
      const stepsToInsert = normalizedSteps.filter((step) => step.id === null)
      const existingStepIds = steps.map((step) => step.id).filter((id) => id !== null && id !== undefined)
      const updatedStepIds = stepsToUpdate.map((step) => step.id)
      const stepsToDelete = existingStepIds.filter((id) => !updatedStepIds.includes(id))

      if (stepsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('process_steps')
          .delete()
          .in('id', stepsToDelete)

        if (deleteError) {
          throw deleteError
        }
      }

      if (stepsToUpdate.length > 0) {
        const updatePayload = stepsToUpdate.map((step) => ({
          id: step.id,
          process_id: process.id,
          seq: step.seq,
          step_name_id: step.step_name_id,
          description: step.description,
          requires_qc: step.requires_qc,
          can_be_skipped: step.can_be_skipped,
          default_location_id: step.default_location_id,
          estimated_duration: step.estimated_duration,
        }))

        const { error: upsertError } = await supabase
          .from('process_steps')
          .upsert(updatePayload, { onConflict: 'id' })

        if (upsertError) {
          throw upsertError
        }
      }

      if (stepsToInsert.length > 0) {
        const insertPayload = stepsToInsert.map((step) => ({
          process_id: process.id,
          seq: step.seq,
          step_name_id: step.step_name_id,
          description: step.description,
          requires_qc: step.requires_qc,
          can_be_skipped: step.can_be_skipped,
          default_location_id: step.default_location_id,
          estimated_duration: step.estimated_duration,
        }))

        const { data: insertedSteps, error: insertError } = await supabase
          .from('process_steps')
          .insert(insertPayload)
          .select('id, seq')

        if (insertError) {
          throw insertError
        }

        // Map inserted steps back to normalizedSteps for QP handling
        if (insertedSteps && Array.isArray(insertedSteps)) {
          insertedSteps.forEach((insertedStep, index) => {
            const originalStep = stepsToInsert[index]
            if (originalStep && insertedStep) {
              originalStep.id = insertedStep.id
            }
          })
        }
      }

      const existingProductProcessMap = new Map(
        productProcesses
          .filter((item) => Number.isInteger(item.product_id))
          .map((item) => [item.product_id, item]),
      )
      const defaultProductId = productIdsPayload[0] ?? null

      const productProcessIdsToDelete = productProcesses
        .filter((item) => !productIdsPayload.includes(item.product_id))
        .map((item) => item.id)
        .filter((id) => Number.isInteger(id))

      if (productProcessIdsToDelete.length > 0) {
        const { error: deleteProductProcessesError } = await supabase
          .from('product_processes')
          .delete()
          .in('id', productProcessIdsToDelete)

        if (deleteProductProcessesError) {
          throw deleteProductProcessesError
        }
      }

      const productProcessUpserts = productIdsPayload
        .filter((productId) => existingProductProcessMap.has(productId))
        .map((productId) => ({
          id: existingProductProcessMap.get(productId)?.id,
          process_id: process.id,
          product_id: productId,
          is_default: productId === defaultProductId,
        }))

      if (productProcessUpserts.length > 0) {
        const { error: upsertProductProcessesError } = await supabase
          .from('product_processes')
          .upsert(productProcessUpserts, { onConflict: 'id' })

        if (upsertProductProcessesError) {
          throw upsertProductProcessesError
        }
      }

      const productProcessInserts = productIdsPayload
        .filter((productId) => !existingProductProcessMap.has(productId))
        .map((productId) => ({
          process_id: process.id,
          product_id: productId,
          is_default: productId === defaultProductId,
        }))

      if (productProcessInserts.length > 0) {
        const { error: insertProductProcessesError } = await supabase
          .from('product_processes')
          .insert(productProcessInserts)

        if (insertProductProcessesError) {
          throw insertProductProcessesError
        }
      }

      // Handle step-level quality parameters
      // For each step, handle its QPs
      for (const step of normalizedSteps) {
        if (!step.id) continue

        const stepQPs = step.qualityParameterIds || []
        const stepQPsPayload = stepQPs
          .map((value: number) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0)

        // Get existing QPs for this step
        const existingStepQPs = Array.from(stepQualityParameters.get(step.id) || [])

        // Delete QPs that were removed
        const qpsToDelete = existingStepQPs.filter((id) => !stepQPsPayload.includes(id))
        if (qpsToDelete.length > 0) {
          const { error: deleteStepQPsError } = await supabase
            .from('process_step_quality_parameters')
            .delete()
            .eq('process_step_id', step.id)
            .in('quality_parameter_id', qpsToDelete)

          if (deleteStepQPsError) {
            throw deleteStepQPsError
          }
        }

        // Insert new QPs
        const qpsToInsert = stepQPsPayload.filter((id) => !existingStepQPs.includes(id))
        if (qpsToInsert.length > 0) {
          const insertPayload = qpsToInsert.map((qpId: number) => ({
            process_step_id: step.id!,
            quality_parameter_id: qpId,
          }))

          const { error: insertStepQPsError } = await supabase
            .from('process_step_quality_parameters')
            .insert(insertPayload)

          if (insertStepQPsError) {
            throw insertStepQPsError
          }
        }
      }

      // Clean up QPs for deleted steps
      if (stepsToDelete.length > 0) {
        // QPs are automatically deleted via CASCADE, but we can verify
        const { error: cleanupError } = await supabase
          .from('process_step_quality_parameters')
          .delete()
          .in('process_step_id', stepsToDelete)

        // Ignore errors here as CASCADE should handle it, but log if needed
        if (cleanupError) {
          console.warn('Error cleaning up step QPs for deleted steps:', cleanupError)
        }
      }

      const processPayload = {
        code: formState.code.trim(),
        name: formState.name.trim(),
        product_ids: productIdsPayload,
      }

      const { data: updatedProcess, error: updateProcessError } = await supabase
        .from('processes')
        .update(processPayload)
        .eq('id', process.id)
        .select('id, code, name, created_at, updated_at, product_ids')
        .single()

      if (updateProcessError) {
        throw updateProcessError
      }

      toast.success('Process updated successfully.')

      if (updatedProcess) {
        setProcess(updatedProcess)
      }

      await fetchProcessData()
      // Refresh products list to exclude newly assigned products
      await fetchProducts()
      setIsEditModalOpen(false)
    } catch (saveError) {
      console.error('Error updating process', saveError)
      const errorMessage = saveError instanceof Error ? saveError.message : 'Unable to update process.'
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }
  const totalSteps = steps.length
  const qcSteps = useMemo(() => steps.filter((step: ProcessStep) => step.requires_qc).length, [steps])
  const uniqueLocations = useMemo(
    () => [...new Set(steps.map((step: ProcessStep) => step.default_location_name).filter(Boolean))] as string[],
    [steps],
  )
  const totalEstimatedDuration = useMemo(
    () =>
      steps.reduce(
        (acc: number, step: ProcessStep) =>
          acc + (typeof step.estimated_duration_hours === 'number' && Number.isFinite(step.estimated_duration_hours) ? step.estimated_duration_hours : 0),
        0,
      ),
    [steps],
  )
  const productLookup = useMemo(() => {
    const lookup = new Map<number, Product>()
    products.forEach((product: Product) => {
      if (Number.isInteger(product.id)) {
        lookup.set(product.id, product)
      }
    })
    return lookup
  }, [products])

  const assignedProducts = useMemo(() => {
    const baseAssignments =
      productProcesses.length > 0
        ? productProcesses.map((item: ProductProcess) => ({
            product_id: item.product_id,
            is_default: Boolean(item.is_default),
          }))
        : Array.isArray(process?.product_ids)
        ? process.product_ids.map((productId: number) => ({
            product_id: productId,
            is_default: false,
          }))
        : []

    return baseAssignments
      .map((assignment: { product_id: number; is_default: boolean }) => {
        const productInfo = productLookup.get(assignment.product_id)
        if (!productInfo) {
          return null
        }
        return {
          product_id: assignment.product_id,
          is_default: assignment.is_default,
          name: productInfo.name,
          sku: productInfo.sku,
        }
      })
      .filter((item): item is { product_id: number; is_default: boolean; name: string; sku: string | null } => item !== null)
  }, [productProcesses, process, productLookup])

  const qualityParameterLookup = useMemo(() => {
    const lookup = new Map<number, QualityParameter>()
    qualityParameters.forEach((qp: QualityParameter) => {
      if (Number.isInteger(qp.id)) {
        lookup.set(qp.id, qp)
      }
    })
    return lookup
  }, [qualityParameters])

  const getStepQualityParameters = useCallback(
    (stepId: number | null | undefined): QualityParameter[] => {
      if (!stepId) return []
      const qpIds = stepQualityParameters.get(stepId) || []
      return qpIds
        .map((id) => qualityParameterLookup.get(id))
        .filter((qp): qp is QualityParameter => qp !== undefined)
    },
    [stepQualityParameters, qualityParameterLookup],
  )

  if (loading) {
    return (
      <PageLayout
        title="Loading process…"
        activeItem="settings"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)} className="border-olive-light/40 text-olive hover:text-olive-dark">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-10 py-8"
      >
        <Spinner text="Loading process details..." />
      </PageLayout>
    )
  }

  if (error || !process) {
    return (
      <PageLayout title="Process Not Found" activeItem="settings">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <Layers className="h-12 w-12 text-olive" />
          <div>
            <h2 className="text-2xl font-semibold text-text-dark">
              {error ? 'Unable to load process' : 'Process not found'}
            </h2>
            <p className="mt-2 text-sm text-text-dark/70">
              {error
                ? 'We encountered a problem while loading this process. Please try again later.'
                : 'We couldn’t find the process you were looking for. It may have been removed or the URL is incorrect.'}
            </p>
          </div>
          <Button onClick={() => navigate(-1)} className="bg-olive hover:bg-olive-dark">
            Go back
          </Button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={`${process.name}`}
      activeItem="settings"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(-1)} className="border-olive-light/40 text-olive hover:text-olive-dark">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleOpenEditModal} className="bg-olive hover:bg-olive-dark text-white">
            Edit Process
          </Button>
        </div>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-6"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="bg-white border-olive-light/30">
            <CardHeader className="space-y-1 pb-2">
              <span className="inline-flex w-fit items-center rounded-full border border-olive-light/40 bg-olive-light/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {process.code}
              </span>
              <CardTitle className="text-2xl text-text-dark">{process.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
                <div className="text-sm font-medium text-text-dark/70">Created</div>
                <div className="mt-1 text-lg font-semibold text-text-dark">
                  {new Date(process.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
                <div className="text-sm font-medium text-text-dark/70">Total Steps</div>
                <div className="mt-1 text-lg font-semibold text-text-dark">{totalSteps}</div>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
                <div className="text-sm font-medium text-text-dark/70">Quality Checks</div>
                <div className="mt-1 text-lg font-semibold text-text-dark">{qcSteps}</div>
              </div>
              <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-3 sm:col-span-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-dark/70">Assigned Products</p>
                    <p className="text-xs text-text-dark/60">
                      {assignedProducts.length > 0
                        ? `${assignedProducts.length} product${assignedProducts.length === 1 ? '' : 's'}`
                        : 'No products assigned'}
                    </p>
                  </div>
                </div>
                {assignedProducts.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignedProducts.map((product) => (
                      <div
                        key={product.product_id}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-text-dark shadow-sm"
                      >
                        <span>{product.name}</span>
                        {product.is_default ? (
                          <span className="rounded-full bg-olive-light/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-olive-dark">
                            Default
                          </span>
                        ) : product.sku ? (
                          <span className="text-[10px] uppercase tracking-wide text-text-dark/50">
                            {product.sku}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-olive-light/40 bg-white py-4 text-center text-xs text-text-dark/50">
                    Assign products to this process to make it available in production workflows.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">Process Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 sm:grid-cols-2">
                {steps.map((step) => (
                  <li key={step.id} className="group relative rounded-lg border border-olive-light/30 bg-olive-light/10 p-4 transition-all duration-200 hover:border-olive/60 hover:bg-white hover:shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-olive px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">{`Step ${step.seq}`}</span>
                          <span className="text-xs font-mono uppercase tracking-wide text-text-dark/60">{step.step_code}</span>
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-text-dark">{step.step_name}</h3>
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-olive shadow-sm">
                        <Clock className="h-4 w-4" />
                        <span>{step.estimated_duration || '—'}</span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-text-dark/80">{step.description}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-olive-light/20 pt-3 text-sm text-text-dark/70">
                      <div className="flex items-center gap-2">
                        {step.requires_qc ? (
                          <>
                            <Shield className="h-4 w-4 text-olive" />
                            <span className="font-medium text-text-dark">Quality check required</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-olive" />
                            <span>Optional quality check</span>
                          </>
                        )}
                      </div>
                      {step.default_location_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-olive" />
                          <span>
                            Default location:{' '}
                            <span className="font-medium text-text-dark">{step.default_location_name}</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {(() => {
                      const stepQPs = getStepQualityParameters(step.id)
                      return stepQPs.length > 0 ? (
                        <div className="mt-3 border-t border-olive-light/20 pt-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                            <Shield className="h-3.5 w-3.5 text-olive" />
                            Quality Parameters
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {stepQPs.map((qp) => (
                              <div
                                key={qp.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-olive-light/40 bg-white px-2.5 py-1 text-xs font-medium text-text-dark shadow-sm"
                              >
                                <span className="font-mono text-[10px] uppercase tracking-wide text-olive-dark">
                                  {qp.code}
                                </span>
                                <span className="text-text-dark/80">{qp.name}</span>
                                {qp.specification && (
                                  <span className="text-[10px] text-text-dark/50">({qp.specification})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null
                    })()}
                  </li>
                ))}
              </ol>

              {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-text-dark/60">
                  <Layers className="h-10 w-10" />
                  <div>
                    <p className="font-medium text-text-dark">No steps defined yet</p>
                    <p className="text-sm">Add steps to this process to see them listed here.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="border-olive-light/30 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
                <div>
                  <p className="text-sm font-medium text-text-dark/70">Requires QC</p>
                  <p className="mt-1 text-lg font-semibold text-text-dark">
                    {qcSteps > 0 ? `${qcSteps} of ${totalSteps} steps` : 'No steps'}
                  </p>
                </div>
                <Shield className="h-8 w-8 text-olive" />
              </div>
              <div className="rounded-lg border border-olive-light/30 p-3">
                <p className="text-sm font-medium text-text-dark/70">Default locations used</p>
                <ul className="mt-2 space-y-1 text-sm text-text-dark">
                  {uniqueLocations.map((location) => (
                    <li key={location} className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-olive" />
                      <span>{location}</span>
                    </li>
                  ))}
                  {steps.every((step) => !step.default_location_name) && (
                    <li className="text-text-dark/60">No default locations configured.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-olive-light/30 p-3">
                <p className="text-sm font-medium text-text-dark/70">Estimated duration</p>
                <p className="mt-1 text-lg font-semibold text-text-dark">
                  {steps.length > 0 && totalEstimatedDuration > 0 ? `${totalEstimatedDuration.toFixed(1)}h` : '—'}
                </p>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-olive-light/20 p-4 sm:p-6">
              <div>
                <h2 className="text-2xl font-bold text-text-dark">Edit Process</h2>
                <p className="text-sm text-text-dark/70 mt-1">Step {currentEditStep} of 2</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseEditModal}
                className="text-text-dark hover:bg-olive-light/10"
                disabled={isSaving}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            {/* Progress Indicator */}
            <div className="border-b border-olive-light/20 px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${currentEditStep >= 1 ? 'bg-olive text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {currentEditStep > 1 ? '✓' : '1'}
                  </div>
                  <span className={`text-sm font-medium ${currentEditStep >= 1 ? 'text-text-dark' : 'text-text-dark/60'}`}>Basic Information</span>
                </div>
                <div className="flex-1 h-0.5 mx-4 bg-olive-light/30">
                  <div className={`h-full transition-all ${currentEditStep >= 2 ? 'bg-olive w-full' : 'bg-transparent w-0'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${currentEditStep >= 2 ? 'bg-olive text-white' : 'bg-gray-200 text-gray-600'}`}>
                    2
                  </div>
                  <span className={`text-sm font-medium ${currentEditStep >= 2 ? 'text-text-dark' : 'text-text-dark/60'}`}>Process Steps</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveChanges} className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Step 1: Basic Information */}
              {currentEditStep === 1 && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="process_code">
                        Process Code<span className="text-red-500"> *</span>
                      </Label>
                      <Input
                        id="process_code"
                        value={formState.code}
                        readOnly
                        required
                        className="bg-olive-light/10 text-text-dark/80"
                      />
                      <p className="text-xs text-text-dark/60">
                        Process code cannot be changed
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="process_name">
                        Process Name<span className="text-red-500"> *</span>
                      </Label>
                      <Input
                        id="process_name"
                        value={formState.name}
                        onChange={(event) => handleFormFieldChange('name', event.target.value)}
                        required
                        className="bg-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-text-dark">
                      Products (Raw Materials Only) <span className="text-red-500">*</span>
                    </Label>
                    {productsLoading ? (
                      <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                        Loading products…
                      </div>
                    ) : productsError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {productsError.message ?? 'Unable to load products.'}
                      </div>
                    ) : products.length === 0 ? (
                      <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                        No available raw products. All raw products have been assigned to other processes, or no raw products exist. Add new raw products before configuring a process.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-olive-light/30 bg-olive-light/5">
                        <div className="border-b border-olive-light/20 p-2">
                          <Input
                            type="text"
                            placeholder="Search products by name or SKU..."
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                            className="bg-white text-sm"
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {(() => {
                            // Filter products by search term
                            const filteredProducts = productSearchTerm.trim()
                              ? products.filter((product) => {
                                  const name = (product.name || '').toLowerCase()
                                  const sku = (product.sku || '').toLowerCase()
                                  const search = productSearchTerm.toLowerCase()
                                  return name.includes(search) || sku.includes(search)
                                })
                              : products

                            // Sort: selected products first, then by name
                            const sortedProducts = [...filteredProducts].sort((a, b) => {
                              const aSelected = formState.productIds.includes(a.id)
                              const bSelected = formState.productIds.includes(b.id)
                              if (aSelected && !bSelected) return -1
                              if (!aSelected && bSelected) return 1
                              return (a.name || '').localeCompare(b.name || '')
                            })

                            if (sortedProducts.length === 0) {
                              return (
                                <div className="px-3 py-4 text-center text-sm text-text-dark/60">
                                  No products found matching "{productSearchTerm}"
                                </div>
                              )
                            }

                            return (
                              <ul className="divide-y divide-olive-light/20">
                                {sortedProducts.map((product) => {
                                  const isSelected = formState.productIds.includes(product.id)
                                  return (
                                    <li key={product.id}>
                                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition-colors hover:bg-white">
                                        <input
                                          type="checkbox"
                                          className="mt-1 h-4 w-4 rounded border-input text-olive focus:ring-olive"
                                          checked={isSelected}
                                          onChange={() => handleToggleProductSelection(product.id)}
                                        />
                                        <div>
                                          <p className="font-medium text-text-dark">{product.name}</p>
                                          <p className="text-xs uppercase tracking-wide text-text-dark/60">
                                            {product.sku || 'No SKU'}
                                          </p>
                                        </div>
                                      </label>
                                    </li>
                                  )
                                })}
                              </ul>
                            )
                          })()}
                        </div>
                      </div>
                    )}
                    {Array.isArray(formState.productIds) && formState.productIds.length > 0 && (
                      <p className="text-xs text-text-dark/60">
                        {formState.productIds.length} product{formState.productIds.length === 1 ? '' : 's'} selected
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Process Steps */}
              {currentEditStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-3 pt-4 border-t border-olive-light/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold text-text-dark">Process Steps</Label>
                    </div>

                {formState.steps.length === 0 ? (
                  <div className="space-y-3">
                    <p className="py-2 text-sm italic text-text-dark/60">No steps configured. Click "Add Step" to begin.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddStep}
                      className="border-olive-light/30"
                    >
                      Add Step
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formState.steps.map((step, index) => (
                      <div
                        key={step.clientId}
                        className="space-y-4 rounded-lg border border-olive-light/30 bg-olive-light/10 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-dark">Step {index + 1}</span>
                            {step.id ? (
                              <span className="rounded-full border border-olive-light/40 bg-white px-2 py-0.5 text-xs text-text-dark/70">
                                ID {step.id}
                              </span>
                            ) : (
                              <span className="rounded-full border border-olive-light/40 bg-white px-2 py-0.5 text-xs text-olive">
                                New
                              </span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveStep(step.clientId)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`step_code_${step.clientId}`}>Step Code</Label>
                            <Input
                              id={`step_code_${step.clientId}`}
                              value={generateStepCode(index + 1)}
                              readOnly
                              className="bg-olive-light/10 text-text-dark/80"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`step_name_${step.clientId}`}>
                              Step Name<span className="text-red-500"> *</span>
                            </Label>
                            <select
                              id={`step_name_${step.clientId}`}
                              value={step.step_name_id || ''}
                              onChange={(event) =>
                                handleStepFieldChange(step.clientId, 'step_name_id', event.target.value ? Number(event.target.value) : null)
                              }
                              required
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <option value="">Select step name</option>
                              {processStepNames.map((stepName: ProcessStepName) => (
                                <option key={stepName.id} value={stepName.id}>
                                  {stepName.name} ({stepName.code})
                                </option>
                              ))}
                            </select>
                            {processStepNamesLoading && (
                              <p className="mt-1 text-xs text-text-dark/60">Loading step names…</p>
                            )}
                            {processStepNames.length === 0 && !processStepNamesLoading && (
                              <p className="mt-1 text-xs text-text-dark/60">
                                No step names available. <a href="/settings/process-step-names" className="text-olive hover:underline">Add step names</a> first.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor={`step_location_${step.clientId}`}>Default Location</Label>
                          <select
                            id={`step_location_${step.clientId}`}
                            value={step.default_location_id}
                            onChange={(event) =>
                              handleStepFieldChange(step.clientId, 'default_location_id', event.target.value)
                            }
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <option value="">Select location</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                          {warehousesLoading && (
                            <p className="mt-1 text-xs text-text-dark/60">Loading locations…</p>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Estimated Duration</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                type="number"
                                min="0"
                                value={step.duration_hours}
                                onChange={(event) =>
                                  handleStepFieldChange(step.clientId, 'duration_hours', event.target.value)
                                }
                                placeholder="Hours"
                                className="bg-white"
                              />
                              <Input
                                type="number"
                                min="0"
                                max="59"
                                value={step.duration_minutes}
                                onChange={(event) =>
                                  handleStepFieldChange(step.clientId, 'duration_minutes', event.target.value)
                                }
                                placeholder="Minutes"
                                className="bg-white"
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-sm text-text-dark">
                              <input
                                type="checkbox"
                                checked={step.requires_qc}
                                onChange={(event) =>
                                  handleToggleStepCheckbox(step.clientId, 'requires_qc', event.target.checked)
                                }
                                className="h-4 w-4 rounded border-input text-olive focus:ring-olive"
                              />
                              Requires Quality Check
                            </label>
                            <label className="flex items-center gap-2 text-sm text-text-dark">
                              <input
                                type="checkbox"
                                checked={step.can_be_skipped}
                                onChange={(event) =>
                                  handleToggleStepCheckbox(step.clientId, 'can_be_skipped', event.target.checked)
                                }
                                className="h-4 w-4 rounded border-input text-olive focus:ring-olive"
                              />
                              Can be Skipped
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2 border-t border-olive-light/20 pt-3">
                          <Label className="text-sm font-medium text-text-dark">
                            Quality Parameters
                          </Label>
                          {qualityParametersLoading ? (
                            <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                              Loading quality parameters…
                            </div>
                          ) : qualityParameters.length === 0 ? (
                            <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                              No quality parameters available. Add quality parameters in settings first.
                            </div>
                          ) : (
                            <>
                              <div className="rounded-lg border border-olive-light/30 bg-olive-light/5">
                                <div className="border-b border-olive-light/20 p-2">
                                  <Input
                                    type="text"
                                    placeholder="Search quality parameters..."
                                    value={qualityParameterSearchTerms[step.clientId] || ''}
                                    onChange={(event) => {
                                      setQualityParameterSearchTerms(prev => ({
                                        ...prev,
                                        [step.clientId]: event.target.value
                                      }))
                                    }}
                                    className="bg-white text-sm h-8"
                                  />
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {(() => {
                                    const searchTerm = (qualityParameterSearchTerms[step.clientId] || '').toLowerCase()
                                    const filteredQPs = searchTerm
                                      ? qualityParameters.filter((qp) => {
                                          const name = (qp.name || '').toLowerCase()
                                          const code = (qp.code || '').toLowerCase()
                                          const spec = (qp.specification || '').toLowerCase()
                                          return name.includes(searchTerm) || code.includes(searchTerm) || spec.includes(searchTerm)
                                        })
                                      : qualityParameters
                                    
                                    // Sort: selected parameters first, then by name
                                    const sortedQPs = [...filteredQPs].sort((a, b) => {
                                      const aSelected = step.qualityParameterIds.includes(a.id)
                                      const bSelected = step.qualityParameterIds.includes(b.id)
                                      if (aSelected && !bSelected) return -1
                                      if (!aSelected && bSelected) return 1
                                      return (a.name || '').localeCompare(b.name || '')
                                    })
                                    
                                    if (sortedQPs.length === 0) {
                                      return (
                                        <div className="px-3 py-4 text-center text-sm text-text-dark/60">
                                          No quality parameters found matching "{qualityParameterSearchTerms[step.clientId]}"
                                        </div>
                                      )
                                    }
                                    
                                    return (
                                      <ul className="divide-y divide-olive-light/20">
                                        {sortedQPs.map((qp) => {
                                          const isSelected = step.qualityParameterIds.includes(qp.id)
                                          return (
                                            <li key={qp.id}>
                                              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition-colors hover:bg-white">
                                                <input
                                                  type="checkbox"
                                                  className="mt-1 h-4 w-4 rounded border-input text-olive focus:ring-olive"
                                                  checked={isSelected}
                                                  onChange={() =>
                                                    handleToggleStepQualityParameter(step.clientId, qp.id)
                                                  }
                                                />
                                                <div className="flex-1">
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs uppercase tracking-wide text-olive-dark">
                                                      {qp.code}
                                                    </span>
                                                    <span className="font-medium text-text-dark">{qp.name}</span>
                                                  </div>
                                                  {qp.specification && (
                                                    <p className="mt-1 text-xs text-text-dark/60">
                                                      {qp.specification}
                                                    </p>
                                                  )}
                                                </div>
                                              </label>
                                            </li>
                                          )
                                        })}
                                      </ul>
                                    )
                                  })()}
                                </div>
                              </div>
                            </>
                          )}
                          {Array.isArray(step.qualityParameterIds) && step.qualityParameterIds.length > 0 && (
                            <p className="text-xs text-text-dark/60">
                              {step.qualityParameterIds.length} quality parameter
                              {step.qualityParameterIds.length === 1 ? '' : 's'} selected
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddStep}
                        className="border-olive-light/30"
                      >
                        Add Step
                      </Button>
                    </div>
                  </div>
                )}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="mt-6 flex flex-col gap-3 border-t border-olive-light/20 pt-6 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  {currentEditStep === 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBackEditStep}
                      className="border-olive-light/30"
                      disabled={isSaving}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseEditModal}
                    className="border-olive-light/30"
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
                <Button 
                  type="submit" 
                  className="bg-olive hover:bg-olive-dark" 
                  disabled={isSaving}
                >
                  {currentEditStep === 1 ? 'Next' : isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default ProcessDetail


