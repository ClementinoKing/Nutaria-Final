import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'

interface ProductOption {
  id: number
  name: string
  sku: string | null
  base_unit_id: number | null
}

interface WarehouseOption {
  id: number
  name: string
}

interface UnitOption {
  id: number
  name: string | null
  symbol: string | null
}

interface LotOption {
  id: number
  lot_no: string
  product_id: number
  warehouse_id: number
}

interface AdjustmentRow {
  id: number
  adjusted_at: string | null
  reason: string
  qty: number
  note: string | null
  product_name: string
  warehouse_name: string
  unit_label: string
  lot_no: string | null
}

interface AdjustmentFormData {
  product_id: string
  warehouse_id: string
  lot_id: string
  qty: string
  unit_id: string
  reason: string
  note: string
}

const createEmptyForm = (): AdjustmentFormData => ({
  product_id: '',
  warehouse_id: '',
  lot_id: '',
  qty: '',
  unit_id: '',
  reason: '',
  note: '',
})

function InventoryAdjustments() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])
  const [lots, setLots] = useState<LotOption[]>([])
  const [rows, setRows] = useState<AdjustmentRow[]>([])
  const [formData, setFormData] = useState<AdjustmentFormData>(createEmptyForm())

  const load = useCallback(async () => {
    setLoading(true)
    const [productsRes, warehousesRes, unitsRes, lotsRes, adjustmentsRes] = await Promise.all([
      supabase.from('products').select('id, name, sku, base_unit_id').order('name'),
      supabase.from('warehouses').select('id, name').order('name'),
      supabase.from('units').select('id, name, symbol').order('name'),
      supabase
        .from('supply_batches')
        .select('id, lot_no, product_id, supply:supplies(warehouse_id)')
        .order('id', { ascending: false }),
      supabase
        .from('inventory_adjustments')
        .select('id, adjusted_at, reason, qty, note, product_id, warehouse_id, lot_id, unit_id')
        .order('adjusted_at', { ascending: false })
        .limit(50),
    ])

    if (productsRes.error || warehousesRes.error || unitsRes.error || lotsRes.error || adjustmentsRes.error) {
      toast.error(
        productsRes.error?.message ||
          warehousesRes.error?.message ||
          unitsRes.error?.message ||
          lotsRes.error?.message ||
          adjustmentsRes.error?.message ||
          'Failed to load adjustment data'
      )
      setLoading(false)
      return
    }

    const nextProducts = (productsRes.data ?? []) as ProductOption[]
    const nextWarehouses = (warehousesRes.data ?? []) as WarehouseOption[]
    const nextUnits = (unitsRes.data ?? []) as UnitOption[]
    const nextLots = ((lotsRes.data ?? []) as Array<{
      id: number
      lot_no: string
      product_id: number
      supply: { warehouse_id: number | null }[] | { warehouse_id: number | null } | null
    }>).map((lot) => {
      const supply = Array.isArray(lot.supply) ? lot.supply[0] : lot.supply
      return {
        id: lot.id,
        lot_no: lot.lot_no,
        product_id: lot.product_id,
        warehouse_id: Number(supply?.warehouse_id ?? 0),
      }
    })

    const productMap = new Map(nextProducts.map((p) => [p.id, p]))
    const warehouseMap = new Map(nextWarehouses.map((w) => [w.id, w]))
    const unitMap = new Map(nextUnits.map((u) => [u.id, u]))
    const lotMap = new Map(nextLots.map((l) => [l.id, l]))

    const nextRows = ((adjustmentsRes.data ?? []) as Array<{
      id: number
      adjusted_at: string | null
      reason: string
      qty: number
      note: string | null
      product_id: number
      warehouse_id: number
      lot_id: number | null
      unit_id: number | null
    }>).map((row) => {
      const unit = row.unit_id ? unitMap.get(row.unit_id) : null
      return {
        id: row.id,
        adjusted_at: row.adjusted_at,
        reason: row.reason,
        qty: Number(row.qty) || 0,
        note: row.note,
        product_name: productMap.get(row.product_id)?.name ?? `Product #${row.product_id}`,
        warehouse_name: warehouseMap.get(row.warehouse_id)?.name ?? `Warehouse #${row.warehouse_id}`,
        unit_label: unit?.symbol || unit?.name || '—',
        lot_no: row.lot_id ? lotMap.get(row.lot_id)?.lot_no ?? `Lot #${row.lot_id}` : null,
      }
    })

    setProducts(nextProducts)
    setWarehouses(nextWarehouses)
    setUnits(nextUnits)
    setLots(nextLots)
    setRows(nextRows)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === Number(formData.product_id)) ?? null,
    [products, formData.product_id]
  )

  const availableLots = useMemo(() => {
    const productId = Number(formData.product_id)
    const warehouseId = Number(formData.warehouse_id)
    return lots
      .filter((lot) => {
        if (productId && lot.product_id !== productId) return false
        if (warehouseId && lot.warehouse_id !== warehouseId) return false
        return true
      })
      .slice(0, 300)
  }, [lots, formData.product_id, formData.warehouse_id])

  useEffect(() => {
    if (!selectedProduct || formData.unit_id) return
    if (!selectedProduct.base_unit_id) return
    setFormData((prev) => ({ ...prev, unit_id: String(selectedProduct.base_unit_id) }))
  }, [selectedProduct, formData.unit_id])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const qty = Number(formData.qty)
    if (!Number.isFinite(qty) || qty === 0) {
      toast.error('Quantity must be a non-zero number')
      return
    }

    if (!formData.product_id || !formData.warehouse_id || !formData.reason.trim()) {
      toast.error('Product, warehouse, quantity, and reason are required')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.rpc('create_inventory_adjustment', {
      p_product_id: Number(formData.product_id),
      p_warehouse_id: Number(formData.warehouse_id),
      p_lot_id: formData.lot_id ? Number(formData.lot_id) : null,
      p_qty: qty,
      p_unit_id: formData.unit_id ? Number(formData.unit_id) : null,
      p_reason: formData.reason.trim(),
      p_note: formData.note.trim() || null,
    })

    if (error) {
      toast.error(error.message)
      setSubmitting(false)
      return
    }

    toast.success('Inventory adjustment posted')
    const nextUnitId = selectedProduct?.base_unit_id ? String(selectedProduct.base_unit_id) : ''
    setFormData({ ...createEmptyForm(), unit_id: nextUnitId })
    await load()
    setSubmitting(false)
  }

  const productOptions = products.map((p) => ({ value: String(p.id), label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))
  const warehouseOptions = warehouses.map((w) => ({ value: String(w.id), label: w.name }))
  const unitOptions = units.map((u) => ({ value: String(u.id), label: u.symbol || u.name || `Unit #${u.id}` }))
  const lotOptions = availableLots.map((lot) => ({ value: String(lot.id), label: lot.lot_no }))

  if (loading) {
    return (
      <PageLayout title="Inventory Adjustments" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading adjustment workspace..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Inventory Adjustments" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Post Adjustment</CardTitle>
            <CardDescription>Creates an adjustment record and an inventory movement immediately.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="adj-product">Product</Label>
                <SearchableSelect
                  id="adj-product"
                  options={productOptions}
                  value={formData.product_id}
                  onChange={(value) => setFormData((prev) => ({ ...prev, product_id: value, lot_id: '' }))}
                  placeholder="Select product"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-warehouse">Warehouse</Label>
                <SearchableSelect
                  id="adj-warehouse"
                  options={warehouseOptions}
                  value={formData.warehouse_id}
                  onChange={(value) => setFormData((prev) => ({ ...prev, warehouse_id: value, lot_id: '' }))}
                  placeholder="Select warehouse"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-lot">Lot (Optional)</Label>
                <SearchableSelect
                  id="adj-lot"
                  options={lotOptions}
                  value={formData.lot_id}
                  onChange={(value) => setFormData((prev) => ({ ...prev, lot_id: value }))}
                  placeholder="Select lot"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adj-qty">Quantity (+/-)</Label>
                  <Input
                    id="adj-qty"
                    type="number"
                    step="0.001"
                    value={formData.qty}
                    onChange={(event) => setFormData((prev) => ({ ...prev, qty: event.target.value }))}
                    placeholder="Enter quantity"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adj-unit">Unit</Label>
                  <SearchableSelect
                    id="adj-unit"
                    options={unitOptions}
                    value={formData.unit_id}
                    onChange={(value) => setFormData((prev) => ({ ...prev, unit_id: value }))}
                    placeholder="Select unit"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-reason">Reason</Label>
                <Input
                  id="adj-reason"
                  value={formData.reason}
                  onChange={(event) => setFormData((prev) => ({ ...prev, reason: event.target.value }))}
                  placeholder="Enter reason"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adj-note">Note (Optional)</Label>
                <Input
                  id="adj-note"
                  value={formData.note}
                  onChange={(event) => setFormData((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Additional context"
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-olive hover:bg-olive-dark">
                {submitting ? 'Posting...' : 'Post Adjustment'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Recent Adjustments</CardTitle>
            <CardDescription>Latest 50 posted adjustments.</CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="text-sm text-text-dark/60">No adjustments yet.</p>
            ) : (
              <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                {rows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-olive-light/30 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-text-dark">{row.product_name}</p>
                        <p className="text-xs text-text-dark/60">{row.warehouse_name}{row.lot_no ? ` · Lot ${row.lot_no}` : ''}</p>
                      </div>
                      <p className={`text-sm font-semibold ${row.qty >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {row.qty >= 0 ? '+' : ''}{row.qty} {row.unit_label}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-text-dark/80">{row.reason}</p>
                    {row.note ? <p className="text-xs text-text-dark/60">{row.note}</p> : null}
                    <p className="mt-1 text-xs text-text-dark/50">
                      {row.adjusted_at ? new Date(row.adjusted_at).toLocaleString() : 'Unknown timestamp'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  )
}

export default InventoryAdjustments
