import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PostgrestError } from '@supabase/supabase-js'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'
import { useSupplierTypes } from '@/hooks/useSupplierTypes'
import { useDocumentTypes } from '@/hooks/useDocumentTypes'
import {
  ArrowLeft,
  BadgeCheck,
  ExternalLink,
  FileImage,
  FileStack,
  FileText,
  Globe,
  Landmark,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react'
import { getStoredFileUrls } from '@/lib/fileStorage'
import { getPrimarySupplierContact, type SupplierContactRecord } from '@/lib/supplierContacts'

function formatEnumLabel(value: string | number | null | undefined): string {
  const label = value ?? ''
  if (!label) {
    return 'Not specified'
  }

  return label
    .toString()
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(value: string | Date | number | null | undefined): string {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateOnly(value: string | Date | number | null | undefined): string | null {
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

function isExpired(expiryDate: string | Date | number | null | undefined): boolean {
  if (!expiryDate) return false
  const date = new Date(expiryDate)
  if (Number.isNaN(date.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return date < today
}

function formatFileSize(size: unknown): string | null {
  if (typeof size !== 'number') {
    return null
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const CERTIFICATE_DOC_TYPES = new Set(['HALAL', 'ISO9001', 'ISO22000', 'KOSHER', 'OTHER'])

function normalizeFileMeta(file: unknown, index: number) {
  if (!file) {
    return null
  }

  if (typeof file === 'object' && file !== null) {
    const fileObj = file as Record<string, unknown>
    const storagePath = 'storage_path' in fileObj ? (fileObj.storage_path as string | null) ?? null : null
    return {
      name: (fileObj.name as string | undefined) || `File ${index + 1}`,
      size: typeof fileObj.size === 'number' ? fileObj.size : null,
      expiry_date: (fileObj.expiry_date as string | null) ?? null,
      storage_path: storagePath,
    }
  }

  return {
    name: typeof file === 'string' ? file : `File ${index + 1}`,
    size: null,
    expiry_date: null,
    storage_path: null,
  }
}

function normalizeFileGroup(item: unknown, index: number, defaultTypeLabel: string | number | null | undefined) {
  if (!item) {
    return {
      id: `group-${index}`,
      type: (defaultTypeLabel ?? '').toString().toUpperCase() || 'UNSPECIFIED',
      isCertificate: CERTIFICATE_DOC_TYPES.has((defaultTypeLabel ?? '').toString().toUpperCase()),
      files: [],
    }
  }

  if (typeof item === 'object' && item !== null && Array.isArray((item as Record<string, unknown>).files)) {
    const itemObj = item as Record<string, unknown>
    const rawType = itemObj.type ?? defaultTypeLabel ?? ''
    const normalizedType = rawType ? rawType.toString().toUpperCase() : 'UNSPECIFIED'
    return {
      id: (itemObj.id as string | number | null | undefined) ?? `group-${index}`,
      type: normalizedType,
      isCertificate: CERTIFICATE_DOC_TYPES.has(normalizedType),
      files: (itemObj.files as unknown[])
        .map((file, fileIndex) => normalizeFileMeta(file, fileIndex))
        .filter((meta) => meta !== null),
    }
  }

  const fileMeta = normalizeFileMeta(item, 0)
  const normalizedType = (defaultTypeLabel ?? '').toString().toUpperCase() || 'UNSPECIFIED'
  return {
    id: `group-${index}`,
    type: normalizedType,
    isCertificate: CERTIFICATE_DOC_TYPES.has(normalizedType),
    files: fileMeta ? [fileMeta] : [],
  }
}

function groupDocumentsByType(documentRows: unknown) {
  if (!Array.isArray(documentRows)) {
    return []
  }

  const groupsByType = new Map()

  documentRows.forEach((row, index) => {
    const rawType = row?.doc_type
    const normalizedType = rawType ? rawType.toString().toUpperCase() : 'UNSPECIFIED'
    const mapKey = normalizedType || `UNSPECIFIED-${index}`

    if (!groupsByType.has(mapKey)) {
      groupsByType.set(mapKey, {
        id: `doc-${mapKey.toLowerCase() || index}`,
        type: normalizedType,
        isCertificate: CERTIFICATE_DOC_TYPES.has(normalizedType),
        files: [],
      })
    }

    const fileMeta = {
      id: row?.id ?? `file-${index}`,
      name: row?.name || `File ${index + 1}`,
      size: null,
      storage_path: (row?.storage_path as string | null) ?? null,
      uploaded_at: row?.uploaded_at ?? null,
      expiry_date: (row?.expiry_date as string | null) ?? null,
    }

    groupsByType.get(mapKey).files.push(fileMeta)
  })

  return Array.from(groupsByType.values())
}

type SupplierFormState = {
  id: string | number | null
  name: string
  supplier_type: string
  phone: string
  email: string
  address: string
  country: string
  is_halal_certified: boolean
  primary_contact_name: string
  primary_contact_email: string
  primary_contact_phone: string
  primary_contact_role: string
  contacts: SupplierContactRecord[]
  bank: string
  account_number: string
  branch: string
  documents: Array<{
    id: string | number
    type: string
    isCertificate: boolean
    files: Array<{
      name: string
      size: number | null
      expiry_date: string | null
      storage_path: string | null
    }>
  }>
  files: Array<{
    name: string
    size: number | null
    expiry_date: string | null
    storage_path: string | null
  }>
  created_at: string | Date | number | null
}

type FilePreviewMeta = {
  name: string
  size: number | null
  expiry_date: string | null
  storage_path: string | null
}

const getFileExtension = (name: string): string => {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() || '' : ''
}

const isImageFile = (name: string): boolean =>
  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(getFileExtension(name))

const isPdfFile = (name: string): boolean => getFileExtension(name) === 'pdf'

const getInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'S'

function createFormStateFromSupplier(
  supplier: unknown,
  documentRows: unknown[] = [],
  contacts: SupplierContactRecord[] = []
) {
  const supplierObj = supplier as Record<string, unknown> | null | undefined
  const baseFallbackDocuments = Array.isArray(supplierObj?.documents)
    ? (supplierObj.documents as unknown[]).map((item: unknown, index: number) => normalizeFileGroup(item, index, 'DOCUMENT'))
    : []

  const rawCertificates = Array.isArray(supplierObj?.certificates)
    ? (supplierObj.certificates as unknown[])
    : supplierObj?.certificate
    ? [supplierObj.certificate]
    : []

  const certificateFallback = rawCertificates.map((item: unknown, index: number) =>
    normalizeFileGroup(item, baseFallbackDocuments.length + index, 'CERTIFICATE')
  )

  const fallbackDocuments = [...baseFallbackDocuments, ...certificateFallback]

  const normalizedSupportingFiles = Array.isArray(supplierObj?.files)
    ? (supplierObj.files as unknown[])
        .map((file: unknown, index: number) => normalizeFileMeta(file, index))
        .filter((meta) => meta !== null)
    : []

  const groupedDocuments = documentRows.length > 0 ? groupDocumentsByType(documentRows) : null

  const primaryContact = getPrimarySupplierContact(contacts, supplierObj)

  return {
    id: (supplierObj?.id as string | number | null | undefined) ?? null,
    name: String(supplierObj?.name ?? ''),
    supplier_type: String(supplierObj?.supplier_type ?? ''),
    phone: String(supplierObj?.phone ?? ''),
    email: String(supplierObj?.email ?? ''),
    address: String(supplierObj?.address ?? ''),
    country: String(supplierObj?.country ?? ''),
    is_halal_certified: Boolean(supplierObj?.is_halal_certified ?? false),
    primary_contact_name: primaryContact.name,
    primary_contact_email: primaryContact.email,
    primary_contact_phone: primaryContact.phone,
    primary_contact_role: primaryContact.role,
    contacts,
    bank: String(supplierObj?.bank ?? ''),
    account_number: String(supplierObj?.account_number ?? ''),
    branch: String(supplierObj?.branch ?? ''),
    documents: groupedDocuments ?? fallbackDocuments,
    files: normalizedSupportingFiles,
    created_at: (supplierObj?.created_at as string | Date | number | null | undefined) ?? null,
  }
}

function SupplierDetail() {
  const navigate = useNavigate()
  const { supplierId } = useParams()
  const { supplierTypes } = useSupplierTypes()
  const { documentTypes } = useDocumentTypes()

  const typeNameMap = useMemo(
    () => new Map(supplierTypes.map((t) => [t.code, t.name])),
    [supplierTypes]
  )
  const documentTypeNameMap = useMemo(
    () => new Map(documentTypes.map((type) => [type.code?.toUpperCase(), type.name])),
    [documentTypes]
  )

  const [supplierData, setSupplierData] = useState<SupplierFormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})
  const [brokenPreviewPaths, setBrokenPreviewPaths] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fetchSupplier = async () => {
      const supplierIdValue = supplierId ? Number(supplierId) : null
      if (!supplierIdValue || Number.isNaN(supplierIdValue)) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase.rpc('get_supplier_detail', {
        p_supplier_id: supplierIdValue,
      })

      if (fetchError) {
        setError(fetchError)
        setLoading(false)
        return
      }

      const payload = data as { supplier?: unknown; documents?: unknown[] } | null
      if (!payload?.supplier) {
        setSupplierData(null)
        setLoading(false)
        return
      }

      const { data: supplierContacts, error: contactsError } = await supabase
        .from('supplier_contacts')
        .select('id, name, email, phone, role, is_primary')
        .eq('supplier_id', supplierIdValue)
        .order('is_primary', { ascending: false })
        .order('id', { ascending: true })

      if (contactsError) {
        console.warn('Unable to load supplier contacts', contactsError)
      }

      const normalized = createFormStateFromSupplier(payload.supplier, payload.documents ?? [], supplierContacts ?? [])
      setSupplierData(normalized)
      setLoading(false)
    }

    fetchSupplier()
  }, [supplierId])

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? 'Unable to load supplier from Supabase.')
    }
  }, [error])

  useEffect(() => {
    const loadPreviewUrls = async () => {
      const allFiles = [
        ...(supplierData?.documents.flatMap((group) => group.files) ?? []),
        ...(supplierData?.files ?? []),
      ]
      const storagePaths = allFiles
        .map((file) => file.storage_path)
        .filter((path): path is string => typeof path === 'string' && path.trim().length > 0)

      if (storagePaths.length === 0) {
        setPreviewUrls({})
        return
      }

      try {
        const urls = await getStoredFileUrls(storagePaths, 3600)
        setPreviewUrls(urls)
        setBrokenPreviewPaths({})
      } catch (previewError) {
        console.error('Error loading supplier file previews', previewError)
        setPreviewUrls({})
        setBrokenPreviewPaths({})
      }
    }

    void loadPreviewUrls()
  }, [supplierData])

  const handleBack = () => {
    navigate('/suppliers-customers/suppliers')
  }

  const handleOpenEdit = () => {
    if (!supplierData?.id) {
      return
    }
    navigate(`/suppliers-customers/suppliers/${supplierData.id}/edit`)
  }

  const handleOpenDocument = (file: FilePreviewMeta) => {
    if (!file.storage_path) {
      toast.error('This document does not have a storage path.')
      return
    }

    navigate(
      `/documents/view?source=supplier&path=${encodeURIComponent(file.storage_path)}&name=${encodeURIComponent(file.name)}`
    )
  }
  if (loading) {
    return (
      <PageLayout
        title="Supplier Detail"
        activeItem="suppliersCustomers"
        leadingActions={
          <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Suppliers">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading supplier details..." />
      </PageLayout>
    )
  }

  if (!supplierData) {
    return (
      <PageLayout
        title="Supplier Not Found"
        activeItem="suppliersCustomers"
        leadingActions={
          <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Suppliers">
            <ArrowLeft className="h-4 w-4" />
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

  const documents = Array.isArray(supplierData.documents) ? supplierData.documents : []
  const documentGroups = documents.filter((group) => !group.isCertificate)
  const certificateGroups = documents.filter((group) => group.isCertificate)
  const totalDocumentFiles = documentGroups.reduce((count, entry) => count + entry.files.length, 0)
  const totalCertificateFiles = certificateGroups.reduce((count, entry) => count + entry.files.length, 0)

  const typeDisplay =
    typeNameMap.get(supplierData.supplier_type ?? '') ?? supplierData.supplier_type ?? 'Not specified'

  const summaryCards = [
    {
      title: 'Document Types',
      value: documentGroups.length,
      description: totalDocumentFiles
        ? `${totalDocumentFiles} file${totalDocumentFiles === 1 ? '' : 's'} on record`
        : 'No files uploaded',
      icon: FileStack,
    },
    {
      title: 'Certificates',
      value: certificateGroups.length,
      description: totalCertificateFiles
        ? `${totalCertificateFiles} certificate file${totalCertificateFiles === 1 ? '' : 's'}`
        : 'No certificates uploaded',
      icon: ShieldCheck,
    },
    {
      title: 'Supporting Files',
      value: supplierData.files.length,
      description: supplierData.files.length ? 'Additional supporting material available' : 'No supporting files',
      icon: BadgeCheck,
    },
  ]

  const companyProfileItems = [
    { label: 'Supplier Type', value: typeDisplay, icon: BadgeCheck },
    { label: 'Country', value: supplierData.country || 'Not provided', icon: Globe },
    { label: 'Address', value: supplierData.address || 'Not provided', icon: MapPin },
    { label: 'Added', value: formatDate(supplierData.created_at), icon: ShieldCheck },
  ]

  const supplierContacts = supplierData.contacts.length
    ? supplierData.contacts
    : [
        {
          id: 'fallback-primary',
          name: supplierData.primary_contact_name || null,
          email: supplierData.primary_contact_email || supplierData.email || null,
          phone: supplierData.primary_contact_phone || supplierData.phone || null,
          role: supplierData.primary_contact_role || null,
          is_primary: true,
        },
      ].filter((contact) => contact.name || contact.email || contact.phone)

  const financialItems = [
    { label: 'Bank', value: supplierData.bank || 'Not provided', icon: Landmark },
    { label: 'Account Number', value: supplierData.account_number || 'Not provided', icon: Landmark },
    { label: 'Branch', value: supplierData.branch || 'Not provided', icon: Landmark },
    {
      label: 'Halal Status',
      value: supplierData.is_halal_certified ? 'Halal Certified' : 'Not Halal Certified',
      icon: supplierData.is_halal_certified ? ShieldCheck : BadgeCheck,
    },
  ]

  const getDocumentTypeLabel = (value: string) => {
    const normalizedValue = value?.trim().toUpperCase()
    return documentTypeNameMap.get(normalizedValue) ?? formatEnumLabel(value)
  }

  const renderFileCard = (file: FilePreviewMeta, key: string) => {
    const expired = isExpired(file.expiry_date)
    const previewUrl = file.storage_path ? previewUrls[file.storage_path] ?? '' : ''
    const hasBrokenPreview = file.storage_path ? brokenPreviewPaths[file.storage_path] ?? false : false
    const imageFile = isImageFile(file.name)
    const pdfFile = isPdfFile(file.name)
    const showImagePreview = imageFile && previewUrl && !hasBrokenPreview

    return (
      <button
        key={key}
        type="button"
        onClick={() => handleOpenDocument(file)}
        className={`flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition hover:border-olive hover:bg-white ${
          expired ? 'border-red-200 bg-red-50/80' : 'border-olive-light/25 bg-white'
        }`}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-olive-light/30 bg-gradient-to-br from-olive-light/20 to-white">
          {showImagePreview ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="h-full w-full object-contain bg-white"
              onError={() => {
                if (!file.storage_path) return
                setBrokenPreviewPaths((prev) => ({ ...prev, [file.storage_path!]: true }))
              }}
            />
          ) : pdfFile ? (
            <FileText className="h-4 w-4 text-olive-dark" />
          ) : (
            <FileImage className="h-4 w-4 text-olive-dark" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-dark">{file.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-dark/60">
                {formatFileSize(file.size) && <span>{formatFileSize(file.size)}</span>}
                {formatDateOnly(file.expiry_date) && (
                  <span className={expired ? 'font-medium text-red-700' : ''}>
                    {expired ? 'Expired ' : 'Expires '}
                    {formatDateOnly(file.expiry_date)}
                  </span>
                )}
              </div>
            </div>
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-text-dark/40" />
          </div>
        </div>
      </button>
    )
  }

  const renderInfoList = (
    title: string,
    description: string,
    items: Array<{ label: string; value: string; icon: React.ComponentType<{ className?: string }> }>
  ) => (
    <Card className="border-olive-light/35 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-text-dark">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-0 px-6 pb-5">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.label}
              className="flex items-start gap-3 border-t border-olive-light/15 py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-olive-light/20 text-olive-dark">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dark/45">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-text-dark">{item.value}</p>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )

  const renderContactsCard = () => (
    <Card className="border-olive-light/35 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-text-dark">Contacts</CardTitle>
        <CardDescription>Direct communication channels and accountable contact people.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-5">
        {supplierContacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-olive-light/40 bg-olive-light/10 px-4 py-5 text-sm text-text-dark/60">
            No supplier contacts recorded.
          </div>
        ) : (
          supplierContacts.map((contact, index) => (
            <div key={String(contact.id ?? index)} className="rounded-xl border border-olive-light/20 bg-olive-light/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text-dark">{contact.name || 'Unnamed contact'}</p>
                    {contact.is_primary && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-olive-dark">
                        Primary
                      </span>
                    )}
                  </div>
                  {contact.role && <p className="mt-1 text-xs text-text-dark/60">{contact.role}</p>}
                </div>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-text-dark/75">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-text-dark/45" />
                  <span>{contact.phone || 'No phone'}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-4 w-4 shrink-0 text-text-dark/45" />
                  <span className="truncate">{contact.email || 'No email'}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )

  return (
    <PageLayout
      title="Supplier Detail"
      activeItem="suppliersCustomers"
      leadingActions={
        <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Suppliers">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenEdit}>
          Edit Supplier
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <Card className="overflow-hidden border-olive-light/35 bg-white shadow-sm">
          <CardContent className="px-6 py-6 lg:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-olive text-lg font-semibold text-white">
                  {getInitials(supplierData.name)}
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-dark/40">Supplier profile</p>
                    <CardTitle className="text-3xl font-semibold tracking-tight text-text-dark">{supplierData.name}</CardTitle>
                    <p className="max-w-2xl text-sm leading-6 text-text-dark/65">
                      Operational contact details, compliance status, and supplier documents in one place.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-olive/20 bg-olive-light/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                      {typeDisplay}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                        supplierData.is_halal_certified ? 'bg-green-100 text-green-800' : 'bg-stone-200 text-text-dark/80'
                      }`}
                    >
                      {supplierData.is_halal_certified ? 'Halal Certified' : 'Halal Not Recorded'}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-beige/50 px-3 py-1 text-xs font-medium text-text-dark/70">
                      Added {formatDate(supplierData.created_at)}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm text-text-dark/70 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-text-dark/45" />
                      <span>{supplierData.phone || supplierData.primary_contact_phone || 'No phone'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-text-dark/45" />
                      <span className="truncate">{supplierData.email || supplierData.primary_contact_email || 'No email'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-text-dark/45" />
                      <span>{supplierData.country || 'No country'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
                {summaryCards.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.title}
                      className="rounded-xl border border-olive-light/25 bg-olive-light/10 px-4 py-4"
                    >
                      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-olive-dark">
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dark/50">{item.title}</p>
                      <p className="mt-2 text-2xl font-semibold text-text-dark">{item.value}</p>
                      <p className="mt-1 text-xs leading-5 text-text-dark/65">{item.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-3">
          {renderInfoList('Company Profile', 'Primary supplier registration and business details.', companyProfileItems)}
          {renderContactsCard()}
          {renderInfoList('Financial & Compliance', 'Banking information and compliance standing.', financialItems)}
        </div>

        <div className="space-y-6">
          <Card className="border-olive-light/35 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-text-dark">Document Library</CardTitle>
              <CardDescription>Compliance and registration documentation grouped by type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-text-dark">
              {documentGroups.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-olive-light/50 bg-olive-light/10 px-5 py-6 text-text-dark/60">
                  No document types captured.
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {documentGroups.map((documentType) => (
                    <div
                      key={documentType.id}
                      className="space-y-3 rounded-xl border border-olive-light/25 bg-olive-light/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-text-dark">{getDocumentTypeLabel(documentType.type)}</p>
                          <p className="mt-1 text-xs text-text-dark/60">
                            {documentType.files.length
                              ? `${documentType.files.length} file${documentType.files.length === 1 ? '' : 's'} uploaded`
                              : 'No files uploaded yet'}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-dark/55">
                          {documentType.files.length} item{documentType.files.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {documentType.files.length > 0 && (
                        <div className="space-y-2.5 text-sm text-text-dark">
                          {documentType.files.map((file, index) => renderFileCard(file, `${documentType.id}-file-${index}`))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </PageLayout>
  )
}

export default SupplierDetail
