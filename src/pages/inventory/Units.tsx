import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, RefreshCcw, Ruler, X, Edit, Trash2 } from 'lucide-react'
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

interface Unit {
  id: number
  name: string
  symbol: string
  created_at: string
  createdAtDate?: Date | null
}

interface FormData {
  name: string
  symbol: string
}

interface FormErrors {
  name?: string
  symbol?: string
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
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function Units() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [unitToDelete, setUnitToDelete] = useState<Unit | null>(null)
  const [formData, setFormData] = useState<FormData>({ name: '', symbol: '' })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  const deriveUnitName = useCallback((symbol: string) => {
    const trimmed = symbol.trim()
    if (!trimmed) return ''
    const key = trimmed.toLowerCase()
    const lookup: Record<string, string> = {
      kg: 'Kilogram',
      g: 'Gram',
      mg: 'Milligram',
      lb: 'Pound',
      oz: 'Ounce',
      l: 'Litre',
      ml: 'Millilitre',
      m: 'Metre',
      cm: 'Centimetre',
      mm: 'Millimetre',
      pc: 'Piece',
      pcs: 'Pieces',
      unit: 'Unit',
      units: 'Units',
      bag: 'Bag',
      bags: 'Bags',
      box: 'Box',
      boxes: 'Boxes',
      pack: 'Pack',
      packs: 'Packs',
    }
    if (lookup[key]) return lookup[key]
    return trimmed.toUpperCase()
  }, [])

  const fetchUnits = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('units')
      .select('id, name, symbol, created_at')
      .order('created_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Error fetching units', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load units from Supabase.')
      setUnits([])
      setLoading(false)
      return
    }

