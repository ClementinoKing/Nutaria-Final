import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import ResponsiveTable from '@/components/ResponsiveTable'
import { LotWasteSummary, loadWasteTrackingData } from '@/lib/wasteTracking'

function WastePage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<LotWasteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadWasteTrackingData()
      setRows(data.summaries)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load waste stock levels')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalLots += 1
        acc.wasteKg += row.waste_kg
        acc.foreignObjectKg += row.foreign_object_kg
        acc.lostKg += row.lost_kg
        return acc
      },
      { totalLots: 0, wasteKg: 0, foreignObjectKg: 0, lostKg: 0 }
    )
  }, [rows])

  const columns = useMemo(
    () => [
      {
        key: 'lot',
        header: 'Lot',
        render: (row: LotWasteSummary) => (
          <div>
            <div className="font-medium text-text-dark">{row.lot_no ?? `Lot Run #${row.lot_run_id}`}</div>
            <div className="text-xs text-text-dark/60">Run #{row.lot_run_id}</div>
          </div>
        ),
      },
      {
        key: 'supplier',
        header: 'Supplier / Doc',
        render: (row: LotWasteSummary) => (
          <div className="text-sm text-text-dark">
            {row.supplier_name ?? '—'}
            <div className="text-xs text-text-dark/60">{row.supply_doc_no ?? '—'}</div>
          </div>
        ),
      },
      {
        key: 'qa',
        header: 'QA Status',
        render: (row: LotWasteSummary) => row.qa_status ?? '—',
      },
      {
        key: 'waste',
        header: 'Waste (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (row: LotWasteSummary) => row.waste_kg.toFixed(2),
      },
      {
        key: 'fo',
        header: 'Foreign Objects (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (row: LotWasteSummary) => row.foreign_object_kg.toFixed(2),
      },
      {
        key: 'lost',
        header: 'Lost (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-semibold',
        render: (row: LotWasteSummary) => row.lost_kg.toFixed(2),
      },
      {
        key: 'updated',
        header: 'Last Updated',
        render: (row: LotWasteSummary) =>
          row.last_recorded_at ? new Date(row.last_recorded_at).toLocaleString() : '—',
      },
      {
        key: 'action',
        header: '',
        headerClassName: 'text-right w-24',
        cellClassName: 'text-right',
        render: () => <span className="text-sm font-medium text-olive hover:underline">View</span>,
      },
    ],
    []
  )

  if (loading) {
    return (
      <PageLayout title="Waste" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading waste stock levels..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Waste" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          to="/inventory/stock-levels"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Stock Levels
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Lots with waste</CardDescription>
            <CardTitle className="text-xl font-semibold text-text-dark">{totals.totalLots.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Total waste</CardDescription>
            <CardTitle className="text-xl font-semibold text-text-dark">{totals.wasteKg.toFixed(2)} kg</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Total foreign objects</CardDescription>
            <CardTitle className="text-xl font-semibold text-text-dark">{totals.foreignObjectKg.toFixed(2)} kg</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/40 bg-white">
          <CardHeader className="pb-2">
            <CardDescription>Total lost</CardDescription>
            <CardTitle className="text-xl font-semibold text-text-dark">{totals.lostKg.toFixed(2)} kg</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Waste by lot run</CardTitle>
          <CardDescription>
            Waste and foreign-object losses aggregated from all process steps by lot run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No waste records found yet.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={rows}
              rowKey="lot_run_id"
              onRowClick={(row) => navigate(`/inventory/stock-levels/waste-details/${row.lot_run_id}`)}
            />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default WastePage
