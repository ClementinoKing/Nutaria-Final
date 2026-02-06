import { useEffect, useMemo, useState, ChangeEvent, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Plus, Edit, Trash2, X, Camera, Search } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { toast } from 'sonner'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useSupplierTypes } from '@/hooks/useSupplierTypes'
import { useDocumentTypes } from '@/hooks/useDocumentTypes'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
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
import { CameraCapture } from '@/components/CameraCapture'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  DEFAULT_COUNTRY_DIAL_CODE,
  getAllCountryOptions,
  getCountryDialCodeOptions,
  getDialCodeForCountryName,
  withCountryOption,
} from '@/lib/countries'

interface Supplier {
  id: string
  name: string
  supplier_type?: string | null
  phone?: string | null
  email?: string | null
  country?: string | null
  address?: string | null
  primary_contact_name?: string | null
  primary_contact_email?: string | null
  primary_contact_phone?: string | null
  [key: string]: unknown
}

interface DocumentTypeEntry {
  clientId: string
  document_type_code: string
  expiryDate: string
  files: File[]
}

interface SupplierFormData {
  name: string
  supplier_type: string
  phone: string
  email: string
  country: string
  address: string
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_phone: string
  supplier_age: string
  gender: string
  number_of_employees: string
  number_of_dependants: string
  bank: string
  account_number: string
  branch: string
  proof_of_residence: File[]
  documents: DocumentTypeEntry[]
}

interface FormErrors {
  fields: Record<string, string>
  documents: Record<string, string>
  proof_of_residence: string | null
}

interface FormStep {
  id: string
  title: string
  description: string
  fieldKeys: string[]
  includeProofOfResidence?: boolean
  includeDocuments?: boolean
}

const BANK_OPTIONS = [
  { value: '', label: 'Select a bank' },
  { value: 'Capitec Bank', label: 'Capitec Bank' },
  { value: 'Standard Bank', label: 'Standard Bank' },
  { value: 'First National Bank (FNB)', label: 'First National Bank (FNB)' },
  { value: 'Absa Bank', label: 'Absa Bank' },
  { value: 'Nedbank', label: 'Nedbank' },
  { value: 'Discovery Bank', label: 'Discovery Bank' },
  { value: 'TymeBank', label: 'TymeBank' },
  { value: 'African Bank', label: 'African Bank' },
  { value: 'Investec Bank', label: 'Investec Bank' },
  { value: 'Bidvest Bank', label: 'Bidvest Bank' },
  { value: 'Sasfin Bank', label: 'Sasfin Bank' },
  { value: 'Ubank', label: 'Ubank' },
  { value: 'Albaraka Bank', label: 'Albaraka Bank' },
  { value: 'HBZ Bank', label: 'HBZ Bank' },
  { value: 'Access Bank South Africa', label: 'Access Bank South Africa' },
]

