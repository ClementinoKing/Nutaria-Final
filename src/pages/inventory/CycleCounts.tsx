import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'

type CycleCountStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

interface Warehouse {
  id: number
  name: string
}

interface Product {
  id: number
  name: string
  sku: string | null
  base_unit_id: number | null
}

interface Unit {
  id: number
  name: string | null
  symbol: string | null
}

interface Lot {
  id: number
  lot_no: string
  product_id: number
  warehouse_id: number
}

interface CycleCount {
  id: number
  warehouse_id: number
  scheduled_for: string
  status: CycleCountStatus
  created_at: string | null
}

interface CycleCountLine {
  id: number
  cycle_count_id: number
  product_id: number
  lot_id: number | null
  counted_qty: number | null
  variance_qty: number | null
  unit_id: number | null
  notes: string | null
}

interface CountLineForm {
  product_id: string
  lot_id: string
  counted_qty: string
  unit_id: string
  notes: string
}

interface VariancePreview {
  lineId: number
  productName: string
  lotNo: string
  unitLabel: string
  countedQty: number
  systemQty: number
  variance: number
}

const emptyLineForm = (): CountLineForm => ({
  product_id: '',
  lot_id: '',
  counted_qty: '',
  unit_id: '',
  notes: '',
})

function CycleCounts() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applyLoading, setApplyLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'schedule' | 'execute' | 'review'>('schedule')

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [counts, setCounts] = useState<CycleCount[]>([])
  const [lines, setLines] = useState<CycleCountLine[]>([])
  const [variancePreview, setVariancePreview] = useState<VariancePreview[]>([])
  const [selectedCountId, setSelectedCountId] = useState<string>('')

  const [scheduleWarehouseId, setScheduleWarehouseId] = useState('')
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10))
  const [lineForm, setLineForm] = useState<CountLineForm>(emptyLineForm())

  const load = useCallback(async () => {
    setLoading(true)
    const [warehousesRes, productsRes, unitsRes, lotsRes, countsRes, linesRes] = await Promise.all([
      supabase.from('warehouses').select('id, name').order('name'),
      supabase.from('products').select('id, name, sku, base_unit_id').order('name'),
      supabase.from('units').select('id, name, symbol').order('name'),
      supabase
        .from('supply_batches')
        .select('id, lot_no, product_id, supply:supplies(warehouse_id)')
        .order('id', { ascending: false }),
      supabase.from('cycle_counts').select('id, warehouse_id, scheduled_for, status, created_at').order('created_at', { ascending: false }),
      supabase.from('cycle_count_lines').select('id, cycle_count_id, product_id, lot_id, counted_qty, variance_qty, unit_id, notes'),
    ])

    if (warehousesRes.error || productsRes.error || unitsRes.error || lotsRes.error || countsRes.error || linesRes.error) {
      toast.error(
        warehousesRes.error?.message ||
          productsRes.error?.message ||
          unitsRes.error?.message ||
          lotsRes.error?.message ||
          countsRes.error?.message ||
          linesRes.error?.message ||
          'Failed to load cycle count data'
      )
      setLoading(false)
      return
    }

    const nextCounts = (countsRes.data ?? []) as CycleCount[]
    setWarehouses((warehousesRes.data ?? []) as Warehouse[])
    setProducts((productsRes.data ?? []) as Product[])
    setUnits((unitsRes.data ?? []) as Unit[])
    setCounts(nextCounts)
    setLines((linesRes.data ?? []) as CycleCountLine[])

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
    setLots(nextLots)

    if (!selectedCountId && nextCounts.length > 0) {
      setSelectedCountId(String(nextCounts[0].id))
    } else if (selectedCountId && !nextCounts.some((count) => String(count.id) === selectedCountId)) {
      setSelectedCountId(nextCounts.length > 0 ? String(nextCounts[0].id) : '')
    }

    setLoading(false)
  }, [selectedCountId])

  useEffect(() => {
    load()
  }, [load])

  const selectedCount = useMemo(() => counts.find((count) => String(count.id) === selectedCountId) ?? null, [counts, selectedCountId])

  const countLines = useMemo(
    () => lines.filter((line) => String(line.cycle_count_id) === selectedCountId),
    [lines, selectedCountId]
  )

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(lineForm.product_id)) ?? null,
    [products, lineForm.product_id]
  )

  useEffect(() => {
    if (!selectedProduct || lineForm.unit_id) return
    if (!selectedProduct.base_unit_id) return
    setLineForm((prev) => ({ ...prev, unit_id: String(selectedProduct.base_unit_id) }))
  }, [selectedProduct, lineForm.unit_id])

  const availableLots = useMemo(() => {
    if (!selectedCount) return []
    const productId = Number(lineForm.product_id)
    return lots.filter((lot) => {
      if (lot.warehouse_id !== selectedCount.warehouse_id) return false
      if (productId && lot.product_id !== productId) return false
      return true
    })
  }, [lots, lineForm.product_id, selectedCount])

  const countOptions = counts.map((count) => ({
    value: String(count.id),
    label: `#${count.id} · ${count.status} · ${count.scheduled_for}`,
  }))

  const refreshVariancePreview = useCallback(async (): Promise<VariancePreview[]> => {
    if (!selectedCount) {
      setVariancePreview([])
      return []
    }

    const { data: stockRows, error } = await supabase
      .from('stock_levels')
      .select('product_id, warehouse_id, lot_id, on_hand')
      .eq('warehouse_id', selectedCount.warehouse_id)

    if (error) {
      toast.error(error.message)
      setVariancePreview([])
      return []
    }

    const stockMap = new Map<string, number>()
    ;(stockRows ?? []).forEach((row: any) => {
      const key = `${row.product_id}-${row.lot_id ?? 'null'}`
      stockMap.set(key, Number(row.on_hand) || 0)
    })

    const productMap = new Map(products.map((p) => [p.id, p]))
    const lotMap = new Map(lots.map((lot) => [lot.id, lot]))
    const unitMap = new Map(units.map((unit) => [unit.id, unit]))

    const preview = countLines
      .filter((line) => line.counted_qty != null)
      .map((line) => {
        const key = `${line.product_id}-${line.lot_id ?? 'null'}`
        const systemQty = stockMap.get(key) ?? 0
        const countedQty = Number(line.counted_qty ?? 0)
        const variance = countedQty - systemQty
        const unit = line.unit_id ? unitMap.get(line.unit_id) : null
        return {
          lineId: line.id,
          productName: productMap.get(line.product_id)?.name ?? `Product #${line.product_id}`,
          lotNo: line.lot_id ? lotMap.get(line.lot_id)?.lot_no ?? `Lot #${line.lot_id}` : 'No lot',
          unitLabel: unit?.symbol || unit?.name || '—',
          countedQty,
          systemQty,
          variance,
        }
      })
    setVariancePreview(preview)
    return preview
  }, [countLines, lots, products, selectedCount, units])

  useEffect(() => {
    void refreshVariancePreview()
  }, [refreshVariancePreview])

  const handleCreateSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!scheduleWarehouseId || !scheduleDate) {
      toast.error('Warehouse and schedule date are required')
      return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('create_cycle_count', {
      p_warehouse_id: Number(scheduleWarehouseId),
      p_scheduled_for: scheduleDate,
    })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success('Cycle count scheduled')
    setSelectedCountId(String(data ?? ''))
    await load()
    setSaving(false)
  }

  const handleSaveLine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCount) {
      toast.error('Select a cycle count first')
      return
    }
    if (!lineForm.product_id) {
      toast.error('Product is required')
      return
    }

    const counted = lineForm.counted_qty.trim() === '' ? null : Number(lineForm.counted_qty)
    if (counted !== null && !Number.isFinite(counted)) {
      toast.error('Counted quantity must be numeric')
      return
    }

    setSaving(true)
    const { error } = await supabase.rpc('upsert_cycle_count_line', {
      p_cycle_count_id: selectedCount.id,
      p_product_id: Number(lineForm.product_id),
      p_lot_id: lineForm.lot_id ? Number(lineForm.lot_id) : null,
      p_counted_qty: counted,
      p_unit_id: lineForm.unit_id ? Number(lineForm.unit_id) : null,
      p_notes: lineForm.notes.trim() || null,
    })

    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }

    toast.success('Cycle count line saved')
    setLineForm(emptyLineForm())
    await load()
    setSaving(false)
  }

  const handleCompleteReview = async () => {
    if (!selectedCount) return
    setSaving(true)
    const { error } = await supabase.rpc('complete_cycle_count', { p_cycle_count_id: selectedCount.id })
    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }
    toast.success('Cycle count set to review-ready')
    await load()
    setSaving(false)
  }

  const handleApplyVariance = async () => {
    if (!selectedCount) return
    if (selectedCount.status === 'COMPLETED') {
      toast.error('Cycle count already completed')
      return
    }

    setApplyLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.rpc('apply_cycle_count_variance', {
      p_cycle_count_id: selectedCount.id,
      p_actor: user?.id ?? null,
    })

    if (error) {
      toast.error(error.message)
      setApplyLoading(false)
      return
    }

    toast.success('Variance applied and count completed')
    await load()
    setApplyLoading(false)
  }

  const warehouseMap = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])), [warehouses])

  const countsForSelection = useMemo(
    () => counts.filter((count) => count.status !== 'CANCELLED'),
    [counts]
  )

  const warehouseOptions = warehouses.map((warehouse) => ({ value: String(warehouse.id), label: warehouse.name }))
  const productOptions = products.map((product) => ({
    value: String(product.id),
    label: `${product.name}${product.sku ? ` (${product.sku})` : ''}`,
  }))
  const unitOptions = units.map((unit) => ({ value: String(unit.id), label: unit.symbol || unit.name || `Unit #${unit.id}` }))
  const lotOptions = availableLots.map((lot) => ({ value: String(lot.id), label: lot.lot_no }))

  if (loading) {
    return (
      <PageLayout title="Cycle Counts" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading cycle count workspace..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Cycle Counts" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={activeTab === 'schedule' ? 'default' : 'outline'} className={activeTab === 'schedule' ? 'bg-olive hover:bg-olive-dark' : ''} onClick={() => setActiveTab('schedule')}>
          Schedule
        </Button>
        <Button variant={activeTab === 'execute' ? 'default' : 'outline'} className={activeTab === 'execute' ? 'bg-olive hover:bg-olive-dark' : ''} onClick={() => setActiveTab('execute')}>
          Execute
        </Button>
        <Button variant={activeTab === 'review' ? 'default' : 'outline'} className={activeTab === 'review' ? 'bg-olive hover:bg-olive-dark' : ''} onClick={() => setActiveTab('review')}>
          Review
        </Button>
      </div>

      {activeTab === 'schedule' && (
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Schedule Cycle Count</CardTitle>
            <CardDescription>Create a count plan by warehouse and date.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-3" onSubmit={handleCreateSchedule}>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="count-warehouse">Warehouse</Label>
                <SearchableSelect
                  id="count-warehouse"
                  options={warehouseOptions}
                  value={scheduleWarehouseId}
                  onChange={setScheduleWarehouseId}
                  placeholder="Select warehouse"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="count-date">Scheduled Date</Label>
                <Input id="count-date" type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" disabled={saving} className="bg-olive hover:bg-olive-dark">
                  {saving ? 'Scheduling...' : 'Create Cycle Count'}
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-2">
              {counts.length === 0 ? (
                <p className="text-sm text-text-dark/60">No cycle counts yet.</p>
              ) : (
                counts.map((count) => (
                  <div key={count.id} className="rounded-md border border-olive-light/30 bg-white px-3 py-2 text-sm">
                    <p className="font-medium text-text-dark">Count #{count.id}</p>
                    <p className="text-text-dark/70">{warehouseMap.get(count.warehouse_id) ?? `Warehouse #${count.warehouse_id}`} · {count.scheduled_for} · {count.status}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'execute' && (
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Execute Count</CardTitle>
            <CardDescription>Add and update cycle count lines.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="active-count">Active Count</Label>
              <SearchableSelect
                id="active-count"
                options={countsForSelection.map((count) => ({ value: String(count.id), label: `#${count.id} · ${count.status} · ${count.scheduled_for}` }))}
                value={selectedCountId}
                onChange={setSelectedCountId}
                placeholder="Select count"
              />
            </div>

            {selectedCount ? (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSaveLine}>
                <div className="space-y-2">
                  <Label htmlFor="line-product">Product</Label>
                  <SearchableSelect
                    id="line-product"
                    options={productOptions}
                    value={lineForm.product_id}
                    onChange={(value) => setLineForm((prev) => ({ ...prev, product_id: value, lot_id: '' }))}
                    placeholder="Select product"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="line-lot">Lot (Optional)</Label>
                  <SearchableSelect
                    id="line-lot"
                    options={lotOptions}
                    value={lineForm.lot_id}
                    onChange={(value) => setLineForm((prev) => ({ ...prev, lot_id: value }))}
                    placeholder="Select lot"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="line-counted">Counted Qty</Label>
                  <Input
                    id="line-counted"
                    type="number"
                    step="0.001"
                    value={lineForm.counted_qty}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, counted_qty: event.target.value }))}
                    placeholder="Physical counted quantity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="line-unit">Unit</Label>
                  <SearchableSelect
                    id="line-unit"
                    options={unitOptions}
                    value={lineForm.unit_id}
                    onChange={(value) => setLineForm((prev) => ({ ...prev, unit_id: value }))}
                    placeholder="Select unit"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="line-notes">Notes</Label>
                  <Input
                    id="line-notes"
                    value={lineForm.notes}
                    onChange={(event) => setLineForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>
                <div className="sm:col-span-2 flex flex-wrap gap-2">
                  <Button type="submit" disabled={saving} className="bg-olive hover:bg-olive-dark">
                    {saving ? 'Saving...' : 'Save Line'}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCompleteReview} disabled={saving || selectedCount.status === 'COMPLETED'}>
                    Mark Ready For Review
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-text-dark/60">Select or create a cycle count first.</p>
            )}

            <div className="space-y-2">
              {countLines.length === 0 ? (
                <p className="text-sm text-text-dark/60">No lines yet.</p>
              ) : (
                countLines.map((line) => {
                  const product = products.find((p) => p.id === line.product_id)
                  const lot = line.lot_id ? lots.find((l) => l.id === line.lot_id) : null
                  return (
                    <div key={line.id} className="rounded-md border border-olive-light/30 bg-white px-3 py-2 text-sm">
                      <p className="font-medium text-text-dark">{product?.name ?? `Product #${line.product_id}`}{product?.sku ? ` (${product.sku})` : ''}</p>
                      <p className="text-text-dark/70">{lot ? `Lot ${lot.lot_no} · ` : ''}Counted: {line.counted_qty ?? '—'} · Variance: {line.variance_qty ?? '—'}</p>
                      {line.notes ? <p className="text-xs text-text-dark/60">{line.notes}</p> : null}
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'review' && (
        <Card className="border-olive-light/30">
          <CardHeader>
            <CardTitle className="text-text-dark">Variance Review</CardTitle>
            <CardDescription>Preview variances and apply movement adjustments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="review-count">Count</Label>
              <SearchableSelect
                id="review-count"
                options={countOptions}
                value={selectedCountId}
                onChange={setSelectedCountId}
                placeholder="Select count"
              />
            </div>

            {selectedCount ? (
              <>
                <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/80">
                  Status: <span className="font-medium">{selectedCount.status}</span>
                </div>

                {variancePreview.length === 0 ? (
                  <p className="text-sm text-text-dark/60">No counted lines available for variance calculation.</p>
                ) : (
                  <div className="space-y-2">
                    {variancePreview.map((item) => (
                      <div key={item.lineId} className="rounded-md border border-olive-light/30 bg-white px-3 py-2 text-sm">
                        <p className="font-medium text-text-dark">{item.productName} · {item.lotNo}</p>
                        <p className="text-text-dark/70">System: {item.systemQty} {item.unitLabel} · Counted: {item.countedQty} {item.unitLabel}</p>
                        <p className={`font-semibold ${item.variance === 0 ? 'text-text-dark/70' : item.variance > 0 ? 'text-green-700' : 'text-red-700'}`}>
                          Variance: {item.variance > 0 ? '+' : ''}{item.variance} {item.unitLabel}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={async () => {
                    const refreshed = await refreshVariancePreview()
                    if (refreshed.length > 0) {
                      toast.success('Variance preview refreshed')
                    }
                  }}>
                    Refresh Preview
                  </Button>
                  <Button
                    type="button"
                    className="bg-olive hover:bg-olive-dark"
                    onClick={handleApplyVariance}
                    disabled={applyLoading || selectedCount.status === 'COMPLETED'}
                  >
                    {applyLoading ? 'Applying...' : 'Apply Variance'}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-text-dark/60">Select a cycle count to review.</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageLayout>
  )
}

export default CycleCounts
