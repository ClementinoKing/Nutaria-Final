import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'


interface PackEntryRow {
  id: number
  quantity_kg: number
  pack_identifier: string
  pack_count: number | null
  remainder_kg: number | null
  packing_type: string | null
  created_at: string | null
  sorting_output_id: number
  lot_no: string | null
  supply_doc_no: string | null
  supplier_name: string | null
  warehouse_name: string | null
  qa_status: string | null
  process_lot_run_id: number | null
  supply_batch_id: number | null
}

interface ProcessRow {
  id: number
  status: string | null
  started_at: string | null
  completed_at: string | null
  lot_no: string | null
}

interface ReworkRow {
  id: number
  quantity_kg: number
  reason: string | null
  created_at: string | null
  original_lot: string | null
  rework_lot: string | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function AllocationDetailsPage() {
  const { productId } = useParams<{ productId: string }>()
  const [product, setProduct] = useState<{ name: string; sku: string | null } | null>(null)
  const [entries, setEntries] = useState<PackEntryRow[]>([])
  const [processRuns, setProcessRuns] = useState<ProcessRow[]>([])
  const [reworks, setReworks] = useState<ReworkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    supply: true,
    process: true,
    reworks: true,
    entries: true,
  })

  const load = useCallback(async () => {
    const pid = productId ? Number(productId) : NaN
    if (!Number.isFinite(pid)) {
      setError('Invalid product')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data: productData, error: productError } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('id', pid)
        .single()

      if (productError || !productData) {
        setError(productError?.message ?? 'Product not found')
        setLoading(false)
        return
      }

      setProduct({ name: (productData as { name: string }).name, sku: (productData as { sku: string | null }).sku })

      const { data: entryRows, error: entryError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          quantity_kg,
          pack_identifier,
          pack_count,
          remainder_kg,
          packing_type,
          created_at,
          sorting_output_id,
          packaging_run:process_packaging_runs(
            process_step_run_id,
            process_step_runs(
              process_lot_run_id,
              process_lot_runs(
                id,
                status,
                started_at,
                completed_at,
                supply_batch_id,
                supply_batches(
                  lot_no,
                  quality_status,
                  supply_id,
                  supplies(
                    doc_no,
                    supplier_id,
                    suppliers(name),
                    warehouse_id,
                    warehouses(name)
                  )
                )
              )
            )
          )
        `)
        .eq('product_id', pid)
        .order('created_at', { ascending: false })

      if (entryError) {
        setError(entryError.message)
        setEntries([])
        setProcessRuns([])
        setReworks([])
        setLoading(false)
        return
      }

      type StepRun = {
        process_lot_run_id: number
        process_lot_runs: {
          id: number
          status: string | null
          started_at: string | null
          completed_at: string | null
          supply_batch_id: number | null
          supply_batches: {
            lot_no: string | null
            quality_status: string | null
            supply_id: number | null
            supplies: {
              doc_no: string | null
              suppliers: { name: string | null } | null
              warehouses: { name: string | null } | null
            } | null
          } | null
        } | null
      } | StepRun[] | null

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const mappedEntries: PackEntryRow[] = (entryRows ?? []).map((row: any) => {
        const stepRun = unwrap(row.packaging_run?.process_step_runs) as StepRun | null
        const lotRun = (stepRun as any)?.process_lot_runs ?? null
        const batch = lotRun?.supply_batches ?? null
        const supply = batch?.supplies ?? null
        return {
          id: row.id,
          quantity_kg: Number(row.quantity_kg) || 0,
          pack_identifier: row.pack_identifier,
          pack_count: row.pack_count ?? null,
          remainder_kg: row.remainder_kg ?? null,
          packing_type: row.packing_type ?? null,
          created_at: row.created_at ?? null,
          sorting_output_id: row.sorting_output_id,
          lot_no: batch?.lot_no ?? null,
          supply_doc_no: supply?.doc_no ?? null,
          supplier_name: supply?.suppliers?.name ?? null,
          warehouse_name: supply?.warehouses?.name ?? null,
          qa_status: batch?.quality_status ?? null,
          process_lot_run_id: lotRun?.id ?? null,
          supply_batch_id: lotRun?.supply_batch_id ?? null,
        }
      })

      setEntries(mappedEntries)

      const processById = new Map<number, ProcessRow>()
      mappedEntries.forEach((entry) => {
        if (!entry.process_lot_run_id) return
        if (!processById.has(entry.process_lot_run_id)) {
          const lotRun = (entryRows ?? [])
            .map((row: any) => unwrap(row.packaging_run?.process_step_runs))
            .find((sr: any) => sr?.process_lot_runs?.id === entry.process_lot_run_id)?.process_lot_runs
          processById.set(entry.process_lot_run_id, {
            id: entry.process_lot_run_id,
            status: lotRun?.status ?? null,
            started_at: lotRun?.started_at ?? null,
            completed_at: lotRun?.completed_at ?? null,
            lot_no: lotRun?.supply_batches?.lot_no ?? entry.lot_no ?? null,
          })
        }
      })
      setProcessRuns(Array.from(processById.values()))

      const batchIds = Array.from(
        new Set(mappedEntries.map((entry) => entry.supply_batch_id).filter((id): id is number => id != null))
      )
      if (batchIds.length > 0) {
        const { data: reworkRows } = await supabase
          .from('reworked_lots')
          .select(`
            id,
            quantity_kg,
            reason,
            created_at,
            original_supply_batch_id,
            rework_supply_batch_id,
            original:supply_batches!reworked_lots_original_supply_batch_id_fkey(lot_no),
            rework:supply_batches!reworked_lots_rework_supply_batch_id_fkey(lot_no)
          `)
          .or(`original_supply_batch_id.in.(${batchIds.join(',')}),rework_supply_batch_id.in.(${batchIds.join(',')})`)
          .order('created_at', { ascending: false })

        const mappedReworks: ReworkRow[] = (reworkRows ?? []).map((row: any) => ({
          id: row.id,
          quantity_kg: Number(row.quantity_kg) || 0,
          reason: row.reason ?? null,
          created_at: row.created_at ?? null,
          original_lot: row.original?.lot_no ?? null,
          rework_lot: row.rework?.lot_no ?? null,
        }))
        setReworks(mappedReworks)
      } else {
        setReworks([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packed product detail')
      setEntries([])
      setProcessRuns([])
      setReworks([])
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  const totalKg = useMemo(() => entries.reduce((sum, entry) => sum + entry.quantity_kg, 0), [entries])
  const totalPacks = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.pack_count ?? 0), 0),
    [entries]
  )
  const uniqueLots = useMemo(
    () => new Set(entries.map((entry) => entry.lot_no).filter((lot): lot is string => Boolean(lot))).size,
    [entries]
  )

  const entryColumns = useMemo(
    () => [
      { key: 'pack', header: 'Pack size', render: (r: PackEntryRow) => r.pack_identifier },
      {
        key: 'packs',
        header: 'Packs / Remainder',
        render: (r: PackEntryRow) =>
          `${r.pack_count ?? '—'} packs${r.remainder_kg && r.remainder_kg > 0 ? ` + ${r.remainder_kg.toFixed(2)} kg` : ''}`,
      },
      {
        key: 'quantity',
        header: 'Quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: PackEntryRow) => `${r.quantity_kg.toFixed(2)} kg`,
      },
      { key: 'lot', header: 'Lot', render: (r: PackEntryRow) => r.lot_no ?? '—' },
      { key: 'warehouse', header: 'Warehouse', render: (r: PackEntryRow) => r.warehouse_name ?? '—' },
      { key: 'qa', header: 'QA status', render: (r: PackEntryRow) => r.qa_status ?? '—' },
      { key: 'date', header: 'Packed at', render: (r: PackEntryRow) => formatDate(r.created_at) },
    ],
    []
  )

  const processColumns = useMemo(
    () => [
      { key: 'lot', header: 'Lot', render: (r: ProcessRow) => r.lot_no ?? '—' },
      { key: 'status', header: 'Status', render: (r: ProcessRow) => r.status ?? '—' },
      { key: 'started', header: 'Started', render: (r: ProcessRow) => formatDate(r.started_at) },
      { key: 'completed', header: 'Completed', render: (r: ProcessRow) => formatDate(r.completed_at) },
      {
        key: 'link',
        header: '',
        render: (r: ProcessRow) =>
          r.id ? (
            <Link to={`/process/completed/${r.id}`} className="text-sm font-medium text-olive hover:underline">
              View
            </Link>
          ) : (
            '—'
          ),
      },
    ],
    []
  )

  const reworkColumns = useMemo(
    () => [
      { key: 'original', header: 'Original lot', render: (r: ReworkRow) => r.original_lot ?? '—' },
      { key: 'rework', header: 'Rework lot', render: (r: ReworkRow) => r.rework_lot ?? '—' },
      { key: 'qty', header: 'Quantity (kg)', render: (r: ReworkRow) => `${r.quantity_kg.toFixed(2)} kg` },
      { key: 'reason', header: 'Reason', render: (r: ReworkRow) => r.reason ?? '—' },
      { key: 'date', header: 'Created', render: (r: ReworkRow) => formatDate(r.created_at) },
    ],
    []
  )

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) {
    return (
      <PageLayout title="Allocation Details" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading allocation details..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Allocation Details" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/inventory/stock-levels/allocation"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Allocations
        </Link>
        {product?.sku ? <span className="text-sm text-text-dark/60">SKU: {product.sku}</span> : null}
      </div>

      <div className="mb-6">
        <Card className="border-emerald-200/60">
          <CardHeader className="pb-2">
            <CardDescription>{product ? product.name : 'Packed product'}</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalKg.toLocaleString()} kg · {totalPacks.toLocaleString()} packs · {uniqueLots} lot{uniqueLots === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {error ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          {error}
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="bg-white border-olive-light/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-text-dark">Overview</CardTitle>
                <CardDescription>Quick summary of allocations, lots, and QA status.</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => toggleSection('overview')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-olive hover:bg-olive/10"
              >
                {expandedSections.overview ? 'Hide' : 'Show'}
                {expandedSections.overview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {expandedSections.overview ? (
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Total packed</p>
                  <p className="text-lg font-semibold text-text-dark">{totalKg.toFixed(2)} kg</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Total packs</p>
                  <p className="text-lg font-semibold text-text-dark">{totalPacks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Lots used</p>
                  <p className="text-lg font-semibold text-text-dark">{uniqueLots}</p>
                </div>
              </CardContent>
            ) : null}
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-text-dark">Supply & Lots</CardTitle>
                <CardDescription>Lots and supplier details tied to this packed product.</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => toggleSection('supply')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-olive hover:bg-olive/10"
              >
                {expandedSections.supply ? 'Hide' : 'Show'}
                {expandedSections.supply ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {expandedSections.supply ? (
              <CardContent className="space-y-3">
                {entries.length === 0 ? (
                  <p className="text-sm text-text-dark/60">No pack entries found.</p>
                ) : (
                  entries.map((entry) => (
                    <div key={`lot-${entry.id}`} className="rounded-md border border-olive-light/30 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="font-medium text-text-dark">Lot {entry.lot_no ?? '—'}</span>
                        <span className="text-text-dark/60">Supplier: {entry.supplier_name ?? '—'}</span>
                        <span className="text-text-dark/60">Warehouse: {entry.warehouse_name ?? '—'}</span>
                        <span className="text-text-dark/60">QA: {entry.qa_status ?? '—'}</span>
                        <span className="text-text-dark/60">Supply Doc: {entry.supply_doc_no ?? '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-text-dark">Process Runs</CardTitle>
                <CardDescription>Process runs connected to the packed lots.</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => toggleSection('process')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-olive hover:bg-olive/10"
              >
                {expandedSections.process ? 'Hide' : 'Show'}
                {expandedSections.process ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {expandedSections.process ? (
              <CardContent>
                {processRuns.length === 0 ? (
                  <p className="text-sm text-text-dark/60">No process runs found.</p>
                ) : (
                  <ResponsiveTable
                    columns={processColumns}
                    data={processRuns}
                    rowKey="id"
                    tableClassName=""
                    mobileCardClassName=""
                    getRowClassName={() => ''}
                  />
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-text-dark">Reworks</CardTitle>
                <CardDescription>Rework lots linked to these packed batches.</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => toggleSection('reworks')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-olive hover:bg-olive/10"
              >
                {expandedSections.reworks ? 'Hide' : 'Show'}
                {expandedSections.reworks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {expandedSections.reworks ? (
              <CardContent>
                {reworks.length === 0 ? (
                  <p className="text-sm text-text-dark/60">No reworks found.</p>
                ) : (
                  <ResponsiveTable
                    columns={reworkColumns}
                    data={reworks}
                    rowKey="id"
                    tableClassName=""
                    mobileCardClassName=""
                    getRowClassName={() => ''}
                  />
                )}
              </CardContent>
            ) : null}
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-text-dark">Pack Entries</CardTitle>
                <CardDescription>Every pack entry recorded for this product.</CardDescription>
              </div>
              <button
                type="button"
                onClick={() => toggleSection('entries')}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-olive hover:bg-olive/10"
              >
                {expandedSections.entries ? 'Hide' : 'Show'}
                {expandedSections.entries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {expandedSections.entries ? (
              <CardContent>
                {entries.length === 0 ? (
                  <p className="text-sm text-text-dark/60">No pack entries found.</p>
                ) : (
                  <ResponsiveTable
                    columns={entryColumns}
                    data={entries}
                    rowKey="id"
                    tableClassName=""
                    mobileCardClassName=""
                    getRowClassName={() => ''}
                  />
                )}
              </CardContent>
            ) : null}
          </Card>
        </div>
      )}
    </PageLayout>
  )
}

export default AllocationDetailsPage
