import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Warehouse, Plus, RefreshCcw, X, Edit, Trash2 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import type { PostgrestError } from '@supabase/supabase-js'
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

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

interface WarehouseData {
  id: number
  name: string
  code: string | null
  enabled: boolean
  created_at: string
  isEnabled?: boolean
  createdAtDate?: Date | null
}

interface FormData {
  name: string
  code: string
  enabled: boolean
}

interface FormErrors {
  name?: string
  code?: string
}

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

function formatDate(value: Date | null | undefined): string {
  const date = parseDate(value as string | Date | null | undefined)
  if (!date) {
    return '—'
  }
  return dateFormatter.format(date)
}

function Warehouses() {
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [warehouseToDelete, setWarehouseToDelete] = useState<WarehouseData | null>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    code: '',
    enabled: true,
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const existingCodes = useMemo(
    () => new Set(warehouses.map((w) => (w.code ?? '').toUpperCase()).filter(Boolean)),
    [warehouses]
  )

  const generateWarehouseCode = useCallback(
    (name: string) => {
      const cleaned = name
        .trim()
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!cleaned) return ''

      const words = cleaned.split(' ').filter(Boolean)
      let base = ''
      if (words.length >= 2) {
        base = words.map((word) => word[0]).join('').toUpperCase()
      } else if (words.length === 1) {
        base = words[0].slice(0, 3).toUpperCase()
      }
      if (!base) base = 'WH'
      let code = base
      let counter = 1
      while (existingCodes.has(code)) {
        counter += 1
        code = `${base}-${String(counter).padStart(2, '0')}`
      }
      return code
    },
    [existingCodes]
  )

  const fetchWarehouses = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('warehouses')
      .select('id, name, code, enabled, created_at')
      .order('created_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Error fetching warehouses', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load warehouses from Supabase.')
      setWarehouses([])
      setLoading(false)
      return
    }

    setWarehouses(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchWarehouses()
  }, [fetchWarehouses])

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      code: '',
      enabled: true,
    })
    setFormErrors({})
    setIsSubmitting(false)
  }, [])

  const preparedWarehouses = useMemo(
    () =>
      warehouses.map((warehouse: WarehouseData) => {
        const createdAtDate = parseDate(warehouse.created_at)
        return {
          ...warehouse,
          isEnabled: warehouse.enabled !== false,
          createdAtDate,
        }
      }),
    [warehouses]
  )

  const filteredWarehouses = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    return preparedWarehouses.filter((warehouse) => {
      const matchesSearch =
        normalisedSearch.length === 0 ||
        (warehouse.name ?? '').toLowerCase().includes(normalisedSearch) ||
        (warehouse.code ?? '').toLowerCase().includes(normalisedSearch)

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ENABLED' && warehouse.isEnabled) ||
        (statusFilter === 'DISABLED' && !warehouse.isEnabled)

      return matchesSearch && matchesStatus
    })
  }, [preparedWarehouses, searchTerm, statusFilter])

  const stats = useMemo(() => {
    const now = Date.now()
    let active = 0
    let recent = 0

    filteredWarehouses.forEach((warehouse) => {
      if (warehouse.isEnabled) {
        active += 1
      }
      if (warehouse.createdAtDate && now - warehouse.createdAtDate.getTime() <= THIRTY_DAYS_MS) {
        recent += 1
      }
    })

    const total = filteredWarehouses.length

    return {
      total,
      active,
      disabled: total - active,
      recent,
    }
  }, [filteredWarehouses])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Warehouse',
        render: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) => (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-olive-light/20 text-olive-dark">
              <Warehouse className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium text-text-dark">
                {warehouse.name ?? 'Unnamed warehouse'}
              </div>
              <div className="text-xs text-text-dark/60">
                {warehouse.code ? `Code: ${warehouse.code}` : `ID: ${warehouse.id}`}
              </div>
            </div>
          </div>
        ),
        mobileRender: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">
              {warehouse.name ?? 'Unnamed warehouse'}
            </div>
            <div className="text-xs text-text-dark/60">
              {warehouse.code ? `Code: ${warehouse.code}` : `ID: ${warehouse.id}`}
            </div>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) => (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              warehouse.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {warehouse.isEnabled ? 'Active' : 'Disabled'}
          </span>
        ),
        mobileRender: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) =>
          warehouse.isEnabled ? 'Active' : 'Disabled',
        cellClassName: 'text-sm',
      },
      {
        key: 'code',
        header: 'Code',
        render: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) =>
          warehouse.code ?? '—',
        mobileRender: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) =>
          warehouse.code ?? '—',
        cellClassName: 'text-text-dark/80',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'created_at',
        header: 'Created',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-sm text-text-dark/70',
        render: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) =>
          formatDate(warehouse.createdAtDate),
        mobileRender: (warehouse: WarehouseData & { isEnabled?: boolean; createdAtDate?: Date | null }) =>
          formatDate(warehouse.createdAtDate),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (warehouse: WarehouseData) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(warehouse)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(warehouse)}
              className="text-red-600 hover:bg-red-50"
              title="Delete"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        mobileRender: (warehouse: WarehouseData) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(warehouse)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(warehouse)}
              className="text-red-600 hover:bg-red-50"
              title="Delete"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [isDeleting]
  )

  const emptyMessage = useMemo(() => {
    if (loading) {
      return 'Loading warehouses…'
    }
    if (error) {
      return 'Unable to load warehouses.'
    }
    return 'No warehouses found.'
  }, [error, loading])

  const handleOpenModal = () => {
    resetForm()
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    resetForm()
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEdit = (warehouse: WarehouseData) => {
    setFormData({
      name: warehouse.name ?? '',
      code: warehouse.code ?? '',
      enabled: warehouse.enabled !== false,
    })
    setFormErrors({})
    setIsEditMode(true)
    setEditingId(warehouse.id)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (warehouse: WarehouseData) => {
    setWarehouseToDelete(warehouse)
    setDeleteAlertOpen(true)
  }

  const handleFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target
    setFormData((previous) => {
      if (name === 'name') {
        const nextName = value
        return {
          ...previous,
          name: nextName,
          code: generateWarehouseCode(nextName),
        }
      }
      return {
        ...previous,
        [name]: type === 'checkbox' ? checked : value,
      }
    })
  }

  const validateForm = () => {
    const errors: FormErrors = {}
    if (!formData.name.trim()) {
      errors.name = 'Name is required.'
    }
    if (formData.code && formData.code.length > 32) {
      errors.code = 'Code must be 32 characters or fewer.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        enabled: formData.enabled,
      }
      if (isEditMode && editingId) {
        const { error: updateError } = await supabase
          .from('warehouses')
          .update(payload)
          .eq('id', editingId)
        if (updateError) throw updateError
        toast.success('Warehouse updated successfully.')
        await fetchWarehouses()
      } else {
        const { data, error: insertError } = await supabase
          .from('warehouses')
          .insert(payload)
          .select('id, name, code, enabled, created_at')
          .single()

        if (insertError) {
          throw insertError
        }

        toast.success('Warehouse added successfully.')
        setWarehouses((previous) => (data ? [data as WarehouseData, ...previous] : previous))
      }
      handleCloseModal()
    } catch (insertError) {
      console.error('Error creating warehouse', insertError)
      const errorMessage = insertError instanceof Error ? insertError.message : 'Unable to add warehouse.'
      toast.error(errorMessage)
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!warehouseToDelete) return
    setIsDeleting(true)
    try {
      const { error: deleteError } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', warehouseToDelete.id)
      if (deleteError) throw deleteError
      toast.success('Warehouse deleted successfully.')
      setWarehouses((previous) => previous.filter((warehouse) => warehouse.id !== warehouseToDelete.id))
      setDeleteAlertOpen(false)
      setWarehouseToDelete(null)
    } catch (err) {
      console.error('Error deleting warehouse', err)
      toast.error(err instanceof Error ? err.message : 'Unable to delete warehouse.')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageLayout
        title="Warehouses"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading warehouses..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Warehouses"
      activeItem="inventory"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Warehouse
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total in view</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.active}/{stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Disabled</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.disabled}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Added last 30 days</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.recent}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Warehouses</CardTitle>
          <CardDescription>Manage your warehouse locations and activation status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="warehouse-search">Search</Label>
              <Input
                id="warehouse-search"
                placeholder="Search by name or code"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All statuses</option>
                <option value="ENABLED">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                <div className="font-medium text-text-dark">Results</div>
                <div>
                  {filteredWarehouses.length} of {preparedWarehouses.length}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchWarehouses}
                disabled={loading}
              >
                <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load warehouses from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={loading ? [] : filteredWarehouses}
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
          <div className="w-full max-w-xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">
                  {isEditMode ? 'Edit Warehouse' : 'Add Warehouse'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {isEditMode ? 'Update the warehouse details.' : 'Capture a new warehouse location.'}
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

            <form onSubmit={handleSubmit} className="px-6 py-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="warehouse-name">Warehouse name</Label>
                  <Input
                    id="warehouse-name"
                    name="name"
                    placeholder="e.g. Eastern Cape Hub"
                    value={formData.name}
                    onChange={handleFormChange}
                    disabled={isSubmitting}
                    className={formErrors.name ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                  />
                  {formErrors.name ? (
                    <p className="text-xs text-red-600">{formErrors.name}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse-code">Code (auto-generated)</Label>
                  <Input
                    id="warehouse-code"
                    name="code"
                    placeholder="e.g. EC-001"
                    value={formData.code}
                    onChange={handleFormChange}
                    disabled
                    className={formErrors.code ? 'border-red-300 focus-visible:ring-red-500' : undefined}
                  />
                  {formErrors.code ? (
                    <p className="text-xs text-red-600">{formErrors.code}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 rounded-md border border-olive-light/40 bg-olive-light/10 px-4 py-3">
                  <input
                    id="warehouse-enabled"
                    name="enabled"
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={handleFormChange}
                    disabled={isSubmitting}
                    className="h-4 w-4 rounded border-olive-light/60 text-olive focus:ring-olive"
                  />
                  <div>
                    <Label htmlFor="warehouse-enabled" className="cursor-pointer">
                      Active
                    </Label>
                    <p className="text-xs text-text-dark/60">
                      Keep enabled to make the warehouse selectable for supplies.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="text-text-dark hover:bg-olive-light/20"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="bg-olive hover:bg-olive-dark">
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Update Warehouse' : 'Save Warehouse'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setWarehouseToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              {warehouseToDelete
                ? `Delete warehouse "${warehouseToDelete.name ?? 'Unknown'}"? This cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default Warehouses
