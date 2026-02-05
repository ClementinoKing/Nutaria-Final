import { useCallback, useEffect, useMemo, useState, FormEvent, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, X, Minus, Eye, Layers } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { PostgrestError } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/spinner'
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
import { useQualityParameters, type QualityParameter } from '@/hooks/useQualityParameters'
import { useProcessStepNames, type ProcessStepName } from '@/hooks/useProcessStepNames'

interface Process {
  id: number
  code: string
  name: string
  created_at: string
  product_ids: number[]
  step_count: number
}

interface Warehouse {
  id: number
  name: string
}

interface Product {
  id: number
  sku: string | null
  name: string
  product_type: 'RAW' | 'WIP' | 'FINISHED' | null
}

interface FormStep {
  id: number
  seq: number
  step_code: string
  step_name_id: number | null
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

const generateStepCode = (sequence: number): string => `STEP-${String(sequence).padStart(2, '0')}`

function buildIntervalString(hoursValue: number | null | undefined, minutesValue: number | null | undefined): string | null {
  const hoursNumberRaw = typeof hoursValue === 'number' && Number.isFinite(hoursValue) ? hoursValue : 0
  const minutesNumberRaw = typeof minutesValue === 'number' && Number.isFinite(minutesValue) ? minutesValue : 0
  const hoursNumber = Math.max(0, Math.floor(hoursNumberRaw))
  const minutesNumber = Math.max(0, Math.floor(minutesNumberRaw))
  
  if (hoursNumber === 0 && minutesNumber === 0) {
    return null
  }
  
  const parts: string[] = []
  if (hoursNumber > 0) {
    parts.push(`${hoursNumber} hour${hoursNumber !== 1 ? 's' : ''}`)
  }
  if (minutesNumber > 0) {
    parts.push(`${minutesNumber} minute${minutesNumber !== 1 ? 's' : ''}`)
  }
  return parts.join(' ')
}

const findCommonPrefix = (productNames: string[]): string => {
  if (productNames.length === 0) {
    return ''
  }
  
  if (productNames.length === 1) {
    const name = productNames[0]
    return name ? name.trim() : ''
  }
  
  // Split each product name into words
  const wordArrays = productNames
    .map(name => name.trim().split(/\s+/).filter(w => w.length > 0))
    .filter((arr): arr is string[] => arr.length > 0)
  
  if (wordArrays.length === 0) {
    return ''
  }
  
  const firstArray = wordArrays[0]
  if (!firstArray || firstArray.length === 0) {
    return ''
  }
  
  // Find common words from the start
  const commonWords: string[] = []
  
  for (let i = 0; i < firstArray.length; i++) {
    const word = firstArray[i]
    if (!word) {
      break
    }
    
    const isCommon = wordArrays.every(arr => {
      if (!arr || arr.length <= i) {
        return false
      }
      const arrWord = arr[i]
      return arrWord !== undefined && arrWord.toLowerCase() === word.toLowerCase()
    })
    
    if (isCommon) {
      commonWords.push(word)
    } else {
      break
    }
  }
  
  return commonWords.join(' ')
}

const generateProcessCode = (commonPrefix: string): string => {
  if (!commonPrefix || !commonPrefix.trim()) {
    return ''
  }
  
  // Split by spaces
  const words = commonPrefix.trim().split(/\s+/).filter(w => w.length > 0)
  
  if (words.length === 0) {
    return ''
  }
  
  const firstWord = words[0]
  if (!firstWord) {
    return ''
  }
  
  // Take first 3 letters of first word, then first letter of each subsequent word
  const firstWordAbbr: string = firstWord.toUpperCase().slice(0, 3)
  const otherLetters = words.slice(1)
    .map(word => word?.charAt(0).toUpperCase() || '')
    .filter(letter => letter.length > 0)
    .join('')
  
  const abbreviation = (firstWordAbbr + otherLetters).slice(0, 4) // Limit to 4 characters max
  
  return `PROC-${abbreviation}`
}

const generateProcessName = (commonPrefix: string): string => {
  if (!commonPrefix || !commonPrefix.trim()) {
    return ''
  }
  
  return `${commonPrefix.trim()} Processing`
}

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value)
  if (!date) {
    return '—'
  }
  return dateFormatter.format(date)
}

