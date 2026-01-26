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
import { useSupplierTypes, type SupplierType } from '@/hooks/useSupplierTypes'

interface FormData {
  code: string
  name: string
}

interface FormErrors {
  code?: string
  name?: string
}

function SupplierTypes() {
  const { supplierTypes, loading, error, refresh } = useSupplierTypes()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<FormData>({ code: '', name: '' })
  const [formErrors, setFormErrors] = useState<FormErrors>({})

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
    ],
    []
  )

  const handleOpenModal = () => {
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) return
    setFormData({ code: '', name: '' })
    setFormErrors({})
    setIsModalOpen(false)
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
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
      const { error: insertError } = await supabase.from('supplier_types').insert({
        code: formData.code.trim(),
        name: formData.name.trim(),
      })

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error('A supplier type with this code already exists.')
          setFormErrors((prev) => ({ ...prev, code: 'Code must be unique.' }))
        } else {
          throw insertError
        }
        setIsSubmitting(false)
        return
      }

      toast.success('Supplier type added successfully.')
      await refresh()
      setIsSubmitting(false)
      setIsModalOpen(false)
      setFormData({ code: '', name: '' })
      setFormErrors({})
    } catch (err) {
      console.error('Error creating supplier type', err)
      toast.error(err instanceof Error ? err.message : 'Unable to add supplier type.')
      setIsSubmitting(false)
    }
  }

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
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier Type
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total types</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{supplierTypes.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
              {error.message ?? 'Unable to load supplier types from Supabase.'}
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
                <h2 className="text-lg font-semibold text-text-dark">Add Supplier Type</h2>
                <p className="text-sm text-text-dark/70">Define the code and display name for the new type.</p>
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
                <Label htmlFor="st-code">Code</Label>
                <Input
                  id="st-code"
                  name="code"
                  placeholder="e.g. NUT"
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
                <Label htmlFor="st-name">Name</Label>
                <Input
                  id="st-name"
                  name="name"
                  placeholder="e.g. Nut Supplier"
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

export default SupplierTypes
