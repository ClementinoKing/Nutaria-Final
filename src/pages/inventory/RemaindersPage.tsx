import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Scale } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface RemainderRow {
  id: string
  process_name: string
  process_code: string
  lot_no: string | null
  product_name: string
  product_sku: string
  packet_unit_code: string | null
  pack_count: number | null
  remainder_kg: number
  quantity_kg: number
  packed_at: string | null
}

function RemaindersPage() {
  const [rows, setRows] = useState<RemainderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          product_id,
          quantity_kg,
          pack_identifier,
          packet_unit_code,
          pack_count,
          remainder_kg,
          created_at,
          sorting_output:process_sorting_outputs(
            product:products(id, name, sku)
          ),
          packaging_run:process_packaging_runs(
            process_step_run_id,
            process_step_runs(
              process_lot_run_id,
              process_lot_runs(
                process_id,
                supply_batch_id,
                processes(code, name),
                supply_batches(lot_no)
              )
            )
          )
        `)
        .gt('remainder_kg', 0)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setRows([])
        return
      }

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const result: RemainderRow[] = ((data ?? []) as any[]).map((row) => {
        const stepRun = unwrap(row.packaging_run?.process_step_runs)
        const lotRun = stepRun?.process_lot_runs ?? null
        const processInfo = lotRun?.processes ?? null
        const batch = lotRun?.supply_batches ?? null
        const product = row.sorting_output?.product ?? null

        return {
          id: String(row.id),
          process_name: processInfo?.name ?? 'Unknown',
          process_code: processInfo?.code ?? '—',
          lot_no: batch?.lot_no ?? null,
          product_name: product?.name ?? 'Unknown',
          product_sku: product?.sku ?? '',
          packet_unit_code: row.packet_unit_code ?? row.pack_identifier ?? null,
          pack_count: row.pack_count ?? null,
          remainder_kg: Number(row.remainder_kg) || 0,
          quantity_kg: Number(row.quantity_kg) || 0,
          packed_at: row.created_at ?? null,
        }
      })

      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load remainders')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totalRemainderKg = useMemo(() => rows.reduce((sum, r) => sum + r.remainder_kg, 0), [rows])
  const affectedProcesses = useMemo(
    () => new Set(rows.map((r) => `${r.process_code}::${r.process_name}`)).size,
    [rows]
  )

  const columns = useMemo(
    () => [
      {
        key: 'process',
        header: 'Source Process',
        render: (r: RemainderRow) => (
          <div>
            <div className="font-medium text-text-dark">{r.process_name}</div>
            <div className="text-xs text-text-dark/60">{r.process_code}</div>
          </div>
        ),
        mobileRender: (r: RemainderRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{r.process_name}</div>
            <div className="text-xs text-text-dark/60">{r.process_code}</div>
          </div>
        ),
      },
      {
        key: 'lot',
        header: 'Lot',
        render: (r: RemainderRow) => <div className="text-text-dark/80">{r.lot_no ?? '—'}</div>,
        mobileRender: (r: RemainderRow) => <div className="text-right text-text-dark/80">{r.lot_no ?? '—'}</div>,
      },
      {
        key: 'product',
        header: 'Product',
        render: (r: RemainderRow) => (
          <div>
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
        mobileRender: (r: RemainderRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'packet',
        header: 'Packet Unit',
        render: (r: RemainderRow) => <div className="text-text-dark/80">{r.packet_unit_code ?? '—'}</div>,
        mobileRender: (r: RemainderRow) => <div className="text-right text-text-dark/80">{r.packet_unit_code ?? '—'}</div>,
      },
      {
        key: 'packs',
        header: 'Produced Packs',
        render: (r: RemainderRow) => <div className="text-text-dark/80">{r.pack_count ?? '—'}</div>,
        mobileRender: (r: RemainderRow) => <div className="text-right text-text-dark/80">{r.pack_count ?? '—'}</div>,
      },
      {
        key: 'remainder',
        header: 'Remainder (kg)',
        render: (r: RemainderRow) => <div className="font-medium text-orange-700">{r.remainder_kg.toFixed(2)}</div>,
        mobileRender: (r: RemainderRow) => <div className="text-right font-medium text-orange-700">{r.remainder_kg.toFixed(2)}</div>,
      },
      {
        key: 'date',
        header: 'Packed At',
        render: (r: RemainderRow) => (r.packed_at ? new Date(r.packed_at).toLocaleString() : '—'),
        mobileRender: (r: RemainderRow) => <div className="text-right">{r.packed_at ? new Date(r.packed_at).toLocaleString() : '—'}</div>,
      },
    ],
    []
  )

  if (loading) {
    return (
      <PageLayout title="Remainders" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading remainders..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Remainders" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          to="/inventory/stock-levels"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stock Levels
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-orange-200/70 bg-orange-50/50">
          <CardHeader className="pb-2">
            <CardDescription>Total remainders</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{totalRemainderKg.toFixed(2)} kg</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Entries</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{rows.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Source processes</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{affectedProcesses.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-orange-200/70 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-orange-100">
              <Scale className="h-4 w-4 text-orange-700" />
            </div>
            <div>
              <CardTitle className="text-text-dark">Packaging Remainders</CardTitle>
              <CardDescription>Remainders from process packaging entries, including source process context.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <ResponsiveTable
            columns={columns}
            data={rows}
            rowKey="id"
            emptyMessage="No packaging remainders found."
            tableClassName={undefined}
            mobileCardClassName={undefined}
            getRowClassName={undefined}
            onRowClick={undefined}
          />
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default RemaindersPage
