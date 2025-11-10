import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'

function formatEnumLabel(value) {
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

function formatSupplierType(type) {
  return formatEnumLabel(type)
}

function formatDate(value) {
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

function formatDateOnly(value) {
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

function formatFileSize(size) {
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

function normalizeFileMeta(file, index) {
  if (!file) {
    return null
  }

  if (typeof file === 'object' && file !== null) {
    const storagePath = 'storage_path' in file ? file.storage_path ?? null : null
    return {
      name: file.name || `File ${index + 1}`,
      size: typeof file.size === 'number' ? file.size : null,
      expiry_date: file.expiry_date ?? null,
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

function normalizeFileGroup(item, index, defaultTypeLabel) {
  if (!item) {
    return {
      id: `group-${index}`,
      type: (defaultTypeLabel ?? '').toString().toUpperCase() || 'UNSPECIFIED',
      isCertificate: CERTIFICATE_DOC_TYPES.has((defaultTypeLabel ?? '').toString().toUpperCase()),
      files: [],
    }
  }

  if (typeof item === 'object' && Array.isArray(item.files)) {
    const rawType = item.type ?? defaultTypeLabel ?? ''
    const normalizedType = rawType ? rawType.toString().toUpperCase() : 'UNSPECIFIED'
    return {
      id: item.id ?? `group-${index}`,
      type: normalizedType,
      isCertificate: CERTIFICATE_DOC_TYPES.has(normalizedType),
      files: item.files
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

function groupDocumentsByType(documentRows) {
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
      storage_path: row?.storage_path ?? null,
      uploaded_at: row?.uploaded_at ?? null,
      expiry_date: row?.expiry_date ?? null,
    }

    groupsByType.get(mapKey).files.push(fileMeta)
  })

  return Array.from(groupsByType.values())
}

function createFormStateFromSupplier(supplier, documentRows = []) {
  const baseFallbackDocuments = Array.isArray(supplier?.documents)
    ? supplier.documents.map((item, index) => normalizeFileGroup(item, index, 'DOCUMENT'))
    : []

  const rawCertificates = Array.isArray(supplier?.certificates)
    ? supplier.certificates
    : supplier?.certificate
    ? [supplier.certificate]
    : []

  const certificateFallback = rawCertificates.map((item, index) =>
    normalizeFileGroup(item, baseFallbackDocuments.length + index, 'CERTIFICATE')
  )

  const fallbackDocuments = [...baseFallbackDocuments, ...certificateFallback]

  const normalizedSupportingFiles = Array.isArray(supplier?.files)
    ? supplier.files
        .map((file, index) => normalizeFileMeta(file, index))
        .filter((meta) => meta !== null)
    : []

  const groupedDocuments = documentRows.length > 0 ? groupDocumentsByType(documentRows) : null

  return {
    id: supplier?.id ?? null,
    name: supplier?.name ?? '',
    supplier_type: supplier?.supplier_type ?? 'NUT',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    address: supplier?.address ?? '',
    country: supplier?.country ?? '',
    is_halal_certified: supplier?.is_halal_certified ?? false,
    primary_contact_name: supplier?.primary_contact_name ?? '',
    primary_contact_email: supplier?.primary_contact_email ?? '',
    primary_contact_phone: supplier?.primary_contact_phone ?? '',
    documents: groupedDocuments ?? fallbackDocuments,
    files: normalizedSupportingFiles,
    created_at: supplier?.created_at ?? null,
  }
}

function SupplierDetail() {
  const navigate = useNavigate()
  const { supplierId } = useParams()

  const [supplierData, setSupplierData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchSupplier = async () => {
      if (!supplierId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .maybeSingle()

      if (fetchError) {
        setError(fetchError)
        setLoading(false)
        return
      }

      if (!data) {
        setSupplierData(null)
        setLoading(false)
        return
      }

      const { data: documentRows, error: documentsError } = await supabase
        .from('documents')
        .select('id, owner_type, owner_id, name, doc_type, storage_path, uploaded_at, expiry_date')
        .eq('owner_type', 'supplier')
        .eq('owner_id', supplierId)

      if (documentsError) {
        console.warn('Unable to load supplier documents', documentsError)
      }

      const normalized = createFormStateFromSupplier(data, documentRows ?? [])
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

  const handleBack = () => {
    navigate('/suppliers-customers/suppliers')
  }

  const handleOpenEdit = () => {
    if (!supplierData?.id) {
      return
    }
    navigate(`/suppliers-customers/suppliers/${supplierData.id}/edit`)
  }
  if (loading) {
    return (
      <PageLayout
        title="Supplier Detail"
        activeItem="suppliersCustomers"
        actions={
          <Button variant="outline" onClick={handleBack}>
            Back to Suppliers
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

  if (!supplierData) {
    return (
      <PageLayout
        title="Supplier Not Found"
        activeItem="suppliersCustomers"
        actions={
          <Button variant="outline" onClick={handleBack}>
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

  const documents = Array.isArray(supplierData.documents) ? supplierData.documents : []
  const documentGroups = documents.filter((group) => !group.isCertificate)
  const certificateGroups = documents.filter((group) => group.isCertificate)
  const totalDocumentFiles = documentGroups.reduce((count, entry) => count + entry.files.length, 0)
  const totalCertificateFiles = certificateGroups.reduce((count, entry) => count + entry.files.length, 0)
  const complianceStats = [
    {
      title: 'Document Types',
      value: documentGroups.length,
      description: totalDocumentFiles
        ? `${totalDocumentFiles} file${totalDocumentFiles === 1 ? '' : 's'} uploaded`
        : 'No files uploaded',
      tone: documentGroups.length > 0 ? 'text-olive-dark' : 'text-text-dark/60',
    },
    {
      title: 'Certificates',
      value: certificateGroups.length,
      description: totalCertificateFiles
        ? `${totalCertificateFiles} file${totalCertificateFiles === 1 ? '' : 's'} uploaded`
        : 'No files uploaded',
      tone: certificateGroups.length > 0 ? 'text-olive-dark' : 'text-text-dark/60',
    },
    {
      title: 'Supporting Files',
      value: supplierData.files.length,
      description: supplierData.files.length
        ? 'Additional references shared'
        : 'No supporting files uploaded',
      tone: supplierData.files.length > 0 ? 'text-olive-dark' : 'text-text-dark/60',
    },
  ]

  const companyDetails = [
    { label: 'Supplier Type', value: formatSupplierType(supplierData.supplier_type) },
    { label: 'Halal Certified', value: supplierData.is_halal_certified ? 'Yes' : 'No' },
    { label: 'Country', value: supplierData.country || 'Not provided' },
    { label: 'Address', value: supplierData.address || 'Not provided' },
    { label: 'Created', value: formatDate(supplierData.created_at) },
  ]

  const primaryContactDetails = [
    { label: 'Name', value: supplierData.primary_contact_name || 'Not provided' },
    { label: 'Email', value: supplierData.primary_contact_email || supplierData.email || 'Not provided' },
    { label: 'Phone', value: supplierData.primary_contact_phone || supplierData.phone || 'Not provided' },
  ]

  const contactChannels = [
    { label: 'Main Email', value: supplierData.email || 'Not provided' },
    { label: 'Main Phone', value: supplierData.phone || 'Not provided' },
  ]

  return (
    <PageLayout
      title="Supplier Detail"
      activeItem="suppliersCustomers"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack}>
            Back to Suppliers
          </Button>
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenEdit}>
            Edit Supplier
          </Button>
        </div>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <Card className="overflow-hidden border-olive-light/40 bg-gradient-to-r from-olive-light/40 via-white to-white">
          <CardContent className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-text-dark">{supplierData.name}</CardTitle>
              <p className="text-sm text-text-dark/70">
                Comprehensive profile, contact channels, and compliance snapshot for this supplier.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-olive-light/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {formatSupplierType(supplierData.supplier_type)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  supplierData.is_halal_certified
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-200 text-text-dark/80'
                }`}
              >
                {supplierData.is_halal_certified ? 'Halal Certified' : 'Not Halal Certified'}
              </span>
              <span className="inline-flex items-center rounded-full bg-beige/40 px-3 py-1 text-xs font-medium text-text-dark/70">
                Added {formatDate(supplierData.created_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {complianceStats.map((item) => (
            <Card key={item.title} className="border border-olive-light/40 bg-white">
              <CardContent className="space-y-2 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">{item.title}</p>
                <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
                <p className="text-sm text-text-dark/70">{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="border-olive-light/40 bg-white lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-text-dark">Company Overview</CardTitle>
              <CardDescription>Core profile information for this supplier</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm text-text-dark">
              {companyDetails.map((detail) => (
                <div key={detail.label} className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                    {detail.label}
                  </span>
                  <span className="mt-1 text-base text-text-dark/90">{detail.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-olive-light/40 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Primary Contact</CardTitle>
              <CardDescription>Your main point of contact at this supplier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-text-dark">
              {primaryContactDetails.map((detail) => (
                <div key={detail.label} className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                    {detail.label}
                  </span>
                  <span className="mt-1 text-base text-text-dark/90">{detail.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card className="border-olive-light/40 bg-white xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-text-dark">Contact Channels</CardTitle>
              <CardDescription>How to reach the supplier’s main desk</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm text-text-dark">
              {contactChannels.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                    {item.label}
                  </span>
                  <span className="mt-1 text-base text-text-dark/90">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-olive-light/40 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Supporting Files</CardTitle>
              <CardDescription>Additional materials shared with this supplier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-text-dark">
              {supplierData.files.length === 0 ? (
                <p className="text-text-dark/60">No supporting files uploaded.</p>
              ) : (
                <ul className="space-y-2 rounded-md border border-olive-light/40 bg-olive-light/10 p-3">
                  {supplierData.files.map((file, index) => (
                    <li
                      key={`support-file-${index}`}
                      className="flex items-center justify-between gap-2 text-sm text-text-dark"
                    >
                      <span className="truncate">{file.name}</span>
                      {formatFileSize(file.size) && (
                        <span className="text-xs text-text-dark/50">{formatFileSize(file.size)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-olive-light/40 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Document Library</CardTitle>
              <CardDescription>Compliance and registration documentation grouped by type</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-text-dark">
              {documentGroups.length === 0 ? (
                <p className="text-text-dark/60">No document types captured.</p>
              ) : (
                documentGroups.map((documentType) => (
                  <div
                    key={documentType.id}
                    className="space-y-2 rounded-md border border-olive-light/40 bg-olive-light/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-text-dark">{formatEnumLabel(documentType.type)}</p>
                        <p className="text-xs text-text-dark/60">
                          {documentType.files.length
                            ? `${documentType.files.length} file${documentType.files.length === 1 ? '' : 's'} uploaded`
                            : 'No files uploaded yet'}
                        </p>
                      </div>
                    </div>
                    {documentType.files.length > 0 && (
                      <ul className="space-y-1 text-sm text-text-dark">
                        {documentType.files.map((file, index) => (
                          <li
                            key={`${documentType.id}-file-${index}`}
                            className="flex items-center justify-between gap-2 rounded bg-white/80 px-3 py-2"
                          >
                            <div className="flex flex-col flex-1">
                              <span className="truncate">{file.name}</span>
                              {formatDateOnly(file.expiry_date) && (
                                <span className="text-xs text-text-dark/60">
                                  Expires {formatDateOnly(file.expiry_date)}
                                </span>
                              )}
                            </div>
                            {formatFileSize(file.size) && (
                              <span className="text-xs text-text-dark/50">{formatFileSize(file.size)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-olive-light/40 bg-white">
            <CardHeader>
              <CardTitle className="text-text-dark">Certificate Portfolio</CardTitle>
              <CardDescription>Certification coverage tracked for this supplier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-text-dark">
              {certificateGroups.length === 0 ? (
                <p className="text-text-dark/60">No certificate types captured.</p>
              ) : (
                certificateGroups.map((certificateType) => (
                  <div
                    key={certificateType.id}
                    className="space-y-2 rounded-md border border-olive-light/40 bg-olive-light/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-text-dark">{formatEnumLabel(certificateType.type)}</p>
                        <p className="text-xs text-text-dark/60">
                          {certificateType.files.length
                            ? `${certificateType.files.length} file${certificateType.files.length === 1 ? '' : 's'} uploaded`
                            : 'No files uploaded yet'}
                        </p>
                      </div>
                    </div>
                    {certificateType.files.length > 0 && (
                      <ul className="space-y-1 text-sm text-text-dark">
                        {certificateType.files.map((file, index) => (
                          <li
                            key={`${certificateType.id}-file-${index}`}
                            className="flex items-center justify-between gap-2 rounded bg-white/80 px-3 py-2"
                          >
                            <div className="flex flex-col flex-1">
                              <span className="truncate">{file.name}</span>
                              {formatDateOnly(file.expiry_date) && (
                                <span className="text-xs text-text-dark/60">
                                  Expires {formatDateOnly(file.expiry_date)}
                                </span>
                              )}
                            </div>
                            {formatFileSize(file.size) && (
                              <span className="text-xs text-text-dark/50">{formatFileSize(file.size)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

    </PageLayout>
  )
}

export default SupplierDetail