    setUnits(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  const preparedUnits = useMemo(
    () =>
      units.map((unit: Unit) => ({
        ...unit,
        createdAtDate: parseDate(unit.created_at),
      })),
    [units]
  )

  const filteredUnits = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()
    if (!normalisedSearch) {
      return preparedUnits
    }
    return preparedUnits.filter((unit) => {
      const name = unit.name ?? ''
      const symbol = unit.symbol ?? ''
      return (
        name.toLowerCase().includes(normalisedSearch) || symbol.toLowerCase().includes(normalisedSearch)
      )
    })
  }, [preparedUnits, searchTerm])

  const stats = useMemo(() => {
    const total = preparedUnits.length
    let addedLastThirtyDays = 0
    let latestUnit: (Unit & { createdAtDate: Date | null }) | null = null

    const now = Date.now()
    preparedUnits.forEach((unit) => {
      if (unit.createdAtDate) {
        if (!latestUnit || !latestUnit.createdAtDate || unit.createdAtDate > latestUnit.createdAtDate) {
          latestUnit = unit as Unit & { createdAtDate: Date | null }
        }
        if (now - unit.createdAtDate.getTime() <= THIRTY_DAYS_MS) {
          addedLastThirtyDays += 1
        }
      }
    })

    return {
      total,
      addedLastThirtyDays,
      latestUnit,
    } as {
      total: number
      addedLastThirtyDays: number
      latestUnit: (Unit & { createdAtDate: Date | null }) | null
    }
  }, [preparedUnits])

  const emptyMessage = useMemo(() => {
    if (loading) {
      return 'Loading units…'
    }
    if (error) {
      return 'Unable to load units.'
    }
    return 'No units found.'
  }, [error, loading])

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Unit',
        render: (unit: Unit & { createdAtDate?: Date | null }) => (
          <div>
            <div className="font-medium text-text-dark">{unit.name ?? 'Unnamed unit'}</div>
            <div className="text-xs text-text-dark/60">{unit.symbol ? `Symbol: ${unit.symbol}` : 'No symbol'}</div>
          </div>
        ),
        mobileRender: (unit: Unit & { createdAtDate?: Date | null }) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{unit.name ?? 'Unnamed unit'}</div>
            <div className="text-xs text-text-dark/60">{unit.symbol ? `Symbol: ${unit.symbol}` : 'No symbol'}</div>
          </div>
        ),
      },
      {
        key: 'symbol',
        header: 'Symbol',
        render: (unit: Unit & { createdAtDate?: Date | null }) => unit.symbol ?? '—',
        mobileRender: (unit: Unit & { createdAtDate?: Date | null }) => unit.symbol ?? '—',
        cellClassName: 'text-text-dark/80',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'created_at',
        header: 'Created',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-sm text-text-dark/70',
        render: (unit: Unit & { createdAtDate?: Date | null }) => formatDate(unit.createdAtDate),
        mobileRender: (unit: Unit & { createdAtDate?: Date | null }) => formatDate(unit.createdAtDate),
      },
      {
        key: 'actions',
        header: 'Actions',
        render: (unit: Unit) => (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(unit)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(unit)}
              className="text-red-600 hover:bg-red-50"
              title="Delete"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        mobileRender: (unit: Unit) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(unit)}
              className="text-blue-600 hover:bg-blue-50"
              title="Edit"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeleteClick(unit)}
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

  const handleOpenModal = () => {
    setFormData({ name: '', symbol: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) {
      return
    }
    setFormData({ name: '', symbol: '' })
    setFormErrors({})
    setIsEditMode(false)
    setEditingId(null)
    setIsModalOpen(false)
  }

  const handleEdit = (unit: Unit) => {
    setFormData({
      symbol: unit.symbol ?? '',
      name: deriveUnitName(unit.symbol ?? ''),
    })
    setFormErrors({})
    setIsEditMode(true)
    setEditingId(unit.id)
    setIsModalOpen(true)
  }

  const handleDeleteClick = (unit: Unit) => {
    setUnitToDelete(unit)
    setDeleteAlertOpen(true)
  }

  const handleFormChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setFormData((previous) => {
      if (name === 'symbol') {
        const nextSymbol = value
        return {
          ...previous,
          symbol: nextSymbol,
          name: deriveUnitName(nextSymbol),
        }
      }
      return {
        ...previous,
        [name]: value,
      }
    })
  }

  const validateForm = () => {
    const errors: FormErrors = {}
    if (!formData.symbol.trim()) {
      errors.symbol = 'Symbol is required.'
    }
    if (formData.symbol.trim().length > 16) {
      errors.symbol = 'Symbol must be 16 characters or fewer.'
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
        name: deriveUnitName(formData.symbol),
        symbol: formData.symbol.trim(),
      }
      if (isEditMode && editingId) {
        const { error: updateError } = await supabase
          .from('units')
          .update(payload)
          .eq('id', editingId)
        if (updateError) throw updateError
        toast.success('Unit updated successfully.')
        await fetchUnits()
      } else {
        const { data, error: insertError } = await supabase
          .from('units')
          .insert(payload)
          .select('id, name, symbol, created_at')
          .single()

        if (insertError) {
          throw insertError
        }

        toast.success('Unit added successfully.')
        setUnits((previous) => (data ? [data as Unit, ...previous] : previous))
      }
      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ name: '', symbol: '' })
      setFormErrors({})
      setIsEditMode(false)
      setEditingId(null)
    } catch (insertError) {
      console.error('Error creating unit', insertError)
      const errorMessage = insertError instanceof Error ? insertError.message : 'Unable to add unit.'
      toast.error(errorMessage)
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!unitToDelete) return
    setIsDeleting(true)
    try {
      const { error: deleteError } = await supabase.from('units').delete().eq('id', unitToDelete.id)
      if (deleteError) throw deleteError
      toast.success('Unit deleted successfully.')
      setUnits((previous) => previous.filter((unit) => unit.id !== unitToDelete.id))
      setDeleteAlertOpen(false)
      setUnitToDelete(null)
    } catch (err) {
      console.error('Error deleting unit', err)
      toast.error(err instanceof Error ? err.message : 'Unable to delete unit.')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <PageLayout
        title="Units"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading units..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Units"
      activeItem="inventory"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Unit
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total Units</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Added last 30 days</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.addedLastThirtyDays}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Most recent</CardDescription>
            <CardTitle className="flex items-center gap-3 text-2xl font-semibold text-text-dark">
              <Ruler className="h-5 w-5 text-olive" />
              {stats.latestUnit?.name ?? '—'}
            </CardTitle>
            <p className="text-sm text-text-dark/60">
              {stats.latestUnit?.createdAtDate ? formatDate(stats.latestUnit.createdAtDate) : 'No date'}
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Units of Measure</CardTitle>
          <CardDescription>Manage measurement units available throughout the system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="unit-search">Search</Label>
              <Input
                id="unit-search"
                placeholder="Search by name or symbol"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2">
              <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70">
                <div className="font-medium text-text-dark">Results</div>
                <div>
                  {filteredUnits.length} of {preparedUnits.length}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchUnits}
                disabled={loading}
              >
                <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load units from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={loading ? [] : filteredUnits}
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
                  {isEditMode ? 'Edit Unit' : 'Add Unit'}
                </h2>
                <p className="text-sm text-text-dark/70">Enter a symbol and the name will be generated automatically.</p>
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
                <Label htmlFor="unit-name">Name (auto-generated)</Label>
                <Input
                  id="unit-name"
                  name="name"
                  placeholder="e.g. Kilogram"
                  value={formData.name}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled
                />
              </div>

              <div>
                <Label htmlFor="unit-symbol">Symbol</Label>
                <Input
                  id="unit-symbol"
                  name="symbol"
                  placeholder="e.g. kg"
                  value={formData.symbol}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled={isSubmitting}
                />
                {formErrors.symbol ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.symbol}</p>
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
                  {isSubmitting ? 'Saving…' : isEditMode ? 'Update Unit' : 'Save Unit'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setUnitToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete unit?</AlertDialogTitle>
            <AlertDialogDescription>
              {unitToDelete
                ? `Delete unit "${unitToDelete.name ?? unitToDelete.symbol ?? 'Unknown'}"? This cannot be undone.`
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

export default Units
