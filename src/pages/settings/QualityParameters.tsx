import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, X, Edit, Trash2 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
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
import { useQualityParameters, type QualityParameter } from '@/hooks/useQualityParameters'

interface FormData {
  code: string
  name: string
}

interface FormErrors {
  code?: string
  name?: string
}

function QualityParameters() {
  const { qualityParameters, loading, error, refresh } = useQualityParameters()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [parameterToDelete, setParameterToDelete] = useState<QualityParameter | null>(null)
  const [formData, setFormData] = useState<FormData>({ 
    code: '', 
    name: '' 
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const filteredParameters = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    if (!normalised) return qualityParameters
    return qualityParameters.filter((p) => {
      const code = (p.code ?? '').toLowerCase()
      const name = (p.name ?? '').toLowerCase()
      return code.includes(normalised) || name.includes(normalised)
    })
  }, [qualityParameters, searchTerm])

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading quality parameters…'
    if (error) return 'Unable to load quality parameters.'
    return 'No quality parameters found.'
  }, [error, loading])

  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (row: QualityParameter) => (
          <div className="font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
        mobileRender: (row: QualityParameter) => (
          <div className="text-right font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: QualityParameter) => <div className="text-text-dark/80">{row.name ?? '—'}</div>,
        mobileRender: (row: QualityParameter) => (
          <div className="text-right text-text-dark/80">{row.name ?? '—'}</div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row: QualityParameter) => (
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
        mobileRender: (row: QualityParameter) => (
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
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEdit = (parameter: QualityParameter) => {
    setFormData({
      code: parameter.code,
      name: parameter.name,
    })
    setFormErrors({})
    setIsEditMode(true)
    setEditingId(parameter.id)
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
      if (isEditMode && editingId) {
        const { error: updateError } = await supabase
          .from('quality_parameters')
          .update({
            code: formData.code.trim(),
            name: formData.name.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingId)

        if (updateError) {
          if (updateError.code === '23505') {
            toast.error('A quality parameter with this code already exists.')
            setFormErrors((prev) => ({ ...prev, code: 'Code must be unique.' }))
          } else {
            throw updateError
          }
          setIsSubmitting(false)
          return
        }

        toast.success('Quality parameter updated successfully.')
      } else {
        const { error: insertError } = await supabase.from('quality_parameters').insert({
          code: formData.code.trim(),
          name: formData.name.trim(),
        })

        if (insertError) {
          if (insertError.code === '23505') {
            toast.error('A quality parameter with this code already exists.')
            setFormErrors((prev) => ({ ...prev, code: 'Code must be unique.' }))
          } else {
            throw insertError
          }
          setIsSubmitting(false)
          return
        }

        toast.success('Quality parameter added successfully.')
      }

      await refresh()
      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ code: '', name: '' })
      setFormErrors({})
      setIsEditMode(false)
      setEditingId(null)
    } catch (err) {
      console.error('Error saving quality parameter', err)
      toast.error(err instanceof Error ? err.message : 'Unable to save quality parameter.')
      setIsSubmitting(false)
    }
  }

  const handleDeleteClick = (parameter: QualityParameter) => {
    setParameterToDelete(parameter)
    setDeleteAlertOpen(true)
  }

  const handleDelete = async (id: number) => {
    setIsDeleting(true)
    setDeletingId(id)
    try {
      // Check if parameter is used by any processes
      const { data: processParams, error: checkError } = await supabase
        .from('process_quality_parameters')
        .select('id')
        .eq('quality_parameter_id', id)
        .limit(1)

      if (checkError) {
        throw checkError
      }

      if (processParams && processParams.length > 0) {
        toast.error('Cannot delete quality parameter. It is currently assigned to one or more processes.')
        setIsDeleting(false)
        setDeletingId(null)
        return
      }

      const { error: deleteError } = await supabase
        .from('quality_parameters')
        .delete()
        .eq('id', id)

      if (deleteError) {
        throw deleteError
      }

      toast.success('Quality parameter deleted successfully.')
      await refresh()
    } catch (err) {
      console.error('Error deleting quality parameter', err)
      toast.error(err instanceof Error ? err.message : 'Unable to delete quality parameter.')
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  if (loading && qualityParameters.length === 0) {
    return (
      <PageLayout title="Quality Parameters" activeItem="settings" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading quality parameters..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Quality Parameters"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Quality Parameter
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total parameters</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{qualityParameters.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Quality Parameters</CardTitle>
          <CardDescription>
            Manage quality parameters that can be assigned to processes. Each process can have different quality parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="qp-search">Search</Label>
              <Input
                id="qp-search"
                placeholder="Search by code or name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2">
              <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                <div className="font-medium text-text-dark">Results</div>
                <div>
                  {filteredParameters.length} of {qualityParameters.length}
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
              {error.message ?? 'Unable to load quality parameters from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={filteredParameters}
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
                  {isEditMode ? 'Edit Quality Parameter' : 'Add Quality Parameter'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {isEditMode
                    ? 'Update the quality parameter details.'
                    : 'Define the code and name for the new quality parameter.'}
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
                <Label htmlFor="qp-code">Code <span className="text-red-500">*</span></Label>
                <Input
                  id="qp-code"
                  name="code"
                  placeholder="e.g. MECHANICAL_DAMAGE"
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
                <Label htmlFor="qp-name">Name <span className="text-red-500">*</span></Label>
                <Input
                  id="qp-name"
                  name="name"
                  placeholder="e.g. Mechanical damage"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {formErrors.name ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                ) : null}
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

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setParameterToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete quality parameter?</AlertDialogTitle>
            <AlertDialogDescription>
              {parameterToDelete
                ? `Are you sure you want to delete "${parameterToDelete.name}"? This action cannot be undone.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => parameterToDelete && handleDelete(parameterToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default QualityParameters
