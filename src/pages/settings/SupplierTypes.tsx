import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Edit, Plus, RefreshCcw, Trash2, X, Sparkles } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { useSupplierTypes, type SupplierType } from '@/hooks/useSupplierTypes'
import SettingsTour from '@/components/tour/SettingsTour'
import { useSettingsTour, type TourStep } from '@/hooks/useSettingsTour'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'

interface FormData {
  code: string
  name: string
}

interface FormErrors {
  name?: string
  code?: string
}

function SupplierTypes() {
  const { supplierTypes, loading, error, refresh } = useSupplierTypes()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({ code: '', name: '' })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [editingType, setEditingType] = useState<SupplierType | null>(null)
  const [deletingCode, setDeletingCode] = useState<string | null>(null)

  const existingCodes = useMemo(
    () => new Set(supplierTypes.map((t) => (t.code ?? '').toUpperCase()).filter(Boolean)),
    [supplierTypes]
  )

  const generateTypeCode = (name: string) => {
    const cleaned = name
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!cleaned) return ''
    const base = cleaned
      ? cleaned
          .split(' ')
          .filter(Boolean)
          .map((word) => word[0])
          .join('')
          .toUpperCase()
      : ''
    let code = base || 'SUP'
    let counter = 1
    while (existingCodes.has(code)) {
      counter += 1
      code = `${base || 'SUP'}-${String(counter).padStart(2, '0')}`
    }
    return code
  }

  const filteredTypes = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    if (!normalised) return supplierTypes
    return supplierTypes.filter((t) => {
      const code = (t.code ?? '').toLowerCase()
      const name = (t.name ?? '').toLowerCase()
      return code.includes(normalised) || name.includes(normalised)
    })
  }, [supplierTypes, searchTerm])

  const emptyMessage = useMemo(() => {
    if (loading) return 'Loading supplier types…'
    if (error) return 'Unable to load supplier types.'
    return 'No supplier types found.'
  }, [error, loading])

  const handleOpenModal = () => {
    setEditingType(null)
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setEditingType(null)
    setIsModalOpen(false)
  }

  const handleEditType = (type: SupplierType) => {
    setEditingType(type)
    setFormData({ code: type.code ?? '', name: type.name ?? '' })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => {
      if (name === 'name') {
        return editingType
          ? { ...prev, name: value }
          : { ...prev, name: value, code: generateTypeCode(value) }
      }
      return { ...prev, [name]: value }
    })
  }

  const validateForm = (): boolean => {
    const err: FormErrors = {}
    if (!formData.name.trim()) err.name = 'Name is required.'
    if (!editingType && !formData.code.trim()) err.code = 'Code is required.'
    setFormErrors(err)
    return Object.keys(err).length === 0
  }

  const handleDeleteType = async (type: SupplierType) => {
    const confirmed = window.confirm(`Delete supplier type "${type.name}"? This cannot be undone.`)
    if (!confirmed) return

    setDeletingCode(type.code)
    try {
      const { error: deleteError } = await supabase.from('supplier_types').delete().eq('code', type.code)
      if (deleteError) {
        throw deleteError
      }

      toast.success('Supplier type deleted successfully.')
      await refresh()
    } catch (err) {
      console.error('Error deleting supplier type', err)
      toast.error(getUserFriendlyErrorMessage(err, 'Unable to delete supplier type.'))
    } finally {
      setDeletingCode(null)
    }
  }

  const columns = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        render: (row: SupplierType) => (
          <div className="font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
        mobileRender: (row: SupplierType) => (
          <div className="text-right font-medium text-text-dark">{row.code ?? '—'}</div>
        ),
      },
      {
        key: 'name',
        header: 'Name',
        render: (row: SupplierType) => <div className="text-text-dark/80">{row.name ?? '—'}</div>,
        mobileRender: (row: SupplierType) => (
          <div className="text-right text-text-dark/80">{row.name ?? '—'}</div>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        mobileValueClassName: 'text-right',
        render: (row: SupplierType) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-olive-light/60 bg-beige/30 text-text-dark hover:bg-beige/50"
              onClick={() => handleEditType(row)}
              aria-label={`Edit ${row.name}`}
              title="Edit type"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => void handleDeleteType(row)}
              aria-label={`Delete ${row.name}`}
              title="Delete type"
              disabled={isSubmitting || deletingCode === row.code}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        mobileRender: (row: SupplierType) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-olive-light/60 bg-beige/30 text-text-dark hover:bg-beige/50"
              onClick={() => handleEditType(row)}
              aria-label={`Edit ${row.name}`}
              title="Edit type"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => void handleDeleteType(row)}
              aria-label={`Delete ${row.name}`}
              title="Delete type"
              disabled={isSubmitting || deletingCode === row.code}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [deletingCode, isSubmitting]
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      const { error: categoryError } = await supabase.from('supplier_categories').upsert(
        [
          { code: 'PRODUCT', name: 'Product Supplier' },
          { code: 'SERVICE', name: 'Service / Operational Supplier' },
        ],
        { onConflict: 'code' }
      )

      if (categoryError) {
        throw categoryError
      }

      const payload = editingType
        ? {
            name: formData.name.trim(),
          }
        : {
            code: formData.code.trim(),
            name: formData.name.trim(),
            category_code: 'PRODUCT',
          }

      const { error: writeError } = editingType
        ? await supabase.from('supplier_types').update(payload).eq('code', editingType.code)
        : await supabase.from('supplier_types').insert(payload)

      if (writeError) {
        if (writeError.code === '23505') {
          toast.error('A supplier type with this code already exists.')
          setFormErrors((prev) => ({ ...prev, code: 'Code must be unique.' }))
        } else if (writeError.code === '23503') {
          toast.error('Supplier categories are not configured. Run latest DB migrations and try again.')
        } else {
          throw writeError
        }
        setIsSubmitting(false)
        return
      }

      toast.success(editingType ? 'Supplier type updated successfully.' : 'Supplier type added successfully.')
      await refresh()
      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ code: '', name: '' })
      setFormErrors({})
      setEditingType(null)
    } catch (err) {
      console.error('Error creating supplier type', err)
      toast.error(err instanceof Error ? err.message : 'Unable to save supplier type.')
      setIsSubmitting(false)
    }
  }

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        id: 'intro',
        title: 'Supplier types overview',
        description:
          'Use this page to manage the supplier type labels that appear when creating and organizing suppliers.',
        placement: 'center',
      },
      {
        id: 'search',
        target: '[data-tour="supplier-types-search"]',
        title: 'Search existing supplier types',
        description:
          'Search by code or name before adding a new type so the list stays clean and consistent.',
        placement: 'bottom',
      },
      {
        id: 'results',
        target: '[data-tour="supplier-types-results"]',
        title: 'Review the current types',
        description:
          'This table shows the supplier types already available to the team.',
        placement: 'top',
      },
      {
        id: 'add-button',
        target: '[data-tour="supplier-types-add-button"]',
        title: 'Add a new supplier type',
        description:
          'Use this action whenever a new supplier category needs to be available in supplier records.',
        placement: 'left',
      },
      {
        id: 'name',
        target: '[data-tour="supplier-types-name-field"]',
        title: 'Enter the type name',
        description:
          'Start with the display name. The code is generated automatically from it.',
        placement: 'bottom',
        beforeEnter: () => {
          handleOpenModal()
        },
      },
      {
        id: 'code',
        target: '[data-tour="supplier-types-code-field"]',
        title: 'Review the generated code',
        description:
          'The code is derived from the name so supplier type records stay consistent.',
        placement: 'bottom',
        beforeEnter: () => {
          handleOpenModal()
        },
      },
      {
        id: 'save',
        target: '[data-tour="supplier-types-save-button"]',
        title: 'Save the supplier type',
        description:
          'Save when the name looks right to make the new type available across supplier forms.',
        placement: 'top',
        beforeEnter: () => {
          handleOpenModal()
        },
      },
    ],
    [supplierTypes.length]
  )

  const {
    closeTour,
    currentStep,
    currentStepIndex,
    isLastStep,
    isOpen: isTourOpen,
    nextStep,
    openTour,
    previousStep,
  } = useSettingsTour(tourSteps)

  if (loading && supplierTypes.length === 0) {
    return (
      <PageLayout title="Supplier Types" activeItem="settings" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading supplier types..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Supplier Types"
      activeItem="settings"
      actions={
        <>
          <Button variant="outline" onClick={() => void openTour()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Take tour
          </Button>
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal} data-tour="supplier-types-add-button">
            <Plus className="mr-2 h-4 w-4" />
            Add Supplier Type
          </Button>
        </>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Supplier Types</CardTitle>
          <CardDescription>
            Manage supplier types used when creating and editing suppliers. The code is stored on each supplier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="st-search">Search</Label>
              <Input
                id="st-search"
                data-tour="supplier-types-search"
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
                  {filteredTypes.length} of {supplierTypes.length}
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
              {getUserFriendlyErrorMessage(error, 'We could not load the supplier types right now. Please refresh and try again.')}
            </div>
          ) : null}

          <div data-tour="supplier-types-results">
            <ResponsiveTable
              columns={columns}
              data={filteredTypes}
              rowKey="code"
              emptyMessage={emptyMessage}
              tableClassName={undefined}
              mobileCardClassName={undefined}
              getRowClassName={undefined}
              onRowClick={(row) => handleEditType(row)}
            />
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">
                  {editingType ? 'Edit Supplier Type' : 'Add Supplier Type'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {editingType
                    ? 'Update the name. The code stays read-only.'
                    : 'Enter a name and the code will be generated automatically.'}
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
                <Label htmlFor="st-name">Name</Label>
                <Input
                  id="st-name"
                  data-tour="supplier-types-name-field"
                  name="name"
                  placeholder="Enter supplier type name"
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
                <Label htmlFor="st-code">Code (read-only)</Label>
                <Input
                  id="st-code"
                  data-tour="supplier-types-code-field"
                  name="code"
                  placeholder="Enter code"
                  value={formData.code}
                  onChange={handleFormChange}
                  className="mt-1"
                  disabled
                />
                {formErrors.code ? (
                  <p className="mt-1 text-sm text-red-600">{formErrors.code}</p>
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
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting} data-tour="supplier-types-save-button">
                  {isSubmitting ? 'Saving…' : editingType ? 'Update' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SettingsTour
        open={isTourOpen}
        step={currentStep}
        currentStepIndex={currentStepIndex}
        totalSteps={tourSteps.length}
        isLastStep={isLastStep}
        onClose={closeTour}
        onBack={() => void previousStep()}
        onNext={() => void nextStep()}
      />
    </PageLayout>
  )
}

export default SupplierTypes
