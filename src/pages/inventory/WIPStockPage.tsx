import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface LotInfo {
  lot_run_id: number
  lot_no: string
}

interface WIPRow {
  id: string
  product_id: number
  product_name: string
  product_sku: string
  total_quantity_kg: number
  output_count: number
  lots: LotInfo[]
}

function WIPStockPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<WIPRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: outputs, error: outputsError }, { data: packEntries, error: packError }] = await Promise.all([
        supabase
          .from('process_sorting_outputs')
          .select(`
            id,
            product_id,
            quantity_kg,
            created_at,
            product:products(id, name, sku),
            process_step_runs(process_lot_run_id, process_lot_runs(id, supply_batches(lot_no)))
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('process_packaging_pack_entries')
          .select('sorting_output_id, quantity_kg'),
      ])

      if (outputsError || packError) {
        setError(outputsError?.message || packError?.message || 'Failed to load WIP data')
        setRows([])
        return
      }

      const consumedByOutput = new Map<number, number>()
      ;(packEntries ?? []).forEach((pe: any) => {
        if (!pe?.sorting_output_id) return
        const qty = Number(pe.quantity_kg) || 0
        consumedByOutput.set(pe.sorting_output_id, (consumedByOutput.get(pe.sorting_output_id) || 0) + qty)
      })

      type StepRun = {
        process_lot_run_id: number
        process_lot_runs: { id: number; supply_batches: { lot_no: string | null } | null } | null
      } | null
      type OutputRow = {
        id: number
        product_id: number
        quantity_kg: number
        product: { id: number; name: string | null; sku: string | null } | null
        process_step_runs: StepRun | StepRun[] | null
      }
      const list = (outputs ?? []) as OutputRow[]

      const byProduct = new Map<
        number,
        { quantity: number; count: number; name: string; sku: string; lotSet: Map<number, string> }
      >()
      for (const o of list) {
        const productId = o.product_id
        const name = o.product?.name ?? 'Unknown'
        const sku = o.product?.sku ?? ''
        const rawQty = Number(o.quantity_kg) || 0
        const consumed = consumedByOutput.get(o.id) || 0
        const qty = Math.max(0, rawQty - consumed)
        if (qty <= 0) {
          // fully packed/consumed WIP; skip from WIP stock aggregation
          continue
        }
        if (!byProduct.has(productId)) {
          byProduct.set(productId, { quantity: 0, count: 0, name, sku, lotSet: new Map() })
        }
        const agg = byProduct.get(productId)!
        agg.quantity += qty
        agg.count += 1
        const stepRun = Array.isArray(o.process_step_runs) ? o.process_step_runs[0] : o.process_step_runs
        const lotRun = stepRun?.process_lot_runs
        const lotNo = lotRun?.supply_batches?.lot_no
        if (lotRun?.id != null && lotNo) {
          agg.lotSet.set(lotRun.id, lotNo)
        }
      }

      const result: WIPRow[] = Array.from(byProduct.entries()).map(([product_id, agg]) => ({
        id: `wip-${product_id}`,
        product_id,
        product_name: agg.name,
        product_sku: agg.sku,
        total_quantity_kg: Math.round(agg.quantity * 100) / 100,
        output_count: agg.count,
        lots: Array.from(agg.lotSet.entries())
          .map(([lot_run_id, lot_no]) => ({ lot_run_id, lot_no }))
          .sort((a, b) => a.lot_no.localeCompare(b.lot_no)),
      }))
      result.sort((a, b) => a.product_name.localeCompare(b.product_name))
      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load WIP stock')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo(
    () => [
      {
        key: 'product',
        header: 'Product',
        render: (r: WIPRow) => (
          <div>
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
        mobileRender: (r: WIPRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'lots',
        header: 'Lots',
        render: (r: WIPRow) => (
          <div className="text-sm text-text-dark/80">
            {r.lots.length === 0
              ? '—'
              : r.lots.length <= 3
                ? r.lots.map((l) => l.lot_no).join(', ')
                : `${r.lots.length} lots`}
          </div>
        ),
        mobileRender: (r: WIPRow) => (
          <div className="text-right text-sm text-text-dark/80">
            {r.lots.length === 0 ? '—' : r.lots.length <= 2 ? r.lots.map((l) => l.lot_no).join(', ') : `${r.lots.length} lots`}
          </div>
        ),
      },
      {
        key: 'quantity',
        header: 'Total quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: WIPRow) => `${r.total_quantity_kg.toLocaleString()} kg`,
        mobileRender: (r: WIPRow) => `${r.total_quantity_kg.toLocaleString()} kg`,
      },
      {
        key: 'outputs',
        header: 'Output records',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/70',
        render: (r: WIPRow) => r.output_count,
        mobileRender: (r: WIPRow) => r.output_count,
      },
      {
        key: 'action',
        header: '',
        headerClassName: 'text-right w-10',
        cellClassName: 'text-right',
        render: (r: WIPRow) => (
          <Link
            to={`/inventory/stock-levels/wip/${r.product_id}`}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-olive hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View lots <ChevronRight className="h-4 w-4" />
          </Link>
        ),
        mobileRender: (r: WIPRow) => (
          <Link
            to={`/inventory/stock-levels/wip/${r.product_id}`}
            className="inline-flex items-center gap-0.5 text-sm font-medium text-olive hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View lots <ChevronRight className="h-4 w-4" />
          </Link>
        ),
      },
    ],
    []
  )

  const totalKg = useMemo(() => rows.reduce((s, r) => s + r.total_quantity_kg, 0), [rows])

  if (loading) {
    return (
      <PageLayout title="Work In Progress Stock" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading WIP stock..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Work In Progress Stock" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          to="/inventory/stock-levels"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stock Levels
        </Link>
      </div>
      <div className="mb-6">
        <Card className="border-amber-200/60">
          <CardHeader className="pb-2">
            <CardDescription>Total WIP quantity</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalKg.toLocaleString()} kg
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">WIP by product</CardTitle>
          <CardDescription>
            Quantities from sorting outputs (work in progress before packaging).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No WIP stock recorded yet. Run processes and record sorting outputs to see data here.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={rows}
              rowKey="id"
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
              onRowClick={(r) => navigate(`/inventory/stock-levels/wip/${r.product_id}`)}
            />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default WIPStockPage
