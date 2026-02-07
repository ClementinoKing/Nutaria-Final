import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface AllocationRow {
  id: string
  product_id: number | null
  product_name: string
  product_sku: string
  pack_identifier: string
  storage_type: string | null
  box_unit_code: string | null
  units_count: number
  packs_per_unit: number
  total_packs: number
  total_quantity_kg: number
  notes: string | null
  lot_no: string | null
  warehouse_name: string | null
  qa_status: string | null
  allocated_at: string | null
}

function AllocationPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<AllocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('process_packaging_storage_allocations')
        .select(`
          id,
          storage_type,
          box_unit_code,
          units_count,
          packs_per_unit,
          total_packs,
          total_quantity_kg,
          notes,
          created_at,
          pack_entry:process_packaging_pack_entries(
            product_id,
            pack_identifier,
            packet_unit_code,
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
        storage_type: string | null
        box_unit_code: string | null
        units_count: number | null
        packs_per_unit: number | null
        total_packs: number | null
        total_quantity_kg: number | null
        notes: string | null
        created_at: string | null
        pack_entry:
          | {
              product_id: number | null
              pack_identifier: string | null
              packet_unit_code: string | null
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
            }
          | Array<{
              product_id: number | null
              pack_identifier: string | null
              packet_unit_code: string | null
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
          | null
      }>

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const result: AllocationRow[] = list.map((entry) => {
        const packEntry = unwrap(entry.pack_entry)
        const productName = packEntry?.sorting_output?.product?.name ?? 'Unknown'
        const productSku = packEntry?.sorting_output?.product?.sku ?? ''
        const stepRun = unwrap(packEntry?.packaging_run?.process_step_runs)
        const lotRun = stepRun?.process_lot_runs ?? null
        const batch = lotRun?.supply_batches ?? null
        const supply = batch?.supplies ?? null
        const warehouseName = supply?.warehouses?.name ?? null

        return {
          id: String(entry.id),
          product_id: packEntry?.product_id ?? packEntry?.sorting_output?.product?.id ?? null,
          product_name: productName,
          product_sku: productSku,
          pack_identifier: packEntry?.packet_unit_code ?? packEntry?.pack_identifier ?? '—',
          storage_type: entry.storage_type ?? null,
          box_unit_code: entry.box_unit_code ?? null,
          units_count: Number(entry.units_count) || 0,
          packs_per_unit: Number(entry.packs_per_unit) || 0,
          total_packs: Number(entry.total_packs) || 0,
          total_quantity_kg: Number(entry.total_quantity_kg) || 0,
          notes: entry.notes ?? null,
          lot_no: batch?.lot_no ?? null,
          warehouse_name: warehouseName ?? null,
          qa_status: batch?.quality_status ?? null,
          allocated_at: entry.created_at ?? null,
        }
      })

      setRows(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load allocations')
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
        render: (r: AllocationRow) => (
          <div>
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
        mobileRender: (r: AllocationRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{r.product_name}</div>
            <div className="text-xs text-text-dark/60">{r.product_sku}</div>
          </div>
        ),
      },
      {
        key: 'pack',
        header: 'Pack',
        render: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">{r.pack_identifier}</div>
        ),
        mobileRender: (r: AllocationRow) => r.pack_identifier,
      },
      {
        key: 'storage',
        header: 'Storage',
        render: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.storage_type ?? '—'}
            {r.box_unit_code ? ` · ${r.box_unit_code}` : ''}
          </div>
        ),
        mobileRender: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.storage_type ?? '—'}
            {r.box_unit_code ? ` · ${r.box_unit_code}` : ''}
          </div>
        ),
      },
      {
        key: 'units',
        header: 'Units · Packs/Unit',
        render: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.units_count} units · {r.packs_per_unit} packs/unit
          </div>
        ),
        mobileRender: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">
            {r.units_count} units · {r.packs_per_unit} packs/unit
          </div>
        ),
      },
      {
        key: 'total-packs',
        header: 'Total Packs',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: AllocationRow) => r.total_packs.toLocaleString(),
        mobileRender: (r: AllocationRow) => r.total_packs.toLocaleString(),
      },
      {
        key: 'quantity',
        header: 'Quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (r: AllocationRow) => `${r.total_quantity_kg.toFixed(2)} kg`,
        mobileRender: (r: AllocationRow) => `${r.total_quantity_kg.toFixed(2)} kg`,
      },
      {
        key: 'lot',
        header: 'Supply lot',
        render: (r: AllocationRow) => (
          <div className="text-sm text-text-dark">{r.lot_no ?? '—'}</div>
        ),
        mobileRender: (r: AllocationRow) => r.lot_no ?? '—',
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (r: AllocationRow) => r.warehouse_name ?? '—',
        mobileRender: (r: AllocationRow) => r.warehouse_name ?? '—',
      },
      {
        key: 'qa',
        header: 'QA status',
        render: (r: AllocationRow) => r.qa_status ?? '—',
        mobileRender: (r: AllocationRow) => r.qa_status ?? '—',
      },
      {
        key: 'date',
        header: 'Allocated at',
        render: (r: AllocationRow) =>
          r.allocated_at ? new Date(r.allocated_at).toLocaleString() : '—',
        mobileRender: (r: AllocationRow) =>
          r.allocated_at ? new Date(r.allocated_at).toLocaleString() : '—',
      },
      {
        key: 'notes',
        header: 'Notes',
        render: (r: AllocationRow) => r.notes || '—',
        mobileRender: (r: AllocationRow) => r.notes || '—',
      },
      {
        key: 'action',
        header: '',
        headerClassName: 'text-right w-24',
        cellClassName: 'text-right',
        render: (r: AllocationRow) =>
          r.product_id ? (
            <span className="text-sm font-medium text-olive hover:underline">
              View
            </span>
          ) : (
            '—'
          ),
        mobileRender: (r: AllocationRow) =>
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

  const totalKg = useMemo(() => rows.reduce((s, r) => s + r.total_quantity_kg, 0), [rows])
  const totalUnits = useMemo(() => rows.reduce((s, r) => s + r.units_count, 0), [rows])
  const totalPacks = useMemo(
    () => rows.reduce((s, r) => s + r.total_packs, 0),
    [rows]
  )

  if (loading) {
    return (
      <PageLayout title="Allocations" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading allocations..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Allocations" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
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
            <CardDescription>Total allocated quantity</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {totalKg.toLocaleString()} kg
            </CardTitle>
          </CardHeader>
        </Card>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-2">
              <CardDescription>Total allocations</CardDescription>
              <CardTitle className="text-xl font-semibold text-text-dark">
                {rows.length.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-2">
              <CardDescription>Total allocated packs</CardDescription>
              <CardTitle className="text-xl font-semibold text-text-dark">
                {totalPacks.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-olive-light/40 bg-white">
            <CardHeader className="pb-2">
              <CardDescription>Total allocated units</CardDescription>
              <CardTitle className="text-xl font-semibold text-text-dark">
                {totalUnits.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Packaging allocations</CardTitle>
          <CardDescription>
            Product allocations created in packaging with storage type, units, and allocated quantities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No allocations recorded yet. Add storage allocations in the packaging step to see data here.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={rows}
              rowKey="id"
              onRowClick={(row) => {
                if (row.product_id) {
                  navigate(`/inventory/stock-levels/allocation-details/${row.product_id}`)
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

export default AllocationPage
