import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface PackedEntryRow {
  id: string
  product_id: number | null
  product_name: string
  product_sku: string
  pack_identifier: string
  pack_count: number | null
  remainder_kg: number | null
  quantity_kg: number
  packing_type: string | null
  lot_no: string | null
  warehouse_name: string | null
  qa_status: string | null
  packed_at: string | null
}

function PackedStockPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<PackedEntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          product_id,
          quantity_kg,
          pack_identifier,
          pack_count,
          remainder_kg,
          packing_type,
          created_at,
          pack_size_kg,
          sorting_output:process_sorting_outputs(
            product_id,
            product:products(id, name, sku)
          ),
          packaging_run:process_packaging_runs(
            process_step_run_id,
            process_step_runs(
              process_lot_run_id,
              process_lot_runs(
                supply_batch_id,
                supply_batches(
                  lot_no,
                  quality_status,
                  supply_id,
                  supplies(
                    doc_no,
                    received_at,
                    warehouse_id,
                    warehouses(name)
                  )
                )
              )
            )
          )
        `)
        .order('created_at', { ascending: false })

      if (entriesError) {
        setError(entriesError.message)
        setRows([])
        return
      }

      const list = (entries ?? []) as Array<{
        id: number
        product_id: number | null
        quantity_kg: number
        pack_identifier: string
        pack_count: number | null
        remainder_kg: number | null
        packing_type: string | null
        created_at: string | null
        sorting_output: {
          product_id: number
          product: { id: number; name: string | null; sku: string | null } | null
        } | null
        packaging_run: {
          process_step_run_id: number
          process_step_runs:
            | {
                process_lot_run_id: number
                process_lot_runs: {
                  supply_batch_id: number
                  supply_batches: {
                    lot_no: string | null
                    quality_status: string | null
                    supply_id: number
                    supplies: {
                      doc_no: string | null
                      received_at: string | null
                      warehouse_id: number | null
                      warehouses: { name: string | null } | null
                    } | null
                  } | null
                } | null
              }
            | Array<{
                process_lot_run_id: number
                process_lot_runs: {
                  supply_batch_id: number
                  supply_batches: {
                    lot_no: string | null
                    quality_status: string | null
                    supply_id: number
                    supplies: {
                      doc_no: string | null
                      received_at: string | null
                      warehouse_id: number | null
                      warehouses: { name: string | null } | null
                    } | null
                  } | null
                } | null
              }>
            | null
        } | null
      }>

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const result: PackedEntryRow[] = list.map((entry) => {
        const productName = entry.sorting_output?.product?.name ?? 'Unknown'
        const productSku = entry.sorting_output?.product?.sku ?? ''
        const stepRun = unwrap(entry.packaging_run?.process_step_runs)
        const lotRun = stepRun?.process_lot_runs ?? null
        const batch = lotRun?.supply_batches ?? null
        const supply = batch?.supplies ?? null
        const warehouseName = supply?.warehouses?.name ?? null

        return {
          id: String(entry.id),
          product_id: entry.product_id ?? entry.sorting_output?.product?.id ?? null,
          product_name: productName,
          product_sku: productSku,
          pack_identifier: entry.pack_identifier,
          pack_count: entry.pack_count ?? null,
          remainder_kg: entry.remainder_kg ?? null,
          quantity_kg: Number(entry.quantity_kg) || 0,
          packing_type: entry.packing_type ?? null,
          lot_no: batch?.lot_no ?? null,
          warehouse_name: warehouseName ?? null,
          qa_status: batch?.quality_status ?? null,
          packed_at: entry.created_at ?? null,
        }
      })

      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packed stock')
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
        render: (r: PackedEntryRow) => (
          <div>
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
        mobileRender: (r: PackedEntryRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'pack',
        header: 'Pack size',
        render: (r: PackedEntryRow) => (
          <div className="text-sm text-text-dark">{r.pack_identifier}</div>
        ),
        mobileRender: (r: PackedEntryRow) => r.pack_identifier,
      },
      {
        key: 'packs',
        header: 'Packs / Remainder',
        render: (r: PackedEntryRow) => (
          <div className="text-sm text-text-dark">
            {r.pack_count ?? '—'} packs
            {r.remainder_kg && r.remainder_kg > 0 ? ` + ${r.remainder_kg.toFixed(2)} kg` : ''}
          </div>
        ),
        mobileRender: (r: PackedEntryRow) => (
          <div className="text-sm text-text-dark">
            {r.pack_count ?? '—'} packs
            {r.remainder_kg && r.remainder_kg > 0 ? ` + ${r.remainder_kg.toFixed(2)} kg` : ''}
          </div>
        ),
      },
      {
        key: 'quantity',
        header: 'Quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: PackedEntryRow) => `${r.quantity_kg.toFixed(2)} kg`,
        mobileRender: (r: PackedEntryRow) => `${r.quantity_kg.toFixed(2)} kg`,
      },
      {
        key: 'lot',
        header: 'Supply lot',
        render: (r: PackedEntryRow) => (
          <div className="text-sm text-text-dark">{r.lot_no ?? '—'}</div>
        ),
        mobileRender: (r: PackedEntryRow) => r.lot_no ?? '—',
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (r: PackedEntryRow) => r.warehouse_name ?? '—',
        mobileRender: (r: PackedEntryRow) => r.warehouse_name ?? '—',
      },
      {
        key: 'qa',
        header: 'QA status',
        render: (r: PackedEntryRow) => r.qa_status ?? '—',
        mobileRender: (r: PackedEntryRow) => r.qa_status ?? '—',
      },
      {
        key: 'date',
        header: 'Packed at',
        render: (r: PackedEntryRow) =>
          r.packed_at ? new Date(r.packed_at).toLocaleString() : '—',
        mobileRender: (r: PackedEntryRow) =>
          r.packed_at ? new Date(r.packed_at).toLocaleString() : '—',
      },
      {
        key: 'action',
        header: '',
        headerClassName: 'text-right w-24',
        cellClassName: 'text-right',
        render: (r: PackedEntryRow) =>
          r.product_id ? (
            <span className="text-sm font-medium text-olive hover:underline">
              View
            </span>
          ) : (
            '—'
          ),
        mobileRender: (r: PackedEntryRow) =>
          r.product_id ? (
            <span className="text-sm font-medium text-olive hover:underline">
              View
            </span>
          ) : (
            '—'
          ),
      },
    ],
    []
  )

  const totalKg = useMemo(() => rows.reduce((s, r) => s + r.quantity_kg, 0), [rows])
  const totalPacks = useMemo(
    () => rows.reduce((s, r) => s + (typeof r.pack_count === 'number' ? r.pack_count : 0), 0),
    [rows]
  )

  if (loading) {
    return (
      <PageLayout title="Packed Stock" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading packed stock..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Packed Stock" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
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
        <Card className="border-emerald-200/60">
          <CardHeader className="pb-2">
            <CardDescription>Total packed quantity</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalKg.toLocaleString()} kg
            </CardTitle>
          </CardHeader>
        </Card>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-2">
              <CardDescription>Total pack entries</CardDescription>
              <CardTitle className="text-xl font-semibold text-text-dark">
                {rows.length.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-2">
              <CardDescription>Total packs</CardDescription>
              <CardTitle className="text-xl font-semibold text-text-dark">
                {totalPacks.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Packed stock entries</CardTitle>
          <CardDescription>
            Pack entries with lot, warehouse, QA status, and pack size details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No packed stock recorded yet. Record pack entries in packaging steps to see data here.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={rows}
              rowKey="id"
              onRowClick={(row) => {
                if (row.product_id) {
                  navigate(`/inventory/stock-levels/packed/${row.product_id}`)
                }
              }}
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

export default PackedStockPage
