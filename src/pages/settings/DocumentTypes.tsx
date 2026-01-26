import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, X } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { useDocumentTypes, type DocumentType } from '@/hooks/useDocumentTypes'

interface FormData {
  code: string
  name: string
  description: string
  has_expiry_date: boolean
}

interface FormErrors {
  code?: string
  name?: string
}

function DocumentTypes() {
  const { documentTypes, loading, error, refresh } = useDocumentTypes()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({ 
    code: '', 
    name: '', 
    description: '', 
    has_expiry_date: false 
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const filteredTypes = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    if (!normalised) return documentTypes
    return documentTypes.filter((t) => {
      const code = (t.code ?? '').toLowerCase()
      const name = (t.name ?? '').toLowerCase()
      const description = (t.description ?? '').toLowerCase()
      return code.includes(normalised) || name.includes(normalised) || description.includes(normalised)
    })
  }, [documentTypes, searchTerm])

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading document types…'
    if (error) return 'Unable to load document types.'
    return 'No document types found.'
  }, [error, loading])

  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (row: DocumentType) => (
          <div className="font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
        mobileRender: (row: DocumentType) => (
          <div className="text-right font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: DocumentType) => <div className="text-text-dark/80">{row.name ?? '—'}</div>,
        mobileRender: (row: DocumentType) => (
          <div className="text-right text-text-dark/80">{row.name ?? '—'}</div>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        render: (row: DocumentType) => (
          <div className="text-text-dark/70">{row.description ?? '—'}</div>
        ),
        mobileRender: (row: DocumentType) => (
          <div className="text-right text-text-dark/70">{row.description ?? '—'}</div>
        ),
      },
      {
        key: 'has_expiry_date',
        header: 'Requires Expiry',
        render: (row: DocumentType) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              row.has_expiry_date ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {row.has_expiry_date ? 'Yes' : 'No'}
          </span>
        ),
        mobileRender: (row: DocumentType) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              row.has_expiry_date ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {row.has_expiry_date ? 'Yes' : 'No'}
          </span>
        ),
      },
    ],
    []
  )

  const handleOpenModal = () => {
    setFormData({ code: '', name: '', description: '', has_expiry_date: false })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ code: '', name: '', description: '', has_expiry_date: false })
    setFormErrors({})
    setIsModalOpen(false)
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = 'checked' in e.target ? e.target.checked : undefined
    const nextValue = type === 'checkbox' ? checked : value

    setFormData((prev) => ({ ...prev, [name]: nextValue }))
  }

  const validateForm = (): boolean => {
    const err: FormErrors = {}
    if (!formData.code.trim()) err.code = 'Code is required.'
    if (!formData.name.trim()) err.name = 'Name is required.'
    setFormErrors(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const { error: insertError } = await supabase.from('document_types').insert({
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        has_expiry_date: formData.has_expiry_date,
      })

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error('A document type with this code already exists.')
          setFormErrors((prev) => ({ ...prev, code: 'Code must be unique.' }))
        } else {
          throw insertError
        }
        setIsSubmitting(false)
        return
      }

      toast.success('Document type added successfully.')
      await refresh()
      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ code: '', name: '', description: '', has_expiry_date: false })
      setFormErrors({})
    } catch (err) {
      console.error('Error creating document type', err)
      toast.error(err instanceof Error ? err.message : 'Unable to add document type.')
      setIsSubmitting(false)
    }
  }

  if (loading && documentTypes.length === 0) {
    return (
      <PageLayout title="Document Types" activeItem="settings" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading document types..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Document Types"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Document Type
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total types</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{documentTypes.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Document Types</CardTitle>
          <CardDescription>
            Manage document types used when uploading supplier documents. The code is stored on each document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="dt-search">Search</Label>
              <Input
                id="dt-search"
                placeholder="Search by code, name, or description"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2">
              <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                <div className="font-medium text-text-dark">Results</div>
                <div>
                  {filteredTypes.length} of {documentTypes.length}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load document types from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={filteredTypes}
            rowKey="code"
            emptyMessage={emptyMessage}
            tableClassName={undefined}
            mobileCardClassName={undefined}
            getRowClassName={undefined}
            onRowClick={undefined}
          />
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">Add Document Type</h2>
                <p className="text-sm text-text-dark/70">Define the code, name, and expiry requirements for the new type.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
              <div>
                <Label htmlFor="dt-code">Code</Label>
                <Input
                  id="dt-code"
                  name="code"
                  placeholder="e.g. HALAL"
                  value={formData.code}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {formErrors.code ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.code}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="dt-name">Name</Label>
                <Input
                  id="dt-name"
                  name="name"
                  placeholder="e.g. Halal Certificate"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {formErrors.name ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="dt-description">Description</Label>
                <textarea
                  id="dt-description"
                  name="description"
                  placeholder="Optional description of this document type"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="dt-has-expiry"
                  name="has_expiry_date"
                  checked={formData.has_expiry_date}
                  onChange={handleFormChange}
                  className="h-4 w-4 rounded border-gray-300 text-olive focus:ring-olive"
                  disabled={isSubmitting}
                />
                <Label htmlFor="dt-has-expiry" className="text-sm font-normal cursor-pointer">
                  Requires expiry date
                </Label>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="text-text-dark hover:bg-olive-light/10"
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default DocumentTypes