const createUniqueId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`

const createDocumentTypeEntry = (): DocumentTypeEntry => ({
  clientId: createUniqueId('doc'),
  document_type_code: '',
  expiryDate: '',
  files: [],
})

const createEmptyFormErrors = (): FormErrors => ({
  fields: {},
  documents: {},
  proof_of_residence: null,
})

const hasValidationErrors = (errors: FormErrors): boolean =>
  Object.keys(errors.fields).length > 0 ||
  Object.keys(errors.documents).length > 0 ||
  Boolean(errors.proof_of_residence)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isValidEmail = (value: string): boolean => emailPattern.test(value)

const requiredText = (value: string | null | undefined): string => value?.trim() ?? ''

const optionalText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const optionalInteger = (value: string | number | null | undefined): number | null => {
  const trimmed = value?.toString().trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isNaN(parsed) ? null : parsed
}

const formatPreviewFileSize = (size: number | null | undefined): string | null => {
  if (typeof size !== 'number') {
    return null
  }
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const createDefaultSupplier = (): SupplierFormData => ({
  name: '',
  supplier_type: '',
  phone: '',
  email: '',
  country: 'South Africa',
  address: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  supplier_age: '',
  gender: '',
  number_of_employees: '',
  number_of_dependants: '',
  bank: '',
  account_number: '',
  branch: '',
  proof_of_residence: [],
  documents: [createDocumentTypeEntry()],
})


const SUPPLIER_FORM_STEPS: FormStep[] = [
  {
    id: 'basic',
    title: 'Basic Information',
    description: 'Capture the supplier profile and high-level details.',
    fieldKeys: ['name', 'supplier_type', 'country', 'phone', 'email', 'address'],
  },
  {
    id: 'additional',
    title: 'Additional Details',
    description: 'Add contact people and demographics.',
    fieldKeys: [
      'primary_contact_name',
      'primary_contact_phone',
      'primary_contact_email',
      'supplier_age',
      'gender',
      'number_of_employees',
      'number_of_dependants',
      'bank',
      'account_number',
      'branch',
    ],
    includeProofOfResidence: true,
  },
  {
    id: 'documents',
    title: 'Documents',
    description: 'Upload key documents and certifications.',
    fieldKeys: [],
    includeDocuments: true,
  },
]

function Suppliers() {
  const BULK_NO_CHANGE = '__NO_CHANGE__'
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const { supplierTypes, loading: loadingTypes } = useSupplierTypes()
  const { documentTypes, loading: loadingDocumentTypes } = useDocumentTypes()
  const { user } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<SupplierFormData>(createDefaultSupplier())
  const [phoneDialCode, setPhoneDialCode] = useState(DEFAULT_COUNTRY_DIAL_CODE)
  const [primaryContactPhoneDialCode, setPrimaryContactPhoneDialCode] = useState(DEFAULT_COUNTRY_DIAL_CODE)
  const [formErrors, setFormErrors] = useState<FormErrors>(createEmptyFormErrors())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingSupplierId, setDeletingSupplierId] = useState<string | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const [cameraModalOpen, setCameraModalOpen] = useState(false)
  const [cameraForDocument, setCameraForDocument] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterCountry, setFilterCountry] = useState<string>('')
  const [expiredDocCountBySupplierId, setExpiredDocCountBySupplierId] = useState<Record<string, number>>({})
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkDeleteAlertOpen, setBulkDeleteAlertOpen] = useState(false)
  const [bulkEditSupplierType, setBulkEditSupplierType] = useState(BULK_NO_CHANGE)
  const [bulkEditCountry, setBulkEditCountry] = useState(BULK_NO_CHANGE)
  const [isBulkActionSubmitting, setIsBulkActionSubmitting] = useState(false)
  const totalSteps = SUPPLIER_FORM_STEPS.length
  const currentStepIndex = Math.min(activeStep, totalSteps - 1)
  const currentStep = SUPPLIER_FORM_STEPS[currentStepIndex]
  const isLastStep = currentStepIndex === totalSteps - 1
  const isFirstStep = currentStepIndex === 0
  const navigate = useNavigate()

  const supplierTypeOptions = useMemo(
    () => supplierTypes.map((t) => ({ value: t.code, label: t.name })),
    [supplierTypes]
  )
  const typeNameMap = useMemo(
    () => new Map(supplierTypes.map((t) => [t.code, t.name])),
    [supplierTypes]
  )
  const countryOptions = useMemo(() => getAllCountryOptions('South Africa'), [])
  const dialCodeOptions = useMemo(() => getCountryDialCodeOptions(), [])
  const supplierCountryOptions = useMemo(
    () => withCountryOption(countryOptions, formData.country),
    [countryOptions, formData.country]
  )

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 250)

    return () => window.clearTimeout(handle)
  }, [searchQuery])

  const supplierQuery = useMemo(
    () => ({
      searchQuery: debouncedSearchQuery,
      filterType,
      filterCountry,
      page,
      pageSize,
    }),
    [debouncedSearchQuery, filterType, filterCountry, page, pageSize]
  )

  const {
    suppliers,
    loading: loadingSuppliers,
    error: suppliersError,
    totalCount,
    refresh: refreshSuppliers,
  } = useSuppliers(supplierQuery)

  const documentTypeOptions = useMemo(
    () => [
      { value: '', label: 'Select a type' },
      ...documentTypes.map((t) => ({ value: t.code, label: t.name })),
    ],
    [documentTypes]
  )

  const documentTypeMap = useMemo(
    () => new Map(documentTypes.map((t) => [t.code, t])),
    [documentTypes]
  )
  const selectedSupplierIdSet = useMemo(() => new Set(selectedSupplierIds), [selectedSupplierIds])
  const selectedSupplierCount = selectedSupplierIds.length
  const currentPageSupplierIds = useMemo(
    () => suppliers.map((supplier) => String(supplier.id)).filter((id) => id !== 'undefined' && id !== 'null'),
    [suppliers]
  )
  const allCurrentPageSelected =
    currentPageSupplierIds.length > 0 &&
    currentPageSupplierIds.every((supplierId) => selectedSupplierIdSet.has(supplierId))

  const genderOptions = [
    { value: '', label: 'Select gender' },
    { value: 'MALE', label: 'Male' },
    { value: 'FEMALE', label: 'Female' },
  ]

  useEffect(() => {
    if (suppliersError) {
      toast.error(suppliersError.message ?? 'Unable to load suppliers from Supabase.')
    }
  }, [suppliersError])

  useEffect(() => {
    if (suppliers.length === 0) {
      setExpiredDocCountBySupplierId({})
      return
    }
    const supplierIds = suppliers.map((s) => s.id).filter((id): id is string => id != null)
    if (supplierIds.length === 0) {
      setExpiredDocCountBySupplierId({})
      return
    }
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('documents')
      .select('owner_id')
      .eq('owner_type', 'supplier')
      .in('owner_id', supplierIds)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', today)
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load expired document counts', error)
          setExpiredDocCountBySupplierId({})
          return
        }
        const countByOwnerId: Record<string, number> = {}
        supplierIds.forEach((id) => {
          countByOwnerId[String(id)] = 0
        })
        ;(data ?? []).forEach((row: { owner_id?: string | number }) => {
          const id = row.owner_id != null ? String(row.owner_id) : ''
          if (id && countByOwnerId[id] !== undefined) {
            countByOwnerId[id] += 1
          }
        })
        setExpiredDocCountBySupplierId(countByOwnerId)
      })
  }, [suppliers])

  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) {
        setProfileId(null)
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('Unable to load user profile id', error)
        setProfileId(null)
        return
      }

      setProfileId(data?.id ?? null)
    }

    loadProfile()
  }, [user?.id])

  const resetFormState = (overrides?: Partial<SupplierFormData>) => {
    const nextFormData = { ...createDefaultSupplier(), ...overrides }
    const nextDialCode = getDialCodeForCountryName(nextFormData.country || 'South Africa')
    setFormData(nextFormData)
    setPhoneDialCode(nextDialCode)
    setPrimaryContactPhoneDialCode(nextDialCode)
    setFormErrors(createEmptyFormErrors())
    setIsSubmitting(false)
    setActiveStep(0)
  }

  const filterErrorsForStep = (errors: FormErrors, step: FormStep): FormErrors | null => {
    if (!errors) {
      return null
    }

    const filtered = createEmptyFormErrors()

    step.fieldKeys?.forEach((field: string) => {
      if (errors.fields[field]) {
        filtered.fields[field] = errors.fields[field]
      }
    })

    if (step.includeDocuments) {
      filtered.documents = errors.documents
    }
    if (step.includeProofOfResidence) {
      filtered.proof_of_residence = errors.proof_of_residence
    }

    return hasValidationErrors(filtered) ? filtered : null
  }

  const handleSupplierClick = (supplier: Supplier) => {
    navigate(`/suppliers-customers/suppliers/${supplier.id}`)
  }

  const handleOpenModal = () => {
    resetFormState({ supplier_type: supplierTypes[0]?.code ?? '' })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    resetFormState()
  }

  const handleEditSupplier = (supplier: Supplier) => {
    if (!supplier?.id) return
    navigate(`/suppliers-customers/suppliers/${supplier.id}/edit`)
  }

  const performDeleteSupplier = async (supplier: Supplier) => {
    if (!supplier?.id) return
    setDeletingSupplierId(supplier.id)
    try {
      const { error: docsError } = await supabase
        .from('documents')
        .delete()
        .eq('owner_type', 'supplier')
        .eq('owner_id', supplier.id)

      if (docsError) {
        console.warn('Failed to delete supplier documents', docsError)
      }

      const { error: deleteError } = await supabase.from('suppliers').delete().eq('id', supplier.id)
      if (deleteError) {
        throw deleteError
      }

      await refreshSuppliers()
      toast.success(`Supplier "${supplier.name}" removed`)
      setDeleteAlertOpen(false)
      setSupplierToDelete(null)
    } catch (error) {
      console.error('Error deleting supplier', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to delete supplier.'
      toast.error(errorMessage)
    } finally {
      setDeletingSupplierId(null)
    }
  }

  const handleDeleteSupplier = (supplier: Supplier) => {
    if (!supplier?.id) return
    setSupplierToDelete(supplier)
    setDeleteAlertOpen(true)
  }

  const handleToggleSupplierSelection = (supplierId: string, checked: boolean) => {
    setSelectedSupplierIds((prev) => {
      if (checked) {
        if (prev.includes(supplierId)) {
          return prev
        }
        return [...prev, supplierId]
      }
      return prev.filter((id) => id !== supplierId)
    })
  }

  const handleToggleSelectAllCurrentPage = (checked: boolean) => {
    setSelectedSupplierIds((prev) => {
      if (checked) {
        const merged = new Set(prev)
        currentPageSupplierIds.forEach((supplierId) => merged.add(supplierId))
        return Array.from(merged)
      }
      return prev.filter((id) => !currentPageSupplierIds.includes(id))
    })
  }

  const handleClearSelection = () => {
    setSelectedSupplierIds([])
  }

  const openBulkEditModal = () => {
    setBulkEditSupplierType(BULK_NO_CHANGE)
    setBulkEditCountry(BULK_NO_CHANGE)
    setBulkEditModalOpen(true)
  }

  const closeBulkEditModal = () => {
    setBulkEditModalOpen(false)
    setBulkEditSupplierType(BULK_NO_CHANGE)
    setBulkEditCountry(BULK_NO_CHANGE)
  }

  const handleBulkEdit = async () => {
    if (selectedSupplierCount === 0) {
      toast.error('Select at least one supplier.')
      return
    }

    const payload: Record<string, unknown> = {}
    if (bulkEditSupplierType !== BULK_NO_CHANGE) {
      payload.supplier_type = bulkEditSupplierType
    }
    if (bulkEditCountry !== BULK_NO_CHANGE) {
      payload.country = bulkEditCountry
    }

    if (Object.keys(payload).length === 0) {
      toast.error('Choose at least one field to update.')
      return
    }

    setIsBulkActionSubmitting(true)
    try {
      const { error } = await supabase.from('suppliers').update(payload).in('id', selectedSupplierIds)
      if (error) {
        throw error
      }
      await refreshSuppliers()
      toast.success(`Updated ${selectedSupplierCount} supplier${selectedSupplierCount === 1 ? '' : 's'}.`)
      closeBulkEditModal()
      handleClearSelection()
    } catch (error) {
      console.error('Error bulk updating suppliers', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to bulk update suppliers.'
      toast.error(errorMessage)
    } finally {
      setIsBulkActionSubmitting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedSupplierCount === 0) {
      toast.error('Select at least one supplier.')
      return
    }

    setIsBulkActionSubmitting(true)
    try {
      const { error: docsError } = await supabase
        .from('documents')
        .delete()
        .eq('owner_type', 'supplier')
        .in('owner_id', selectedSupplierIds)

      if (docsError) {
        console.warn('Failed to delete supplier documents in bulk', docsError)
      }

      const { error: deleteError } = await supabase.from('suppliers').delete().in('id', selectedSupplierIds)
      if (deleteError) {
        throw deleteError
      }

      await refreshSuppliers()
      toast.success(`Deleted ${selectedSupplierCount} supplier${selectedSupplierCount === 1 ? '' : 's'}.`)
      setBulkDeleteAlertOpen(false)
      handleClearSelection()
    } catch (error) {
      console.error('Error bulk deleting suppliers', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to bulk delete suppliers.'
      toast.error(errorMessage)
    } finally {
      setIsBulkActionSubmitting(false)
    }
  }

  const clearFieldError = (field: string) => {
    setFormErrors((prev) => {
      if (!prev.fields[field]) {
        return prev
      }
      const nextFields = { ...prev.fields }
      delete nextFields[field]
      return { ...prev, fields: nextFields }
    })
  }

  const clearDocumentError = (clientId: string) => {
    setFormErrors((prev) => {
      if (!prev.documents[clientId]) {
        return prev
      }
      const nextDocuments = { ...prev.documents }
      delete nextDocuments[clientId]
      return { ...prev, documents: nextDocuments }
    })
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target
    const target = event.target as HTMLInputElement
    const nextValue = type === 'checkbox' ? target.checked : value

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
    clearFieldError(name)
  }

  const handleSupplierTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target
    setFormData((prev) => ({
      ...prev,
      supplier_type: value
    }))
    clearFieldError('supplier_type')
  }

  const handleCountryChange = (value: string) => {
    const dialCode = getDialCodeForCountryName(value)
    setFormData((prev) => ({
      ...prev,
      country: value,
    }))
    setPhoneDialCode(dialCode)
    setPrimaryContactPhoneDialCode(dialCode)
    clearFieldError('country')
  }

  const formatPhoneForStorage = (dialCode: string, localPhone: string): string | null => {
    const trimmed = localPhone.trim()
    if (!trimmed) return null
    const withoutExistingPrefix = trimmed.replace(/^\+\d+\s*/, '')
    return `${dialCode} ${withoutExistingPrefix}`.trim()
  }

  const handleDocumentTypeChange = (clientId: string, value: string) => {
    setFormData((prev) => {
      const docType = documentTypeMap.get(value)
      const requiresExpiry = docType?.has_expiry_date ?? false
      return {
        ...prev,
        documents: prev.documents.map((entry) =>
          entry.clientId === clientId
            ? {
                ...entry,
                document_type_code: value,
                expiryDate: requiresExpiry ? entry.expiryDate : '',
              }
            : entry
        ),
      }
    })
    clearDocumentError(clientId)
  }

  const handleDocumentExpiryChange = (clientId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((entry) =>
        entry.clientId === clientId ? { ...entry, expiryDate: value } : entry
      ),
    }))
    clearDocumentError(clientId)
  }

  const handleDocumentFilesChange = (clientId: string, fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((entry) =>
        entry.clientId === clientId ? { ...entry, files } : entry
      ),
    }))
    clearDocumentError(clientId)
  }

  const handleAddDocumentType = () => {
    setFormData((prev) => ({
      ...prev,
      documents: [...prev.documents, createDocumentTypeEntry()],
    }))
  }

  const handleRemoveDocumentType = (clientId: string) => {
    setFormData((prev) => {
      const remaining = prev.documents.filter((entry) => entry.clientId !== clientId)
      return {
        ...prev,
        documents: remaining.length > 0 ? remaining : [createDocumentTypeEntry()],
      }
    })
    clearDocumentError(clientId)
  }

  const handleOpenCamera = (clientId: string) => {
    setCameraForDocument(clientId)
    setCameraModalOpen(true)
  }

  const handleCameraCapture = (file: File) => {
    if (!cameraForDocument) return

    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((entry) =>
        entry.clientId === cameraForDocument
          ? { ...entry, files: [...entry.files, file] }
          : entry
      ),
    }))
    clearDocumentError(cameraForDocument)
    setCameraModalOpen(false)
    setCameraForDocument(null)
  }

  const handleCloseCamera = () => {
    setCameraModalOpen(false)
    setCameraForDocument(null)
  }

  const clearProofOfResidenceError = () => {
    setFormErrors((prev) => ({
      ...prev,
      proof_of_residence: null,
    }))
  }

  const handleProofOfResidenceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    setFormData((prev) => ({
      ...prev,
      proof_of_residence: files.slice(0, 1) as File[],
    }))
    clearProofOfResidenceError()
  }

  const removeProofOfResidence = () => {
    setFormData((prev) => ({
      ...prev,
      proof_of_residence: [],
    }))
    clearProofOfResidenceError()
  }

  const validateForm = (data: SupplierFormData): FormErrors | null => {
    const errors = createEmptyFormErrors()

    if (!data.name || !data.name.trim()) {
      errors.fields.name = 'Supplier name is required.'
    }

    if (!data.supplier_type || !data.supplier_type.trim()) {
      errors.fields.supplier_type = 'Supplier type is required.'
    }

    if (!data.phone || !data.phone.trim()) {
      errors.fields.phone = 'Phone is required.'
    }

    const trimmedEmail = data.email?.trim()
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      errors.fields.email = 'Enter a valid email address.'
    }

    const trimmedPrimaryEmail = data.primary_contact_email?.trim()
    if (trimmedPrimaryEmail && !isValidEmail(trimmedPrimaryEmail)) {
      errors.fields.primary_contact_email = 'Enter a valid email address.'
    }

    const integerFieldValidations = [
      { field: 'supplier_age', label: 'Supplier age' },
      { field: 'number_of_employees', label: 'Number of employees' },
      { field: 'number_of_dependants', label: 'Number of dependants' },
    ] as const

    integerFieldValidations.forEach(({ field, label }) => {
      const rawValue = data[field as keyof SupplierFormData]
      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return
      }

      const parsed = Number.parseInt(String(rawValue), 10)
      if (Number.isNaN(parsed) || parsed < 0) {
        errors.fields[field] = `${label} must be a positive number.`
      }
    })

    data.documents.forEach((entry) => {
      const trimmedCode = entry.document_type_code?.trim() ?? ''
      const hasFiles = entry.files.length > 0
      const expiry = entry.expiryDate ? entry.expiryDate.toString().trim() : ''
      const docType = trimmedCode ? documentTypeMap.get(trimmedCode) : null
      const requiresExpiry = docType?.has_expiry_date ?? false

      if (trimmedCode && !hasFiles) {
        errors.documents[entry.clientId] = 'Upload at least one file for this type.'
      } else if (!trimmedCode && hasFiles) {
        errors.documents[entry.clientId] = 'Select a document type for the uploaded files.'
      } else if (hasFiles && requiresExpiry && !expiry) {
        errors.documents[entry.clientId] = 'Provide an expiry date for this document type.'
      }
    })

    return hasValidationErrors(errors) ? errors : null
  }

  const handleFinalSubmit = async () => {
    if (!user?.id) {
      toast.error('You need to be signed in to create suppliers.')
      return
    }

    setFormErrors(createEmptyFormErrors())
    setIsSubmitting(true)

    const payload = {
      name: requiredText(formData.name),
      supplier_type: requiredText(formData.supplier_type),
      primary_contact_name: optionalText(formData.primary_contact_name),
      phone: formatPhoneForStorage(phoneDialCode, formData.phone) ?? requiredText(formData.phone),
      email: optionalText(formData.email),
      country: optionalText(formData.country),
      address: optionalText(formData.address),
      primary_contact_phone: formatPhoneForStorage(primaryContactPhoneDialCode, formData.primary_contact_phone),
      supplier_age: optionalInteger(formData.supplier_age),
      gender: optionalText(formData.gender),
      number_of_employees: optionalInteger(formData.number_of_employees),
      number_of_dependants: optionalInteger(formData.number_of_dependants),
      bank: optionalText(formData.bank),
      account_number: optionalText(formData.account_number),
      branch: optionalText(formData.branch),
    }

    try {
      const { data, error: insertError } = await supabase.from('suppliers').insert(payload).select().single()

      if (insertError) {
        throw insertError
      }

      const documentRows = formData.documents
        .filter((entry) => entry.document_type_code && entry.files.length > 0)
        .flatMap((entry) => {
          const docType = documentTypeMap.get(entry.document_type_code)
          const requiresExpiry = docType?.has_expiry_date ?? false
          return entry.files.map((file) => ({
            owner_type: 'supplier',
            owner_id: data.id,
            name: file.name,
            document_type_code: entry.document_type_code,
            doc_type: entry.document_type_code,
            storage_path: `suppliers/${data.id}/${requiresExpiry ? 'certificates/' : ''}${file.name}`,
            expiry_date:
              requiresExpiry && entry.expiryDate && entry.expiryDate.toString().trim()
                ? entry.expiryDate
                : null,
            uploaded_by: profileId ?? null,
          }))
        })

      // For proof of residence, we need a document_type_code that exists in document_types table
      // Find a document type code for proof of residence, or use the first available one as fallback
      // Note: document_type_code is required (NOT NULL) and must reference document_types(code)
      const proofDocTypeCode = documentTypes.find(dt => 
        dt.code?.toUpperCase() === 'PROOF' || 
        dt.code?.toUpperCase() === 'PROOF_OF_RESIDENCE' ||
        dt.name?.toLowerCase().includes('proof') ||
        dt.name?.toLowerCase().includes('residence')
      )?.code || documentTypes[0]?.code

      const proofRows = proofDocTypeCode 
        ? formData.proof_of_residence.map((file) => ({
            owner_type: 'supplier',
            owner_id: data.id,
            name: file.name,
            document_type_code: proofDocTypeCode,
            doc_type: 'PROOF_OF_RESIDENCE',
            storage_path: `suppliers/${data.id}/proof-of-residence/${file.name}`,
            uploaded_by: profileId ?? null
          }))
        : [] // Skip if no valid document type code found

      const rowsToInsert = [...documentRows, ...proofRows]

      if (rowsToInsert.length > 0) {
        const { error: docsError } = await supabase.from('documents').insert(rowsToInsert)
        if (docsError) {
          console.error('Error inserting supplier documents', docsError)
          toast.error('Supplier saved but documents failed to register.')
        }
      }

      toast.success('Supplier added')
      setPage(1)
      await refreshSuppliers({ page: 1 })
      resetFormState()
      setIsModalOpen(false)
    } catch (error) {
      console.error('Error creating supplier', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to create supplier in Supabase.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStepSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const validationErrors = validateForm(formData)

    if (validationErrors) {
      if (isLastStep) {
        setFormErrors(validationErrors)
        return
      }

      if (currentStep) {
        const stepErrors = filterErrorsForStep(validationErrors, currentStep)
        if (stepErrors) {
          setFormErrors(stepErrors)
          return
        }
      }

      setFormErrors(createEmptyFormErrors())
    } else {
      setFormErrors(createEmptyFormErrors())
    }

    if (isLastStep) {
      await handleFinalSubmit()
      return
    }

    setActiveStep((prev) => Math.min(prev + 1, totalSteps - 1))
  }

  const handleBack = () => {
    setFormErrors(createEmptyFormErrors())
    setActiveStep((prev) => Math.max(prev - 1, 0))
  }

  const primaryActionLabel = isLastStep
    ? isSubmitting
      ? 'Saving…'
      : 'Save Supplier'
    : 'Next Step'

  // Reset to page 1 when filters or suppliers list changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery, filterType, filterCountry])

  // Reset to page 1 when suppliers list changes
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [totalCount, pageSize, page])

  const columns = [
    {
      key: 'select',
      header: 'Select',
      headerClassName: 'w-14',
      cellClassName: 'w-14',
      render: (supplier: Supplier) => {
        const supplierId = String(supplier.id)
        return (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-olive-light/70 text-olive focus:ring-olive"
              checked={selectedSupplierIdSet.has(supplierId)}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => handleToggleSupplierSelection(supplierId, event.target.checked)}
              aria-label={`Select supplier ${supplier.name}`}
            />
          </div>
        )
      },
      mobileRender: (supplier: Supplier) => {
        const supplierId = String(supplier.id)
        return (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-olive-light/70 text-olive focus:ring-olive"
            checked={selectedSupplierIdSet.has(supplierId)}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => handleToggleSupplierSelection(supplierId, event.target.checked)}
            aria-label={`Select supplier ${supplier.name}`}
          />
        )
      },
      mobileValueClassName: 'flex justify-end',
    },
    {
      key: 'name',
      header: 'Name',
      accessor: 'name',
      cellClassName: 'font-medium text-text-dark',
    },
    {
      key: 'type',
      header: 'Type',
      render: (supplier: Supplier) =>
        typeNameMap.get(supplier.supplier_type ?? '') ?? supplier.supplier_type ?? '—',
      mobileRender: (supplier: Supplier) =>
        typeNameMap.get(supplier.supplier_type ?? '') ?? supplier.supplier_type ?? '—',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'contact',
      header: 'Primary Contact',
      render: (supplier: Supplier) => supplier.primary_contact_name || '-',
      mobileRender: (supplier: Supplier) => supplier.primary_contact_name || '-',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (supplier: Supplier) => supplier.phone || '-',
      mobileRender: (supplier: Supplier) => supplier.phone || '-',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'email',
      header: 'Email',
      render: (supplier: Supplier) => supplier.email || '-',
      mobileRender: (supplier: Supplier) => supplier.email || '-',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'country',
      header: 'Country',
      render: (supplier: Supplier) => supplier.country || '-',
      mobileRender: (supplier: Supplier) => supplier.country || '-',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'expired_docs',
      header: 'Expired docs',
      render: (supplier: Supplier) => {
        const count = expiredDocCountBySupplierId[String(supplier.id)] ?? 0
        if (count === 0) {
          return <span className="text-text-dark/50">0</span>
        }
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
            {count}
          </span>
        )
      },
      mobileRender: (supplier: Supplier) => {
        const count = expiredDocCountBySupplierId[String(supplier.id)] ?? 0
        if (count === 0) return '0'
        return String(count)
      },
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'flex w-full justify-end gap-2',
      render: (supplier: Supplier) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-olive-light/60 text-text-dark hover:bg-olive-light/40"
            onClick={(event) => {
              event.stopPropagation()
              handleEditSupplier(supplier)
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            disabled={deletingSupplierId === supplier.id}
            onClick={(event) => {
              event.stopPropagation()
              handleDeleteSupplier(supplier)
            }}
          >
            {deletingSupplierId === supplier.id ? (
              <span className="text-xs">Deleting…</span>
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ),
      mobileRender: (supplier: Supplier) => (
        <div className="flex w-full justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-olive-light/60 text-text-dark hover:bg-olive-light/40"
            onClick={(event) => {
              event.stopPropagation()
              handleEditSupplier(supplier)
            }}
          >
            <Edit className="mr-1 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            disabled={deletingSupplierId === supplier.id}
            onClick={(event) => {
              event.stopPropagation()
              handleDeleteSupplier(supplier)
            }}
          >
            {deletingSupplierId === supplier.id ? (
              <span className="text-xs">Deleting…</span>
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ),
    },
  ]

  if (loadingSuppliers && suppliers.length === 0) {
    return (
      <PageLayout
        title="Suppliers"
        activeItem="suppliersCustomers"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading suppliers..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Suppliers"
      activeItem="suppliersCustomers"
      actions={
        <Button onClick={handleOpenModal} className="bg-olive hover:bg-olive-dark">
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Suppliers</CardTitle>
          <CardDescription>Manage supplier information</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSuppliers ? (
            <div className="flex items-center justify-center py-16 text-sm text-text-dark/60">
              Loading suppliers from Supabase…
            </div>
          ) : (
            <>
              {/* Search and Filter Section */}
              <div className="mb-6 space-y-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  {/* Search Input */}
                  <div className="space-y-2 sm:col-span-3 lg:col-span-1">
                    <Label htmlFor="search-suppliers" className="text-sm font-medium text-text-dark">
                      Search
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
                      <Input
                        id="search-suppliers"
                        type="text"
                        placeholder="Search by name, email, phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 border-olive-light/60 focus-visible:ring-olive"
                      />
                    </div>
                  </div>

                  {/* Type Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="filter-type" className="text-sm font-medium text-text-dark">
                      Type
                    </Label>
                    <SearchableSelect
                      id="filter-type"
                      options={[
                        { value: '', label: 'All Types' },
                        ...supplierTypeOptions,
                      ]}
                      value={filterType}
                      onChange={(value) => setFilterType(value)}
                      placeholder="Select type"
                      disabled={loadingTypes}
                    />
                  </div>

                  {/* Country Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="filter-country" className="text-sm font-medium text-text-dark">
                      Country
                    </Label>
                    <SearchableSelect
                      id="filter-country"
                      options={[
                        { value: '', label: 'All Countries' },
                        ...countryOptions,
                      ]}
                      value={filterCountry}
                      onChange={(value) => setFilterCountry(value)}
                      placeholder="Select country"
                      disabled={loadingTypes}
                    />
                  </div>
                </div>

              {/* Active Filters Display */}
              {(searchQuery || filterType || filterCountry) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-text-dark/60">Active filters:</span>
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-olive-light/30 px-2 py-1 text-xs text-text-dark">
                        Search: {searchQuery}
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="hover:text-red-600"
                          aria-label="Clear search"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {filterType && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-olive-light/30 px-2 py-1 text-xs text-text-dark">
                        Type: {typeNameMap.get(filterType) || filterType}
                        <button
                          type="button"
                          onClick={() => setFilterType('')}
                          className="hover:text-red-600"
                          aria-label="Clear type filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {filterCountry && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-olive-light/30 px-2 py-1 text-xs text-text-dark">
                        Country: {filterCountry}
                        <button
                          type="button"
                          onClick={() => setFilterCountry('')}
                          className="hover:text-red-600"
                          aria-label="Clear country filter"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('')
                        setFilterType('')
                        setFilterCountry('')
                      }}
                      className="h-6 text-xs text-text-dark/60 hover:text-text-dark"
                    >
                      Clear all
                    </Button>
                  </div>
                )}
              </div>

              <div className="mb-4 rounded-lg border border-olive-light/40 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-text-dark/70">
                    {selectedSupplierCount > 0
                      ? `${selectedSupplierCount} supplier${selectedSupplierCount === 1 ? '' : 's'} selected`
                      : 'No suppliers selected'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleSelectAllCurrentPage(!allCurrentPageSelected)}
                      disabled={currentPageSupplierIds.length === 0 || isBulkActionSubmitting}
                    >
                      {allCurrentPageSelected ? 'Deselect Page' : 'Select Page'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                      disabled={selectedSupplierCount === 0 || isBulkActionSubmitting}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openBulkEditModal}
                      disabled={selectedSupplierCount === 0 || isBulkActionSubmitting}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Bulk Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() => setBulkDeleteAlertOpen(true)}
                      disabled={selectedSupplierCount === 0 || isBulkActionSubmitting}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Selected
                    </Button>
                  </div>
                </div>
              </div>

              {totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  {searchQuery || filterType || filterCountry ? (
                    <>
                      <p className="text-sm font-medium text-text-dark">No suppliers match your filters.</p>
                      <p className="text-sm text-text-dark/60">
                        Try adjusting your search criteria or clear filters to see all suppliers.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('')
                          setFilterType('')
                          setFilterCountry('')
                        }}
                      >
                        Clear Filters
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-text-dark">No suppliers captured yet.</p>
                      <p className="text-sm text-text-dark/60">
                        Add your first supplier to start building the Nutaria directory.
                      </p>
                      <Button onClick={handleOpenModal} className="bg-olive hover:bg-olive-dark">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Supplier
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <ResponsiveTable 
                    columns={columns as any} 
                    data={suppliers as any} 
                    rowKey="id" 
                    onRowClick={handleSupplierClick as any}
                    tableClassName={undefined as any}
                    mobileCardClassName={undefined as any}
                    getRowClassName={undefined as any}
                  />
                  {totalCount > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 mt-4">
                      <div className="text-sm text-text-dark/70">
                        Showing {(page - 1) * pageSize + 1}–
                        {Math.min(page * pageSize, totalCount)} of {totalCount}
                      </div>
                      <div className="flex items-center gap-2">
                        <label htmlFor="page-size" className="text-sm text-text-dark/70">
                          Per page
                        </label>
                        <select
                          id="page-size"
                          value={pageSize}
                          onChange={(event) => {
                            setPageSize(Number(event.target.value))
                            setPage(1)
                          }}
                          className="rounded-md border border-olive-light/60 bg-white px-2 py-1 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={page * pageSize >= totalCount}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">Add Supplier</h2>
                <p className="text-sm text-text-dark/70">Capture supplier profile and documents</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form id="supplier-form" onSubmit={handleStepSubmit} className="flex-1 overflow-hidden bg-beige/10">
              <div className="border-b border-olive-light/30 bg-olive-light/20 px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Step {currentStepIndex + 1} of {totalSteps}
                    </p>
                    <h3 className="text-lg font-semibold text-text-dark">{currentStep?.title ?? ''}</h3>
                    <p className="text-sm text-text-dark/70">{currentStep?.description ?? ''}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPLIER_FORM_STEPS.map((step, index) => {
                      const isActive = index === currentStepIndex
                      const isCompleted = index < currentStepIndex
                      const badgeClass = isActive
                        ? 'bg-olive text-white'
                        : isCompleted
                          ? 'bg-olive/70 text-white'
                          : 'bg-white text-text-dark border border-olive-light/60'
                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                        >
                          <span>{index + 1}</span>
                          <span className="hidden sm:inline">{step.title}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {currentStep?.id === 'basic' && (
                  <div className="space-y-8">
                    <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Supplier Profile</h3>
                      <p className="text-sm text-text-dark/70">
                        Capture the core details that appear in the directory.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="name">Supplier Name*</Label>
                          <Input
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Acme Farms"
                            disabled={isSubmitting}
                            className={formErrors.fields.name ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                          />
                          {formErrors.fields.name && (
                            <p className="text-xs text-red-600">{formErrors.fields.name}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="supplier_type">Supplier Type*</Label>
                          <select
                            id="supplier_type"
                            name="supplier_type"
                            value={formData.supplier_type}
                            onChange={handleSupplierTypeChange}
                            disabled={isSubmitting || loadingTypes}
                            className={`h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                              formErrors.fields.supplier_type
                                ? 'border-red-300 focus-visible:ring-red-500'
                                : 'focus-visible:ring-olive'
                            }`}
                          >
                            {loadingTypes ? (
                              <option value="">Loading types…</option>
                            ) : (
                              supplierTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))
                            )}
                          </select>
                          {formErrors.fields.supplier_type && (
                            <p className="text-xs text-red-600">{formErrors.fields.supplier_type}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="country">Country</Label>
                          <SearchableSelect
                            id="country"
                            options={supplierCountryOptions}
                            value={formData.country}
                            onChange={handleCountryChange}
                            placeholder="Select country"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone">Main Phone*</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <SearchableSelect
                              id="phone-dial-code"
                              options={dialCodeOptions}
                              value={phoneDialCode}
                              onChange={setPhoneDialCode}
                              placeholder="Code"
                              disabled={isSubmitting}
                            />
                            <Input
                              id="phone"
                              name="phone"
                              value={formData.phone}
                              onChange={handleChange}
                              placeholder="21 555 1234"
                              disabled={isSubmitting}
                              className={cn(
                                'col-span-2',
                                formErrors.fields.phone ? 'border-red-300 focus-visible:ring-red-500' : undefined
                              )}
                            />
                          </div>
                          {formErrors.fields.phone && (
                            <p className="text-xs text-red-600">{formErrors.fields.phone}</p>
                          )}
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="email">Main Email</Label>
                          <Input
                            id="email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="hello@acmefarms.co.za"
                            disabled={isSubmitting}
                            className={formErrors.fields.email ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                          />
                          {formErrors.fields.email && (
                            <p className="text-xs text-red-600">{formErrors.fields.email}</p>
                          )}
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="address">Address</Label>
                          <textarea
                            id="address"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            rows={3}
                            placeholder="Street, City, Postal Code"
                            disabled={isSubmitting}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {currentStep?.id === 'additional' && (
                  <div className="max-h-[60vh] space-y-8 overflow-y-auto pr-1">
                    <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Primary Contact</h3>
                      <p className="text-sm text-text-dark/70">
                        Who should Nutaria teams reach out to for this supplier.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="primary_contact_name">Contact Name</Label>
                          <Input
                            id="primary_contact_name"
                            name="primary_contact_name"
                            value={formData.primary_contact_name}
                            onChange={handleChange}
                            placeholder="Jane Smith"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="primary_contact_phone">Contact Phone</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <SearchableSelect
                              id="primary-contact-phone-dial-code"
                              options={dialCodeOptions}
                              value={primaryContactPhoneDialCode}
                              onChange={setPrimaryContactPhoneDialCode}
                              placeholder="Code"
                              disabled={isSubmitting}
                            />
                            <Input
                              id="primary_contact_phone"
                              name="primary_contact_phone"
                              value={formData.primary_contact_phone}
                              onChange={handleChange}
                              placeholder="82 456 7890"
                              disabled={isSubmitting}
                              className="col-span-2"
                            />
                          </div>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="primary_contact_email">Contact Email</Label>
                          <Input
                            id="primary_contact_email"
                            name="primary_contact_email"
                            type="email"
                            value={formData.primary_contact_email}
                            onChange={handleChange}
                            placeholder="jane.smith@acmefarms.co.za"
                            disabled={isSubmitting}
                            className={
                              formErrors.fields.primary_contact_email
                                ? 'border-red-300 focus-visible:ring-red-500'
                                : undefined
                            }
                          />
                          {formErrors.fields.primary_contact_email && (
                            <p className="text-xs text-red-600">{formErrors.fields.primary_contact_email}</p>
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Supplier Details</h3>
                      <p className="text-sm text-text-dark/70">Capture workforce numbers and verification information.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="supplier_age">Supplier Age</Label>
                          <Input
                            id="supplier_age"
                            name="supplier_age"
                            type="number"
                            min="0"
                            value={formData.supplier_age}
                            onChange={handleChange}
                            placeholder="e.g. 12"
                            disabled={isSubmitting}
                            className={
                              formErrors.fields.supplier_age ? 'border-red-300 focus-visible:ring-red-500' : undefined
                            }
                          />
                          {formErrors.fields.supplier_age && (
                            <p className="text-xs text-red-600">{formErrors.fields.supplier_age}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gender">Gender</Label>
                          <select
                            id="gender"
                            name="gender"
                            value={formData.gender}
                            onChange={handleChange}
                            disabled={isSubmitting}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {genderOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="number_of_employees">Number of Employees</Label>
                          <Input
                            id="number_of_employees"
                            name="number_of_employees"
                            type="number"
                            min="0"
                            value={formData.number_of_employees}
                            onChange={handleChange}
                            placeholder="e.g. 45"
                            disabled={isSubmitting}
                            className={
                              formErrors.fields.number_of_employees
                                ? 'border-red-300 focus-visible:ring-red-500'
                                : undefined
                            }
                          />
                          {formErrors.fields.number_of_employees && (
                            <p className="text-xs text-red-600">{formErrors.fields.number_of_employees}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="number_of_dependants">Number of Dependants</Label>
                          <Input
                            id="number_of_dependants"
                            name="number_of_dependants"
                            type="number"
                            min="0"
                            value={formData.number_of_dependants}
                            onChange={handleChange}
                            placeholder="e.g. 3"
                            disabled={isSubmitting}
                            className={
                              formErrors.fields.number_of_dependants
                                ? 'border-red-300 focus-visible:ring-red-500'
                                : undefined
                            }
                          />
                          {formErrors.fields.number_of_dependants && (
                            <p className="text-xs text-red-600">{formErrors.fields.number_of_dependants}</p>
                          )}
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="bank">Bank</Label>
                          <select
                            id="bank"
                            name="bank"
                            value={formData.bank}
                            onChange={handleChange}
                            disabled={isSubmitting}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {BANK_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="account_number">Account Number</Label>
                          <Input
                            id="account_number"
                            name="account_number"
                            value={formData.account_number}
                            onChange={handleChange}
                            placeholder="e.g. 1234567890"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="branch">Branch</Label>
                          <Input
                            id="branch"
                            name="branch"
                            value={formData.branch}
                            onChange={handleChange}
                            placeholder="Branch name or code"
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="proof_of_residence">Proof of Residence</Label>
                          <Input
                            id="proof_of_residence"
                            type="file"
                            onChange={handleProofOfResidenceChange}
                            disabled={isSubmitting}
                          />
                          {formData.proof_of_residence.length === 0 ? (
                            <p className="text-sm text-text-dark/60">Upload a recent utility bill or official proof.</p>
                          ) : (
                            <ul className="space-y-1 rounded-md border border-olive-light/40 bg-olive-light/10 p-3 text-sm text-text-dark">
                              {formData.proof_of_residence.map((file, index) => (
                                <li key={`proof-file-${index}`} className="flex items-center justify-between gap-2">
                                  <span className="truncate">{file.name}</span>
                                  {formatPreviewFileSize(file.size) && (
                                    <span className="text-xs text-text-dark/50">{formatPreviewFileSize(file.size)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {formData.proof_of_residence.length > 0 && (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={removeProofOfResidence}
                                disabled={isSubmitting}
                              >
                                Remove File
                              </Button>
                            </div>
                          )}
                          {formErrors.proof_of_residence && (
                            <p className="text-xs text-red-600">{formErrors.proof_of_residence}</p>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                )}

                {currentStep?.id === 'documents' && (
                  <div className="max-h-[60vh] space-y-8 overflow-y-auto pr-1">
                    <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Documents & Certificates</h3>
                      <p className="text-sm text-text-dark/70">
                        Upload key documentation and compliance certificates for this supplier.
                      </p>
                      <div className="mt-4 space-y-4">
                        {formData.documents.map((documentType) => {
                          const documentError = formErrors.documents[documentType.clientId]
                          const documentTypeId = `document-type-${documentType.clientId}`
                          const documentFilesId = `document-files-${documentType.clientId}`
                          const documentExpiryId = `document-expiry-${documentType.clientId}`
                          const docType = documentType.document_type_code
                            ? documentTypeMap.get(documentType.document_type_code)
                            : null
                          const requiresExpiry = docType?.has_expiry_date ?? false

                          return (
                            <div
                              key={documentType.clientId}
                              className={`rounded-md border p-4 space-y-3 ${
                                documentError ? 'border-red-300 bg-red-50/50' : 'border-olive-light/40 bg-olive-light/10'
                              }`}
                            >
                              <div className="grid gap-3 sm:grid-cols-3">
                                <div className="space-y-2">
                                  <Label htmlFor={documentTypeId}>Document Type</Label>
                                  <select
                                    id={documentTypeId}
                                    value={documentType.document_type_code}
                                    onChange={(event) =>
                                      handleDocumentTypeChange(documentType.clientId, event.target.value)
                                    }
                                    className={`h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                                      documentError ? 'border-red-300 focus-visible:ring-red-500' : 'focus-visible:ring-olive'
                                    }`}
                                    disabled={isSubmitting || loadingDocumentTypes}
                                  >
                                    {loadingDocumentTypes ? (
                                      <option value="">Loading document types…</option>
                                    ) : (
                                      documentTypeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))
                                    )}
                                  </select>
                                </div>
                                {requiresExpiry && (
                                  <div className="space-y-2">
                                    <Label htmlFor={documentExpiryId}>Expiry Date</Label>
                                    <DatePicker
                                      id={documentExpiryId}
                                      value={documentType.expiryDate ?? ''}
                                      onChange={(value) =>
                                        handleDocumentExpiryChange(documentType.clientId, value)
                                      }
                                      disabled={isSubmitting}
                                    />
                                  </div>
                                )}
                                <div className={`space-y-2 ${requiresExpiry ? '' : 'sm:col-span-2'}`}>
                                  <Label htmlFor={documentFilesId}>Files</Label>
                                  <div className="flex gap-2">
                                    <div className="flex-1">
                                      <Input
                                        id={documentFilesId}
                                        type="file"
                                        multiple
                                        onChange={(event) =>
                                          handleDocumentFilesChange(documentType.clientId, event.target.files)
                                        }
                                        disabled={isSubmitting}
                                      />
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleOpenCamera(documentType.clientId)}
                                      disabled={isSubmitting}
                                      className="shrink-0"
                                      aria-label="Take photo with camera"
                                    >
                                      <Camera className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              {documentType.files.length === 0 ? (
                                <p className="text-sm text-text-dark/60">No files uploaded for this type yet.</p>
                              ) : (
                                <ul className="space-y-1 text-sm text-text-dark">
                                  {documentType.files.map((file, fileIndex) => (
                                    <li
                                      key={`${documentType.clientId}-file-${fileIndex}`}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="truncate">{file.name}</span>
                                      {formatPreviewFileSize(file.size) && (
                                        <span className="text-xs text-text-dark/50">{formatPreviewFileSize(file.size)}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {documentError && <p className="text-xs text-red-600">{documentError}</p>}
                              {formData.documents.length > 1 && (
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleRemoveDocumentType(documentType.clientId)}
                                    disabled={isSubmitting}
                                  >
                                    Remove Type
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        <Button type="button" variant="outline" onClick={handleAddDocumentType} disabled={isSubmitting}>
                          Add Document Type
                        </Button>
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </form>

            <div className="flex flex-col gap-3 border-t border-olive-light/30 bg-olive-light/20 p-5 sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:p-6">
              <Button type="button" variant="outline" onClick={handleCloseModal} disabled={isSubmitting}>
                Cancel
              </Button>
              {!isFirstStep && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={isSubmitting}
                  className="text-text-dark hover:bg-olive-light/20"
                >
                  Previous Step
                </Button>
              )}
              <Button
                type="submit"
                form="supplier-form"
                className="bg-olive hover:bg-olive-dark"
                disabled={isSubmitting}
              >
                {primaryActionLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
      <CameraCapture
        isOpen={cameraModalOpen}
        onClose={handleCloseCamera}
        onCapture={handleCameraCapture}
        disabled={isSubmitting}
      />

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setSupplierToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete supplier?</AlertDialogTitle>
            <AlertDialogDescription>
              {supplierToDelete
                ? `Delete supplier "${supplierToDelete.name}"? This will remove their profile and associated documents.`
                : 'This will remove their profile and associated documents.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => supplierToDelete && performDeleteSupplier(supplierToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={bulkDeleteAlertOpen}
        onOpenChange={(open) => {
          if (isBulkActionSubmitting) return
          setBulkDeleteAlertOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected suppliers?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will permanently remove ${selectedSupplierCount} supplier${selectedSupplierCount === 1 ? '' : 's'} and related documents.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkActionSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleBulkDelete}
              disabled={isBulkActionSubmitting}
            >
              {isBulkActionSubmitting ? 'Deleting…' : 'Delete Selected'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {bulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg border border-olive-light/40 bg-white shadow-xl">
            <div className="border-b border-olive-light/40 px-5 py-4">
              <h3 className="text-lg font-semibold text-text-dark">Bulk Edit Suppliers</h3>
              <p className="text-sm text-text-dark/70">
                Update selected fields for {selectedSupplierCount} supplier{selectedSupplierCount === 1 ? '' : 's'}.
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-edit-supplier-type">Supplier Type</Label>
                <select
                  id="bulk-edit-supplier-type"
                  value={bulkEditSupplierType}
                  onChange={(event) => setBulkEditSupplierType(event.target.value)}
                  disabled={isBulkActionSubmitting}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value={BULK_NO_CHANGE}>No change</option>
                  {supplierTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-edit-country">Country</Label>
                <SearchableSelect
                  id="bulk-edit-country"
                  options={[{ value: BULK_NO_CHANGE, label: 'No change' }, ...countryOptions]}
                  value={bulkEditCountry}
                  onChange={setBulkEditCountry}
                  placeholder="Select country"
                  disabled={isBulkActionSubmitting}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-olive-light/40 px-5 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeBulkEditModal}
                disabled={isBulkActionSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-olive hover:bg-olive-dark"
                onClick={handleBulkEdit}
                disabled={isBulkActionSubmitting}
              >
                {isBulkActionSubmitting ? 'Saving…' : 'Apply Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Suppliers
