import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { FileText, MapPin, User2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface ShipmentItem {
  id: string
  sku?: string | null
  description?: string | null
  quantity?: number | null
  unit?: string | null
}

interface ShipmentPackItem {
  id: string
  product_name: string | null
  product_sku: string | null
  pack_identifier: string | null
  pack_size_kg: number | null
  pack_count: number | null
  units_count: number | null
  storage_type: 'BOX' | 'BAG' | 'SHOP_PACKING' | null
  box_count: number | null
  box_label: string | null
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
  pack_items: ShipmentPackItem[]
  documents: ShipmentDocument[]
  created_at: string
}

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

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
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

const hydrateShipment = (shipment: Partial<Shipment> | null | undefined): Shipment | null => {
  if (!shipment) {
    return null
  }

  return {
    id: shipment.id ?? 0,
    doc_no: shipment.doc_no ?? '',
    customer_id: shipment.customer_id ?? 0,
    customer_name: shipment.customer_name ?? '',
    customer_contact_name: shipment.customer_contact_name ?? null,
    customer_contact_email: shipment.customer_contact_email ?? null,
    customer_contact_phone: shipment.customer_contact_phone ?? null,
    shipping_address: shipment.shipping_address ?? null,
    warehouse_id: shipment.warehouse_id ?? 0,
    warehouse_name: shipment.warehouse_name ?? null,
    carrier_id: shipment.carrier_id ?? null,
    carrier_name: shipment.carrier_name ?? null,
    carrier_reference: shipment.carrier_reference ?? null,
    planned_ship_date: shipment.planned_ship_date ?? null,
    shipped_at: shipment.shipped_at ?? null,
    expected_delivery: shipment.expected_delivery ?? null,
    doc_status: shipment.doc_status ?? 'PENDING',
    notes: shipment.notes ?? null,
    special_instructions: shipment.special_instructions ?? null,
    items: Array.isArray(shipment.items) ? shipment.items : [],
    pack_items: Array.isArray(shipment.pack_items) ? shipment.pack_items : [],
    documents: Array.isArray(shipment.documents) ? shipment.documents : [],
    created_at: shipment.created_at ?? new Date().toISOString(),
  }
}

function ShipmentDetail() {
  const { shipmentId } = useParams()
  const navigate = useNavigate()
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadShipment = useCallback(async () => {
    const id = shipmentId ? Number(shipmentId) : NaN
    if (!shipmentId || Number.isNaN(id)) {
      setShipment(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: row, error: shipError } = await supabase
        .from('shipments')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (shipError) {
        setError(shipError.message)
        setShipment(null)
        setLoading(false)
        return
      }

      if (!row) {
        setShipment(null)
        setLoading(false)
        return
      }

      const s = row as {
        id: number
        doc_no: string | null
        customer_id: number | null
        warehouse_id: number | null
        carrier_name: string | null
        carrier_reference: string | null
        planned_ship_date: string | null
        shipped_at: string | null
        expected_delivery: string | null
        doc_status: string
        shipping_address: string | null
        customer_contact_name: string | null
        customer_contact_email: string | null
        customer_contact_phone: string | null
        notes: string | null
        special_instructions: string | null
        created_at: string
      }

      const [itemsRes, packItemsRes, customerRes, warehouseRes] = await Promise.all([
        supabase.from('shipment_items').select('*').eq('shipment_id', s.id).order('id'),
        supabase
          .from('shipment_pack_items')
          .select(`
            id,
            units_count,
            storage_type,
            pack_count,
            box_count,
            box_label,
            pack_entry:process_packaging_pack_entries(
              pack_identifier,
              pack_size_kg,
              sorting_output:process_sorting_outputs(
                product:products(name, sku)
              )
            )
          `)
          .eq('shipment_id', s.id)
          .order('id'),
        s.customer_id
          ? supabase.from('customers').select('id, name').eq('id', s.customer_id).maybeSingle()
          : { data: null },
        s.warehouse_id
          ? supabase.from('warehouses').select('id, name').eq('id', s.warehouse_id).maybeSingle()
          : { data: null },
      ])

      const itemsList = (itemsRes.data ?? []) as Array<{
        id: number
        shipment_id: number
        product_id: number | null
        sku: string | null
        description: string | null
        quantity: number
        unit: string | null
      }>
      const items: ShipmentItem[] = itemsList.map((item) => ({
        id: `line-${item.id}`,
        sku: item.sku ?? null,
        description: item.description ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
      }))

      const packItemsList = (packItemsRes.data ?? []) as Array<{
        id: number
        units_count: number | null
        storage_type: 'BOX' | 'BAG' | 'SHOP_PACKING' | null
        pack_count: number | null
        box_count: number | null
        box_label: string | null
        pack_entry: {
          pack_identifier?: string | null
          pack_size_kg?: number | null
          sorting_output?: { product?: { name?: string | null; sku?: string | null } | null } | null
        } | null
      }>
      const packItems: ShipmentPackItem[] = packItemsList.map((item) => ({
        id: `pack-${item.id}`,
        product_name: item.pack_entry?.sorting_output?.product?.name ?? null,
        product_sku: item.pack_entry?.sorting_output?.product?.sku ?? null,
        pack_identifier: item.pack_entry?.pack_identifier ?? null,
        pack_size_kg: item.pack_entry?.pack_size_kg ?? null,
        units_count: item.units_count ?? null,
        storage_type: item.storage_type ?? null,
        pack_count: item.pack_count ?? null,
        box_count: item.box_count ?? null,
        box_label: item.box_label ?? null,
      }))

      const customerName: string =
        s.customer_id != null ? ((customerRes.data as { name?: string } | null)?.name ?? '') : ''
      const warehouseName: string =
        s.warehouse_id != null ? ((warehouseRes.data as { name?: string } | null)?.name ?? '') : ''

      setShipment(
        hydrateShipment({
          id: s.id,
          doc_no: s.doc_no ?? '',
          customer_id: s.customer_id ?? 0,
          customer_name: customerName,
          customer_contact_name: s.customer_contact_name ?? null,
          customer_contact_email: s.customer_contact_email ?? null,
          customer_contact_phone: s.customer_contact_phone ?? null,
          shipping_address: s.shipping_address ?? null,
          warehouse_id: s.warehouse_id ?? 0,
          warehouse_name: warehouseName,
          carrier_name: s.carrier_name ?? null,
          carrier_reference: s.carrier_reference ?? null,
          planned_ship_date: s.planned_ship_date ?? null,
          shipped_at: s.shipped_at ?? null,
          expected_delivery: s.expected_delivery ?? null,
          doc_status: (s.doc_status as ShipmentStatus) ?? 'PENDING',
          notes: s.notes ?? null,
          special_instructions: s.special_instructions ?? null,
          items,
          pack_items: packItems,
          documents: [],
          created_at: s.created_at ?? new Date().toISOString(),
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shipment')
      setShipment(null)
    } finally {
      setLoading(false)
    }
  }, [shipmentId])

  useEffect(() => {
    loadShipment()
  }, [loadShipment])

  const handleBack = () => {
    navigate('/shipments')
  }

  const handleEdit = () => {
    if (!shipment) {
      return
    }
    navigate('/shipments', { state: { editShipmentId: shipment.id, shipment } })
  }

  if (loading) {
    return (
      <PageLayout
        title="Shipment Detail"
        activeItem="shipments"
        actions={
          <Button variant="outline" onClick={handleBack}>
            Back to Shipments
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <div className="flex items-center justify-center py-12">
          <Spinner className="h-8 w-8 text-olive" />
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout
        title="Shipment Detail"
        activeItem="shipments"
        actions={
          <Button variant="outline" onClick={handleBack}>
            Back to Shipments
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Error loading shipment</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => loadShipment()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  if (!shipment) {
    return (
      <PageLayout
        title="Shipment Detail"
        activeItem="shipments"
        actions={
          <Button variant="outline" onClick={handleBack}>
            Back to Shipments
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Shipment not found</CardTitle>
            <CardDescription>The shipment you are looking for could not be located.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-dark/70">
              The record may have been removed or the link is outdated. Please return to the shipments register to
              continue.
            </p>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  const totalItems = shipment.items.reduce((count: number, item: ShipmentItem) => count + (item.quantity ?? 0), 0)
  const totalPackUnits = shipment.pack_items.reduce((count, item) => count + (item.units_count ?? item.box_count ?? 0), 0)

  return (
    <PageLayout
      title="Shipment Detail"
      activeItem="shipments"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack}>
            Back to Shipments
          </Button>
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleEdit}>
            Edit Shipment
          </Button>
        </div>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="space-y-6">
        <Card className="overflow-hidden border-olive-light/40 bg-gradient-to-r from-olive-light/40 via-white to-white">
          <CardContent className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold text-text-dark">{shipment.doc_no}</CardTitle>
              <p className="text-sm text-text-dark/70">
                {shipment.customer_name} · Created {formatDate(shipment.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${getStatusBadgeColor(shipment.doc_status)}`}
              >
                {shipment.doc_status}
              </span>
              <span className="inline-flex items-center rounded-full border border-olive-light/60 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-olive-dark">
                {shipment.carrier_name || 'Carrier not set'}
              </span>
              <span className="inline-flex items-center rounded-full bg-beige/40 px-3 py-1 text-xs font-medium text-text-dark/70">
                Planned {formatDateTime(shipment.planned_ship_date)}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Carrier</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.carrier_name || 'Not assigned'}
              </p>
              <p className="text-xs text-text-dark/60">
                {shipment.carrier_reference ? `Reference: ${shipment.carrier_reference}` : 'No carrier reference'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Schedule</p>
              <p className="text-xs text-text-dark/60">Planned departure</p>
              <p className="text-sm font-medium text-text-dark">{formatDateTime(shipment.planned_ship_date)}</p>
              <p className="text-xs text-text-dark/60">Expected delivery</p>
              <p className="text-sm font-medium text-text-dark">{formatDateTime(shipment.expected_delivery)}</p>
              {shipment.shipped_at && (
                <>
                  <p className="text-xs text-text-dark/60">Dispatched</p>
                  <p className="text-sm font-medium text-text-dark">{formatDateTime(shipment.shipped_at)}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Customer Contact</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.customer_contact_name || shipment.customer_name}
              </p>
              <p className="text-xs text-text-dark/60">
                {shipment.customer_contact_email || 'No email recorded'}
              </p>
              <p className="text-xs text-text-dark/60">
                {shipment.customer_contact_phone || 'No phone recorded'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Line Items</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.items.length} item{shipment.items.length === 1 ? '' : 's'} · {totalItems} units
              </p>
              <p className="text-xs text-text-dark/60">Packed boxes</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.pack_items.length} lines · {totalPackUnits} units
              </p>
              <p className="text-xs text-text-dark/60">Warehouse</p>
              <p className="text-sm font-medium text-text-dark">{shipment.warehouse_name || 'Not specified'}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Destination</CardTitle>
            <CardDescription>Delivery coordinates for this shipment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-olive-light/40 bg-olive-light/10 p-3">
              <MapPin className="h-5 w-5 text-olive" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Shipping Address</p>
                <p className="text-sm font-medium text-text-dark">
                  {shipment.shipping_address || 'No shipping address recorded'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-olive-light/40 bg-olive-light/10 p-3">
              <User2 className="h-5 w-5 text-olive" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Customer</p>
                <p className="text-sm font-medium text-text-dark">{shipment.customer_name}</p>
                <p className="text-xs text-text-dark/60">Created {formatDate(shipment.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Notes &amp; Instructions</CardTitle>
            <CardDescription>Context for warehouse and transport teams</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Internal Notes</p>
              <p className="text-sm text-text-dark/80">
                {shipment.notes || 'No notes recorded for this shipment.'}
              </p>
            </div>
            {shipment.special_instructions && (
              <div className="rounded-md bg-olive-light/10 p-3 text-sm text-text-dark">
                <p className="text-xs font-semibold uppercase tracking-wide text-olive">Special Instructions</p>
                <p className="mt-1">{shipment.special_instructions}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Documents</CardTitle>
            <CardDescription>Supporting paperwork available for this shipment</CardDescription>
          </CardHeader>
          <CardContent>
            {shipment.documents.length === 0 ? (
              <div className="rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 text-sm text-text-dark/70">
                No documents have been uploaded for this shipment.
              </div>
            ) : (
              <ul className="space-y-2">
                {shipment.documents.map((document: ShipmentDocument) => (
                  <li key={document.id} className="flex items-center gap-3 rounded-lg border border-olive-light/40 bg-olive-light/10 px-3 py-2">
                    <FileText className="h-4 w-4 text-olive" />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text-dark">{document.name}</span>
                      <span className="text-xs text-text-dark/60">{document.type}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Packed Boxes</CardTitle>
            <CardDescription>Pack entries allocated to this shipment</CardDescription>
          </CardHeader>
          <CardContent>
            {shipment.pack_items.length === 0 ? (
              <div className="rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 text-sm text-text-dark/70">
                No packed boxes recorded for this shipment yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-olive-light/40">
                <table className="min-w-full divide-y divide-olive-light/30">
                  <thead className="bg-olive-light/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Storage
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Units
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Packs
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Box
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-olive-light/20">
                    {shipment.pack_items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm text-text-dark/80">
                          {item.product_name || '—'}
                          {item.product_sku ? ` (${item.product_sku})` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-dark/80">
                          {item.storage_type || 'LEGACY'}
                          {' · '}
                          {item.pack_identifier || '—'}
                          {item.pack_size_kg ? ` (${item.pack_size_kg} kg/pack)` : ''}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-text-dark/80">
                          {item.units_count ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-text-dark/80">
                          {item.pack_count ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-dark/80">{item.box_label || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-olive-light/30 bg-white">
          <CardHeader>
            <CardTitle className="text-text-dark">Line Items</CardTitle>
            <CardDescription>Products allocated to this shipment</CardDescription>
          </CardHeader>
          <CardContent>
            {shipment.items.length === 0 ? (
              <div className="rounded-lg border border-olive-light/40 bg-olive-light/10 p-4 text-sm text-text-dark/70">
                No items recorded for this shipment yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-olive-light/40">
                <table className="min-w-full divide-y divide-olive-light/30">
                  <thead className="bg-olive-light/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                        Unit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-olive-light/20">
                    {shipment.items.map((item: ShipmentItem) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm font-medium text-text-dark">{item.sku || '-'}</td>
                        <td className="px-4 py-3 text-sm text-text-dark/80">{item.description || '-'}</td>
                        <td className="px-4 py-3 text-right text-sm text-text-dark/80">
                          {item.quantity !== null && item.quantity !== undefined ? item.quantity : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-dark/80">{item.unit || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

export default ShipmentDetail
