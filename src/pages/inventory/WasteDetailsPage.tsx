import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import ResponsiveTable from '@/components/ResponsiveTable'
import { LotWasteSummary, WasteRecord, WasteSourceKind, loadWasteTrackingData } from '@/lib/wasteTracking'

const SOURCE_LABELS: Record<WasteSourceKind, string> = {
  WASHING_WASTE: 'Washing waste',
  DRYING_WASTE: 'Drying waste',
  SORTING_WASTE: 'Sorting waste',
  PACKAGING_WASTE: 'Packaging waste',
  METAL_DETECTOR_WASTE: 'Metal detector waste',
  METAL_DETECTOR_FOREIGN_OBJECT: 'Metal detector FO',
  PACKAGING_FOREIGN_OBJECT: 'Packaging FO',
}

function WasteDetailsPage() {
  const { lotRunId } = useParams<{ lotRunId: string }>()
  const [summary, setSummary] = useState<LotWasteSummary | null>(null)
  const [records, setRecords] = useState<WasteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const parsedLotRunId = Number(lotRunId)
    if (!Number.isFinite(parsedLotRunId)) {
      setError('Invalid lot run')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const data = await loadWasteTrackingData({ lotRunId: parsedLotRunId })
      const filteredRecords = data.records.filter((row) => row.lot_run_id === parsedLotRunId)
      const foundSummary = data.summaries.find((row) => row.lot_run_id === parsedLotRunId) ?? null
      const context = data.lotContexts.find((row) => row.lot_run_id === parsedLotRunId) ?? null
      setRecords(filteredRecords)
      setSummary(
        foundSummary ?? {
          lot_run_id: parsedLotRunId,
          lot_no: context?.lot_no ?? null,
          qa_status: context?.qa_status ?? null,
          supplier_name: context?.supplier_name ?? null,
          supply_doc_no: context?.supply_doc_no ?? null,
          waste_kg: 0,
          foreign_object_kg: 0,
          lost_kg: 0,
          records_count: 0,
          last_recorded_at: null,
        }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load waste details')
      setSummary(null)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [lotRunId])

  useEffect(() => {
    load()
  }, [load])

  const wasteRecords = useMemo(() => records.filter((row) => row.source.endsWith('_WASTE')), [records])
  const foreignObjectRecords = useMemo(() => records.filter((row) => row.source.includes('FOREIGN_OBJECT')), [records])

  const sourceSubtotals = useMemo(() => {
    const bySource = new Map<WasteSourceKind, number>()
    records.forEach((row) => {
      bySource.set(row.source, (bySource.get(row.source) ?? 0) + row.quantity_kg)
    })
    return Array.from(bySource.entries()).map(([source, quantity]) => ({
      source,
      quantity,
      label: SOURCE_LABELS[source],
    }))
  }, [records])

  const sharedColumns = useMemo(
    () => [
      {
        key: 'source',
        header: 'Source',
        render: (row: WasteRecord) => SOURCE_LABELS[row.source],
      },
      {
        key: 'type',
        header: 'Waste/Object',
        render: (row: WasteRecord) => row.waste_type_or_object,
      },
      {
        key: 'qty',
        header: 'Quantity (kg)',
        headerClassName: 'text-right',
        cellClassName: 'text-right font-medium',
        render: (row: WasteRecord) => row.quantity_kg.toFixed(3),
      },
      {
        key: 'remarks',
        header: 'Remarks / Action',
        render: (row: WasteRecord) => row.remarks || '—',
      },
      {
        key: 'step-run',
        header: 'Step Run',
        render: (row: WasteRecord) => (row.step_run_id ? `#${row.step_run_id}` : '—'),
      },
      {
        key: 'recorded',
        header: 'Recorded At',
        render: (row: WasteRecord) => (row.recorded_at ? new Date(row.recorded_at).toLocaleString() : '—'),
      },
    ],
    []
  )

  if (loading) {
    return (
      <PageLayout title="Waste Details" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading waste details..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Waste Details" activeItem="inventory" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          to="/inventory/stock-levels/waste"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Waste
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-6">
            <Card className="border-emerald-200/60">
              <CardHeader className="pb-2">
                <CardDescription>
                  Lot {summary?.lot_no ?? '—'} · Run #{summary?.lot_run_id ?? '—'} · QA {summary?.qa_status ?? '—'}
                </CardDescription>
                <CardTitle className="text-2xl font-semibold text-text-dark">
                  Waste {summary?.waste_kg.toFixed(2) ?? '0.00'} kg · FO {summary?.foreign_object_kg.toFixed(2) ?? '0.00'} kg · Lost{' '}
                  {summary?.lost_kg.toFixed(2) ?? '0.00'} kg
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <Card className="border-olive-light/40 bg-white">
                <CardHeader className="pb-2">
                  <CardDescription>Supplier</CardDescription>
                  <CardTitle className="text-xl font-semibold text-text-dark">{summary?.supplier_name ?? '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-olive-light/40 bg-white">
                <CardHeader className="pb-2">
                  <CardDescription>Supply Doc</CardDescription>
                  <CardTitle className="text-xl font-semibold text-text-dark">{summary?.supply_doc_no ?? '—'}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-olive-light/40 bg-white">
                <CardHeader className="pb-2">
                  <CardDescription>Total records</CardDescription>
                  <CardTitle className="text-xl font-semibold text-text-dark">{summary?.records_count ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-olive-light/40 bg-white">
                <CardHeader className="pb-2">
                  <CardDescription>Last updated</CardDescription>
                  <CardTitle className="text-base font-semibold text-text-dark">
                    {summary?.last_recorded_at ? new Date(summary.last_recorded_at).toLocaleString() : '—'}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>

          <Card className="bg-white border-olive-light/30 mb-6">
            <CardHeader>
              <CardTitle className="text-text-dark">Subtotals by source</CardTitle>
              <CardDescription>Quick breakdown of where losses came from.</CardDescription>
            </CardHeader>
            <CardContent>
              {sourceSubtotals.length === 0 ? (
                <p className="text-sm text-text-dark/60">No waste/foreign-object records for this lot run.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {sourceSubtotals.map((row) => (
                    <div key={row.source} className="rounded-md border border-olive-light/30 px-3 py-2">
                      <div className="text-sm text-text-dark/70">{row.label}</div>
                      <div className="text-base font-semibold text-text-dark">{row.quantity.toFixed(3)} kg</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white border-olive-light/30 mb-6">
            <CardHeader>
              <CardTitle className="text-text-dark">Waste Records</CardTitle>
              <CardDescription>Actual waste records across washing, drying, sorting, packaging, and metal detector.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable columns={sharedColumns} data={wasteRecords} rowKey="id" emptyMessage="No waste records for this lot run." />
            </CardContent>
          </Card>

          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">Foreign Objects</CardTitle>
              <CardDescription>Foreign-object rejection records from metal detection and packaging checks.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                columns={sharedColumns}
                data={foreignObjectRecords}
                rowKey="id"
                emptyMessage="No foreign-object records for this lot run."
              />
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  )
}

export default WasteDetailsPage
