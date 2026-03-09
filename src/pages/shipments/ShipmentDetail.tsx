import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import PageLayout from '@/components/layout/PageLayout'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface ShipmentItem {
  id: string
  shipment_item_id?: number
  product_id?: number | null
  product_name?: string | null
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
  box_label: string | null
  lot_no: string | null
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
        carrier_id: number | null
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

      const [itemsRes, packItemsRes, customerRes, warehouseRes, carrierRes] = await Promise.all([
        supabase.from('shipment_items').select('id, shipment_id, product_id, description, requested_qty, unit_id').eq('shipment_id', s.id).order('id'),
        supabase
          .from('shipment_pack_items')
          .select('id, packaging_allocation_id, pack_entry_id, units_count, storage_type, pack_count, box_label')
          .eq('shipment_id', s.id)
          .order('id'),
        s.customer_id
          ? supabase.from('customers').select('id, name').eq('id', s.customer_id).maybeSingle()
          : { data: null },
        s.warehouse_id
          ? supabase.from('warehouses').select('id, name').eq('id', s.warehouse_id).maybeSingle()
          : { data: null },
        s.carrier_id
          ? supabase.from('carriers').select('id, name').eq('id', s.carrier_id).maybeSingle()
          : { data: null },
      ])

      const itemsList = (itemsRes.data ?? []) as Array<{
        id: number
        shipment_id: number
        product_id: number | null
        description: string | null
        requested_qty: number | null
        unit_id: number | null
      }>
      const itemProductIds = [...new Set(itemsList.map((item) => item.product_id).filter((value): value is number => value != null))]
      const unitIds = [...new Set(itemsList.map((item) => item.unit_id).filter((value): value is number => value != null))]
      const [productsRes, unitsRes] = await Promise.all([
        itemProductIds.length > 0 ? supabase.from('products').select('id, name, sku').in('id', itemProductIds) : { data: [] },
        unitIds.length > 0 ? supabase.from('units').select('id, symbol, name').in('id', unitIds) : { data: [] },
      ])
      const productMap = new Map<number, { name: string; sku: string | null }>(
        ((productsRes.data ?? []) as Array<{ id: number; name: string | null; sku: string | null }>).map((product) => [
          product.id,
          { name: product.name ?? `Product #${product.id}`, sku: product.sku ?? null },
        ])
      )
      const unitMap = new Map<number, string>(
        ((unitsRes.data ?? []) as Array<{ id: number; symbol: string | null; name: string | null }>).map((unit) => [
          unit.id,
          unit.symbol ?? unit.name ?? '',
        ])
      )
      const items: ShipmentItem[] = itemsList.map((item) => ({
        id: `line-${item.id}`,
        shipment_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_id ? productMap.get(item.product_id)?.name ?? null : null,
        sku: item.product_id ? productMap.get(item.product_id)?.sku ?? null : null,
        description: item.description ?? null,
        quantity: item.requested_qty ?? null,
        unit: item.unit_id ? unitMap.get(item.unit_id) ?? null : null,
      }))

      const packItemsList = (packItemsRes.data ?? []) as Array<{
        id: number
        packaging_allocation_id: number | null
        pack_entry_id: number | null
        units_count: number | null
        storage_type: 'BOX' | 'BAG' | 'SHOP_PACKING' | null
        pack_count: number | null
        box_label: string | null
      }>
      const packEntryIds = [...new Set(packItemsList.map((item) => item.pack_entry_id).filter((id): id is number => id != null))]
      const allocationIds = [...new Set(packItemsList.map((item) => item.packaging_allocation_id).filter((id): id is number => id != null))]

      const [packEntriesRes, allocationRes] = await Promise.all([
        packEntryIds.length > 0
          ? supabase
              .from('process_packaging_pack_entries')
              .select(`
                id,
                pack_identifier,
                pack_size_kg,
                sorting_output:process_sorting_outputs(
                  product:products(name, sku),
                  process_step_run:process_step_runs(
                    process_lot_run:process_lot_runs(
                      supply_batch:supply_batches(lot_no)
                    )
                  )
                )
              `)
              .in('id', packEntryIds)
          : { data: [] },
        allocationIds.length > 0
          ? supabase.from('process_packaging_storage_allocations').select('id, packs_per_unit').in('id', allocationIds)
          : { data: [] },
      ])

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const packEntryMap = new Map<
        number,
        { product_name: string | null; product_sku: string | null; pack_identifier: string | null; pack_size_kg: number | null; lot_no: string | null }
      >()
      ;((packEntriesRes.data ?? []) as Array<{
        id: number
        pack_identifier: string | null
        pack_size_kg: number | null
        sorting_output:
          | {
              product?: { name?: string | null; sku?: string | null } | null
              process_step_run?: { process_lot_run?: { supply_batch?: { lot_no?: string | null } | null } | null } | null
            }
          | Array<{
              product?: { name?: string | null; sku?: string | null } | null
              process_step_run?: { process_lot_run?: { supply_batch?: { lot_no?: string | null } | null } | null } | null
            }>
          | null
      }>).forEach((entry) => {
        const sortingOutput = unwrap(entry.sorting_output)
        const lotNo = sortingOutput?.process_step_run?.process_lot_run?.supply_batch?.lot_no ?? null
        packEntryMap.set(entry.id, {
          product_name: sortingOutput?.product?.name ?? null,
          product_sku: sortingOutput?.product?.sku ?? null,
          pack_identifier: entry.pack_identifier ?? null,
          pack_size_kg: entry.pack_size_kg ?? null,
          lot_no: lotNo,
        })
      })

      const packsPerUnitMap = new Map<number, number>()
      ;((allocationRes.data ?? []) as Array<{ id: number; packs_per_unit: number | null }>).forEach((row) => {
        packsPerUnitMap.set(row.id, Number(row.packs_per_unit) || 0)
      })

      const packItems: ShipmentPackItem[] = packItemsList.map((item) => {
        const packEntry = item.pack_entry_id ? packEntryMap.get(item.pack_entry_id) : null
        const packsPerUnit = item.packaging_allocation_id ? packsPerUnitMap.get(item.packaging_allocation_id) ?? 0 : 0
        const derivedUnits =
          item.units_count != null
            ? Number(item.units_count)
            : packsPerUnit > 0 && item.pack_count != null
              ? Number(item.pack_count) / packsPerUnit
              : null
        return {
          id: `pack-${item.id}`,
          product_name: packEntry?.product_name ?? null,
          product_sku: packEntry?.product_sku ?? null,
          pack_identifier: packEntry?.pack_identifier ?? null,
          pack_size_kg: packEntry?.pack_size_kg ?? null,
          units_count: Number.isFinite(derivedUnits as number) ? derivedUnits : null,
          storage_type: item.storage_type ?? null,
          pack_count: item.pack_count ?? null,
          box_label: item.box_label ?? null,
          lot_no: packEntry?.lot_no ?? null,
        }
      })

      const customerName: string =
        s.customer_id != null ? ((customerRes.data as { name?: string } | null)?.name ?? '') : ''
      const warehouseName: string =
        s.warehouse_id != null ? ((warehouseRes.data as { name?: string } | null)?.name ?? '') : ''
      const carrierName: string | null =
        s.carrier_id != null
          ? ((carrierRes.data as { name?: string } | null)?.name ?? `Unknown carrier (ID ${s.carrier_id})`)
          : null

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
          carrier_id: s.carrier_id ?? null,
          carrier_name: carrierName,
          carrier_reference: s.carrier_reference ?? null,
          planned_ship_date: s.planned_ship_date ?? null,
          shipped_at: s.shipped_at ?? null,
          expected_delivery: s.expected_delivery ?? null,
          doc_status: (s.doc_status as ShipmentStatus) ?? 'PENDING',
          notes: s.notes ?? null,
          special_instructions: s.special_instructions ?? null,
          items,
          pack_items: packItems,
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
        leadingActions={
          <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Shipments">
            <ArrowLeft className="h-4 w-4" />
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
        leadingActions={
          <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Shipments">
            <ArrowLeft className="h-4 w-4" />
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
        leadingActions={
          <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Shipments">
            <ArrowLeft className="h-4 w-4" />
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
  const totalPackUnits = shipment.pack_items.reduce((count, item) => count + (item.units_count ?? 0), 0)

  return (
    <PageLayout
      title="Shipment Detail"
      activeItem="shipments"
      leadingActions={
        <Button size="icon" variant="outline" onClick={handleBack} aria-label="Back to Shipments">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
      actions={
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleEdit}>
          Edit Shipment
        </Button>
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
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Customer</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.customer_name}
              </p>
              <p className="text-xs text-text-dark/60">
                {shipment.shipping_address || 'No shipping address recorded'}
              </p>
              <p className="text-xs text-text-dark/60">
                Contact: {shipment.customer_contact_phone || 'No phone recorded'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-olive-light/30 bg-white">
            <CardContent className="space-y-2 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Line Items</p>
              <p className="text-sm font-medium text-text-dark">
                {shipment.items.length} item{shipment.items.length === 1 ? '' : 's'} · {totalItems} units
              </p>
              <p className="text-xs text-text-dark/60">Packed allocations</p>
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
                          {item.lot_no ? ` · Lot ${item.lot_no}` : ''}
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
