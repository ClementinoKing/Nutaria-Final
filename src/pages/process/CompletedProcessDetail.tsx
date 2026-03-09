import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface ProcessNonConformanceRow {
  id: number
  nc_type: string | null
  description: string | null
  severity: string | null
  corrective_action: string | null
  resolved: boolean | null
  resolved_at: string | null
}

interface StepMeasurementRow {
  id: number
  metric: string
  value: number
  unit: string
  recorded_at: string | null
}

interface StepDetailEntry {
  label: string
  value: string
}

interface StepRunRow {
  id: number
  seq: number
  step_code: string
  step_name: string
  status: string
  started_at: string | null
  completed_at: string | null
  performed_by: string | null
  operator_name: string | null
  location_name: string | null
  measurements: StepMeasurementRow[]
  detail_entries: StepDetailEntry[]
  non_conformances: ProcessNonConformanceRow[]
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
  const text = String(value).trim()
  return text ? text : null
}

function addDetailEntry(entries: StepDetailEntry[], label: string, value: unknown): void {
  const formatted = formatDetailValue(value)
  if (!formatted) return
  entries.push({ label, value: formatted })
}

function CompletedProcessDetail() {
  const { lotRunId } = useParams<{ lotRunId: string }>()
  const [lotNo, setLotNo] = useState<string | null>(null)
  const [lotSummary, setLotSummary] = useState<string | null>(null)
  const [productName, setProductName] = useState<string | null>(null)
  const [processName, setProcessName] = useState<string | null>(null)
  const [processCode, setProcessCode] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [stepRuns, setStepRuns] = useState<StepRunRow[]>([])
  const [expandedStepIds, setExpandedStepIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const id = lotRunId ? Number(lotRunId) : NaN
    if (!Number.isFinite(id)) {
      setError('Invalid lot run')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data: lotRun, error: lotRunError } = await supabase
        .from('process_lot_runs')
        .select(`
          id,
          started_at,
          completed_at,
          supply_batches: supply_batch_id (lot_no, products: product_id (name)),
          process_lot_run_batches (
            id,
            is_primary,
            supply_batches:supply_batch_id (lot_no, products:product_id (name))
          ),
          processes: process_id (name, code)
        `)
        .eq('id', id)
        .single()

      if (lotRunError || !lotRun) {
        setError(lotRunError?.message ?? 'Process run not found')
        setLoading(false)
        return
      }

      const batch = (lotRun as any).supply_batches
      const process = (lotRun as any).processes
      const linkedLots = (((lotRun as any).process_lot_run_batches || []) as any[])
        .map((row) => (Array.isArray(row.supply_batches) ? row.supply_batches[0] : row.supply_batches))
        .filter(Boolean)
      const batchSingle = Array.isArray(batch) ? batch[0] : batch
      const processSingle = Array.isArray(process) ? process[0] : process
      setLotNo(batchSingle?.lot_no ?? null)
      if (linkedLots.length > 1) {
        setLotSummary(`${linkedLots[0]?.lot_no ?? batchSingle?.lot_no ?? 'Lot'} +${linkedLots.length - 1}`)
      } else {
        setLotSummary(linkedLots[0]?.lot_no ?? batchSingle?.lot_no ?? null)
      }
      setProductName(batchSingle?.products?.name ?? null)
      setProcessName(processSingle?.name ?? null)
      setProcessCode(processSingle?.code ?? null)
      setStartedAt((lotRun as any).started_at ?? null)
      setCompletedAt((lotRun as any).completed_at ?? null)

      const { data: stepRunsData, error: stepRunsError } = await supabase
        .from('process_step_runs')
        .select('id, process_step_id, status, started_at, completed_at, performed_by, location_id')
        .eq('process_lot_run_id', id)
        .order('id', { ascending: true })

      if (stepRunsError) {
        setStepRuns([])
        setLoading(false)
        return
      }

      const runs = (stepRunsData ?? []) as Array<{
        id: number
        process_step_id: number
        status: string
        started_at: string | null
        completed_at: string | null
        performed_by: string | null
        location_id: number | null
      }>
      const stepIds = runs.map((r) => r.process_step_id).filter(Boolean)
      if (stepIds.length === 0) {
        setStepRuns(
          runs.map((r, i) => ({
            id: r.id,
            seq: i + 1,
            step_code: '',
            step_name: `Step ${i + 1}`,
            status: r.status,
            started_at: r.started_at,
            completed_at: r.completed_at,
            performed_by: r.performed_by,
            operator_name: null,
            location_name: null,
            measurements: [],
            detail_entries: [],
            non_conformances: [],
          }))
        )
        setLoading(false)
        return
      }

      const locationIds = Array.from(new Set(runs.map((r) => r.location_id).filter((value): value is number => Number.isFinite(value as number))))
      const stepRunIds = runs.map((r) => r.id)
      const userIds = Array.from(new Set(runs.map((r) => r.performed_by).filter((value): value is string => Boolean(value))))

      const [stepsResult, warehousesResult, nonConformancesResult, profilesResult, measurementsResult, dryingResult, washingResult, packagingResult] = await Promise.all([
        supabase.from('process_steps').select('id, seq, step_name_id').in('id', stepIds),
        locationIds.length > 0
          ? supabase.from('warehouses').select('id, name').in('id', locationIds)
          : Promise.resolve({ data: [], error: null }),
        stepRunIds.length > 0
          ? supabase
              .from('process_non_conformances')
              .select('id, process_step_run_id, nc_type, description, severity, corrective_action, resolved, resolved_at')
              .in('process_step_run_id', stepRunIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length > 0
          ? supabase.from('user_profiles').select('auth_user_id, full_name, email').in('auth_user_id', userIds)
          : Promise.resolve({ data: [], error: null }),
        stepRunIds.length > 0
          ? supabase
              .from('process_measurements')
              .select('id, process_step_run_id, metric, value, unit, recorded_at')
              .in('process_step_run_id', stepRunIds)
              .order('recorded_at', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        stepRunIds.length > 0
          ? supabase
              .from('process_drying_runs')
              .select('process_step_run_id, dryer_temperature_c, time_in, time_out, moisture_in, moisture_out, crates_clean, insect_infestation, dryer_hygiene_clean, remarks')
              .in('process_step_run_id', stepRunIds)
          : Promise.resolve({ data: [], error: null }),
        stepRunIds.length > 0
          ? supabase
              .from('process_washing_runs')
              .select('process_step_run_id, washing_water_litres, oxy_acid_ml, moisture_percent, remarks')
              .in('process_step_run_id', stepRunIds)
          : Promise.resolve({ data: [], error: null }),
        stepRunIds.length > 0
          ? supabase
              .from('process_packaging_runs')
              .select('process_step_run_id, visual_status, rework_destination, pest_status, foreign_object_status, mould_status, damaged_kernels_pct, insect_damaged_kernels_pct, nitrogen_used, nitrogen_batch_number, primary_packaging_type, primary_packaging_batch, secondary_packaging, secondary_packaging_type, secondary_packaging_batch, label_correct, label_legible, pallet_integrity, allergen_swab_result, remarks')
              .in('process_step_run_id', stepRunIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      const stepsList = (stepsResult.data ?? []) as Array<{
        id: number
        seq: number
        step_name_id: number | null
      }>
      const stepNameIds = stepsList.map((s) => s.step_name_id).filter((id): id is number => id != null)
      const stepNamesMap = new Map<number, { code: string; name: string }>()
      if (stepNameIds.length > 0) {
        const { data: namesData } = await supabase
          .from('process_step_names')
          .select('id, code, name')
          .in('id', stepNameIds)
        ;(namesData ?? []).forEach((n: any) => {
          stepNamesMap.set(n.id, { code: n.code ?? '', name: n.name ?? '' })
        })
      }

      const stepsById = new Map(stepsList.map((s) => [s.id, s]))
      const warehousesById = new Map<number, { id: number; name: string }>(
        ((warehousesResult.data ?? []) as Array<{ id: number; name: string }>).map((w) => [w.id, w]),
      )
      const operatorByAuthId = new Map<string, string>()
      ;((profilesResult.data ?? []) as Array<{ auth_user_id: string; full_name?: string | null; email?: string | null }>).forEach((profile) => {
        operatorByAuthId.set(profile.auth_user_id, profile.full_name || profile.email || profile.auth_user_id)
      })
      const nonConformanceByStepRunId = new Map<number, ProcessNonConformanceRow[]>()
      ;((nonConformancesResult.data ?? []) as Array<ProcessNonConformanceRow & { process_step_run_id: number }>).forEach((nc) => {
        const list = nonConformanceByStepRunId.get(nc.process_step_run_id) ?? []
        list.push({
          id: nc.id,
          nc_type: nc.nc_type,
          description: nc.description,
          severity: nc.severity,
          corrective_action: nc.corrective_action,
          resolved: nc.resolved,
          resolved_at: nc.resolved_at,
        })
        nonConformanceByStepRunId.set(nc.process_step_run_id, list)
      })

      const measurementsByStepRunId = new Map<number, StepMeasurementRow[]>()
      ;((measurementsResult.data ?? []) as Array<StepMeasurementRow & { process_step_run_id: number }>).forEach((measurement) => {
        const list = measurementsByStepRunId.get(measurement.process_step_run_id) ?? []
        list.push({
          id: measurement.id,
          metric: measurement.metric,
          value: measurement.value,
          unit: measurement.unit,
          recorded_at: measurement.recorded_at,
        })
        measurementsByStepRunId.set(measurement.process_step_run_id, list)
      })

      const dryingByStepRunId = new Map<number, Record<string, unknown>>(
        ((dryingResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [Number(row.process_step_run_id), row]),
      )
      const washingByStepRunId = new Map<number, Record<string, unknown>>(
        ((washingResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [Number(row.process_step_run_id), row]),
      )
      const packagingByStepRunId = new Map<number, Record<string, unknown>>(
        ((packagingResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [Number(row.process_step_run_id), row]),
      )

      const rows: StepRunRow[] = runs.map((r) => {
        const step = stepsById.get(r.process_step_id)
        const stepNameFromId = step?.step_name_id ? stepNamesMap.get(step.step_name_id) : null
        const operatorName = r.performed_by ? operatorByAuthId.get(r.performed_by) ?? r.performed_by : null
        const locationName = r.location_id ? warehousesById.get(r.location_id)?.name ?? null : null
        const detailEntries: StepDetailEntry[] = []
        const drying = dryingByStepRunId.get(r.id)
        const washing = washingByStepRunId.get(r.id)
        const packaging = packagingByStepRunId.get(r.id)

        if (washing) {
          addDetailEntry(detailEntries, 'Washing Water (L)', washing.washing_water_litres)
          addDetailEntry(detailEntries, 'Oxy Acid (ml)', washing.oxy_acid_ml)
          addDetailEntry(detailEntries, 'Moisture (%)', washing.moisture_percent)
          addDetailEntry(detailEntries, 'Washing Remarks', washing.remarks)
        }

        if (drying) {
          addDetailEntry(detailEntries, 'Dryer Temperature (°C)', drying.dryer_temperature_c)
          addDetailEntry(detailEntries, 'Time In', drying.time_in)
          addDetailEntry(detailEntries, 'Time Out', drying.time_out)
          addDetailEntry(detailEntries, 'Moisture In', drying.moisture_in)
          addDetailEntry(detailEntries, 'Moisture Out', drying.moisture_out)
          addDetailEntry(detailEntries, 'Crates Clean', drying.crates_clean)
          addDetailEntry(detailEntries, 'Insect Infestation', drying.insect_infestation)
          addDetailEntry(detailEntries, 'Dryer Hygiene Clean', drying.dryer_hygiene_clean)
          addDetailEntry(detailEntries, 'Drying Remarks', drying.remarks)
        }

        if (packaging) {
          addDetailEntry(detailEntries, 'Visual Status', packaging.visual_status)
          addDetailEntry(detailEntries, 'Rework Destination', packaging.rework_destination)
          addDetailEntry(detailEntries, 'Pest Status', packaging.pest_status)
          addDetailEntry(detailEntries, 'Foreign Object Status', packaging.foreign_object_status)
          addDetailEntry(detailEntries, 'Mould Status', packaging.mould_status)
          addDetailEntry(detailEntries, 'Damaged Kernels (%)', packaging.damaged_kernels_pct)
          addDetailEntry(detailEntries, 'Insect Damaged Kernels (%)', packaging.insect_damaged_kernels_pct)
          addDetailEntry(detailEntries, 'Nitrogen Used', packaging.nitrogen_used)
          addDetailEntry(detailEntries, 'Nitrogen Batch Number', packaging.nitrogen_batch_number)
          addDetailEntry(detailEntries, 'Primary Packaging Type', packaging.primary_packaging_type)
          addDetailEntry(detailEntries, 'Primary Packaging Batch', packaging.primary_packaging_batch)
          addDetailEntry(detailEntries, 'Secondary Packaging', packaging.secondary_packaging)
          addDetailEntry(detailEntries, 'Secondary Packaging Type', packaging.secondary_packaging_type)
          addDetailEntry(detailEntries, 'Secondary Packaging Batch', packaging.secondary_packaging_batch)
          addDetailEntry(detailEntries, 'Label Correct', packaging.label_correct)
          addDetailEntry(detailEntries, 'Label Legible', packaging.label_legible)
          addDetailEntry(detailEntries, 'Pallet Integrity', packaging.pallet_integrity)
          addDetailEntry(detailEntries, 'Allergen Swab Result', packaging.allergen_swab_result)
          addDetailEntry(detailEntries, 'Packaging Remarks', packaging.remarks)
        }

        return {
          id: r.id,
          seq: step?.seq ?? 0,
          step_code: stepNameFromId?.code ?? '',
          step_name: stepNameFromId?.name ?? `Step`,
          status: r.status,
          started_at: r.started_at,
          completed_at: r.completed_at,
          performed_by: r.performed_by,
          operator_name: operatorName,
          location_name: locationName,
          measurements: measurementsByStepRunId.get(r.id) ?? [],
          detail_entries: detailEntries,
          non_conformances: nonConformanceByStepRunId.get(r.id) ?? [],
        }
      })
      rows.sort((a, b) => a.seq - b.seq)
      setStepRuns(rows)
      setExpandedStepIds(new Set(rows.map((row) => row.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load process detail')
      setStepRuns([])
    } finally {
      setLoading(false)
    }
  }, [lotRunId])

  useEffect(() => {
    load()
  }, [load])

  const formatDateTime = (value: string | null): string => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  const formatDuration = (startedAtValue: string | null, completedAtValue: string | null): string => {
    if (!startedAtValue || !completedAtValue) return '—'
    const start = new Date(startedAtValue).getTime()
    const end = new Date(completedAtValue).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—'

    const totalMinutes = Math.round((end - start) / 60000)
    if (totalMinutes < 60) return `${totalMinutes} min`
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }

  const toggleStepExpansion = (stepRunId: number) => {
    setExpandedStepIds((previous) => {
      const next = new Set(previous)
      if (next.has(stepRunId)) {
        next.delete(stepRunId)
      } else {
        next.add(stepRunId)
      }
      return next
    })
  }

  if (loading) {
    return (
      <PageLayout
        title="Completed Process"
        activeItem="process"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading process detail..." />
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout title="Completed Process" activeItem="process" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          {error}
        </div>
        <Link
          to="/process/completed"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Completed Processes
        </Link>
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title={lotNo ? `Lot ${lotNo}` : 'Completed Process'}
      activeItem="process"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-4">
        <Link
          to="/process/completed"
          className="inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Completed Processes
        </Link>
      </div>

      <Card className="mb-6 border-olive-light/30">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle className="text-text-dark">
                {lotSummary ?? lotNo ?? 'Lot'} {productName ? `· ${productName}` : ''}
              </CardTitle>
              <CardDescription>
                {processName ?? 'Process'} {processCode ? `(${processCode})` : ''}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-text-dark/70">
          <p>Started: {formatDateTime(startedAt)}</p>
          <p>Completed: {formatDateTime(completedAt)}</p>
        </CardContent>
      </Card>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Steps</CardTitle>
          <CardDescription>Step runs for this process (read-only).</CardDescription>
        </CardHeader>
        <CardContent>
          {stepRuns.length === 0 ? (
            <p className="text-sm text-text-dark/60">No step data recorded.</p>
          ) : (
            <ul className="divide-y divide-olive-light/30">
              {stepRuns.map((step) => (
                <li key={step.id} className="py-3 first:pt-0">
                  <button
                    type="button"
                    onClick={() => toggleStepExpansion(step.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-1 py-1 text-left hover:bg-olive-light/10"
                  >
                    <div className="flex items-center gap-2">
                      {expandedStepIds.has(step.id) ? (
                        <ChevronDown className="h-4 w-4 text-text-dark/60" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-text-dark/60" />
                      )}
                      <div>
                        <span className="font-medium text-text-dark">
                          {step.step_name || step.step_code || `Step ${step.seq}`}
                        </span>
                        {step.step_code ? (
                          <span className="ml-2 text-xs text-text-dark/60">({step.step_code})</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span
                        className={
                          step.status === 'COMPLETED'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-green-800'
                            : 'rounded-full bg-olive-light/20 px-2 py-0.5 text-text-dark/80'
                        }
                      >
                        {step.status}
                      </span>
                      <span className="text-text-dark/60">
                        {formatDateTime(step.started_at)} → {formatDateTime(step.completed_at)}
                      </span>
                    </div>
                  </button>

                  {expandedStepIds.has(step.id) ? (
                    <div className="ml-6 mt-3 rounded-md border border-olive-light/30 bg-olive-light/10 p-3">
                      <div className="grid gap-2 text-sm text-text-dark/75 sm:grid-cols-2">
                        <div>
                          <span className="font-medium text-text-dark">Operator:</span>{' '}
                          {step.operator_name ?? step.performed_by ?? '—'}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Location:</span>{' '}
                          {step.location_name ?? '—'}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Started:</span>{' '}
                          {formatDateTime(step.started_at)}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Completed:</span>{' '}
                          {formatDateTime(step.completed_at)}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Duration:</span>{' '}
                          {formatDuration(step.started_at, step.completed_at)}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Non-Conformances:</span>{' '}
                          {step.non_conformances.length}
                        </div>
                        <div>
                          <span className="font-medium text-text-dark">Entries:</span>{' '}
                          {step.measurements.length + step.detail_entries.length}
                        </div>
                      </div>

                      {step.measurements.length > 0 ? (
                        <div className="mt-3">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-dark/60">Measurements</div>
                          <div className="space-y-1 text-sm text-text-dark/80">
                            {step.measurements.map((measurement) => (
                              <div key={measurement.id} className="rounded-md border border-olive-light/30 bg-white/70 px-3 py-2">
                                <span className="font-medium text-text-dark">{measurement.metric}:</span>{' '}
                                {measurement.value} {measurement.unit}
                                <span className="ml-2 text-xs text-text-dark/60">
                                  {measurement.recorded_at ? `(${formatDateTime(measurement.recorded_at)})` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {step.detail_entries.length > 0 ? (
                        <div className="mt-3">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-dark/60">Recorded Details</div>
                          <div className="grid gap-2 text-sm text-text-dark/80 sm:grid-cols-2">
                            {step.detail_entries.map((entry, index) => (
                              <div key={`${step.id}-${entry.label}-${index}`} className="rounded-md border border-olive-light/30 bg-white/70 px-3 py-2">
                                <span className="font-medium text-text-dark">{entry.label}:</span> {entry.value}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {step.non_conformances.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {step.non_conformances.map((nc) => (
                            <div key={nc.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                              <div className="font-medium">
                                {nc.nc_type || 'Issue'}{nc.severity ? ` · ${nc.severity}` : ''}
                              </div>
                              {nc.description ? <div className="mt-1">{nc.description}</div> : null}
                              {nc.corrective_action ? (
                                <div className="mt-1 text-red-700">Corrective action: {nc.corrective_action}</div>
                              ) : null}
                              <div className="mt-1 text-xs text-red-700">
                                {nc.resolved ? `Resolved${nc.resolved_at ? ` at ${formatDateTime(nc.resolved_at)}` : ''}` : 'Open'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default CompletedProcessDetail
