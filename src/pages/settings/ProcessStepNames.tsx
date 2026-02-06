import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, X, Pencil, Trash2, Workflow } from 'lucide-react'
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
  description?: string
}

const sortableColumns = [
  { value: 'name', label: 'Name' },
  { value: 'code', label: 'Code' },
  { value: 'updated_at', label: 'Last Updated' },
  { value: 'created_at', label: 'Created' },
]

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function generatePreviewCode(name: string): string {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return 'STEP'
  if (cleaned.length <= 4) return cleaned
  return cleaned.slice(0, 4)
}

function ProcessStepNames() {
  const {
    processStepNames,
    loading,
    error,
    refresh,
    create,
    update,
    delete: deleteStepName,
  } = useProcessStepNames()

  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingStepName, setEditingStepName] = useState<ProcessStepName | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [stepNameToDelete, setStepNameToDelete] = useState<ProcessStepName | null>(null)

  const [formData, setFormData] = useState<FormData>({ name: '', description: '' })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const filteredStepNames = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()

    const matchesSearch = (row: ProcessStepName): boolean => {
      if (!normalised) return true
      const code = (row.code ?? '').toLowerCase()
      const name = (row.name ?? '').toLowerCase()
      const description = (row.description ?? '').toLowerCase()
      return code.includes(normalised) || name.includes(normalised) || description.includes(normalised)
    }

    const comparator = (a: ProcessStepName, b: ProcessStepName): number => {
      const direction = sortDirection === 'asc' ? 1 : -1

      if (sortBy === 'updated_at' || sortBy === 'created_at') {
        const aDate = parseDate(a[sortBy])?.getTime() ?? 0
        const bDate = parseDate(b[sortBy])?.getTime() ?? 0
        return (aDate - bDate) * direction
      }

      const aValue = String(a[sortBy as keyof ProcessStepName] ?? '').toLowerCase()
      const bValue = String(b[sortBy as keyof ProcessStepName] ?? '').toLowerCase()
      if (aValue < bValue) return -1 * direction
      if (aValue > bValue) return 1 * direction
      return 0
    }

    return processStepNames.filter(matchesSearch).sort(comparator)
  }, [processStepNames, searchTerm, sortBy, sortDirection])

  const paginatedStepNames = useMemo(
    () => filteredStepNames.slice((page - 1) * pageSize, page * pageSize),
    [filteredStepNames, page, pageSize]
  )

  const stats = useMemo(() => {
    const total = processStepNames.length
    const withDescription = processStepNames.filter((item) => (item.description ?? '').trim().length > 0).length
    const updatedLast7Days = processStepNames.filter((item) => {
      const date = parseDate(item.updated_at)
      if (!date) return false
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      return Date.now() - date.getTime() <= sevenDaysMs
    }).length

    return {
      total,
      withDescription,
      withoutDescription: total - withDescription,
      updatedLast7Days,
    }
  }, [processStepNames])

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading process step names...'
    if (error) return 'Unable to load process step names.'
    return 'No process step names found.'
  }, [error, loading])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredStepNames.length / pageSize))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [filteredStepNames.length, page, pageSize])

  const handleOpenCreateModal = () => {
    setFormData({ name: '', description: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingStepName(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ name: '', description: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingStepName(null)
    setIsModalOpen(false)
  }

  const handleEdit = (stepName: ProcessStepName) => {
    setFormData({
      name: stepName.name ?? '',
      description: stepName.description ?? '',
    })
    setFormErrors({})
    setIsEditMode(true)
    setEditingStepName(stepName)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (stepName: ProcessStepName) => {
    setStepNameToDelete(stepName)
    setDeleteAlertOpen(true)
  }

  const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setFormData((previous) => ({ ...previous, [name]: value }))
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((previous) => ({ ...previous, [name]: undefined }))
    }
  }

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {}

    if (!formData.name.trim()) {
      nextErrors.name = 'Name is required.'
    }
    if (formData.name.trim().length > 80) {
      nextErrors.name = 'Name must be 80 characters or fewer.'
    }
    if (formData.description.trim().length > 300) {
      nextErrors.description = 'Description must be 300 characters or fewer.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      if (isEditMode && editingStepName) {
        const { error: updateError } = await update(
          editingStepName.id,
          formData.name,
          formData.description || undefined
        )

        if (updateError) {
          if (updateError.code === '23505') {
            toast.error('A process step with this name or code already exists.')
            setIsSubmitting(false)
            return
          }
          throw updateError
        }

        toast.success('Process step name updated.')
      } else {
        const { error: createError } = await create(formData.name, formData.description || undefined)

        if (createError) {
          if (createError.code === '23505') {
            toast.error('A process step with this name or code already exists.')
            setIsSubmitting(false)
            return
          }
          throw createError
        }

        toast.success('Process step name created.')
      }

      setIsModalOpen(false)
      setFormData({ name: '', description: '' })
      setFormErrors({})
      setIsEditMode(false)
      setEditingStepName(null)
    } catch (submitError) {
      console.error('Error saving process step name', submitError)
      toast.error(
        submitError instanceof Error ? submitError.message : 'Unable to save process step name.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (stepName: ProcessStepName) => {
    setIsDeleting(true)
    try {
      const { error: deleteError } = await deleteStepName(stepName.id)

      if (deleteError) {
        if (deleteError.code === '23503') {
          toast.error('Cannot delete this step name because it is used in existing process steps.')
          return
        }
        throw deleteError
      }

      toast.success('Process step name deleted.')
      setDeleteAlertOpen(false)
      setStepNameToDelete(null)
    } catch (deleteErr) {
      console.error('Error deleting process step name', deleteErr)
      toast.error(deleteErr instanceof Error ? deleteErr.message : 'Unable to delete process step name.')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (row: ProcessStepName) => (
          <span className="inline-flex items-center rounded-full bg-olive-light/20 px-2.5 py-1 text-xs font-semibold text-text-dark">
            {row.code ?? '—'}
          </span>
        ),
        mobileRender: (row: ProcessStepName) => (
          <span className="inline-flex items-center rounded-full bg-olive-light/20 px-2.5 py-1 text-xs font-semibold text-text-dark">
            {row.code ?? '—'}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'Step Name',
        render: (row: ProcessStepName) => (
          <div>
            <div className="font-medium text-text-dark">{row.name ?? '—'}</div>
            <div className="mt-1 text-xs text-text-dark/60">{row.description ?? 'No description'}</div>
          </div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{row.name ?? '—'}</div>
            <div className="mt-1 text-xs text-text-dark/60">{row.description ?? 'No description'}</div>
          </div>
        ),
      },
      {
        key: 'updated_at',
        header: 'Last Updated',
        render: (row: ProcessStepName) => (
          <div className="text-sm text-text-dark/70">{formatDate(row.updated_at)}</div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="text-right text-sm text-text-dark/70">{formatDate(row.updated_at)}</div>
        ),
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        mobileValueClassName: 'text-right',
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (row: ProcessStepName) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                handleEdit(row)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={(event) => {
                event.stopPropagation()
                handleDeleteClick(row)
              }}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        ),
        mobileRender: (row: ProcessStepName) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                handleEdit(row)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={(event) => {
                event.stopPropagation()
                handleDeleteClick(row)
              }}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        ),
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        mobileValueClassName: 'text-right',
      },
    ],
    [isDeleting]
  )

  if (loading && processStepNames.length === 0) {
    return (
      <PageLayout
        title="Process Step Names"
        activeItem="settings"
        contentClassName="px-4 py-8 sm:px-6 lg:px-8"
      >
        <Spinner text="Loading process step names..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Process Step Names"
      activeItem="settings"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Step Name
        </Button>
      }
      contentClassName="px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total Step Names</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>With Description</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{stats.withDescription}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Without Description</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.withoutDescription}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Updated Last 7 Days</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{stats.updatedLast7Days}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Process Step Name Directory</CardTitle>
          <CardDescription>
            Create, edit, and remove reusable process step names used across process definitions.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label htmlFor="psn-search">Search</Label>
              <Input
                id="psn-search"
                placeholder="Search by code, name, or description"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value)
                  setPage(1)
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="psn-sort-field">Sort by</Label>
              <div className="mt-1 flex gap-2">
                <select
                  id="psn-sort-field"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                >
                  {sortableColumns.map((column) => (
                    <option key={column.value} value={column.value}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-olive-light/60 px-4"
                  onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                >
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </Button>
              </div>
            </div>
            <div className="sm:col-span-2 flex items-end justify-between gap-2">
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
              {error.message ?? 'Unable to load process step names from database.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={paginatedStepNames}
            rowKey="id"
            emptyMessage={emptyMessage}
            tableClassName=""
            mobileCardClassName=""
            getRowClassName={() => ''}
            onRowClick={undefined}
          />

          {filteredStepNames.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2">
              <div className="text-sm text-text-dark/70">
                Showing {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredStepNames.length)} of {filteredStepNames.length}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="psn-page-size" className="text-sm text-text-dark/70">
                  Per page
                </label>
                <select
                  id="psn-page-size"
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
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={page * pageSize >= filteredStepNames.length}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 bg-gradient-to-r from-olive-light/30 via-olive-light/20 to-beige px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-olive shadow-sm">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-dark">
                    {isEditMode ? 'Edit Process Step Name' : 'Add Process Step Name'}
                  </h2>
                  <p className="text-sm text-text-dark/70">
                    {isEditMode
                      ? 'Update the step metadata used in process definitions.'
                      : 'Create a new reusable step name for your process library.'}
                  </p>
                </div>
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

            <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
              <div className="rounded-xl border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-dark">Core Details</h3>
                  <p className="text-xs text-text-dark/60">
                    Code is generated automatically from the name and saved with the record.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="psn-name">
                      Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="psn-name"
                      name="name"
                      placeholder="e.g. Sorting & Grading"
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
                    <Label htmlFor="psn-code-preview">Generated Code</Label>
                    <Input
                      id="psn-code-preview"
                      value={generatePreviewCode(formData.name)}
                      readOnly
                      disabled
                      className="mt-1 bg-olive-light/20 text-text-dark"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm">
                <Label htmlFor="psn-description">Description</Label>
                <textarea
                  id="psn-description"
                  name="description"
                  rows={4}
                  placeholder="Optional context for operators and planning teams"
                  value={formData.description}
                  onChange={handleFormChange}
                  className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                  disabled={isSubmitting}
                />
                {formErrors.description ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.description}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-olive-light/30 pt-4">
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
                  {isSubmitting ? 'Saving...' : isEditMode ? 'Update Step Name' : 'Save Step Name'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={deleteAlertOpen}
        onOpenChange={(open) => {
          setDeleteAlertOpen(open)
          if (!open) setStepNameToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete process step name?</AlertDialogTitle>
            <AlertDialogDescription>
              {stepNameToDelete
                ? `Delete \"${stepNameToDelete.name}\"? This cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => stepNameToDelete && handleDelete(stepNameToDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default ProcessStepNames
