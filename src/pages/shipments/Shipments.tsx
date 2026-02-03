import { useCallback, useEffect, useMemo, useState, ChangeEvent, FormEvent, MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Edit, Trash2, Package as PackageIcon, X, ChevronLeft, ChevronRight, FileText, User, Truck, Package, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

interface ShipmentItem {
  id: string
  product_id?: number | null
  sku: string
  description: string
  quantity: number | null
  unit: string
}

interface ShipmentDocument {
  id: string
  name: string
  type: string
}

type ShipmentStatus = 'PENDING' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

interface Shipment {
  id: number
  doc_no: string
  customer_id: number
  customer_name: string
  customer_contact_name?: string | null
  customer_contact_email?: string | null
  customer_contact_phone?: string | null
  shipping_address?: string | null
  warehouse_id: number
  warehouse_name?: string | null
  carrier_id?: number | null
  carrier_name?: string | null
  carrier_reference?: string | null
  planned_ship_date?: string | null
  shipped_at?: string | null
  expected_delivery?: string | null
  doc_status: ShipmentStatus
  notes?: string | null
  special_instructions?: string | null
  items: ShipmentItem[]
  documents: ShipmentDocument[]
  created_at: string
}

interface ShipmentFormItem {
  id: string
  product_id: string
  sku: string
  description: string
  quantity: string
  unit: string
}

interface PackedProduct {
  product_id: number
  product_name: string
  product_sku: string
  total_quantity_kg: number
}

interface ShipmentFormData {
  doc_no: string
  customer_id: string
  customer_name: string
  customer_contact_name: string
  customer_contact_email: string
  customer_contact_phone: string
  shipping_address: string
  warehouse_id: string
  warehouse_name: string
  carrier_id: string
  carrier_name: string
  carrier_reference: string
  planned_ship_date: string
  shipped_at: string
  expected_delivery: string
  doc_status: ShipmentStatus
  notes: string
  special_instructions: string
  items: ShipmentFormItem[]
  documents: ShipmentDocument[]
}

const statusOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'READY', label: 'Ready' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const

const SHIPMENT_FORM_STEPS = [
  { key: 1, label: 'Details', icon: FileText },
  { key: 2, label: 'Customer', icon: User },
  { key: 3, label: 'Warehouse & Carrier', icon: Truck },
  { key: 4, label: 'Line Items', icon: Package },
  { key: 5, label: 'Notes', icon: MessageSquare },
] as const
const TOTAL_STEPS = SHIPMENT_FORM_STEPS.length

const createEmptyItem = (): ShipmentFormItem => ({
  id: `item-${Math.random().toString(36).slice(2, 8)}`,
  product_id: '',
  sku: '',
  description: '',
  quantity: '',
  unit: '',
})

const createEmptyShipment = (): ShipmentFormData => ({
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

const formatDateTime = (value: string | null | undefined): string => {
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

const toInputDateTimeValue = (value: string | null | undefined): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number): string => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`
}

const getStatusBadgeColor = (status: ShipmentStatus | string): string => {
  const colors: Record<ShipmentStatus, string> = {
    PENDING: 'bg-gray-100 text-gray-800',
    READY: 'bg-blue-100 text-blue-800',
    SHIPPED: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700',
  }
  return colors[status as ShipmentStatus] || 'bg-gray-100 text-gray-800'
}

function Shipments() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState<ShipmentFormData>(createEmptyShipment())
  const [editingShipmentId, setEditingShipmentId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([])
  const [formStep, setFormStep] = useState(1)
  const [packedProducts, setPackedProducts] = useState<PackedProduct[]>([])
  const [loadingPacked, setLoadingPacked] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20
  const location = useLocation()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: shipmentRows, error: shipError } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false })

      if (shipError) {
        setError(shipError.message)
        setShipments([])
        setLoading(false)
        return
      }

      const list = (shipmentRows ?? []) as Array<{
        id: number
        doc_no: string
        customer_id: number
        warehouse_id: number
        carrier_id: number | null
        carrier_reference: string | null
        planned_ship_date: string | null
        shipped_at: string | null
        expected_delivery: string | null
        doc_status: string
        notes: string | null
        special_instructions: string | null
        created_at: string
      }>

      if (list.length === 0) {
        setShipments([])
        setLoading(false)
        return
      }

      const shipmentIds = list.map((s) => s.id)
      const customerIds = [...new Set(list.map((s) => s.customer_id).filter((id): id is number => id != null))]
      const warehouseIds = [...new Set(list.map((s) => s.warehouse_id).filter((id): id is number => id != null))]

      const [itemsRes, customersRes, warehousesRes] = await Promise.all([
        supabase.from('shipment_items').select('*').in('shipment_id', shipmentIds),
        customerIds.length > 0 ? supabase.from('customers').select('id, name').in('id', customerIds) : { data: [] },
        warehouseIds.length > 0 ? supabase.from('warehouses').select('id, name').in('id', warehouseIds) : { data: [] },
      ])

      const itemsList = (itemsRes.data ?? []) as Array<{
        id: number
        shipment_id: number
        product_id: number
        description: string | null
        requested_qty: number | null
        unit_id: number | null
      }>
      const itemsByShipment = new Map<number, ShipmentItem[]>()
      itemsList.forEach((row) => {
        const item: ShipmentItem = {
          id: `line-${row.id}`,
          product_id: row.product_id,
          sku: '', // Not in schema, will be empty
          description: row.description ?? '',
          quantity: row.requested_qty ?? null,
          unit: row.unit_id ? String(row.unit_id) : '', // Store unit_id as string for form
        }
        if (!itemsByShipment.has(row.shipment_id)) itemsByShipment.set(row.shipment_id, [])
        itemsByShipment.get(row.shipment_id)!.push(item)
      })

      const customerMap = new Map<number, string>((customersRes.data ?? []).map((c: any) => [c.id, c.name ?? '']))
      const warehouseMap = new Map<number, string>((warehousesRes.data ?? []).map((w: any) => [w.id, w.name ?? '']))

      const built: Shipment[] = list.map((s) => ({
        id: s.id,
        doc_no: s.doc_no ?? '',
        customer_id: s.customer_id,
        customer_name: customerMap.get(s.customer_id) ?? '',
        customer_contact_name: null, // Not in schema
        customer_contact_email: null, // Not in schema
        customer_contact_phone: null, // Not in schema
        shipping_address: null, // Not in schema
        warehouse_id: s.warehouse_id,
        warehouse_name: warehouseMap.get(s.warehouse_id) ?? null,
        carrier_id: s.carrier_id ?? null,
        carrier_name: null, // Not in schema - would need to join carriers table
        carrier_reference: s.carrier_reference ?? null,
        planned_ship_date: s.planned_ship_date ?? null,
        shipped_at: s.shipped_at ?? null,
        expected_delivery: s.expected_delivery ?? null,
        doc_status: (s.doc_status as ShipmentStatus) ?? 'PENDING',
        notes: s.notes ?? null,
        special_instructions: s.special_instructions ?? null,
        items: itemsByShipment.get(s.id) ?? [],
        documents: [],
        created_at: s.created_at ?? new Date().toISOString(),
      }))

      setShipments(built)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shipments')
      setShipments([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLookups = useCallback(async () => {
    const [custRes, whRes] = await Promise.all([
      supabase.from('customers').select('id, name').order('name'),
      supabase.from('warehouses').select('id, name').order('id', { ascending: true }),
    ])
    setCustomers((custRes.data ?? []) as Array<{ id: number; name: string }>)
    setWarehouses((whRes.data ?? []) as Array<{ id: number; name: string }>)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadLookups()
  }, [loadLookups])

  const loadPackedProducts = useCallback(async () => {
    setLoadingPacked(true)
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          quantity_kg,
          sorting_output:process_sorting_outputs(
            product_id,
            product:products(id, name, sku)
          )
        `)
        .order('created_at', { ascending: false })

      if (entriesError) {
        setPackedProducts([])
        setLoadingPacked(false)
        return
      }

      const list = (entries ?? []) as Array<{
        id: number
        quantity_kg: number
        sorting_output: unknown
      }>

      const byProduct = new Map<number, { quantity: number; name: string; sku: string }>()
      for (const e of list) {
        const so = e.sorting_output as { product_id?: number; product?: { name?: string | null; sku?: string | null } } | null
        const productId = so?.product_id
        if (productId == null) continue
        const name = so?.product?.name ?? 'Unknown'
        const sku = so?.product?.sku ?? ''
        const qty = Number(e.quantity_kg) || 0
        if (!byProduct.has(productId)) {
          byProduct.set(productId, { quantity: 0, name, sku })
        }
        const agg = byProduct.get(productId)!
        agg.quantity += qty
      }

      const result: PackedProduct[] = Array.from(byProduct.entries()).map(([product_id, agg]) => ({
        product_id,
        product_name: agg.name,
        product_sku: agg.sku,
        total_quantity_kg: Math.round(agg.quantity * 100) / 100,
      }))
      result.sort((a, b) => a.product_name.localeCompare(b.product_name))
      setPackedProducts(result)
    } catch {
      setPackedProducts([])
    } finally {
      setLoadingPacked(false)
    }
  }, [])

  useEffect(() => {
    loadPackedProducts()
  }, [loadPackedProducts])

  const totalPages = Math.max(1, Math.ceil(shipments.length / pageSize))
  const paginatedShipments = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return shipments.slice(startIndex, startIndex + pageSize)
  }, [shipments, currentPage])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  // When creating a new shipment, default warehouse to the first created (first in list, ordered by id)
  useEffect(() => {
    const first = warehouses[0]
    if (isModalOpen && editingShipmentId === null && first && formData.warehouse_id === '') {
      setFormData((prev) => ({
        ...prev,
        warehouse_id: String(first.id),
        warehouse_name: first.name,
      }))
    }
  }, [isModalOpen, editingShipmentId, warehouses, formData.warehouse_id])

  const openEditModal = useCallback((shipment: Shipment) => {
    setFormStep(1)
    setFormData({
      ...shipment,
      customer_id: String(shipment.customer_id ?? ''),
      warehouse_id: String(shipment.warehouse_id ?? ''),
      carrier_id: String(shipment.carrier_id ?? ''),
      planned_ship_date: toInputDateTimeValue(shipment.planned_ship_date),
      shipped_at: toInputDateTimeValue(shipment.shipped_at),
      expected_delivery: toInputDateTimeValue(shipment.expected_delivery),
      customer_contact_name: shipment.customer_contact_name ?? '',
      customer_contact_email: shipment.customer_contact_email ?? '',
      customer_contact_phone: shipment.customer_contact_phone ?? '',
      shipping_address: shipment.shipping_address ?? '',
      warehouse_name: shipment.warehouse_name ?? '',
      carrier_name: shipment.carrier_name ?? '',
      carrier_reference: shipment.carrier_reference ?? '',
      notes: shipment.notes ?? '',
      special_instructions: shipment.special_instructions ?? '',
      items:
        shipment.items && shipment.items.length > 0
          ? shipment.items.map((item: ShipmentItem) => ({
              id: item.id,
              product_id: item.product_id != null ? String(item.product_id) : '',
              sku: item.sku ?? '',
              description: item.description ?? '',
              quantity:
                item.quantity !== null && item.quantity !== undefined ? String(item.quantity) : '',
              unit: item.unit ?? '',
            }))
          : [createEmptyItem()],
      documents: shipment.documents ?? [],
    })
    setEditingShipmentId(shipment.id)
    setIsModalOpen(true)
  }, [])

  useEffect(() => {
    const { editShipmentId, shipment } = (location.state as { editShipmentId?: number; shipment?: Shipment }) || {}
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
    setFormStep(1)
    setIsModalOpen(true)
  }

  const handleEditShipment = (shipment: Shipment, event?: MouseEvent<HTMLButtonElement>) => {
    if (event) {
      event.stopPropagation()
    }
    openEditModal(shipment)
  }

  const handleDeleteShipment = async (shipment: Shipment, event?: MouseEvent<HTMLButtonElement>) => {
    if (event) event.stopPropagation()
    if (!window.confirm(`Are you sure you want to delete shipment ${shipment.doc_no}?`)) return
    const { error: delError } = await supabase.from('shipments').delete().eq('id', shipment.id)
    if (delError) {
      toast.error(delError.message)
      return
    }
    setShipments((prev) => prev.filter((entry) => entry.id !== shipment.id))
    if (editingShipmentId === shipment.id) {
      setIsModalOpen(false)
      setEditingShipmentId(null)
      setFormData(createEmptyShipment())
      setFormStep(1)
    }
    toast.success('Shipment deleted')
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target
    setFormData((prev) => ({
      ...prev,
      doc_status: value as ShipmentStatus,
    }))
  }

  const handleCustomerSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value
    const customerId = id ? Number(id) : null
    const customer = customerId ? customers.find((c) => c.id === customerId) : null
    setFormData((prev) => ({
      ...prev,
      customer_id: id,
      customer_name: customer?.name ?? '',
    }))
  }

  const handleWarehouseSelect = (event: ChangeEvent<HTMLSelectElement>) => {
    const id = event.target.value
    const warehouse = id ? warehouses.find((w) => w.id === Number(id)) : null
    setFormData((prev) => ({
      ...prev,
      warehouse_id: id,
      warehouse_name: warehouse?.name ?? '',
    }))
  }

  const handleItemChange = (itemId: string, field: keyof ShipmentFormItem, value: string) => {
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

  const handleRemoveItem = (itemId: string) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((item) => item.id !== itemId),
    }))
  }

  const handlePackedProductSelect = (itemId: string, productIdStr: string) => {
    const productId = productIdStr ? Number(productIdStr) : null
    const packed = productId ? packedProducts.find((p) => p.product_id === productId) : null
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              product_id: productIdStr,
              sku: packed?.product_sku ?? '',
              description: packed?.product_name ?? '',
              unit: packed ? 'kg' : item.unit,
              quantity: packed && item.quantity ? item.quantity : packed ? '' : item.quantity,
            }
          : item
      ),
    }))
  }

  const generateDocNumber = (): string => {
    const sequences = shipments
      .map((shipment) => {
        const parts = shipment.doc_no?.split('-') ?? []
        const sequence = parts[parts.length - 1]
        if (!sequence) return null
        const parsed = parseInt(sequence, 10)
        return Number.isNaN(parsed) ? null : parsed
      })
      .filter((value): value is number => value !== null)

    const nextSequence = (sequences.length ? Math.max(...sequences) : 0) + 1
    const year = new Date().getFullYear()
    return `SHIP-${year}-${String(nextSequence).padStart(3, '0')}`
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Validate required fields
    if (!formData.customer_id || !formData.warehouse_id) {
      toast.error('Customer and Warehouse are required')
      setSaving(false)
      return
    }

    const normalizedItems = formData.items
      .filter((item) => item.product_id && (Number(item.quantity) || 0) > 0)
      .map((item) => ({
        product_id: Number(item.product_id), // Required in schema
        description: item.description?.trim() || null,
        requested_qty: Number(item.quantity) || null,
        unit_id: item.unit ? Number(item.unit) : null, // unit_id is integer FK to units
      }))

    const normalizeDateValue = (value: string): string | null => (value ? new Date(value).toISOString() : null)

    // doc_no has default function, but we can provide it if user entered one
    const docNo = formData.doc_no?.trim() || null
    const payload = {
      doc_no: docNo, // Will use default function if null
      customer_id: Number(formData.customer_id), // Required
      warehouse_id: Number(formData.warehouse_id), // Required
      carrier_id: formData.carrier_id ? Number(formData.carrier_id) : null,
      carrier_reference: formData.carrier_reference?.trim() || null,
      planned_ship_date: normalizeDateValue(formData.planned_ship_date),
      shipped_at: normalizeDateValue(formData.shipped_at),
      expected_delivery: normalizeDateValue(formData.expected_delivery),
      doc_status: formData.doc_status,
      notes: formData.notes?.trim() || null,
      special_instructions: formData.special_instructions?.trim() || null,
    }

    setSaving(true)
    try {
      if (editingShipmentId !== null) {
        const { error: updateError } = await supabase
          .from('shipments')
          .update(payload)
          .eq('id', editingShipmentId)

        if (updateError) {
          toast.error(updateError.message)
          setSaving(false)
          return
        }

        await supabase.from('shipment_items').delete().eq('shipment_id', editingShipmentId)
        if (normalizedItems.length > 0) {
          await supabase
            .from('shipment_items')
            .insert(normalizedItems.map((item) => ({ shipment_id: editingShipmentId, ...item })))
        }

        await load()
        toast.success('Shipment updated')
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('shipments')
          .insert(payload)
          .select()
          .single()

        if (insertError) {
          toast.error(insertError.message)
          setSaving(false)
          return
        }

        const newId = (inserted as { id: number } | null)?.id
        if (newId == null) {
          toast.error('Failed to get new shipment id')
          setSaving(false)
          return
        }
        if (normalizedItems.length > 0) {
          await supabase
            .from('shipment_items')
            .insert(normalizedItems.map((item) => ({ shipment_id: newId, ...item })))
        }

        await load()
        toast.success('Shipment created')
      }

      setIsModalOpen(false)
      setEditingShipmentId(null)
      setFormData(createEmptyShipment())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save shipment')
    } finally {
      setSaving(false)
    }
  }

  const handleRowClick = (shipment: Shipment) => {
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
      render: (shipment: Shipment) => shipment.customer_name,
      cellClassName: 'text-text-dark/80',
      mobileHeader: 'Customer',
    },
    {
      key: 'carrier',
      header: 'Carrier',
      render: (shipment: Shipment) => shipment.carrier_name || '-',
      cellClassName: 'text-text-dark/60',
    },
    {
      key: 'planned',
      header: 'Planned Ship Date',
      render: (shipment: Shipment) => formatDateTime(shipment.planned_ship_date),
      cellClassName: 'text-text-dark/60',
      mobileHeader: 'Planned Ship',
    },
    {
      key: 'status',
      header: 'Status',
      render: (shipment: Shipment) => (
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeColor(shipment.doc_status)}`}>
          {shipment.doc_status}
        </span>
      ),
      mobileRender: (shipment: Shipment) => (
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
      render: (shipment: Shipment) => (
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
      mobileRender: (shipment: Shipment) => (
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
          <ResponsiveTable 
            columns={columns as any} 
            data={paginatedShipments as any} 
            rowKey="id" 
            onRowClick={handleRowClick as any}
            tableClassName={undefined as any}
            mobileCardClassName={undefined as any}
            getRowClassName={undefined as any}
          />
          {shipments.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t border-olive-light/20 pt-4 sm:flex-row">
              <p className="text-xs text-text-dark/60">
                Showing {(currentPage - 1) * pageSize + 1}-
                {Math.min(currentPage * pageSize, shipments.length)} of {shipments.length} shipments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-xs text-text-dark/70">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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
                  setFormStep(1)
                }}
                className="text-text-dark hover:bg-olive-light/10"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            {/* Step indicator */}
            <div className="border-b border-olive-light/30 bg-white px-6 py-3">
              <div className="flex items-center justify-between gap-2">
                {SHIPMENT_FORM_STEPS.map((step, index) => {
                  const stepNum = index + 1
                  const isActive = formStep === stepNum
                  const isPast = formStep > stepNum
                  const Icon = step.icon
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => setFormStep(stepNum)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-3 ${
                        isActive
                          ? 'bg-olive text-white'
                          : isPast
                            ? 'bg-olive-light/20 text-olive-dark'
                            : 'bg-olive-light/10 text-text-dark/60 hover:bg-olive-light/20'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden truncate sm:inline">{step.label}</span>
                      <span className="sm:hidden">{stepNum}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-center text-xs text-text-dark/50">
                Step {formStep} of {TOTAL_STEPS}: {SHIPMENT_FORM_STEPS[formStep - 1]?.label ?? '—'}
              </p>
            </div>

            <form
              id="shipment-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto bg-beige/10 px-6 py-6"
            >
              <div className="mx-auto max-w-2xl">
                {formStep === 1 && (
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
                )}

                {formStep === 2 && (
                  <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-text-dark">Customer &amp; Destination</h3>
                    <p className="text-sm text-text-dark/70">Delivery details and customer contacts</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="customer_id">Customer *</Label>
                        <select
                          id="customer_id"
                          name="customer_id"
                          value={formData.customer_id}
                          onChange={handleCustomerSelect}
                          required
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Select customer</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        {customers.length === 0 && (
                          <p className="text-xs text-text-dark/50">No customers in the system. Add customers first.</p>
                        )}
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
                )}

                {formStep === 3 && (
                  <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-text-dark">Warehouse &amp; Carrier</h3>
                    <p className="text-sm text-text-dark/70">Operational origin and transport partner</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="warehouse_id">Warehouse</Label>
                        <select
                          id="warehouse_id"
                          name="warehouse_id"
                          value={formData.warehouse_id}
                          onChange={handleWarehouseSelect}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="">Select warehouse</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                        {warehouses.length === 0 && (
                          <p className="text-xs text-text-dark/50">No warehouses in the system. Add warehouses first.</p>
                        )}
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
                )}

                {formStep === 4 && (
                  <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-text-dark">Line Items</h3>
                    <p className="text-sm text-text-dark/70">
                      Select only from packed stock. Products and quantities included in this shipment.
                    </p>
                    {loadingPacked && (
                      <p className="mt-2 text-sm text-text-dark/60">Loading packed products…</p>
                    )}
                    {!loadingPacked && packedProducts.length === 0 && (
                      <p className="mt-2 text-sm text-amber-700">
                        No packed stock available. Record pack entries in packaging steps first.
                      </p>
                    )}
                    <div className="mt-4 space-y-4">
                      {formData.items.map((item) => {
                        const selectedPacked = item.product_id
                          ? packedProducts.find((p) => p.product_id === Number(item.product_id))
                          : null
                        const maxQty = selectedPacked?.total_quantity_kg ?? 0
                        return (
                          <div
                            key={item.id}
                            className="grid gap-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 sm:grid-cols-4"
                          >
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor={`packed-product-${item.id}`}>Packed product *</Label>
                              <select
                                id={`packed-product-${item.id}`}
                                value={item.product_id}
                                onChange={(e) => handlePackedProductSelect(item.id, e.target.value)}
                                required
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Select packed product</option>
                                {packedProducts.map((p) => (
                                  <option key={p.product_id} value={p.product_id}>
                                    {p.product_name}
                                    {p.product_sku ? ` (${p.product_sku})` : ''} — {p.total_quantity_kg.toFixed(2)} kg
                                    available
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`quantity-${item.id}`}>
                                Quantity (kg) *
                                {selectedPacked && (
                                  <span className="ml-1 text-xs font-normal text-text-dark/50">
                                    (max {maxQty.toFixed(2)})
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={`quantity-${item.id}`}
                                type="number"
                                min="0"
                                max={selectedPacked ? maxQty : undefined}
                                step="0.01"
                                value={item.quantity}
                                onChange={(event) => handleItemChange(item.id, 'quantity', event.target.value)}
                                placeholder="0"
                                disabled={!item.product_id}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`unit-${item.id}`}>Unit</Label>
                              <Input
                                id={`unit-${item.id}`}
                                value={item.unit}
                                onChange={(event) => handleItemChange(item.id, 'unit', event.target.value)}
                                placeholder="kg"
                              />
                            </div>
                            {selectedPacked && (item.sku || item.description) && (
                              <div className="sm:col-span-4 text-xs text-text-dark/60">
                                {item.sku && <span>SKU: {item.sku}</span>}
                                {item.sku && item.description && ' · '}
                                {item.description && <span>{item.description}</span>}
                              </div>
                            )}
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
                        )
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddItem}
                        disabled={loadingPacked || packedProducts.length === 0}
                      >
                        <PackageIcon className="mr-2 h-4 w-4" />
                        Add Another Item
                      </Button>
                    </div>
                  </section>
                )}

                {formStep === 5 && (
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
                )}
              </div>
            </form>

            <div className="flex justify-between gap-3 border-t border-olive-light/30 bg-white px-6 py-4">
              <div>
                {formStep > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormStep((s) => s - 1)}
                    className="border-olive-light/30"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditingShipmentId(null)
                    setFormData(createEmptyShipment())
                    setFormStep(1)
                  }}
                >
                  Cancel
                </Button>
                {formStep < TOTAL_STEPS ? (
                  <Button
                    type="button"
                    onClick={() => setFormStep((s) => s + 1)}
                    className="bg-olive hover:bg-olive-dark"
                  >
                    Next
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    form="shipment-form"
                    className="bg-olive hover:bg-olive-dark"
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : editingShipmentId !== null ? 'Update Shipment' : 'Save Shipment'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default Shipments
