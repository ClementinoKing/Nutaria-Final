import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, X, Edit, Trash2 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { toast } from 'sonner'
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
import { useProcessStepNames, type ProcessStepName } from '@/hooks/useProcessStepNames'

interface FormData {
  name: string
  description: string
}

interface FormErrors {
  name?: string
}

function ProcessStepNames() {
  const { processStepNames, loading, error, refresh, create, update, delete: deleteStepName } = useProcessStepNames()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [stepNameToDelete, setStepNameToDelete] = useState<ProcessStepName | null>(null)
  const [formData, setFormData] = useState<FormData>({ 
    name: '', 
    description: '' 
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const filteredStepNames = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    if (!normalised) return processStepNames
    return processStepNames.filter((s) => {
      const code = (s.code ?? '').toLowerCase()
      const name = (s.name ?? '').toLowerCase()
      const description = (s.description ?? '').toLowerCase()
      return code.includes(normalised) || name.includes(normalised) || description.includes(normalised)
    })
  }, [processStepNames, searchTerm])

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading process step names…'
    if (error) return 'Unable to load process step names.'
    return 'No process step names found.'
  }, [error, loading])

  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (row: ProcessStepName) => (
          <div className="font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="text-right font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: ProcessStepName) => <div className="text-text-dark/80">{row.name ?? '—'}</div>,
        mobileRender: (row: ProcessStepName) => (
          <div className="text-right text-text-dark/80">{row.name ?? '—'}</div>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        render: (row: ProcessStepName) => (
          <div className="text-text-dark/70 max-w-md">{row.description ?? '—'}</div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="text-right text-text-dark/70">{row.description ?? '—'}</div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row: ProcessStepName) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(row)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(row)}
              className="text-red-600 hover:bg-red-50"
              title="Delete"
              disabled={isDeleting && deletingId === row.id}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(row)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(row)}
              className="text-red-600 hover:bg-red-50"
              title="Delete"
              disabled={isDeleting && deletingId === row.id}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [isDeleting, deletingId]
  )

  const handleOpenModal = () => {
    setFormData({ name: '', description: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ name: '', description: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEdit = (stepName: ProcessStepName) => {
    setFormData({
      name: stepName.name,
      description: stepName.description || '',
    })
    setFormErrors({})
    setIsEditMode(true)
    setEditingId(stepName.id)
    setIsModalOpen(true)
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const err: FormErrors = {}
    if (!formData.name.trim()) err.name = 'Name is required.'
    setFormErrors(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      if (isEditMode && editingId) {
        const { error: updateError } = await update(
          editingId,
          formData.name,
          formData.description || undefined
        )

        if (updateError) {
          if (updateError.code === '23505') {
            const field = updateError.message.includes('code') ? 'code' : 'name'
            toast.error(`A process step name with this ${field} already exists.`)
            setFormErrors((prev) => ({ ...prev, [field]: `${field === 'code' ? 'Code' : 'Name'} must be unique.` }))
          } else {
            throw updateError
          }
          setIsSubmitting(false)
          return
        }

        toast.success('Process step name updated successfully.')
      } else {
        const { error: createError } = await create(
          formData.name,
          formData.description || undefined
        )

        if (createError) {
          if (createError.code === '23505') {
            const field = createError.message.includes('code') ? 'code' : 'name'
            toast.error(`A process step name with this ${field} already exists.`)
            setFormErrors((prev) => ({ ...prev, [field]: `${field === 'code' ? 'Code' : 'Name'} must be unique.` }))
          } else {
            throw createError
          }
          setIsSubmitting(false)
          return
        }

        toast.success('Process step name added successfully.')
      }

      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ name: '', description: '' })
      setFormErrors({})
      setIsEditMode(false)
      setEditingId(null)
    } catch (err) {
      console.error('Error saving process step name', err)
      toast.error(err instanceof Error ? err.message : 'Unable to save process step name.')
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (stepName: ProcessStepName) => {
    setStepNameToDelete(stepName)
    setDeleteAlertOpen(true)
  }

  const handleDelete = async (id: number) => {
    setIsDeleting(true)
    setDeletingId(id)
    try {
      const { error: deleteError } = await deleteStepName(id)

      if (deleteError) {
        if (deleteError.code === '23503') {
          toast.error('Cannot delete process step name. It is currently assigned to one or more process steps.')
        } else {
          throw deleteError
        }
        setIsDeleting(false)
        setDeletingId(null)
        return
      }

      toast.success('Process step name deleted successfully.')
    } catch (err) {
      console.error('Error deleting process step name', err)
      toast.error(err instanceof Error ? err.message : 'Unable to delete process step name.')
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  if (loading && processStepNames.length === 0) {
    return (
      <PageLayout title="Process Step Names" activeItem="settings" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading process step names..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Process Step Names"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Process Step Name
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total step names</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{processStepNames.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Process Step Names</CardTitle>
          <CardDescription>
            Manage process step names that can be used when creating process steps. The code is automatically generated from the name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="psn-search">Search</Label>
              <Input
                id="psn-search"
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
                  {filteredStepNames.length} of {processStepNames.length}
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
              {error.message ?? 'Unable to load process step names from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={filteredStepNames}
            rowKey="id"
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
                <h2 className="text-lg font-semibold text-text-dark">
                  {isEditMode ? 'Edit Process Step Name' : 'Add Process Step Name'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {isEditMode
                    ? 'Update the process step name details.'
                    : 'Define the name and description. The code will be automatically generated.'}
                </p>
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
                <Label htmlFor="psn-name">Name <span className="text-red-500">*</span></Label>
                <Input
                  id="psn-name"
                  name="name"
                  placeholder="e.g. Receiving & Inspection"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {formErrors.name ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                ) : null}
                <p className="mt-1 text-xs text-text-dark/60">
                  Code will be auto-generated from the name (e.g., "RECE" from "Receiving & Inspection")
                </p>
              </div>

              <div>
                <Label htmlFor="psn-description">Description</Label>
                <textarea
                  id="psn-description"
                  name="description"
                  placeholder="Optional description of this process step name"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isSubmitting}
                />
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
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Update' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setStepNameToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete process step name?</AlertDialogTitle>
            <AlertDialogDescription>
              {stepNameToDelete
                ? `Are you sure you want to delete "${stepNameToDelete.name}"? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => stepNameToDelete && handleDelete(stepNameToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default ProcessStepNames
