import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { Edit, Plus, Trash2, X } from 'lucide-react'
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

interface Carrier {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  created_at: string | null
}
const tableEditButtonClass = 'border-olive-light/60 bg-beige/30 text-text-dark hover:bg-beige/50'
const tableDeleteButtonClass = 'text-red-600 hover:bg-red-50 hover:text-red-700'

interface CarrierForm {
  name: string
  contact: string
  phone: string
  email: string
}

const emptyForm = (): CarrierForm => ({
  name: '',
  contact: '',
  phone: '',
  email: '',
})

function Carriers() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Carrier[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null)
  const [form, setForm] = useState<CarrierForm>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Carrier | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('carriers').select('id, name, contact_name, phone, email, created_at').order('name')
    if (error) {
      toast.error(error.message)
      setRows([])
      setLoading(false)
      return
    }
    setRows((data ?? []) as Carrier[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) return rows
    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(search) ||
        (row.contact_name ?? '').toLowerCase().includes(search) ||
        (row.phone ?? '').toLowerCase().includes(search) ||
        (row.email ?? '').toLowerCase().includes(search)
      )
    })
  }, [rows, searchTerm])

  const openCreate = () => {
    setEditingCarrier(null)
    setForm(emptyForm())
    setIsModalOpen(true)
  }

  const openEdit = (carrier: Carrier) => {
    setEditingCarrier(carrier)
    setForm({
      name: carrier.name,
      contact: carrier.contact_name ?? '',
      phone: carrier.phone ?? '',
      email: carrier.email ?? '',
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.name.trim()) {
      toast.error('Carrier name is required')
      return
    }

    setSaving(true)
    if (editingCarrier) {
      const { error } = await supabase
        .from('carriers')
        .update({
          name: form.name.trim(),
          contact_name: form.contact.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        })
        .eq('id', editingCarrier.id)
      if (error) {
        if (error.code === '23505') {
          toast.error('Carrier name must be unique')
        } else {
          toast.error(error.message)
        }
        setSaving(false)
        return
      }
      toast.success('Carrier updated')
    } else {
      const { error } = await supabase.from('carriers').insert({
        name: form.name.trim(),
        contact_name: form.contact.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      })
      if (error) {
        if (error.code === '23505') {
          toast.error('Carrier name must be unique')
        } else {
          toast.error(error.message)
        }
        setSaving(false)
        return
      }
      toast.success('Carrier created')
    }

    setIsModalOpen(false)
    setEditingCarrier(null)
    setForm(emptyForm())
    await load()
    setSaving(false)
  }

  const deleteCarrier = async () => {
    if (!deleteTarget) return
    const { error } = await supabase.from('carriers').delete().eq('id', deleteTarget.id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Carrier deleted')
    setDeleteTarget(null)
    await load()
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row: Carrier) => <span className="font-medium text-text-dark">{row.name}</span>,
      mobileRender: (row: Carrier) => <span className="font-medium text-text-dark">{row.name}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (row: Carrier) => row.contact_name || '—',
      mobileRender: (row: Carrier) => row.contact_name || '—',
      cellClassName: 'text-text-dark/80',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (row: Carrier) => row.phone || '—',
      mobileRender: (row: Carrier) => row.phone || '—',
      cellClassName: 'text-text-dark/80',
    },
    {
      key: 'email',
      header: 'Email',
      render: (row: Carrier) => row.email || '—',
      mobileRender: (row: Carrier) => row.email || '—',
      cellClassName: 'text-text-dark/80',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'text-right',
      render: (row: Carrier) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="icon"
            onClick={() => openEdit(row)}
            className={tableEditButtonClass}
            title={`Edit ${row.name ?? 'carrier'}`}
            aria-label={`Edit ${row.name ?? 'carrier'}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={tableDeleteButtonClass}
            onClick={() => setDeleteTarget(row)}
            title={`Delete ${row.name ?? 'carrier'}`}
            aria-label={`Delete ${row.name ?? 'carrier'}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      mobileRender: (row: Carrier) => (
        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="icon"
            onClick={() => openEdit(row)}
            className={tableEditButtonClass}
            title={`Edit ${row.name ?? 'carrier'}`}
            aria-label={`Edit ${row.name ?? 'carrier'}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={tableDeleteButtonClass}
            onClick={() => setDeleteTarget(row)}
            title={`Delete ${row.name ?? 'carrier'}`}
            aria-label={`Delete ${row.name ?? 'carrier'}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  if (loading) {
    return (
      <PageLayout title="Carriers" activeItem="suppliersCustomers" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading carriers..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Carriers"
      activeItem="suppliersCustomers"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Carrier
        </Button>
      }
    >
      <Card className="border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Carrier Directory</CardTitle>
          <CardDescription>Manage shipment transport partners.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 sm:max-w-sm">
            <Label htmlFor="carrier-search">Search</Label>
            <Input id="carrier-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search carriers" />
          </div>

          <ResponsiveTable
            columns={columns}
            data={filteredRows}
            rowKey="id"
            emptyMessage={filteredRows.length === 0 ? 'No carriers found.' : 'No carriers.'}
            tableClassName={undefined}
            mobileCardClassName={undefined}
            getRowClassName={undefined}
            onRowClick={undefined}
          />
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">{editingCarrier ? 'Edit Carrier' : 'Add Carrier'}</h2>
                <p className="text-sm text-text-dark/70">Carrier names must be unique.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)} disabled={saving}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
              <div className="space-y-2">
                <Label htmlFor="carrier-name">Name</Label>
                <Input id="carrier-name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier-contact">Contact</Label>
                <Input id="carrier-contact" value={form.contact} onChange={(event) => setForm((prev) => ({ ...prev, contact: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier-phone">Phone</Label>
                <Input id="carrier-phone" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier-email">Email</Label>
                <Input id="carrier-email" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={saving}>
                  {saving ? 'Saving...' : editingCarrier ? 'Save Changes' : 'Create Carrier'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete carrier?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteTarget?.name}. Shipments referencing it will keep the carrier id only if already saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteCarrier} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  )
}

export default Carriers
