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

interface ShipmentPackItemForm {
  id: string
  pack_entry_id: string
  box_count: string
  pack_count: string
  box_label: string
}

interface ShipmentAllocationForm {
  id: string
  pack_entry_id: string
  pack_count: string
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

interface PackedEntryOption {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  pack_identifier: string
  pack_size_kg: number | null
  pack_count: number | null
  lot_no: string | null
  created_at: string | null
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
  allocations: ShipmentAllocationForm[]
  pack_items: ShipmentPackItemForm[]
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
  { key: 2, label: 'Warehouse & Carrier', icon: Truck },
  { key: 3, label: 'Allocation', icon: Package },
  { key: 4, label: 'Boxing & Review', icon: MessageSquare },
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

const createEmptyPackItem = (): ShipmentPackItemForm => ({
  id: `pack-${Math.random().toString(36).slice(2, 8)}`,
  pack_entry_id: '',
  box_count: '',
  pack_count: '',
  box_label: '',
})

const createEmptyAllocation = (): ShipmentAllocationForm => ({
  id: `alloc-${Math.random().toString(36).slice(2, 8)}`,
  pack_entry_id: '',
  pack_count: '',
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
  allocations: [createEmptyAllocation()],
  pack_items: [createEmptyPackItem()],
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

const getPacksPerStandardCarton = (packSizeKg: number | null | undefined): number | null => {
  if (!packSizeKg) return null
  const rounded = Math.round(packSizeKg * 1000)
  if (rounded === 250) return 40
  if (rounded === 500) return 20
  if (rounded === 1000) return 10
  if (rounded === 2000) return 5
  return null
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
  const [packedEntries, setPackedEntries] = useState<PackedEntryOption[]>([])
  const [loadingPackedEntries, setLoadingPackedEntries] = useState(false)
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

  const packEntryMap = useMemo(() => {
    return new Map(packedEntries.map((entry) => [entry.id, entry]))
  }, [packedEntries])

  const allocationTotals = useMemo(() => {
    const byEntry = new Map<number, number>()
    let totalPacks = 0
    let totalKg = 0
    formData.allocations.forEach((alloc) => {
      const entryId = Number(alloc.pack_entry_id)
      const count = Number(alloc.pack_count) || 0
      if (!entryId || count <= 0) return
      const entry = packEntryMap.get(entryId)
      byEntry.set(entryId, (byEntry.get(entryId) ?? 0) + count)
      totalPacks += count
      if (entry?.pack_size_kg) {
        totalKg += count * entry.pack_size_kg
      }
    })
    return { byEntry, totalPacks, totalKg }
  }, [formData.allocations, packEntryMap])

  const boxingTotals = useMemo(() => {
    const byEntry = new Map<number, number>()
    const boxesByEntry = new Map<number, number>()
    let totalPacks = 0
    let totalKg = 0
    formData.pack_items.forEach((box) => {
      const entryId = Number(box.pack_entry_id)
      const entry = packEntryMap.get(entryId)
      const packsPerBox = getPacksPerStandardCarton(entry?.pack_size_kg ?? null)
      const boxCount = Number(box.box_count) || 0
      const remainderPacks = Number(box.pack_count) || 0
      const count =
        packsPerBox != null ? boxCount * packsPerBox + remainderPacks : remainderPacks
      if (!entryId || count <= 0) return
      byEntry.set(entryId, (byEntry.get(entryId) ?? 0) + count)
      boxesByEntry.set(entryId, (boxesByEntry.get(entryId) ?? 0) + (boxCount > 0 ? boxCount : 0))
      totalPacks += count
      if (entry?.pack_size_kg) {
        totalKg += count * entry.pack_size_kg
      }
    })
    return { byEntry, boxesByEntry, totalPacks, totalKg }
  }, [formData.pack_items, packEntryMap])

  useEffect(() => {
    if (packedEntries.length === 0) return
    setFormData((prev) => {
      if (!isModalOpen) return prev
      const nextPackItems: ShipmentPackItemForm[] = []
      prev.allocations.forEach((allocation) => {
        const entryId = Number(allocation.pack_entry_id)
        const allocated = Number(allocation.pack_count) || 0
        if (!entryId || allocated <= 0) return
        const entry = packEntryMap.get(entryId)
        const packsPerBox = getPacksPerStandardCarton(entry?.pack_size_kg ?? null)
        const fullBoxes = packsPerBox ? Math.floor(allocated / packsPerBox) : 0
        const remainder = packsPerBox ? allocated - fullBoxes * packsPerBox : allocated
        const existing = prev.pack_items.find((item) => Number(item.pack_entry_id) === entryId)
        nextPackItems.push({
          id: existing?.id ?? `pack-${entryId}`,
          pack_entry_id: String(entryId),
          box_count: packsPerBox && fullBoxes > 0 ? String(fullBoxes) : '',
          pack_count: remainder > 0 ? String(remainder) : '',
          box_label: existing?.box_label ?? '',
        })
      })
      if (nextPackItems.length === 0) {
        nextPackItems.push(createEmptyPackItem())
      }
      return { ...prev, pack_items: nextPackItems }
    })
  }, [formData.allocations, packEntryMap, packedEntries.length, isModalOpen])

  const loadPackedEntries = useCallback(async () => {
    setLoadingPackedEntries(true)
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          pack_identifier,
          pack_size_kg,
          pack_count,
          created_at,
          sorting_output:process_sorting_outputs(
            product_id,
            product:products(id, name, sku)
          ),
          packaging_run:process_packaging_runs(
            process_step_runs(
              process_lot_runs(
                supply_batches(lot_no)
              )
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (entriesError) {
        setPackedEntries([])
        setLoadingPackedEntries(false)
        return
      }

      const list = (entries ?? []) as Array<{
        id: number
        pack_identifier: string
        pack_size_kg: number | null
        pack_count: number | null
        created_at: string | null
        sorting_output: {
          product_id?: number
          product?: { name?: string | null; sku?: string | null }
        } | null
        packaging_run: {
          process_step_runs?: {
            process_lot_runs?: {
              supply_batches?: { lot_no?: string | null } | null
            } | null
          } | { process_lot_runs?: { supply_batches?: { lot_no?: string | null } | null } | null }[] | null
        } | null
      }>

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const result = list
        .map((entry) => {
          const productId = entry.sorting_output?.product_id
          if (!productId) return null
          if (entry.pack_count == null || entry.pack_count <= 0) return null
          const productName = entry.sorting_output?.product?.name ?? 'Unknown'
          const productSku = entry.sorting_output?.product?.sku ?? ''
          const stepRun = unwrap(entry.packaging_run?.process_step_runs)
          const lotNo = (stepRun as any)?.process_lot_runs?.supply_batches?.lot_no ?? null
          return {
            id: entry.id,
            product_id: productId,
            product_name: productName,
            product_sku: productSku,
            pack_identifier: entry.pack_identifier,
            pack_size_kg: entry.pack_size_kg ?? null,
            pack_count: entry.pack_count ?? null,
            lot_no: lotNo,
            created_at: entry.created_at ?? null,
          } as PackedEntryOption
        })
        .filter((entry): entry is PackedEntryOption => entry !== null)

      setPackedEntries(result)
    } catch {
      setPackedEntries([])
    } finally {
      setLoadingPackedEntries(false)
    }
  }, [])

  useEffect(() => {
    loadPackedEntries()
  }, [loadPackedEntries])

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

  const loadShipmentPackItems = useCallback(async (shipmentId: number) => {
    const { data } = await supabase
      .from('shipment_pack_items')
      .select('id, pack_entry_id, pack_count, box_count, box_label, pack_entry:process_packaging_pack_entries(pack_size_kg)')
      .eq('shipment_id', shipmentId)
      .order('id')

    const items = (data ?? []) as Array<{
      id: number
      pack_entry_id: number
      pack_count: number
      box_count: number | null
      box_label: string | null
      pack_entry: { pack_size_kg?: number | null } | null
    }>
    const allocationMap = new Map<number, number>()
    items.forEach((item) => {
      if (!item.pack_entry_id) return
      const current = allocationMap.get(item.pack_entry_id) ?? 0
      allocationMap.set(item.pack_entry_id, current + (item.pack_count ?? 0))
    })
    setFormData((prev) => ({
      ...prev,
      pack_items:
        items.length > 0
          ? items.map((item) => ({
              id: `pack-${item.id}`,
              pack_entry_id: String(item.pack_entry_id),
              box_count:
                item.box_count != null
                  ? String(item.box_count)
                  : (() => {
                      const packsPerBox = getPacksPerStandardCarton(item.pack_entry?.pack_size_kg ?? null)
                      if (!packsPerBox || !item.pack_count) return ''
                      return String(Math.floor(item.pack_count / packsPerBox))
                    })(),
              pack_count: item.pack_count ? String(item.pack_count) : '',
              box_label: item.box_label ?? '',
            }))
          : [createEmptyPackItem()],
      allocations:
        allocationMap.size > 0
          ? Array.from(allocationMap.entries()).map(([pack_entry_id, pack_count]) => ({
              id: `alloc-${pack_entry_id}`,
              pack_entry_id: String(pack_entry_id),
              pack_count: pack_count ? String(pack_count) : '',
            }))
          : [createEmptyAllocation()],
    }))
  }, [])

  const openEditModal = useCallback(async (shipment: Shipment) => {
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
      allocations: [createEmptyAllocation()],
      pack_items: [createEmptyPackItem()],
      documents: shipment.documents ?? [],
    })
    setEditingShipmentId(shipment.id)
    setIsModalOpen(true)
    await loadShipmentPackItems(shipment.id)
  }, [loadShipmentPackItems])

  useEffect(() => {
    const { editShipmentId, shipment } = (location.state as { editShipmentId?: number; shipment?: Shipment }) || {}
    if (editShipmentId) {
      const existingShipment =
        shipments.find((entry) => entry.id === editShipmentId) || (shipment ? { ...shipment } : null)

      if (existingShipment) {
        const open = async () => {
          await openEditModal({
            ...existingShipment,
            items: Array.isArray(existingShipment.items) ? existingShipment.items : [],
            documents: Array.isArray(existingShipment.documents) ? existingShipment.documents : [],
          })
        }
        open()
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

  const handlePackItemChange = (itemId: string, field: keyof ShipmentPackItemForm, value: string) => {
    setFormData((prev) => {
      const nextPackItems = prev.pack_items.map((item) => {
        if (item.id !== itemId) return item
        if (field === 'pack_entry_id') {
          const entryId = Number(value)
          if (!entryId) {
            return { ...item, pack_entry_id: value, box_count: '', pack_count: '' }
          }
          const entry = packEntryMap.get(entryId)
          const packSize = entry?.pack_size_kg ?? null
          const packsPerBox = getPacksPerStandardCarton(packSize)
          const allocated = prev.allocations.reduce((sum, alloc) => {
            if (Number(alloc.pack_entry_id) !== entryId) return sum
            return sum + (Number(alloc.pack_count) || 0)
          }, 0)
          const boxedOther = prev.pack_items.reduce((sum, row) => {
            if (row.id === itemId) return sum
            if (Number(row.pack_entry_id) !== entryId) return sum
            const rowEntry = packEntryMap.get(entryId)
            const rowPacksPerBox = getPacksPerStandardCarton(rowEntry?.pack_size_kg ?? null)
            if (rowPacksPerBox != null) {
              return sum + (Number(row.box_count) || 0) * rowPacksPerBox + (Number(row.pack_count) || 0)
            }
            return sum + (Number(row.pack_count) || 0)
          }, 0)
          const remaining = Math.max(0, allocated - boxedOther)
          const suggestedBoxes =
            packsPerBox && remaining > 0 ? Math.max(1, Math.floor(remaining / packsPerBox)) : 0
          return {
            ...item,
            pack_entry_id: value,
            box_count: suggestedBoxes > 0 ? String(suggestedBoxes) : '',
            pack_count: '',
          }
        }
        if (field === 'box_count' || field === 'pack_count') {
          const entryId = Number(item.pack_entry_id)
          if (!entryId) return { ...item, [field]: value }
          const allocated = prev.allocations.reduce((sum, alloc) => {
            if (Number(alloc.pack_entry_id) !== entryId) return sum
            return sum + (Number(alloc.pack_count) || 0)
          }, 0)
          const boxedOther = prev.pack_items.reduce((sum, row) => {
            if (row.id === itemId) return sum
            if (Number(row.pack_entry_id) !== entryId) return sum
            const rowEntry = packEntryMap.get(entryId)
            const rowPacksPerBox = getPacksPerStandardCarton(rowEntry?.pack_size_kg ?? null)
            if (rowPacksPerBox != null) {
              return sum + (Number(row.box_count) || 0) * rowPacksPerBox
            }
            return sum + (Number(row.pack_count) || 0)
          }, 0)
          const remaining = Math.max(0, allocated - boxedOther)
          const packsPerBox = getPacksPerStandardCarton(packEntryMap.get(entryId)?.pack_size_kg ?? null)
          if (field === 'box_count' && packsPerBox != null) {
            const maxBoxes = packsPerBox > 0 ? Math.floor(remaining / packsPerBox) : 0
            const numeric = Math.max(0, Math.min(Number(value) || 0, maxBoxes))
            return { ...item, box_count: value === '' ? '' : String(numeric) }
          }
          if (field === 'pack_count') {
            const boxedHere = packsPerBox != null ? (Number(item.box_count) || 0) * packsPerBox : 0
            const availableForRemainder = Math.max(0, remaining - boxedHere)
            const numeric = Math.max(0, Math.min(Number(value) || 0, availableForRemainder))
            return { ...item, pack_count: value === '' ? '' : String(numeric) }
          }
          return item
        }
        return { ...item, [field]: value }
      })
      return { ...prev, pack_items: nextPackItems }
    })
  }

  const handleAllocationChange = (itemId: string, field: keyof ShipmentAllocationForm, value: string) => {
    setFormData((prev) => {
      const nextAllocations = prev.allocations.map((item) => {
        if (item.id !== itemId) return item
        if (field === 'pack_entry_id') {
          const entryId = Number(value)
          if (!entryId) {
            return { ...item, pack_entry_id: value, pack_count: '' }
          }
          const entry = packEntryMap.get(entryId)
          const available = entry?.pack_count ?? 0
          const packsPerBox = getPacksPerStandardCarton(entry?.pack_size_kg ?? null)
          const suggested = packsPerBox ? Math.min(packsPerBox, available) : 0
          return {
            ...item,
            pack_entry_id: value,
            pack_count: suggested > 0 ? String(suggested) : '',
          }
        }
        if (field === 'pack_count') {
          const entryId = Number(item.pack_entry_id)
          if (!entryId) return { ...item, pack_count: value }
          const entry = packEntryMap.get(entryId)
          const available = entry?.pack_count ?? 0
          const allocatedOther = prev.allocations.reduce((sum, row) => {
            if (row.id === itemId) return sum
            if (Number(row.pack_entry_id) !== entryId) return sum
            return sum + (Number(row.pack_count) || 0)
          }, 0)
          const remaining = Math.max(0, available - allocatedOther)
          const numeric = Math.max(0, Math.min(Number(value) || 0, remaining))
          return { ...item, pack_count: value === '' ? '' : String(numeric) }
        }
        return { ...item, [field]: value }
      })
      return { ...prev, allocations: nextAllocations }
    })
  }

  const handleAddAllocation = () => {
    setFormData((prev) => ({
      ...prev,
      allocations: [...prev.allocations, createEmptyAllocation()],
    }))
  }

  const handleRemoveAllocation = (itemId: string) => {
    setFormData((prev) => ({
      ...prev,
      allocations:
        prev.allocations.length === 1 ? prev.allocations : prev.allocations.filter((item) => item.id !== itemId),
    }))
  }

  const handleAddPackItem = () => {
    setFormData((prev) => ({
      ...prev,
      pack_items: [...prev.pack_items, createEmptyPackItem()],
    }))
  }

  const handleRemovePackItem = (itemId: string) => {
    setFormData((prev) => ({
      ...prev,
      pack_items:
        prev.pack_items.length === 1 ? prev.pack_items : prev.pack_items.filter((item) => item.id !== itemId),
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

    const normalizedAllocations = formData.allocations
      .filter((item) => item.pack_entry_id || item.pack_count)
      .map((item) => ({
        pack_entry_id: Number(item.pack_entry_id),
        pack_count: Number(item.pack_count) || 0,
      }))

    const invalidAllocation = normalizedAllocations.find(
      (item) => !item.pack_entry_id || item.pack_count <= 0
    )
    if (invalidAllocation) {
      toast.error('Please complete all pack allocation rows with a pack entry and pack count.')
      setSaving(false)
      return
    }

    const allocationMap = new Map<number, number>()
    normalizedAllocations.forEach((item) => {
      allocationMap.set(item.pack_entry_id, (allocationMap.get(item.pack_entry_id) ?? 0) + item.pack_count)
    })

    if (allocationMap.size === 0) {
      toast.error('Add at least one pack allocation before saving.')
      setSaving(false)
      return
    }

    for (const [entryId, totalAllocated] of allocationMap.entries()) {
      const entry = packEntryMap.get(entryId)
      const available = entry?.pack_count ?? 0
      if (totalAllocated > available) {
        toast.error(`Allocated packs exceed available packs for ${entry?.product_name ?? 'selected entry'}.`)
        setSaving(false)
        return
      }
    }

    const normalizedItems = formData.items
      .filter((item) => item.product_id && (Number(item.quantity) || 0) > 0)
      .map((item) => ({
        product_id: Number(item.product_id), // Required in schema
        description: item.description?.trim() || null,
        requested_qty: Number(item.quantity) || null,
        unit_id: item.unit ? Number(item.unit) : null, // unit_id is integer FK to units
      }))

    const normalizedPackItems = formData.pack_items
      .filter((item) => item.pack_entry_id && (Number(item.box_count) || Number(item.pack_count) || 0) > 0)
      .map((item) => {
        const entryId = Number(item.pack_entry_id)
        const entry = packEntryMap.get(entryId)
        const packsPerBox = getPacksPerStandardCarton(entry?.pack_size_kg ?? null)
        const boxCount = Number(item.box_count) || 0
        const packCount =
          packsPerBox != null ? boxCount * packsPerBox : Number(item.pack_count) || 0
        return {
          pack_entry_id: entryId,
          pack_count: packCount,
          box_count: boxCount > 0 ? boxCount : null,
          box_label: item.box_label?.trim() || null,
        }
      })

    const boxedMap = new Map<number, number>()
    normalizedPackItems.forEach((item) => {
      boxedMap.set(item.pack_entry_id, (boxedMap.get(item.pack_entry_id) ?? 0) + item.pack_count)
    })

    if (normalizedPackItems.length === 0) {
      toast.error('Boxing details are required before saving.')
      setSaving(false)
      return
    }

    const invalidBoxing = normalizedPackItems.find((item) => item.pack_count <= 0)
    if (invalidBoxing) {
      toast.error('Boxing rows must include a valid box count or pack count.')
      setSaving(false)
      return
    }

    for (const [entryId, allocated] of allocationMap.entries()) {
      const boxed = boxedMap.get(entryId) ?? 0
      if (boxed !== allocated) {
        toast.error('Boxing totals must match allocated packs for each pack entry.')
        setSaving(false)
        return
      }
    }

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

        await supabase.from('shipment_pack_items').delete().eq('shipment_id', editingShipmentId)
        if (normalizedPackItems.length > 0) {
          await supabase
            .from('shipment_pack_items')
            .insert(normalizedPackItems.map((item) => ({ shipment_id: editingShipmentId, ...item })))
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
        if (normalizedPackItems.length > 0) {
          await supabase
            .from('shipment_pack_items')
            .insert(normalizedPackItems.map((item) => ({ shipment_id: newId, ...item })))
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
              <div className="mx-auto max-w-5xl">
                {formStep === 1 && (
                  <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-text-dark">Shipment Details</h3>
                    <p className="text-sm text-text-dark/70">General shipment and scheduling information</p>
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

                {formStep === 3 && (
                  <section className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-semibold text-text-dark">Pack Allocation</h3>
                    <p className="text-sm text-text-dark/70">
                      Allocate packs from packed stock to this shipment.
                    </p>
                    {loadingPackedEntries && (
                      <p className="mt-2 text-sm text-text-dark/60">Loading packed entries…</p>
                    )}
                    {!loadingPackedEntries && packedEntries.length === 0 && (
                      <p className="mt-2 text-sm text-amber-700">
                        No pack entries available. Add pack entries in the packaging step first.
                      </p>
                    )}
                    <div className="mt-4 space-y-4">
                      {formData.allocations.map((allocation) => {
                        const selectedEntry = allocation.pack_entry_id
                          ? packedEntries.find((entry) => entry.id === Number(allocation.pack_entry_id))
                          : null
                        const entryId = selectedEntry?.id ?? 0
                        const allocatedOther = formData.allocations.reduce((sum, row) => {
                          if (row.id === allocation.id) return sum
                          if (!row.pack_entry_id) return sum
                          if (Number(row.pack_entry_id) !== entryId) return sum
                          return sum + (Number(row.pack_count) || 0)
                        }, 0)
                        const availablePacks = Math.max(0, (selectedEntry?.pack_count ?? 0) - allocatedOther)
                        const packSize = selectedEntry?.pack_size_kg ?? 0
                        const packsPerBox = getPacksPerStandardCarton(selectedEntry?.pack_size_kg ?? null)
                        const enteredPacks = Number(allocation.pack_count) || 0
                        const totalKg = packSize > 0 ? enteredPacks * packSize : 0
                        return (
                          <div
                            key={allocation.id}
                            className="grid gap-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 sm:grid-cols-4"
                          >
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor={`allocation-entry-${allocation.id}`}>Pack entry *</Label>
                              <select
                                id={`allocation-entry-${allocation.id}`}
                                value={allocation.pack_entry_id}
                                onChange={(e) => handleAllocationChange(allocation.id, 'pack_entry_id', e.target.value)}
                                required
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Select pack entry</option>
                                {packedEntries.map((entry) => (
                                  <option key={entry.id} value={entry.id}>
                                    {entry.product_name}
                                    {entry.product_sku ? ` (${entry.product_sku})` : ''} · {entry.pack_identifier}
                                    {entry.pack_size_kg ? ` (${entry.pack_size_kg} kg)` : ''} · {entry.pack_count ?? 0} packs
                                    {entry.lot_no ? ` · Lot ${entry.lot_no}` : ''}
                                  </option>
                                ))}
                              </select>
                              {selectedEntry && (
                                <p className="text-xs text-text-dark/60">
                                  Available: {availablePacks} packs · Pack size:{' '}
                                  {packSize > 0 ? `${packSize} kg` : selectedEntry.pack_identifier}
                                </p>
                              )}
                              {packsPerBox && (
                                <p className="text-xs text-text-dark/60">
                                  Standard 10 kg carton: {packsPerBox} packs per box
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`allocation-count-${allocation.id}`}>
                                Packs allocated *
                                {selectedEntry && (
                                  <span className="ml-1 text-xs font-normal text-text-dark/50">
                                    (max {availablePacks})
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={`allocation-count-${allocation.id}`}
                                type="number"
                                min="0"
                                max={selectedEntry ? availablePacks : undefined}
                                step="1"
                                value={allocation.pack_count}
                                onChange={(event) => handleAllocationChange(allocation.id, 'pack_count', event.target.value)}
                                placeholder="0"
                                disabled={!entryId}
                              />
                              {selectedEntry && packSize > 0 && (
                                <p className="text-xs text-text-dark/60">
                                  ≈ {totalKg.toFixed(2)} kg total
                                </p>
                              )}
                            </div>
                            <div className="flex items-end justify-end sm:col-span-4">
                              <Button
                                type="button"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleRemoveAllocation(allocation.id)}
                                disabled={formData.allocations.length === 1}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove Allocation
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddAllocation}
                        disabled={loadingPackedEntries || packedEntries.length === 0}
                      >
                        <PackageIcon className="mr-2 h-4 w-4" />
                        Add Allocation
                      </Button>
                    </div>
                  </section>
                )}

                {formStep === 4 && (
                  <section className="space-y-6">
                    <div className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Boxing</h3>
                      <p className="text-sm text-text-dark/70">
                        Put allocated packs into boxes. Boxing totals must match allocations.
                      </p>
                      {formData.allocations.length === 0 && (
                        <p className="mt-2 text-sm text-amber-700">
                          Add pack allocations first to start boxing.
                        </p>
                      )}
                      <div className="mt-4 space-y-4">
                        {formData.pack_items.map((packItem) => {
                          const selectedEntry = packItem.pack_entry_id
                            ? packedEntries.find((entry) => entry.id === Number(packItem.pack_entry_id))
                            : null
                              const entryId = selectedEntry?.id ?? 0
                              const allocated = allocationTotals.byEntry.get(entryId) ?? 0
                              const boxedOther = formData.pack_items.reduce((sum, row) => {
                                if (row.id === packItem.id) return sum
                                if (!row.pack_entry_id) return sum
                                if (Number(row.pack_entry_id) !== entryId) return sum
                                const rowEntry = packEntryMap.get(entryId)
                                const rowPacksPerBox = getPacksPerStandardCarton(rowEntry?.pack_size_kg ?? null)
                                if (rowPacksPerBox != null) {
                                  return sum + (Number(row.box_count) || 0) * rowPacksPerBox + (Number(row.pack_count) || 0)
                                }
                                return sum + (Number(row.pack_count) || 0)
                              }, 0)
                              const availableToBox = Math.max(0, allocated - boxedOther)
                              const packSize = selectedEntry?.pack_size_kg ?? 0
                              const packsPerBox = getPacksPerStandardCarton(selectedEntry?.pack_size_kg ?? null)
                              const boxCount = Number(packItem.box_count) || 0
                              const enteredPacks =
                                packsPerBox != null
                                  ? boxCount * packsPerBox + (Number(packItem.pack_count) || 0)
                                  : Number(packItem.pack_count) || 0
                              const totalKg = packSize > 0 ? enteredPacks * packSize : 0
                              const remainingAfterBoxes =
                                packsPerBox != null ? Math.max(0, availableToBox - boxCount * packsPerBox) : availableToBox
                          return (
                            <div
                              key={packItem.id}
                              className="grid gap-4 rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 sm:grid-cols-4"
                            >
                              <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor={`pack-entry-${packItem.id}`}>Allocated pack entry *</Label>
                                <select
                                  id={`pack-entry-${packItem.id}`}
                                  value={packItem.pack_entry_id}
                                  onChange={(e) => handlePackItemChange(packItem.id, 'pack_entry_id', e.target.value)}
                                  required
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <option value="">Select allocated entry</option>
                                  {formData.allocations
                                    .filter((alloc) => alloc.pack_entry_id)
                                    .map((alloc) => Number(alloc.pack_entry_id))
                                    .filter((value, index, self) => self.indexOf(value) === index)
                                    .map((entryId) => {
                                      const entry = packedEntries.find((item) => item.id === entryId)
                                      if (!entry) return null
                                      const allocatedCount = allocationTotals.byEntry.get(entryId) ?? 0
                                      return (
                                        <option key={entry.id} value={entry.id}>
                                          {entry.product_name}
                                          {entry.product_sku ? ` (${entry.product_sku})` : ''} · {entry.pack_identifier}
                                          {entry.pack_size_kg ? ` (${entry.pack_size_kg} kg)` : ''} · {allocatedCount} packs
                                          {entry.lot_no ? ` · Lot ${entry.lot_no}` : ''}
                                        </option>
                                      )
                                    })}
                                </select>
                              {selectedEntry && (
                                <p className="text-xs text-text-dark/60">
                                  Remaining to box: {availableToBox} packs · Pack size:{' '}
                                  {packSize > 0 ? `${packSize} kg` : selectedEntry.pack_identifier}
                                </p>
                              )}
                              {packsPerBox && (
                                <p className="text-xs text-text-dark/60">
                                  Standard 10 kg carton: {packsPerBox} packs per box
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`box-count-${packItem.id}`}>
                                Boxes packed *
                                {selectedEntry && (
                                  <span className="ml-1 text-xs font-normal text-text-dark/50">
                                    (max {packsPerBox ? Math.floor(availableToBox / packsPerBox) : availableToBox})
                                  </span>
                                )}
                              </Label>
                              <Input
                                id={`box-count-${packItem.id}`}
                                type="number"
                                min="0"
                                max={selectedEntry ? (packsPerBox ? Math.floor(availableToBox / packsPerBox) : availableToBox) : undefined}
                                step="1"
                                value={packItem.box_count}
                                onChange={(event) => handlePackItemChange(packItem.id, 'box_count', event.target.value)}
                                placeholder="0"
                                disabled={!entryId || packsPerBox == null}
                              />
                              <Label htmlFor={`pack-count-${packItem.id}`} className="text-xs text-text-dark/60">
                                Remainder packs
                              </Label>
                              <Input
                                id={`pack-count-${packItem.id}`}
                                type="number"
                                min="0"
                                max={selectedEntry ? remainingAfterBoxes : undefined}
                                step="1"
                                value={packItem.pack_count}
                                onChange={(event) => handlePackItemChange(packItem.id, 'pack_count', event.target.value)}
                                placeholder="0"
                                disabled={!entryId}
                              />
                              {selectedEntry && packSize > 0 && (
                                <p className="text-xs text-text-dark/60">
                                  ≈ {totalKg.toFixed(2)} kg total
                                </p>
                              )}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`box-label-${packItem.id}`}>Box label</Label>
                                <Input
                                  id={`box-label-${packItem.id}`}
                                  value={packItem.box_label}
                                  onChange={(event) => handlePackItemChange(packItem.id, 'box_label', event.target.value)}
                                  placeholder="Box A, Pallet 1, etc."
                                />
                              </div>
                              <div className="flex items-end justify-end sm:col-span-4">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleRemovePackItem(packItem.id)}
                                  disabled={formData.pack_items.length === 1}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove Box
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddPackItem}
                          disabled={allocationTotals.totalPacks === 0}
                        >
                          <PackageIcon className="mr-2 h-4 w-4" />
                          Add Box
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-text-dark">Review</h3>
                      <p className="text-sm text-text-dark/70">Confirm totals before saving.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-md border border-olive-light/40 bg-olive-light/10 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Allocated packs</p>
                          <p className="text-lg font-semibold text-text-dark">{allocationTotals.totalPacks}</p>
                          <p className="text-xs text-text-dark/60">
                            {allocationTotals.totalKg > 0 ? `${allocationTotals.totalKg.toFixed(2)} kg` : '—'}
                          </p>
                        </div>
                        <div className="rounded-md border border-olive-light/40 bg-olive-light/10 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Boxes packed</p>
                          <p className="text-lg font-semibold text-text-dark">
                            {Array.from(boxingTotals.boxesByEntry.values()).reduce((sum, value) => sum + value, 0)}
                          </p>
                          <p className="text-xs text-text-dark/60">
                            {boxingTotals.totalPacks} packs · {boxingTotals.totalKg > 0 ? `${boxingTotals.totalKg.toFixed(2)} kg` : '—'}
                          </p>
                        </div>
                        <div className="rounded-md border border-olive-light/40 bg-olive-light/10 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Status</p>
                          <p className="text-lg font-semibold text-text-dark">
                            {allocationTotals.totalPacks === boxingTotals.totalPacks ? 'Balanced' : 'Mismatch'}
                          </p>
                          <p className="text-xs text-text-dark/60">
                            {allocationTotals.totalPacks === boxingTotals.totalPacks
                              ? 'Ready to save'
                              : 'Fix boxing totals'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-text-dark/70">
                        {Array.from(allocationTotals.byEntry.entries()).map(([entryId, allocated]) => {
                          const entry = packEntryMap.get(entryId)
                          const boxed = boxingTotals.byEntry.get(entryId) ?? 0
                          return (
                            <div key={`review-${entryId}`} className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {entry?.product_name ?? 'Entry'} · {entry?.pack_identifier ?? 'Pack'} {entry?.lot_no ? `· Lot ${entry.lot_no}` : ''}
                              </span>
                              <span className={boxed === allocated ? 'text-olive' : 'text-red-600'}>
                                {boxed}/{allocated} packs boxed
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-lg border border-olive-light/40 bg-white p-5 shadow-sm">
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
