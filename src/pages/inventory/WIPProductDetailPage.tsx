import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface LotRow {
  id: string
  lot_run_id: number
  lot_no: string
  quantity_kg: number
  created_at: string
  output_count: number
}

function WIPProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const [product, setProduct] = useState<{ name: string; sku: string | null } | null>(null)
  const [rows, setRows] = useState<LotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setProduct(null)
        setRows([])
        setLoading(false)
        return
      }

      setProduct({ name: (productData as { name: string }).name, sku: (productData as { sku: string | null }).sku })

      const { data: outputs, error: outputsError } = await supabase
        .from('process_sorting_outputs')
        .select(`
          id,
          quantity_kg,
          created_at,
          process_step_runs(process_lot_run_id, process_lot_runs(id, started_at, status, supply_batch_id, supply_batches(lot_no)))
        `)
        .eq('product_id', pid)
        .order('created_at', { ascending: false })

      if (outputsError) {
        setError(outputsError.message)
        setRows([])
        setLoading(false)
        return
      }

      type StepRun = {
        process_lot_run_id: number
        process_lot_runs: {
          id: number
          started_at: string | null
          status: string
          supply_batches: { lot_no: string | null } | null
        } | null
      } | null
      type OutputRow = {
        id: number
        quantity_kg: number
        created_at: string
        process_step_runs: StepRun | StepRun[] | null
      }
      const list = (outputs ?? []) as OutputRow[]

      const byLot = new Map<
        number,
        { lot_no: string; quantity: number; count: number; created_at: string }
      >()
      for (const o of list) {
        const stepRun = Array.isArray(o.process_step_runs) ? o.process_step_runs[0] : o.process_step_runs
        const lotRun = stepRun?.process_lot_runs
        const lotRunId = lotRun?.id
        const lotNo = lotRun?.supply_batches?.lot_no ?? `Lot run ${lotRunId}`
        if (lotRunId == null) continue
        const qty = Number(o.quantity_kg) || 0
        const created = o.created_at ?? ''
        if (!byLot.has(lotRunId)) {
          byLot.set(lotRunId, { lot_no: lotNo, quantity: 0, count: 0, created_at: created })
        }
        const agg = byLot.get(lotRunId)!
        agg.quantity += qty
        agg.count += 1
        if (created && (!agg.created_at || created > agg.created_at)) agg.created_at = created
      }

      const result: LotRow[] = Array.from(byLot.entries()).map(([lot_run_id, agg]) => ({
        id: `lot-${lot_run_id}`,
        lot_run_id,
        lot_no: agg.lot_no,
        quantity_kg: Math.round(agg.quantity * 100) / 100,
        created_at: agg.created_at,
        output_count: agg.count,
      }))
      result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load WIP product detail')
      setProduct(null)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo(
    () => [
      {
        key: 'lot_no',
        header: 'Lot number',
        render: (r: LotRow) => (
          <span className="font-medium text-text-dark">{r.lot_no}</span>
        ),
        mobileRender: (r: LotRow) => (
          <span className="font-medium text-text-dark">{r.lot_no}</span>
        ),
      },
      {
        key: 'quantity',
        header: 'Quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: LotRow) => `${r.quantity_kg.toLocaleString()} kg`,
        mobileRender: (r: LotRow) => `${r.quantity_kg.toLocaleString()} kg`,
      },
      {
        key: 'outputs',
        header: 'Output records',
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark/70',
        render: (r: LotRow) => r.output_count,
        mobileRender: (r: LotRow) => r.output_count,
      },
      {
        key: 'created',
        header: 'Last recorded',
        cellClassName: 'text-text-dark/70 text-sm',
        render: (r: LotRow) =>
          r.created_at ? new Date(r.created_at).toLocaleString() : '—',
        mobileRender: (r: LotRow) =>
          r.created_at ? new Date(r.created_at).toLocaleString() : '—',
      },
      {
        key: 'action',
        header: '',
        headerClassName: 'text-right w-24',
        cellClassName: 'text-right',
        render: (r: LotRow) => (
          <Link
            to={`/process/completed/${r.lot_run_id}`}
            className="text-sm font-medium text-olive hover:underline"
          >
            View process
          </Link>
        ),
        mobileRender: (r: LotRow) => (
          <Link
            to={`/process/completed/${r.lot_run_id}`}
            className="text-sm font-medium text-olive hover:underline"
          >
            View process
          </Link>
        ),
      },
    ],
    []
  )

  const totalKg = useMemo(() => rows.reduce((s, r) => s + r.quantity_kg, 0), [rows])

  if (loading) {
    return (
      <PageLayout
        title={product ? `${product.name} — WIP by lot` : 'WIP by lot'}
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading WIP product detail..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={product ? `${product.name} — WIP by lot` : 'WIP by lot'}
      activeItem="inventory"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/inventory/stock-levels/wip"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to WIP Stock
        </Link>
        {product?.sku ? (
          <span className="text-sm text-text-dark/60">SKU: {product.sku}</span>
        ) : null}
      </div>
      <div className="mb-6">
        <Card className="border-amber-200/60">
          <CardHeader className="pb-2">
            <CardDescription>Total WIP for this product</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalKg.toLocaleString()} kg across {rows.length} lot{rows.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Lots with this product</CardTitle>
          <CardDescription>
            Sorting outputs grouped by process lot. Use “View process” to open the completed process run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No WIP records found for this product.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={rows}
              rowKey="id"
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
            />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default WIPProductDetailPage
