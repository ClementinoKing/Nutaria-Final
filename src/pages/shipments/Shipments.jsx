import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, Package as PackageIcon, X } from 'lucide-react'
import { mockShipments } from '@/data/mockDashboardData'

const statusOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'READY', label: 'Ready' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const createEmptyItem = () => ({
  id: `item-${Math.random().toString(36).slice(2, 8)}`,
  sku: '',
  description: '',
  quantity: '',
  unit: '',
})

const createEmptyShipment = () => ({
  doc_no: '',
  customer_id: '',
  customer_name: '',
  customer_contact_name: '',
  customer_contact_email: '',
  customer_contact_phone: '',
  shipping_address: '',
  warehouse_id: '',
  warehouse_name: '',
  carrier_id: '',
  carrier_name: '',
  carrier_reference: '',
  planned_ship_date: '',
  shipped_at: '',
  expected_delivery: '',
  doc_status: 'PENDING',
  notes: '',
  special_instructions: '',
  items: [createEmptyItem()],
  documents: [],
})

const formatDateTime = (value) => {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const toInputDateTimeValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`
}

const getStatusBadgeColor = (status) => {
  const colors = {
    PENDING: 'bg-gray-100 text-gray-800',
    READY: 'bg-blue-100 text-blue-800',
    SHIPPED: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function Shipments() {
  const [shipments, setShipments] = useState(
    mockShipments.map((shipment) => ({
      ...shipment,
      items: Array.isArray(shipment.items) ? shipment.items : [],
      documents: Array.isArray(shipment.documents) ? shipment.documents : [],
    }))
  )
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState(createEmptyShipment())
  const [editingShipmentId, setEditingShipmentId] = useState(null)
  const location = useLocation()
  const navigate = useNavigate()

  const openEditModal = useCallback((shipment) => {
    setFormData({
      ...shipment,
      planned_ship_date: toInputDateTimeValue(shipment.planned_ship_date),
      shipped_at: toInputDateTimeValue(shipment.shipped_at),
      expected_delivery: toInputDateTimeValue(shipment.expected_delivery),
      items:
        shipment.items && shipment.items.length > 0
          ? shipment.items.map((item) => ({
              ...item,
              quantity:
                item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '',
            }))
          : [createEmptyItem()],
    })
    setEditingShipmentId(shipment.id)
    setIsModalOpen(true)
  }, [])

  useEffect(() => {
    const { editShipmentId, shipment } = location.state || {}
    if (editShipmentId) {
      const existingShipment =
        shipments.find((entry) => entry.id === editShipmentId) ||
        (shipment ? { ...shipment } : null)

      if (existingShipment) {
        openEditModal({
          ...existingShipment,
          items: Array.isArray(existingShipment.items) ? existingShipment.items : [],
          documents: Array.isArray(existingShipment.documents) ? existingShipment.documents : [],
        })
      }

      navigate(location.pathname, { replace: true })
    }
  }, [location, shipments, navigate, openEditModal])

  const handleAddShipment = () => {
    setFormData(createEmptyShipment())
    setEditingShipmentId(null)
    setIsModalOpen(true)
  }

  const handleEditShipment = (shipment, event) => {
    if (event) {
      event.stopPropagation()
    }
    openEditModal(shipment)
  }

  const handleDeleteShipment = (shipment, event) => {
    if (event) {
      event.stopPropagation()
    }
    if (!window.confirm(`Are you sure you want to delete shipment ${shipment.doc_no}?`)) {
      return
    }
    setShipments((prev) => prev.filter((entry) => entry.id !== shipment.id))
    if (editingShipmentId === shipment.id) {
      setIsModalOpen(false)
      setEditingShipmentId(null)
      setFormData(createEmptyShipment())
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleStatusChange = (event) => {
    const { value } = event.target
    setFormData((prev) => ({
      ...prev,
      doc_status: value,
    }))
  }

  const handleItemChange = (itemId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }))
  }

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem()],
    }))
  }

  const handleRemoveItem = (itemId) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((item) => item.id !== itemId),
    }))
  }

  const generateDocNumber = () => {
    const sequences = shipments
      .map((shipment) => {
        const parts = shipment.doc_no?.split('-') ?? []
        const sequence = parts[parts.length - 1]
        const parsed = parseInt(sequence, 10)
        return Number.isNaN(parsed) ? null : parsed
      })
      .filter((value) => value !== null)

    const nextSequence = (sequences.length ? Math.max(...sequences) : 0) + 1
    const year = new Date().getFullYear()
    return `SHIP-${year}-${String(nextSequence).padStart(3, '0')}`
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const normalizedItems = formData.items
      .filter((item) => item.sku || item.description || item.quantity || item.unit)
      .map((item, index) => ({
        id: item.id || `line-${index + 1}`,
        sku: item.sku?.trim() ?? '',
        description: item.description?.trim() ?? '',
        quantity: item.quantity ? Number(item.quantity) : null,
        unit: item.unit?.trim() ?? '',
      }))

    const normalizeDateValue = (value) => (value ? new Date(value).toISOString() : null)

    const sanitizedShipment = {
      ...formData,
      doc_no: formData.doc_no?.trim() || generateDocNumber(),
      customer_name: formData.customer_name?.trim() ?? '',
      customer_contact_name: formData.customer_contact_name?.trim() ?? '',
      customer_contact_email: formData.customer_contact_email?.trim() ?? '',
      customer_contact_phone: formData.customer_contact_phone?.trim() ?? '',
      shipping_address: formData.shipping_address?.trim() ?? '',
      warehouse_name: formData.warehouse_name?.trim() ?? '',
      carrier_name: formData.carrier_name?.trim() ?? '',
      carrier_reference: formData.carrier_reference?.trim() ?? '',
      planned_ship_date: normalizeDateValue(formData.planned_ship_date),
      shipped_at: normalizeDateValue(formData.shipped_at),
      expected_delivery: normalizeDateValue(formData.expected_delivery),
      doc_status: formData.doc_status,
      notes: formData.notes?.trim() ?? '',
      special_instructions: formData.special_instructions?.trim() ?? '',
      items: normalizedItems,
      created_at:
        editingShipmentId !== null
          ? shipments.find((shipment) => shipment.id === editingShipmentId)?.created_at ??
            new Date().toISOString()
          : new Date().toISOString(),
    }

    if (editingShipmentId !== null) {
      setShipments((prev) =>
        prev.map((shipment) => (shipment.id === editingShipmentId ? { ...shipment, ...sanitizedShipment } : shipment))
      )
    } else {
      const nextId = shipments.length ? Math.max(...shipments.map((shipment) => shipment.id)) + 1 : 1
      const newShipment = {
        ...sanitizedShipment,
        id: nextId,
      }
      setShipments((prev) => [newShipment, ...prev])
    }

    setIsModalOpen(false)
    setEditingShipmentId(null)
    setFormData(createEmptyShipment())
  }

  const handleRowClick = (shipment) => {
    navigate(`/shipments/${shipment.id}`, { state: { shipment } })
  }

  const columns = [
    {
      key: 'doc_no',
      header: 'Document',
      accessor: 'doc_no',
      cellClassName: 'font-medium text-text-dark',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (shipment) => shipment.customer_name,
      cellClassName: 'text-text-dark/80',
      mobileHeader: 'Customer',
    },
    {
      key: 'carrier',
      header: 'Carrier',
      render: (shipment) => shipment.carrier_name || '-',
      cellClassName: 'text-text-dark/60',
    },
    {
      key: 'planned',
      header: 'Planned Ship Date',
      render: (shipment) => formatDateTime(shipment.planned_ship_date),
      cellClassName: 'text-text-dark/60',
      mobileHeader: 'Planned Ship',
    },
    {
      key: 'status',
      header: 'Status',
      render: (shipment) => (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeColor(shipment.doc_status)}`}>
          {shipment.doc_status}
        </span>
      ),
      mobileRender: (shipment) => (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeColor(shipment.doc_status)}`}>
          {shipment.doc_status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      mobileValueClassName: 'flex w-full justify-end gap-2',
      render: (shipment) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(event) => handleEditShipment(shipment, event)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={(event) => handleDeleteShipment(shipment, event)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      mobileRender: (shipment) => (
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={(event) => handleEditShipment(shipment, event)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={(event) => handleDeleteShipment(shipment, event)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageLayout
      title="Shipments"
      activeItem="shipments"
      actions={
        <Button onClick={handleAddShipment} className="bg-olive hover:bg-olive-dark">
          <Plus className="mr-2 h-4 w-4" />
          New Shipment
        </Button>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Shipment Register</CardTitle>
          <CardDescription>Track planned, in-transit, and completed shipments</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable columns={columns} data={shipments} rowKey="id" onRowClick={handleRowClick} />
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-text-dark">
                  {editingShipmentId !== null ? 'Edit Shipment' : 'Create Shipment'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {editingShipmentId !== null
                    ? 'Update shipment schedule, carrier, and contents'
                    : 'Capture planned shipment details and contents'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsModalOpen(false)
                  setEditingShipmentId(null)
                  setFormData(createEmptyShipment())
                }}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            <form
              id="shipment-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto bg-beige/10 px-6 py-6"
            >
              <div className="space-y-8">
                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Shipment Details</h3>
                  <p className="text-sm text-text-dark/70">General shipment and scheduling information</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="doc_no">Document Number</Label>
                      <Input
                        id="doc_no"
                        name="doc_no"
                        value={formData.doc_no}
                        onChange={handleChange}
                        placeholder="Automatically assigned if left blank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="doc_status">Status</Label>
                      <select
                        id="doc_status"
                        name="doc_status"
                        value={formData.doc_status}
                        onChange={handleStatusChange}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="planned_ship_date">Planned Ship Date</Label>
                      <Input
                        id="planned_ship_date"
                        name="planned_ship_date"
                        type="datetime-local"
                        value={formData.planned_ship_date}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expected_delivery">Expected Delivery</Label>
                      <Input
                        id="expected_delivery"
                        name="expected_delivery"
                        type="datetime-local"
                        value={formData.expected_delivery}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="shipped_at">Shipped At</Label>
                      <Input
                        id="shipped_at"
                        name="shipped_at"
                        type="datetime-local"
                        value={formData.shipped_at}
                        onChange={handleChange}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carrier_reference">Carrier Reference</Label>
                      <Input
                        id="carrier_reference"
                        name="carrier_reference"
                        value={formData.carrier_reference}
                        onChange={handleChange}
                        placeholder="Tracking or booking reference"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Customer &amp; Destination</h3>
                  <p className="text-sm text-text-dark/70">Delivery details and customer contacts</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="customer_name">Customer Name</Label>
                      <Input
                        id="customer_name"
                        name="customer_name"
                        value={formData.customer_name}
                        onChange={handleChange}
                        placeholder="Customer receiving the shipment"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_contact_name">Customer Contact</Label>
                      <Input
                        id="customer_contact_name"
                        name="customer_contact_name"
                        value={formData.customer_contact_name}
                        onChange={handleChange}
                        placeholder="Primary contact name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_contact_email">Contact Email</Label>
                      <Input
                        id="customer_contact_email"
                        name="customer_contact_email"
                        type="email"
                        value={formData.customer_contact_email}
                        onChange={handleChange}
                        placeholder="contact@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer_contact_phone">Contact Phone</Label>
                      <Input
                        id="customer_contact_phone"
                        name="customer_contact_phone"
                        value={formData.customer_contact_phone}
                        onChange={handleChange}
                        placeholder="+27 00 000 0000"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="shipping_address">Shipping Address</Label>
                      <textarea
                        id="shipping_address"
                        name="shipping_address"
                        value={formData.shipping_address}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Street, City, Country, Postal Code"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Warehouse &amp; Carrier</h3>
                  <p className="text-sm text-text-dark/70">Operational origin and transport partner</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="warehouse_name">Warehouse</Label>
                      <Input
                        id="warehouse_name"
                        name="warehouse_name"
                        value={formData.warehouse_name}
                        onChange={handleChange}
                        placeholder="Origin warehouse"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carrier_name">Carrier</Label>
                      <Input
                        id="carrier_name"
                        name="carrier_name"
                        value={formData.carrier_name}
                        onChange={handleChange}
                        placeholder="Transport partner"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Line Items</h3>
                  <p className="text-sm text-text-dark/70">Products and quantities included in this shipment</p>
                  <div className="mt-4 space-y-4">
                    {formData.items.map((item) => (
                      <div key={item.id} className="grid gap-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 sm:grid-cols-4">
                        <div className="space-y-2">
                          <Label htmlFor={`sku-${item.id}`}>SKU</Label>
                          <Input
                            id={`sku-${item.id}`}
                            value={item.sku}
                            onChange={(event) => handleItemChange(item.id, 'sku', event.target.value)}
                            placeholder="SKU code"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor={`description-${item.id}`}>Description</Label>
                          <Input
                            id={`description-${item.id}`}
                            value={item.description}
                            onChange={(event) => handleItemChange(item.id, 'description', event.target.value)}
                            placeholder="Item description"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`quantity-${item.id}`}>Quantity</Label>
                          <Input
                            id={`quantity-${item.id}`}
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(event) => handleItemChange(item.id, 'quantity', event.target.value)}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`unit-${item.id}`}>Unit</Label>
                          <Input
                            id={`unit-${item.id}`}
                            value={item.unit}
                            onChange={(event) => handleItemChange(item.id, 'unit', event.target.value)}
                            placeholder="Cartons, Pallets..."
                          />
                        </div>
                        <div className="flex items-end justify-end sm:col-span-4">
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={formData.items.length === 1}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove Item
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" onClick={handleAddItem}>
                      <PackageIcon className="mr-2 h-4 w-4" />
                      Add Another Item
                    </Button>
                  </div>
                </section>

                <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-text-dark">Notes &amp; Instructions</h3>
                  <p className="text-sm text-text-dark/70">Additional context for the warehouse or carrier</p>
                  <div className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="notes">Internal Notes</Label>
                      <textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Internal comments about this shipment"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="special_instructions">Special Instructions</Label>
                      <textarea
                        id="special_instructions"
                        name="special_instructions"
                        value={formData.special_instructions}
                        onChange={handleChange}
                        rows={3}
                        placeholder="Instructions for loaders, drivers, or customer"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </form>

            <div className="flex justify-end gap-3 border-t border-olive-light/30 bg-white px-6 py-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsModalOpen(false)
                  setEditingShipmentId(null)
                  setFormData(createEmptyShipment())
                }}
              >
                Cancel
              </Button>
              <Button type="submit" form="shipment-form" className="bg-olive hover:bg-olive-dark">
                {editingShipmentId !== null ? 'Update Shipment' : 'Save Shipment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Shipments

