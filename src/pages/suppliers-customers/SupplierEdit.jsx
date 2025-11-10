import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PageLayout from '@/components/layout/PageLayout'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/context/AuthContext'
import { useSuppliers } from '@/hooks/useSuppliers'

const CERTIFICATE_DOC_TYPES = new Set(['HALAL', 'ISO9001', 'ISO22000', 'KOSHER', 'OTHER'])

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

const hasHalalUploads = (documents = []) =>
  documents.some((entry) => {
    const normalizedType = entry.type?.toString().trim().toUpperCase()
    return normalizedType === 'HALAL' && Array.isArray(entry.files) && entry.files.length > 0
  })

const hasHalalExistingDocuments = (existingDocuments = [], markedForRemoval = new Set()) =>
  existingDocuments.some((group) => {
    const normalizedType = group.type?.toString().trim().toUpperCase()
    if (normalizedType !== 'HALAL') {
      return false
    }
    return Array.isArray(group.files) && group.files.some((file) => file?.id && !markedForRemoval.has(file.id))
  })

const createUniqueId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`

const createDocumentTypeEntry = () => ({
  clientId: createUniqueId('doc'),
  type: '',
  expiryDate: '',
  files: [],
})

const createEmptyFormErrors = () => ({
  fields: {},
  documents: {},
  proof_of_residence: null,
})

const hasValidationErrors = (errors) =>
  Object.keys(errors.fields).length > 0 ||
  Object.keys(errors.documents).length > 0 ||
  Boolean(errors.proof_of_residence)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isValidEmail = (value) => emailPattern.test(value)

const requiredText = (value) => value?.trim() ?? ''

const optionalText = (value) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const optionalInteger = (value) => {
  const trimmed = value?.toString().trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isNaN(parsed) ? null : parsed
}

const formatPreviewFileSize = (size) => {
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

const formatDateDisplay = (value) => {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const SUPPLIER_FORM_STEPS = [
  {
    id: 'basic',
    title: 'Basic Information',
    description: 'Update the supplier profile and high-level details.',
    fieldKeys: ['name', 'supplier_type', 'country', 'phone', 'email', 'address'],
  },
  {
    id: 'additional',
    title: 'Additional Details',
    description: 'Maintain contact details and demographics.',
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
    description: 'Review existing files and upload new documentation.',
    fieldKeys: [],
    includeDocuments: true,
  },
]

const DOCUMENT_TYPE_OPTIONS = [
  { value: '', label: 'Select a type' },
  { value: 'REGISTRATION', label: 'Registration' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'OTHER', label: 'Other' },
  { value: 'HALAL', label: 'Halal Certificate' },
  { value: 'ISO9001', label: 'ISO 9001' },
  { value: 'ISO22000', label: 'ISO 22000' },
  { value: 'KOSHER', label: 'Kosher Certificate' },
]

const supplierTypeOptions = [
  { id: 1, label: 'Nut Supplier', value: 'NUT' },
  { id: 2, label: 'Operational Supplier', value: 'OPERATIONAL' },
]

const groupDocumentRows = (rows = []) => {
  const docMap = new Map()
  const proofList = []

  rows.forEach((row, index) => {
    const rawType = row?.doc_type
    const normalizedType = rawType ? rawType.toString().toUpperCase() : 'UNSPECIFIED'

    if (normalizedType === 'PROOF_OF_RESIDENCE') {
      proofList.push({ ...row, clientId: `proof-${row.id ?? index}` })
      return
    }

    if (!docMap.has(normalizedType)) {
      docMap.set(normalizedType, {
        id: `${CERTIFICATE_DOC_TYPES.has(normalizedType) ? 'cert' : 'doc'}-${normalizedType.toLowerCase()}-${index}`,
        isCertificate: CERTIFICATE_DOC_TYPES.has(normalizedType),
        type: normalizedType,
        files: [],
      })
    }

    docMap.get(normalizedType).files.push({
      id: row?.id ?? `file-${index}`,
      name: row?.name || `File ${index + 1}`,
      storage_path: row?.storage_path ?? null,
      uploaded_at: row?.uploaded_at ?? null,
      expiry_date: row?.expiry_date ?? null,
    })
  })

  return {
    documents: Array.from(docMap.values()),
    proof: proofList,
  }
}

const createFormDataFromSupplier = (supplier, groupedDocuments) => ({
  name: supplier?.name ?? '',
  supplier_type: supplier?.supplier_type ?? 'NUT',
  phone: supplier?.phone ?? '',
  email: supplier?.email ?? '',
  country: supplier?.country ?? 'South Africa',
  address: supplier?.address ?? '',
  primary_contact_name: supplier?.primary_contact_name ?? '',
  primary_contact_email: supplier?.primary_contact_email ?? '',
  primary_contact_phone: supplier?.primary_contact_phone ?? '',
  supplier_age: supplier?.supplier_age ?? '',
  gender: supplier?.gender ?? '',
  number_of_employees: supplier?.number_of_employees ?? '',
  number_of_dependants: supplier?.number_of_dependants ?? '',
  bank: supplier?.bank ?? '',
  account_number: supplier?.account_number ?? '',
  branch: supplier?.branch ?? '',
  documents: [createDocumentTypeEntry()],
  proof_of_residence: [],
  existingDocuments: groupedDocuments?.documents ?? [],
  existingProofOfResidence: groupedDocuments?.proof ?? [],
})

const baseFieldClass =
  'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40'

const sectionCardClass =
  'rounded-xl border border-olive-light/40 bg-olive-light/10 p-5 sm:p-6'

function SupplierEdit() {
  const { supplierId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { refresh } = useSuppliers()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [supplierRecord, setSupplierRecord] = useState(null)
  const [formData, setFormData] = useState(createFormDataFromSupplier(null, { documents: [], proof: [] }))
  const [formErrors, setFormErrors] = useState(createEmptyFormErrors())
  const [profileId, setProfileId] = useState(null)
  const [activeStep, setActiveStep] = useState(0)
  const [documentsToDelete, setDocumentsToDelete] = useState(new Set())

  const totalSteps = SUPPLIER_FORM_STEPS.length
  const currentStepIndex = Math.min(activeStep, totalSteps - 1)
  const currentStep = SUPPLIER_FORM_STEPS[currentStepIndex]
  const isLastStep = currentStepIndex === totalSteps - 1

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

  useEffect(() => {
    const fetchSupplier = async () => {
      if (!supplierId) {
        setLoading(false)
        toast.error('Supplier id is missing.')
        return
      }

      setLoading(true)

      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .maybeSingle()

      if (supplierError) {
        console.error('Error loading supplier', supplierError)
        toast.error('Unable to load supplier.')
        setLoading(false)
        return
      }

      if (!supplier) {
        toast.error('Supplier not found.')
        setLoading(false)
        return
      }

      const { data: docRows, error: docsError } = await supabase
        .from('documents')
        .select('id, owner_type, owner_id, name, doc_type, storage_path, uploaded_at, expiry_date')
        .eq('owner_type', 'supplier')
        .eq('owner_id', supplierId)

      if (docsError) {
        console.warn('Unable to load supplier documents', docsError)
      }

      const grouped = groupDocumentRows(docRows ?? [])
      setSupplierRecord(supplier)
      setFormData(createFormDataFromSupplier(supplier, grouped))
      setDocumentsToDelete(new Set())
      setFormErrors(createEmptyFormErrors())
      setActiveStep(0)
      setLoading(false)
    }

    fetchSupplier()
  }, [supplierId])

  const filterErrorsForStep = (errors, step) => {
    if (!errors) {
      return null
    }

    const filtered = createEmptyFormErrors()

    step.fieldKeys?.forEach((field) => {
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

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    const nextValue = type === 'checkbox' ? checked : value

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
    setFormErrors((prev) => {
      if (!prev.fields[name]) {
        return prev
      }
      const nextFields = { ...prev.fields }
      delete nextFields[name]
      return { ...prev, fields: nextFields }
    })
  }

  const handleSupplierTypeChange = (event) => {
    const { value } = event.target
    setFormData((prev) => ({
      ...prev,
      supplier_type: value,
    }))
  }

  const clearDocumentError = (clientId) => {
    setFormErrors((prev) => {
      if (!prev.documents[clientId]) {
        return prev
      }
      const nextDocuments = { ...prev.documents }
      delete nextDocuments[clientId]
      return { ...prev, documents: nextDocuments }
    })
  }

  const clearProofOfResidenceError = () => {
    setFormErrors((prev) => ({
      ...prev,
      proof_of_residence: null,
    }))
  }

  const handleDocumentTypeChange = (clientId, value) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((entry) =>
        entry.clientId === clientId
          ? {
              ...entry,
              type: value,
              expiryDate: CERTIFICATE_DOC_TYPES.has(value?.toString().toUpperCase() ?? '') ? entry.expiryDate : '',
            }
          : entry
      ),
    }))
    clearDocumentError(clientId)
  }

  const handleDocumentExpiryChange = (clientId, value) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.map((entry) =>
        entry.clientId === clientId ? { ...entry, expiryDate: value } : entry
      ),
    }))
    clearDocumentError(clientId)
  }

  const handleDocumentFilesChange = (clientId, fileList) => {
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

  const handleRemoveDocumentType = (clientId) => {
    setFormData((prev) => {
      const remaining = prev.documents.filter((entry) => entry.clientId !== clientId)
      return {
        ...prev,
        documents: remaining.length > 0 ? remaining : [createDocumentTypeEntry()],
      }
    })
    clearDocumentError(clientId)
  }

  const handleProofOfResidenceChange = (event) => {
    const files = Array.from(event.target.files ?? [])
    setFormData((prev) => ({
      ...prev,
      proof_of_residence: files.slice(0, 1),
    }))
    clearProofOfResidenceError()
  }

  const removeProofOfResidenceUpload = () => {
    setFormData((prev) => ({
      ...prev,
      proof_of_residence: [],
    }))
    clearProofOfResidenceError()
  }

  const toggleExistingDocumentRemoval = (documentId) => {
    setDocumentsToDelete((prev) => {
      const next = new Set(prev)
      if (next.has(documentId)) {
        next.delete(documentId)
      } else {
        next.add(documentId)
      }
      return next
    })
  }

  const validateForm = (data) => {
    const errors = createEmptyFormErrors()

    if (!data.name || !data.name.trim()) {
      errors.fields.name = 'Supplier name is required.'
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
    ]

    integerFieldValidations.forEach(({ field, label }) => {
      const rawValue = data[field]
      if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return
      }

      const parsed = Number.parseInt(rawValue, 10)
      if (Number.isNaN(parsed) || parsed < 0) {
        errors.fields[field] = `${label} must be a positive number.`
      }
    })

    data.documents.forEach((entry) => {
      const trimmedType = entry.type?.trim() ?? ''
      const normalizedType = trimmedType.toUpperCase()
      const hasFiles = entry.files.length > 0

      if (trimmedType && !hasFiles) {
        errors.documents[entry.clientId] = 'Upload at least one file for this type.'
      } else if (!trimmedType && hasFiles) {
        errors.documents[entry.clientId] = 'Select a document type for the uploaded files.'
      } else if (
        hasFiles &&
        CERTIFICATE_DOC_TYPES.has(normalizedType) &&
        !(entry.expiryDate && entry.expiryDate.toString().trim())
      ) {
        errors.documents[entry.clientId] = 'Provide an expiry date for this certificate.'
      }
    })

    return hasValidationErrors(errors) ? errors : null
  }

  const handleFinalSubmit = async () => {
    if (!user?.id) {
      toast.error('You need to be signed in to update suppliers.')
      return
    }
    if (!supplierRecord?.id) {
      toast.error('Supplier record missing.')
      return
    }

    setSaving(true)
    setFormErrors(createEmptyFormErrors())

    const halalFromExisting = hasHalalExistingDocuments(formData.existingDocuments, documentsToDelete)
    const halalFromNewUploads = hasHalalUploads(formData.documents)
    const isHalalCertified = halalFromExisting || halalFromNewUploads

    const payload = {
      name: requiredText(formData.name),
      supplier_type: formData.supplier_type || null,
      primary_contact_name: optionalText(formData.primary_contact_name),
      phone: optionalText(formData.phone),
      email: optionalText(formData.email),
      country: optionalText(formData.country),
      address: optionalText(formData.address),
      is_halal_certified: isHalalCertified,
      supplier_age: optionalInteger(formData.supplier_age),
      gender: optionalText(formData.gender),
      number_of_employees: optionalInteger(formData.number_of_employees),
      number_of_dependants: optionalInteger(formData.number_of_dependants),
      bank: optionalText(formData.bank),
      account_number: optionalText(formData.account_number),
      branch: optionalText(formData.branch),
    }

    try {
      const { error: updateError } = await supabase.from('suppliers').update(payload).eq('id', supplierRecord.id)

      if (updateError) {
        throw updateError
      }

      const documentRows = formData.documents
        .filter((entry) => entry.type && entry.files.length > 0)
        .flatMap((entry) => {
          const normalizedType = entry.type.toString().toUpperCase()
          const isCertificate = CERTIFICATE_DOC_TYPES.has(normalizedType)
          return entry.files.map((file) => ({
            owner_type: 'supplier',
            owner_id: supplierRecord.id,
            name: file.name,
            doc_type: entry.type,
            storage_path: `suppliers/${supplierRecord.id}/${isCertificate ? 'certificates/' : ''}${file.name}`,
            expiry_date:
              isCertificate && entry.expiryDate && entry.expiryDate.toString().trim()
                ? entry.expiryDate
                : null,
            uploaded_by: profileId ?? null,
          }))
        })

      const proofRows = formData.proof_of_residence.map((file) => ({
        owner_type: 'supplier',
        owner_id: supplierRecord.id,
        name: file.name,
        doc_type: 'PROOF_OF_RESIDENCE',
        storage_path: `suppliers/${supplierRecord.id}/proof-of-residence/${file.name}`,
        uploaded_by: profileId ?? null,
      }))

      const rowsToInsert = [...documentRows, ...proofRows]

      if (rowsToInsert.length > 0) {
        const { error: docsError } = await supabase.from('documents').insert(rowsToInsert)
        if (docsError) {
          console.error('Error inserting supplier documents', docsError)
          toast.error('Supplier updated but some documents failed to register.')
        }
      }

      if (documentsToDelete.size > 0) {
        const ids = Array.from(documentsToDelete)
        const { error: deleteDocsError } = await supabase.from('documents').delete().in('id', ids)
        if (deleteDocsError) {
          console.error('Error deleting supplier documents', deleteDocsError)
          toast.error('Supplier updated but some documents could not be removed.')
        }
      }

      await refresh?.()
      toast.success('Supplier updated')
      navigate(`/suppliers-customers/suppliers/${supplierRecord.id}`)
    } catch (error) {
      console.error('Error updating supplier', error)
      toast.error(error.message ?? 'Unable to update supplier in Supabase.')
    } finally {
      setSaving(false)
    }
  }

  const handleStepSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    const validationErrors = validateForm(formData)
    if (validationErrors) {
      if (isLastStep) {
        setFormErrors(validationErrors)
        return
      }

      const stepErrors = filterErrorsForStep(validationErrors, currentStep)
      if (stepErrors) {
        setFormErrors(stepErrors)
        return
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

  const isMarkedForRemoval = useMemo(() => {
    const lookup = new Set(documentsToDelete)
    return lookup
  }, [documentsToDelete])

  if (loading) {
    return (
      <PageLayout
        title="Edit Supplier"
        activeItem="suppliersCustomers"
        actions={
          <Button variant="outline" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Loading supplier</CardTitle>
            <CardDescription>Fetching the latest supplier information from Supabase…</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-dark/70">Please wait a moment.</p>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  if (!supplierRecord) {
    return (
      <PageLayout
        title="Supplier Not Found"
        activeItem="suppliersCustomers"
        actions={
          <Button variant="outline" onClick={() => navigate('/suppliers-customers/suppliers')}>
            Back to Suppliers
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Supplier not available</CardTitle>
            <CardDescription>We could not find the supplier you were looking for.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-dark/70">
              The supplier may have been removed or the link you followed might be incorrect. Please head back to the
              suppliers list to continue.
            </p>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={`Edit ${formData.name || 'Supplier'}`}
      activeItem="suppliersCustomers"
      actions={
        <Button variant="outline" onClick={() => navigate(`/suppliers-customers/suppliers/${supplierRecord.id}`)}>
          Cancel
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <form id="supplier-edit-form" onSubmit={handleStepSubmit} className="flex flex-col gap-6">
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="border-b border-olive-light/30 bg-olive-light/20">
            <CardTitle className="text-lg font-semibold text-text-dark">
              Step {currentStepIndex + 1} of {totalSteps}
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2 text-sm text-text-dark/70">
              {SUPPLIER_FORM_STEPS.map((step, index) => {
                const isActive = index === currentStepIndex
                const isCompleted = index < currentStepIndex
                const badgeClass = isActive
                  ? 'bg-olive text-white'
                  : isCompleted
                    ? 'bg-olive/70 text-white'
                    : 'bg-white text-text-dark border border-olive-light/60'
                return (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                  >
                    <span>{index + 1}</span>
                    <span className="hidden sm:inline">{step.title}</span>
                  </span>
                )
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            {currentStep.id === 'basic' && (
              <section className={sectionCardClass}>
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-text-dark">Supplier Profile</h3>
                    <p className="text-sm text-text-dark/70">
                      Update the high-level details that appear in the directory.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
                  <div className="space-y-2 lg:col-span-6">
                    <Label htmlFor="name">Supplier name *</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Acme Farms"
                      disabled={saving}
                      className={formErrors.fields.name ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                    />
                    {formErrors.fields.name && (
                      <p className="text-xs text-red-600">{formErrors.fields.name}</p>
                    )}
                  </div>

                  <div className="space-y-2 lg:col-span-6">
                    <Label htmlFor="supplier_type">Supplier type</Label>
                    <select
                      id="supplier_type"
                      name="supplier_type"
                      value={formData.supplier_type}
                      onChange={handleSupplierTypeChange}
                      disabled={saving}
                      className={baseFieldClass}
                    >
                      {supplierTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 lg:col-span-6">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      placeholder="South Africa"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-6">
                    <Label htmlFor="phone">Main phone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+27 21 555 1234"
                      disabled={saving}
                    />
                  </div>

                  <div className="space-y-2 lg:col-span-6">
                    <Label htmlFor="email">Main email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="hello@acmefarms.co.za"
                      disabled={saving}
                      className={formErrors.fields.email ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                    />
                    {formErrors.fields.email && (
                      <p className="text-xs text-red-600">{formErrors.fields.email}</p>
                    )}
                  </div>

                <div className="space-y-2 lg:col-span-6">
                  <Label htmlFor="address">Address</Label>
                  <textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Street, City, Postal Code"
                    disabled={saving}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                </div>
              </section>
            )}

            {currentStep.id === 'additional' && (
              <div className="max-h-[60vh] space-y-8 overflow-y-auto pr-1">
                <section className={sectionCardClass}>
                  <div>
                    <h3 className="text-lg font-semibold text-text-dark">Primary contact</h3>
                    <p className="text-sm text-text-dark/70">
                      Keep the liaison details up to date for quick reach outs.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="primary_contact_name">Contact name</Label>
                      <Input
                        id="primary_contact_name"
                        name="primary_contact_name"
                        value={formData.primary_contact_name}
                        onChange={handleChange}
                        placeholder="Jane Smith"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primary_contact_phone">Contact phone</Label>
                      <Input
                        id="primary_contact_phone"
                        name="primary_contact_phone"
                        value={formData.primary_contact_phone}
                        onChange={handleChange}
                        placeholder="+27 82 456 7890"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="primary_contact_email">Contact email</Label>
                      <Input
                        id="primary_contact_email"
                        name="primary_contact_email"
                        type="email"
                        value={formData.primary_contact_email}
                        onChange={handleChange}
                        placeholder="jane.smith@acmefarms.co.za"
                        disabled={saving}
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

                <section className={sectionCardClass}>
                  <div>
                    <h3 className="text-lg font-semibold text-text-dark">Supplier details</h3>
                    <p className="text-sm text-text-dark/70">
                      Workforce numbers and verification information.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="supplier_age">Supplier age</Label>
                      <Input
                        id="supplier_age"
                        name="supplier_age"
                        type="number"
                        min="0"
                        value={formData.supplier_age}
                        onChange={handleChange}
                        placeholder="e.g. 12"
                        disabled={saving}
                        className={formErrors.fields.supplier_age ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                      />
                      {formErrors.fields.supplier_age && (
                        <p className="text-xs text-red-600">{formErrors.fields.supplier_age}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">Gender</Label>
                      <Input
                        id="gender"
                        name="gender"
                        value={formData.gender}
                        onChange={handleChange}
                        placeholder="e.g. Female"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="number_of_employees">Number of employees</Label>
                      <Input
                        id="number_of_employees"
                        name="number_of_employees"
                        type="number"
                        min="0"
                        value={formData.number_of_employees}
                        onChange={handleChange}
                        placeholder="e.g. 45"
                        disabled={saving}
                        className={
                          formErrors.fields.number_of_employees ? 'border-red-300 focus-visible:ring-red-500' : undefined
                        }
                      />
                      {formErrors.fields.number_of_employees && (
                        <p className="text-xs text-red-600">{formErrors.fields.number_of_employees}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="number_of_dependants">Number of dependants</Label>
                      <Input
                        id="number_of_dependants"
                        name="number_of_dependants"
                        type="number"
                        min="0"
                        value={formData.number_of_dependants}
                        onChange={handleChange}
                        placeholder="e.g. 3"
                        disabled={saving}
                        className={
                          formErrors.fields.number_of_dependants ? 'border-red-300 focus-visible:ring-red-500' : undefined
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
                        disabled={saving}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {BANK_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account_number">Account number</Label>
                      <Input
                        id="account_number"
                        name="account_number"
                        value={formData.account_number}
                        onChange={handleChange}
                        placeholder="e.g. 1234567890"
                        disabled={saving}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                        disabled={saving}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="proof_of_residence">Proof of residence (upload new)</Label>
                      <Input
                        id="proof_of_residence"
                        type="file"
                        onChange={handleProofOfResidenceChange}
                        disabled={saving}
                      />
                      {formData.proof_of_residence.length === 0 ? (
                        <p className="text-sm text-text-dark/60">Upload a recent utility bill or official proof.</p>
                      ) : (
                        <ul className="space-y-1 rounded-md border border-olive-light/40 bg-olive-light/10 p-3 text-sm text-text-dark">
                          {formData.proof_of_residence.map((file, index) => (
                            <li key={`proof-file-new-${index}`} className="flex items-center justify-between gap-2">
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
                            onClick={removeProofOfResidenceUpload}
                            disabled={saving}
                          >
                            Remove file
                          </Button>
                        </div>
                      )}
                      {formErrors.proof_of_residence && (
                        <p className="text-xs text-red-600">{formErrors.proof_of_residence}</p>
                      )}
                      {formData.existingProofOfResidence.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-md border border-olive-light/40 bg-white/80 p-3 dark:border-olive-light/20 dark:bg-slate-900/40">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-200/70">
                            Existing proof of residence
                          </p>
                          <ul className="space-y-1 text-sm text-text-dark dark:text-slate-200">
                            {formData.existingProofOfResidence.map((proof) => {
                              const marked = isMarkedForRemoval.has(proof.id)
                              return (
                                <li
                                  key={proof.id}
                                  className={`flex items-center justify-between gap-2 rounded px-3 py-2 ${
                                    marked
                                      ? 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-200'
                                      : 'bg-olive-light/10 text-text-dark dark:bg-slate-800/60 dark:text-slate-100'
                                  }`}
                                >
                                  <span className="truncate">
                                    {proof.name}{' '}
                                    {marked ? '(marked for removal)' : ''}
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleExistingDocumentRemoval(proof.id)}
                                    className={
                                      marked
                                        ? 'text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200'
                                        : 'text-text-dark dark:text-slate-200 dark:hover:text-slate-100'
                                    }
                                    disabled={saving}
                                  >
                                    {marked ? 'Undo' : 'Remove'}
                                  </Button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {currentStep.id === 'documents' && (
              <div className="max-h-[60vh] space-y-8 overflow-y-auto pr-1">
                <section className={sectionCardClass}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text-dark">Existing documents & certificates</h3>
                      <p className="text-sm text-text-dark/70">
                        Review current uploads. Mark items for removal if they are outdated.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {formData.existingDocuments.length === 0 ? (
                      <p className="text-sm text-text-dark/60">No document types captured.</p>
                    ) : (
                      formData.existingDocuments.map((group) => (
                        <div
                          key={group.id}
                          className="space-y-2 rounded-md border border-olive-light/40 bg-white/80 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold text-text-dark">
                                {group.type}
                                {group.isCertificate && (
                                  <span className="inline-flex items-center rounded-full bg-olive-light/50 px-2 py-0.5 text-xs font-medium text-olive-dark">
                                    Certificate
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-text-dark/60">
                                {group.files.length
                                  ? `${group.files.length} file${group.files.length === 1 ? '' : 's'} uploaded`
                                  : 'No files uploaded yet'}
                              </p>
                            </div>
                          </div>
                          {group.files.length > 0 && (
                            <ul className="space-y-1 text-sm text-text-dark">
                              {group.files.map((file) => {
                                const marked = isMarkedForRemoval.has(file.id)
                                return (
                                  <li
                                    key={file.id}
                                    className={`flex items-center justify-between gap-2 rounded px-3 py-2 ${
                                      marked ? 'bg-red-50 text-red-700' : 'bg-olive-light/10 text-text-dark'
                                    }`}
                                  >
                                    <div className="flex flex-col flex-1">
                                      <span className="truncate">
                                        {file.name}{' '}
                                        {marked ? '(marked for removal)' : ''}
                                      </span>
                                      {formatDateDisplay(file.expiry_date) && (
                                        <span className="text-xs text-text-dark/60">
                                          Expires {formatDateDisplay(file.expiry_date)}
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => toggleExistingDocumentRemoval(file.id)}
                                      className={marked ? 'text-red-700 hover:text-red-800' : 'text-text-dark'}
                                      disabled={saving}
                                    >
                                      {marked ? 'Undo' : 'Remove'}
                                    </Button>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text-dark">Upload additional documents & certificates</h3>
                      <p className="text-sm text-text-dark/70">
                        Add new document types or renew certificates with updated files.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddDocumentType}
                      className="border-olive-light/60"
                      disabled={saving}
                    >
                      Add document type
                    </Button>
                  </div>
                  <div className="mt-4 space-y-4">
                    {formData.documents.map((documentType) => {
                      const documentError = formErrors.documents[documentType.clientId]
                      const documentTypeId = `document-type-${documentType.clientId}`
                      const documentFilesId = `document-files-${documentType.clientId}`
                      const documentExpiryId = `document-expiry-${documentType.clientId}`
                      const normalizedType = documentType.type?.toString().toUpperCase() ?? ''
                      const isCertificate = CERTIFICATE_DOC_TYPES.has(normalizedType)

                      return (
                        <div
                          key={documentType.clientId}
                          className={`space-y-3 rounded-md border p-4 ${
                            documentError ? 'border-red-300 bg-red-50/50' : 'border-olive-light/40 bg-olive-light/10'
                          }`}
                        >
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor={documentTypeId}>Document type</Label>
                              <select
                                id={documentTypeId}
                                value={documentType.type}
                                onChange={(event) =>
                                  handleDocumentTypeChange(documentType.clientId, event.target.value)
                                }
                                className={`h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                                  documentError ? 'border-red-300 focus-visible:ring-red-500' : 'focus-visible:ring-olive'
                                }`}
                                disabled={saving}
                              >
                                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {isCertificate && (
                              <div className="space-y-2">
                                <Label htmlFor={documentExpiryId}>Expiry date</Label>
                                <Input
                                  id={documentExpiryId}
                                  type="date"
                                  value={documentType.expiryDate ?? ''}
                                  onChange={(event) =>
                                    handleDocumentExpiryChange(documentType.clientId, event.target.value)
                                  }
                                  disabled={saving}
                                />
                              </div>
                            )}
                            <div className={`space-y-2 ${isCertificate ? '' : 'sm:col-span-2'}`}>
                              <Label htmlFor={documentFilesId}>Files</Label>
                              <Input
                                id={documentFilesId}
                                type="file"
                                multiple
                                onChange={(event) =>
                                  handleDocumentFilesChange(documentType.clientId, event.target.files)
                                }
                                disabled={saving}
                              />
                            </div>
                          </div>
                          {documentType.files.length === 0 ? (
                            <p className="text-sm text-text-dark/60">No files selected for this type yet.</p>
                          ) : (
                            <ul className="space-y-1 text-sm text-text-dark">
                              {documentType.files.map((file, index) => (
                                <li
                                  key={`${documentType.clientId}-new-file-${index}`}
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
                                disabled={saving}
                              >
                                Remove type
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 rounded-xl border border-olive-light/30 bg-white px-6 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-text-dark/60">
            Make sure to review each step before saving. Removing files will delete the associated Supabase records.
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveStep((prev) => Math.max(prev - 1, 0))}
              disabled={currentStepIndex === 0 || saving}
              className="border-olive-light/60"
            >
              Back
            </Button>
            <Button
              type="submit"
              form="supplier-edit-form"
              className="bg-olive hover:bg-olive-dark"
              disabled={saving}
            >
              {isLastStep ? (saving ? 'Saving…' : 'Save Supplier') : 'Next'}
            </Button>
          </div>
        </div>
      </form>
    </PageLayout>
  )
}

export default SupplierEdit