function Processes() {
  const [processes, setProcesses] = useState<Process[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehousesLoading, setWarehousesLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState<PostgrestError | null>(null)
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [qualityParameterSearchTerms, setQualityParameterSearchTerms] = useState<Record<number, string>>({})
  const { qualityParameters, loading: qualityParametersLoading } = useQualityParameters()
  const { processStepNames, loading: processStepNamesLoading } = useProcessStepNames()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingProcessId, setDeletingProcessId] = useState<number | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [processToDelete, setProcessToDelete] = useState<Process | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [formData, setFormData] = useState<FormState>({
    code: '',
    name: '',
    productIds: [],
    steps: []
  })
  const navigate = useNavigate()

  const fetchProcesses = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('processes')
      .select('id, code, name, product_ids, created_at, steps:process_steps(count)')
      .order('created_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Error fetching processes', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load processes from Supabase.')
      setProcesses([])
      setLoading(false)
      return
    }

    const normalizedProcesses: Process[] = Array.isArray(data)
      ? data.map((process: any) => ({
          id: process.id,
          code: process.code,
          name: process.name,
          created_at: process.created_at,
          product_ids: Array.isArray(process.product_ids)
            ? process.product_ids.filter((value: number) => Number.isInteger(value) && value > 0)
            : [],
          step_count: Array.isArray(process.steps) && process.steps.length > 0
            ? Number((process.steps[0] as { count?: number })?.count ?? 0)
            : 0,
        }))
      : []

    setProcesses(normalizedProcesses)
    setLoading(false)
  }, [])

  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true)

    const { data, error: fetchError } = await supabase
      .from('warehouses')
      .select('id, name')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('Error fetching warehouses for processes form', fetchError)
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
      console.error('Error fetching products for processes form', productsError)
      toast.error(productsError.message ?? 'Unable to load products from Supabase.')
      setProducts([])
      setProductsError(productsError)
      setProductsLoading(false)
      return
    }

    // Fetch products that already have processes assigned
    const { data: assignedProductsData, error: assignedError } = await supabase
      .from('product_processes')
      .select('product_id')

    if (assignedError) {
      console.error('Error fetching assigned products', assignedError)
      // Continue even if this fails - we'll just show all products
    }

    // Get list of product IDs that are already assigned
    const assignedProductIds = new Set<number>()
    if (Array.isArray(assignedProductsData)) {
      assignedProductsData.forEach((item: { product_id: number }) => {
        if (item.product_id && Number.isInteger(item.product_id)) {
          assignedProductIds.add(item.product_id)
        }
      })
    }

    // Filter out products that are already assigned to a process
    const availableProducts = Array.isArray(productsData)
      ? productsData.filter((product: Product) => !assignedProductIds.has(product.id))
      : []

    setProducts(availableProducts)
    setProductsLoading(false)
  }, [])

  useEffect(() => {
    fetchProcesses()
  }, [fetchProcesses])

  useEffect(() => {
    fetchWarehouses()
  }, [fetchWarehouses])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const productLookup = useMemo(() => {
    const lookup = new Map<number, Product>()
    products.forEach((product: Product) => {
      if (Number.isInteger(product.id)) {
        lookup.set(product.id, product)
      }
    })
    return lookup
  }, [products])

  const filteredProducts = useMemo(() => {
    if (!productSearchTerm.trim()) {
      return products
    }
    const term = productSearchTerm.toLowerCase()
    return products.filter(
      (product: Product) =>
        product.name.toLowerCase().includes(term) ||
        (product.sku && product.sku.toLowerCase().includes(term))
    )
  }, [products, productSearchTerm])

  const handleOpenModal = () => {
    setCurrentStep(1)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setIsSubmitting(false)
    setCurrentStep(1)
    setProductSearchTerm('')
    setQualityParameterSearchTerms({})
    setFormData({
      code: '',
      name: '',
      productIds: [],
      steps: []
    })
  }

  const performDeleteProcess = useCallback(
    async (process: Process) => {
      if (!process?.id) return
      setDeletingProcessId(process.id)
      try {
        const { error: lotRunsError } = await supabase
          .from('process_lot_runs')
          .delete()
          .eq('process_id', process.id)
        if (lotRunsError) throw lotRunsError

        const { error: productProcessesError } = await supabase
          .from('product_processes')
          .delete()
          .eq('process_id', process.id)
        if (productProcessesError) throw productProcessesError

        const { error: stepsError } = await supabase
          .from('process_steps')
          .delete()
          .eq('process_id', process.id)
        if (stepsError) throw stepsError

        const { error: processError } = await supabase
          .from('processes')
          .delete()
          .eq('id', process.id)
        if (processError) throw processError

        toast.success('Process deleted.')
        setProcesses((prev) => prev.filter((p) => p.id !== process.id))
      } catch (err) {
        const msg = (err as PostgrestError)?.message ?? 'Unable to delete process.'
        toast.error(msg)
      } finally {
        setDeletingProcessId(null)
      }
    },
    []
  )

  const requestDeleteProcess = useCallback((process: Process) => {
    setProcessToDelete(process)
    setDeleteAlertOpen(true)
  }, [])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleAddStep = () => {
    const newStep: FormStep = {
      id: Date.now(), // temporary ID for React key
      seq: formData.steps.length + 1,
      step_code: generateStepCode(formData.steps.length + 1),
      step_name_id: null,
      requires_qc: false,
      can_be_skipped: false,
      default_location_id: '',
      duration_hours: '',
      duration_minutes: '',
      qualityParameterIds: []
    }
    setFormData(prev => ({
      ...prev,
      steps: [...prev.steps, newStep]
    }))
  }

  const handleRemoveStep = (stepId: number) => {
    const updatedSteps = formData.steps
      .filter((step: FormStep) => step.id !== stepId)
      .map((step: FormStep, index: number) => ({
        ...step,
        seq: index + 1,
        step_code: generateStepCode(index + 1)
      }))
    setFormData(prev => ({
      ...prev,
      steps: updatedSteps
    }))
  }

  const handleToggleProductSelection = (productId: number) => {
    setFormData((prev) => {
      const productIdNumber = Number(productId)
      if (!Number.isInteger(productIdNumber) || productIdNumber <= 0) {
        return prev
      }

      const exists = prev.productIds.includes(productIdNumber)
      const newProductIds = exists
        ? prev.productIds.filter((id: number) => id !== productIdNumber)
        : [...prev.productIds, productIdNumber]

      // Auto-generate code and name from selected products
      let newCode = ''
      let newName = ''
      
      if (newProductIds.length > 0) {
        // Get all selected product names
        const selectedProductNames = newProductIds
          .map(id => products.find((p: Product) => p.id === id))
          .filter((p): p is Product => p !== undefined)
          .map(p => p.name)
          .filter((name): name is string => !!name)
        
        if (selectedProductNames.length > 0) {
          // Find common prefix from all selected products
          const commonPrefix = findCommonPrefix(selectedProductNames)
          if (commonPrefix) {
            newCode = generateProcessCode(commonPrefix)
            newName = generateProcessName(commonPrefix)
          }
        }
      }

      return {
        ...prev,
        productIds: newProductIds,
        code: newCode,
        name: newName,
      }
    })
  }

  const handleToggleStepQualityParameter = (stepId: number, qualityParameterId: number) => {
    setFormData((prev) => {
      const qpIdNumber = Number(qualityParameterId)
      if (!Number.isInteger(qpIdNumber) || qpIdNumber <= 0) {
        return prev
      }

      return {
        ...prev,
        steps: prev.steps.map((step: FormStep) => {
          if (step.id !== stepId) return step
          
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

  const handleStepChange = (stepId: number, field: keyof FormStep, value: string | boolean | number | null) => {
    if (field === 'step_code' || field === 'qualityParameterIds') {
      return
    }
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map((step: FormStep) =>
        step.id === stepId ? { ...step, [field]: value } : step
      )
    }))
  }

  const validateStep1 = (): boolean => {
    if (!Array.isArray(formData.productIds) || formData.productIds.length === 0) {
      toast.error('Please select at least one product for this process.')
      return false
    }

    const trimmedCode = formData.code.trim()
    const trimmedName = formData.name.trim()

    if (!trimmedCode || !trimmedName) {
      toast.error('Please select a product to generate process code and name.')
      return false
    }

    return true
  }

  const validateStep2 = (): boolean => {
    if (formData.steps.length === 0) {
      toast.error('Please add at least one process step.')
      return false
    }

    const invalidSteps = formData.steps.filter(
      (step: FormStep) => !step.step_name_id || step.step_name_id <= 0
    )
    if (invalidSteps.length > 0) {
      toast.error('Please select a step name for each step.')
      return false
    }

    return true
  }

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2)
      }
    }
  }

  const handleBackStep = () => {
    if (currentStep === 2) {
      setCurrentStep(1)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    // Validate current step before submission
    if (currentStep === 1) {
      if (!validateStep1()) {
        return
      }
      handleNextStep()
      return
    }

    if (currentStep === 2) {
      if (!validateStep2()) {
        return
      }
    }

    setIsSubmitting(true)
    try {
      const productIdsPayload = Array.isArray(formData.productIds)
        ? formData.productIds
            .map((value: number) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0)
        : []

      const processPayload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        product_ids: productIdsPayload
      }

      const { data: insertedProcess, error: insertProcessError } = await supabase
        .from('processes')
        .insert(processPayload)
        .select('id, code, name, created_at')
        .single()

      if (insertProcessError) {
        throw insertProcessError
      }

      if (productIdsPayload.length > 0 && insertedProcess) {
        const productProcessesPayload = productIdsPayload.map((productId: number, index: number) => ({
          product_id: productId,
          process_id: insertedProcess.id,
          is_default: index === 0,
        }))

        const { error: productProcessError } = await supabase
          .from('product_processes')
          .insert(productProcessesPayload)

        if (productProcessError) {
          await supabase.from('processes').delete().eq('id', insertedProcess.id)
          throw productProcessError
        }
      }

      if (Array.isArray(formData.steps) && formData.steps.length > 0 && insertedProcess) {
        const stepsPayload = formData.steps.map((step: FormStep, index: number) => {
          const hoursInput = (step.duration_hours ?? '').trim()
          const minutesInput = (step.duration_minutes ?? '').trim()
          const hoursValue = hoursInput === '' ? null : Number(hoursInput)
          const minutesValue = minutesInput === '' ? null : Number(minutesInput)
          const intervalString = buildIntervalString(
            hoursValue ?? 0,
            minutesValue ?? 0,
          )
          
          return {
            process_id: insertedProcess.id,
            seq: index + 1,
            step_name_id: step.step_name_id ? Number(step.step_name_id) : null,
            description: null,
            requires_qc: Boolean(step.requires_qc),
            can_be_skipped: Boolean(step.can_be_skipped),
            default_location_id: step.default_location_id ? Number(step.default_location_id) : null,
            estimated_duration: intervalString,
          }
        })

        const { data: insertedSteps, error: insertStepsError } = await supabase
          .from('process_steps')
          .insert(stepsPayload)
          .select('id, seq')

        if (insertStepsError) {
          // Attempt to roll back the created process and product mappings for consistency
          await supabase.from('product_processes').delete().eq('process_id', insertedProcess.id)
          await supabase.from('processes').delete().eq('id', insertedProcess.id)
          throw insertStepsError
        }

        // Insert quality parameters for each step
        if (insertedSteps && Array.isArray(insertedSteps)) {
          const stepQualityParametersPayload: Array<{ process_step_id: number; quality_parameter_id: number }> = []
          
          formData.steps.forEach((step: FormStep, index: number) => {
            const insertedStep = insertedSteps[index]
            if (insertedStep && step.qualityParameterIds && step.qualityParameterIds.length > 0) {
              const qpIds = step.qualityParameterIds
                .map((value: number) => Number(value))
                .filter((value: number) => Number.isInteger(value) && value > 0)
              
              qpIds.forEach((qpId: number) => {
                stepQualityParametersPayload.push({
                  process_step_id: insertedStep.id,
                  quality_parameter_id: qpId,
                })
              })
            }
          })

          if (stepQualityParametersPayload.length > 0) {
            const { error: insertStepQPsError } = await supabase
              .from('process_step_quality_parameters')
              .insert(stepQualityParametersPayload)

            if (insertStepQPsError) {
              // Roll back everything if step QP insertion fails
              await supabase.from('process_steps').delete().eq('process_id', insertedProcess.id)
              await supabase.from('product_processes').delete().eq('process_id', insertedProcess.id)
              await supabase.from('processes').delete().eq('id', insertedProcess.id)
              throw insertStepQPsError
            }
          }
        }
      }

      toast.success('Process added successfully.')
      if (insertedProcess) {
        setProcesses((previous: Process[]) => [
          {
            ...insertedProcess,
            product_ids: productIdsPayload,
            step_count: formData.steps.length,
          },
          ...previous,
        ])
      }
      handleCloseModal()
      // Refresh products list to exclude newly assigned products
      await fetchProducts()
    } catch (submitError) {
      console.error('Error creating process', submitError)
      const errorMessage = submitError instanceof Error ? submitError.message : 'Unable to add process.'
      toast.error(errorMessage)
      setIsSubmitting(false)
    } finally {
      fetchProcesses()
    }
  }

  const emptyStateLabel = useMemo(() => {
    if (loading) {
      return 'Loading processes…'
    }
    if (error) {
      return 'Unable to load processes.'
    }
    return 'No processes found.'
  }, [error, loading])

  const handleViewProcess = useCallback(
    (processId: number) => {
      if (!processId) {
        return
      }
      navigate(`/process/processes/${processId}`)
    },
    [navigate],
  )


  if (loading || warehousesLoading || productsLoading || qualityParametersLoading || processStepNamesLoading) {
    return (
      <PageLayout
        title="Factory Processes"
        activeItem="settings"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading processes..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Factory Processes"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="h-4 w-4 mr-2" />
          New Process
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Factory Processes</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load processes from Supabase.'}
            </div>
          ) : null}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`process-skeleton-${index}`}
                  className="animate-pulse rounded-xl border border-olive-light/40 bg-olive-light/10 p-6"
                >
                  <div className="h-3 w-20 rounded-full bg-olive-light/60" />
                  <div className="mt-4 h-5 w-3/4 rounded-full bg-olive-light/50" />
                  <div className="mt-6 flex gap-3">
                    <div className="h-8 w-20 rounded-lg bg-olive-light/60" />
                    <div className="h-8 w-20 rounded-lg bg-olive-light/60" />
                  </div>
                </div>
              ))}
            </div>
          ) : processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-text-dark/60">
              <Layers className="h-10 w-10 text-olive" />
              <div>
                <p className="text-base font-medium text-text-dark">Nothing to show yet</p>
                <p className="text-sm">{emptyStateLabel}</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {processes.map((process: Process) => {
                const assignedProducts = Array.isArray(process.product_ids)
                  ? process.product_ids
                      .map((productId: number) => productLookup.get(productId))
                      .filter((product): product is Product => product !== undefined)
                  : []

                return (
                  <div
                    key={process.id}
                    className="group flex h-full flex-col justify-between rounded-xl border border-olive-light/40 bg-white p-6 shadow-sm transition-all duration-200 hover:border-olive hover:shadow-lg"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex items-center rounded-full border border-olive/40 bg-olive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                          {process.code}
                        </span>
                        <span className="rounded-full bg-olive-light/30 px-3 py-1 text-xs font-semibold text-olive-dark">
                          {process.step_count} {process.step_count === 1 ? 'step' : 'steps'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark group-hover:text-olive-dark">
                          {process.name}
                        </h3>
                        <p className="mt-2 text-sm text-text-dark/60">
                          Created {formatDate(process.created_at)}
                        </p>
                      </div>
                      <div className="mt-2 rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                          Products
                        </p>
                        {assignedProducts.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {assignedProducts.slice(0, 3).map((product: Product) => (
                              <span
                                key={product.id}
                                className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-text-dark shadow-sm"
                              >
                                {product.name}
                              </span>
                            ))}
                            {assignedProducts.length > 3 && (
                              <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-olive-dark shadow-sm">
                                +{assignedProducts.length - 3} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-text-dark/50">No products assigned.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-olive hover:bg-olive-light/20 hover:text-olive-dark"
                        onClick={() => handleViewProcess(process.id)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          requestDeleteProcess(process)
                        }}
                        disabled={deletingProcessId === process.id}
                      >
                        {deletingProcessId === process.id ? (
                          'Deleting…'
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setProcessToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete process?</AlertDialogTitle>
            <AlertDialogDescription>
              {processToDelete
                ? `Delete process "${processToDelete.name || processToDelete.code || 'Unknown'}"? This will remove the process and its steps. This cannot be undone.`
                : 'This will remove the process and its steps. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => processToDelete && performDeleteProcess(processToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Process Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-olive-light/20 p-4 sm:p-6">
              <div>
                <h2 className="text-2xl font-bold text-text-dark">Add New Process</h2>
                <p className="text-sm text-text-dark/70 mt-1">Step {currentStep} of 2</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
                disabled={isSubmitting}
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            {/* Progress Indicator */}
            <div className="border-b border-olive-light/20 px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${currentStep >= 1 ? 'bg-olive text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {currentStep > 1 ? '✓' : '1'}
                  </div>
                  <span className={`text-sm font-medium ${currentStep >= 1 ? 'text-text-dark' : 'text-text-dark/60'}`}>Basic Information</span>
                </div>
                <div className="flex-1 h-0.5 mx-4 bg-olive-light/30">
                  <div className={`h-full transition-all ${currentStep >= 2 ? 'bg-olive w-full' : 'bg-transparent w-0'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${currentStep >= 2 ? 'bg-olive text-white' : 'bg-gray-200 text-gray-600'}`}>
                    2
                  </div>
                  <span className={`text-sm font-medium ${currentStep >= 2 ? 'text-text-dark' : 'text-text-dark/60'}`}>Process Steps</span>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Step 1: Basic Information */}
              {currentStep === 1 && (
                <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-text-dark">
                    Select Product (Raw Materials Only) <span className="text-red-500">*</span>
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
                      No available raw products. All raw products have been assigned to processes, or no raw products exist. Add new raw products before creating processes.
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
                        {filteredProducts.length === 0 ? (
                          <div className="px-3 py-4 text-center text-sm text-text-dark/60">
                            No products found matching "{productSearchTerm}"
                          </div>
                        ) : (
                          <ul className="divide-y divide-olive-light/20">
                            {filteredProducts.map((product: Product) => {
                              const isSelected = formData.productIds.includes(product.id)
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
                        )}
                      </div>
                    </div>
                  )}
                  {Array.isArray(formData.productIds) && formData.productIds.length > 0 && (
                    <p className="text-xs text-text-dark/60">
                      {formData.productIds.length} product{formData.productIds.length === 1 ? '' : 's'} selected
                    </p>
                  )}
                </div>

                {formData.productIds.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="code" className="text-text-dark">
                        Process Code <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="code"
                        name="code"
                        type="text"
                        value={formData.code}
                        onChange={handleInputChange}
                        className="bg-olive-light/10 text-text-dark/80"
                        required
                        readOnly
                      />
                      <p className="text-xs text-text-dark/60">
                        Auto-generated from selected product
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-text-dark">
                        Process Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="bg-white"
                        required
                      />
                      <p className="text-xs text-text-dark/60">
                        Auto-generated from selected product(s), but can be edited
                      </p>
                    </div>
                  </>
                )}
              </div>
              )}

              {/* Step 2: Process Steps */}
              {currentStep === 2 && (
                <div className="space-y-4">
                <div className="space-y-3 pt-4 border-t border-olive-light/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-text-dark text-base font-semibold">
                      Process Steps
                    </Label>
                    <Button
                      type="button"
                      onClick={handleAddStep}
                      variant="outline"
                      size="sm"
                      className="border-olive-light/30"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  </div>

                  {formData.steps.length === 0 ? (
                    <p className="text-sm text-text-dark/60 italic py-2">
                      No steps added. Click "Add Step" to create process steps.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {formData.steps.map((step: FormStep, index: number) => (
                        <div
                          key={step.id}
                          className="bg-olive-light/5 border border-olive-light/20 rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-text-dark">
                                Step {step.seq}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveStep(step.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Step Code
                              </Label>
                              <Input
                                type="text"
                                value={generateStepCode(index + 1)}
                                readOnly
                                className="bg-olive-light/10 text-sm text-text-dark/80"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Step Name <span className="text-red-500">*</span>
                              </Label>
                              <select
                                value={step.step_name_id || ''}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  handleStepChange(step.id, 'step_name_id', e.target.value ? Number(e.target.value) : null)
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                required
                              >
                                <option value="">Select step name</option>
                                {processStepNames.map((stepName: ProcessStepName) => (
                                  <option key={stepName.id} value={stepName.id}>
                                    {stepName.name} ({stepName.code})
                                  </option>
                                ))}
                              </select>
                              {processStepNamesLoading && (
                                <p className="text-xs text-text-dark/60 mt-1">Loading step names…</p>
                              )}
                              {processStepNames.length === 0 && !processStepNamesLoading && (
                                <p className="text-xs text-text-dark/60 mt-1">
                                  No step names available. <a href="/settings/process-step-names" className="text-olive hover:underline">Add step names</a> first.
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Default Location
                              </Label>
                              <select
                                value={step.default_location_id}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                  handleStepChange(step.id, 'default_location_id', e.target.value)
                                }
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              >
                                <option value="">Select location</option>
                                {warehouses.map((warehouse: Warehouse) => (
                                  <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name}
                                  </option>
                                ))}
                              </select>
                              {warehousesLoading && (
                                <p className="text-xs text-text-dark/60 mt-1">Loading locations…</p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs text-text-dark">
                                Estimated Duration
                              </Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Hours"
                                  value={step.duration_hours}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    handleStepChange(step.id, 'duration_hours', e.target.value)
                                  }
                                  className="bg-white text-sm"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  max="59"
                                  placeholder="Minutes"
                                  value={step.duration_minutes}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    handleStepChange(step.id, 'duration_minutes', e.target.value)
                                  }
                                  className="bg-white text-sm"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1 flex items-end">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`requires_qc_${step.id}`}
                                  checked={step.requires_qc}
                                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    handleStepChange(step.id, 'requires_qc', e.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-input text-olive focus:ring-olive"
                                />
                                <Label
                                  htmlFor={`requires_qc_${step.id}`}
                                  className="text-xs text-text-dark cursor-pointer"
                                >
                                  Requires Quality Check
                                </Label>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`can_be_skipped_${step.id}`}
                              checked={step.can_be_skipped}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                handleStepChange(step.id, 'can_be_skipped', e.target.checked)
                              }
                              className="h-4 w-4 rounded border-input text-olive focus:ring-olive"
                            />
                            <Label
                              htmlFor={`can_be_skipped_${step.id}`}
                              className="text-xs text-text-dark cursor-pointer"
                            >
                              Can be Skipped
                            </Label>
                          </div>

                          {/* Quality Parameters for this step */}
                          <div className="space-y-2 pt-2 border-t border-olive-light/20">
                            <Label className="text-xs text-text-dark font-medium">
                              Quality Parameters (Optional)
                            </Label>
                            {qualityParametersLoading ? (
                              <p className="text-xs text-text-dark/60">Loading quality parameters…</p>
                            ) : qualityParameters.length === 0 ? (
                              <p className="text-xs text-text-dark/60">No quality parameters available.</p>
                            ) : (
                              <>
                                <div className="rounded-lg border border-olive-light/30 bg-olive-light/5">
                                  <div className="border-b border-olive-light/20 p-2">
                                    <Input
                                      type="text"
                                      placeholder="Search quality parameters..."
                                      value={qualityParameterSearchTerms[step.id] || ''}
                                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        setQualityParameterSearchTerms(prev => ({
                                          ...prev,
                                          [step.id]: e.target.value
                                        }))
                                      }}
                                      className="bg-white text-xs h-8"
                                    />
                                  </div>
                                  <div className="max-h-40 overflow-y-auto">
                                    {(() => {
                                      const searchTerm = (qualityParameterSearchTerms[step.id] || '').toLowerCase()
                                      const filteredQPs = searchTerm
                                        ? qualityParameters.filter((qp: QualityParameter) => {
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
                                          <div className="px-3 py-4 text-center text-xs text-text-dark/60">
                                            No quality parameters found matching "{qualityParameterSearchTerms[step.id]}"
                                          </div>
                                        )
                                      }
                                      
                                      return (
                                        <ul className="divide-y divide-olive-light/20">
                                          {sortedQPs.map((qp: QualityParameter) => {
                                            const isSelected = step.qualityParameterIds.includes(qp.id)
                                            return (
                                              <li key={qp.id}>
                                                <label className="flex cursor-pointer items-start gap-2 px-2 py-1.5 text-xs transition-colors hover:bg-white">
                                                  <input
                                                    type="checkbox"
                                                    className="mt-0.5 h-3.5 w-3.5 rounded border-input text-olive focus:ring-olive"
                                                    checked={isSelected}
                                                    onChange={() => handleToggleStepQualityParameter(step.id, qp.id)}
                                                  />
                                                  <div className="flex-1">
                                                    <p className="font-medium text-text-dark">{qp.name}</p>
                                                    <p className="text-xs text-text-dark/60">{qp.code}</p>
                                                    {qp.specification && (
                                                      <p className="text-xs text-text-dark/50 mt-0.5">
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
                            {step.qualityParameterIds.length > 0 && (
                              <p className="text-xs text-text-dark/60">
                                {step.qualityParameterIds.length} quality parameter{step.qualityParameterIds.length === 1 ? '' : 's'} selected
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Modal Footer */}
              <div className="mt-6 flex flex-col gap-3 border-t border-olive-light/20 pt-6 sm:flex-row sm:justify-between">
                <div className="flex gap-3">
                  {currentStep === 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBackStep}
                      className="border-olive-light/30"
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCloseModal}
                    className="border-olive-light/30"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </div>
                <Button 
                  type="submit" 
                  className="bg-olive hover:bg-olive-dark" 
                  disabled={isSubmitting}
                >
                  {currentStep === 1 ? 'Next' : isSubmitting ? 'Creating…' : 'Create Process'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Processes

