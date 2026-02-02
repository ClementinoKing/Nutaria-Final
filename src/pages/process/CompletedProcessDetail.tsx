import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { PostgrestError } from '@supabase/supabase-js'
import { ArrowLeft, CheckCircle2, Clock, Package, Layers, ChevronDown, ChevronRight } from 'lucide-react'

interface SupplyBatch {
  id: number
  lot_no: string
  process_status: string
  current_qty: number
  received_qty: number
  product_id: number
  unit_id: number
  supply_id: number
  products?: { name?: string; sku?: string } | null
  supplies?: { doc_no?: string; received_at?: string } | null
  units?: { name?: string; symbol?: string } | null
}

interface Process {
  id: number
  code: string
  name: string
  description?: string | null
}

interface ProcessStep {
  id: number
  seq: number
  step_code: string | null
  step_name: string | null
}

interface StepRun {
  id: number
  process_step_id: number
  status: string
  started_at: string | null
  completed_at: string | null
  performed_by: string | null
  location_id: number | null
  notes: string | null
  process_steps?: ProcessStep | null
  location?: { id: number; name: string } | null
}

interface LotRun {
  id: number
  status: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  supply_batch_id: number
  process_id: number
  supply_batches: SupplyBatch | null
  processes: Process | null
  step_runs?: StepRun[]
}

type StepDataMap = Record<number, Record<string, unknown>>

function CompletedProcessDetail() {
  const { lotRunId } = useParams()
  const navigate = useNavigate()
  const id = lotRunId ? parseInt(lotRunId, 10) : NaN

  const [lotRun, setLotRun] = useState<LotRun | null>(null)
  const [stepData, setStepData] = useState<StepDataMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set())

  const fetchLotRun = useCallback(async () => {
    if (!Number.isFinite(id)) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: runData, error: runError } = await supabase
      .from('process_lot_runs')
      .select(`
        id,
        status,
        started_at,
        completed_at,
        created_at,
        supply_batch_id,
        process_id,
        supply_batches: supply_batch_id (
          id,
          lot_no,
          process_status,
          current_qty,
          received_qty,
          product_id,
          unit_id,
          supply_id,
          products: product_id (name, sku),
          supplies: supply_id (doc_no, received_at),
          units: unit_id (name, symbol)
        ),
        processes: process_id (id, code, name, description)
      `)
      .eq('id', id)
      .single()

    if (runError || !runData) {
      setError(runError ?? new Error('Not found') as PostgrestError)
      setLotRun(null)
      setLoading(false)
      return
    }

    const run = runData as LotRun

    // Fetch step runs without joins (more reliable than nested select)
    const { data: stepRunsData, error: stepRunsError } = await supabase
      .from('process_step_runs')
      .select('id, process_step_id, status, started_at, completed_at, performed_by, location_id, notes')
      .eq('process_lot_run_id', id)

    if (stepRunsError) {
      run.step_runs = []
    } else {
      const rawStepRuns = (stepRunsData as StepRun[]) ?? []
      const stepIds = rawStepRuns.map((sr) => sr.process_step_id).filter(Boolean) as number[]
      const locationIds = rawStepRuns.map((sr) => sr.location_id).filter(Boolean) as number[]

      // Fetch process_steps separately (join can fail; separate queries are reliable)
      let processStepsMap = new Map<number, ProcessStep>()
      if (stepIds.length > 0) {
        const { data: stepsData, error: stepsError } = await supabase
          .from('process_steps')
          .select('id, seq, step_code, step_name')
          .in('id', stepIds)
        if (stepsError) {
          // Try with step_name_id if schema uses it
          const { data: stepsData2 } = await supabase
            .from('process_steps')
            .select('id, seq, step_name_id')
            .in('id', stepIds)
          const steps = (stepsData2 as { id: number; seq: number; step_name_id?: number }[]) ?? []
          const stepNameIds = steps.map((s) => s.step_name_id).filter((n): n is number => n != null && n > 0)
          let stepNamesMap = new Map<number, { code: string; name: string }>()
          if (stepNameIds.length > 0) {
            const { data: namesData } = await supabase
              .from('process_step_names')
              .select('id, code, name')
              .in('id', stepNameIds)
            ;(namesData ?? []).forEach((n: { id: number; code: string; name: string }) => {
              stepNamesMap.set(n.id, { code: n.code ?? '', name: n.name ?? '' })
            })
          }
          steps.forEach((s) => {
            const stepName = s.step_name_id ? stepNamesMap.get(s.step_name_id) : null
            processStepsMap.set(s.id, {
              id: s.id,
              seq: s.seq,
              step_code: stepName?.code ?? null,
              step_name: stepName?.name ?? null,
            })
          })
        } else {
          const steps = (stepsData as { id: number; seq: number; step_code?: string; step_name?: string }[]) ?? []
          steps.forEach((s) => {
            processStepsMap.set(s.id, {
              id: s.id,
              seq: s.seq,
              step_code: s.step_code ?? null,
              step_name: s.step_name ?? null,
            })
          })
        }
      }

      // Fetch locations (warehouses)
      let locationMap = new Map<number, { id: number; name: string }>()
      if (locationIds.length > 0) {
        const { data: locData } = await supabase
          .from('warehouses')
          .select('id, name')
          .in('id', locationIds)
        ;(locData ?? []).forEach((w: { id: number; name: string }) => locationMap.set(w.id, w))
      }

      run.step_runs = rawStepRuns.map((sr) => ({
        ...sr,
        process_steps: processStepsMap.get(sr.process_step_id) ?? null,
        location: sr.location_id ? locationMap.get(sr.location_id) ?? null : null,
      }))
      run.step_runs.sort((a, b) => (a.process_steps?.seq ?? 0) - (b.process_steps?.seq ?? 0))
    }

    setLotRun(run)

    // Fetch step-specific data for each step run
    const stepRunIds = run.step_runs?.map((sr) => sr.id) ?? []
    const codeByStepRunId = new Map<number, string>()
    run.step_runs?.forEach((sr) => {
      const code = sr.process_steps?.step_code?.toUpperCase() ?? ''
      codeByStepRunId.set(sr.id, code)
    })

    const next: StepDataMap = {}
    for (const stepRun of run.step_runs ?? []) {
      const code = codeByStepRunId.get(stepRun.id) ?? ''
      next[stepRun.id] = {}

      if (code === 'WASH') {
        const { data: wash } = await supabase
          .from('process_washing_runs')
          .select('*')
          .eq('process_step_run_id', stepRun.id)
          .maybeSingle()
        if (wash) {
          next[stepRun.id].washingRun = wash
          const { data: waste } = await supabase
            .from('process_washing_waste')
            .select('*')
            .eq('washing_run_id', wash.id)
          if (waste?.length) next[stepRun.id].washingWaste = waste
        }
      } else if (code === 'DRY') {
        const { data: dry } = await supabase
          .from('process_drying_runs')
          .select('*')
          .eq('process_step_run_id', stepRun.id)
          .maybeSingle()
        if (dry) next[stepRun.id].dryingRun = dry
      } else if (code === 'SORT') {
        const { data: outputs } = await supabase
          .from('process_sorting_outputs')
          .select('*, product:products(id, name, sku)')
          .eq('process_step_run_id', stepRun.id)
          .order('created_at', { ascending: false })
        if (outputs?.length) next[stepRun.id].sortingOutputs = outputs
        const outputIds = (outputs ?? []).map((o: { id: number }) => o.id)
        if (outputIds.length) {
          const { data: waste } = await supabase
            .from('process_sorting_waste')
            .select('*')
            .in('sorting_run_id', outputIds)
          if (waste?.length) next[stepRun.id].sortingWaste = waste
        }
      } else if (code === 'METAL') {
        const { data: metal } = await supabase
          .from('process_metal_detector')
          .select('*')
          .eq('process_step_run_id', stepRun.id)
          .maybeSingle()
        if (metal) next[stepRun.id].metalRun = metal
        const { data: rejections } = await supabase
          .from('process_metal_detector_rejections')
          .select('*')
          .eq('metal_detector_id', metal?.id ?? 0)
        if (rejections?.length) next[stepRun.id].metalRejections = rejections
      } else if (code === 'PACK') {
        const { data: pack } = await supabase
          .from('process_packaging_runs')
          .select('*')
          .eq('process_step_run_id', stepRun.id)
          .maybeSingle()
        if (pack) {
          next[stepRun.id].packagingRun = pack
          const [checks, photos, waste, entries] = await Promise.all([
            supabase.from('process_packaging_weight_checks').select('*').eq('packaging_run_id', pack.id),
            supabase.from('process_packaging_photos').select('*').eq('packaging_run_id', pack.id),
            supabase.from('process_packaging_waste').select('*').eq('packaging_run_id', pack.id),
            supabase
              .from('process_packaging_pack_entries')
              .select('*, sorting_output:process_sorting_outputs(*, product:products(id, name, sku))')
              .eq('packaging_run_id', pack.id)
              .order('created_at', { ascending: false }),
          ])
          if (checks.data?.length) next[stepRun.id].weightChecks = checks.data
          if (photos.data?.length) next[stepRun.id].photos = photos.data
          if (waste.data?.length) next[stepRun.id].packagingWaste = waste.data
          if (entries.data?.length) next[stepRun.id].packEntries = entries.data
        }
      }
    }
    setStepData(next)
    setLoading(false)
    // Expand first step by default so user sees content
    if (run.step_runs && run.step_runs.length > 0) {
      setExpandedSteps((prev) => new Set(prev).add(run.step_runs![0].id))
    }
  }, [id])

  useEffect(() => {
    fetchLotRun()
  }, [fetchLotRun])

  const toggleStep = (stepRunId: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepRunId)) next.delete(stepRunId)
      else next.add(stepRunId)
      return next
    })
  }

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return '—'
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
  }

  const getBatch = (run: LotRun | null) => {
    if (!run?.supply_batches) return null
    const b = run.supply_batches
    return Array.isArray(b) ? b[0] ?? null : b
  }

  const getProcess = (run: LotRun | null) => {
    if (!run?.processes) return null
    const p = run.processes
    return Array.isArray(p) ? p[0] ?? null : p
  }

  if (!Number.isFinite(id)) {
    return (
      <PageLayout title="Completed Process" activeItem="process">
        <Card>
          <CardContent className="py-8 text-center text-text-dark/60">
            Invalid process ID.
            <Button variant="link" className="ml-2" onClick={() => navigate('/process/completed')}>
              Back to list
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  if (loading) {
    return (
      <PageLayout title="Completed Process" activeItem="process">
        <div className="flex items-center justify-center py-20">
          <div className="h-10 w-10 border-2 border-olive border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    )
  }

  if (error || !lotRun) {
    return (
      <PageLayout title="Completed Process" activeItem="process">
        <Card className="border-red-200">
          <CardContent className="py-8 text-center">
            <p className="text-text-dark/70 mb-4">{error?.message ?? 'Process run not found.'}</p>
            <Button variant="outline" onClick={() => navigate('/process/completed')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to completed processes
            </Button>
          </CardContent>
        </Card>
      </PageLayout>
    )
  }

  const batch = getBatch(lotRun)
  const process = getProcess(lotRun)

  return (
    <PageLayout
      title={`Completed: ${batch?.lot_no ?? 'Process'} ${process?.name ? `– ${process.name}` : ''}`}
      activeItem="process"
      stickyHeader={false}
      contentClassName="py-8 space-y-6"
    >
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/process/completed')}
          className="text-text-dark/70 hover:text-text-dark"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to list
        </Button>
      </div>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-dark">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Process summary
          </CardTitle>
          <CardDescription>Lot and process information for this completed run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Lot</p>
              <p className="font-medium text-text-dark">{batch?.lot_no ?? '—'}</p>
              <p className="text-sm text-text-dark/60">{batch?.supplies?.doc_no ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Product</p>
              <p className="font-medium text-text-dark">{batch?.products?.name ?? '—'}</p>
              <p className="text-sm text-text-dark/60">{batch?.products?.sku ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Process</p>
              <p className="font-medium text-text-dark">{process?.name ?? '—'}</p>
              <p className="text-sm text-text-dark/60">{process?.code ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Quantity</p>
              <p className="font-medium text-text-dark">
                {batch?.current_qty != null ? `${batch.current_qty} ${batch?.units?.symbol ?? ''}` : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 pt-2 border-t border-olive-light/20">
            <div className="flex items-center gap-2 text-sm text-text-dark/70">
              <Clock className="h-4 w-4" />
              Started: {formatDateTime(lotRun.started_at)}
            </div>
            <div className="flex items-center gap-2 text-sm text-text-dark/70">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completed: {formatDateTime(lotRun.completed_at)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-dark">
            <Layers className="h-5 w-5" />
            Step details
          </CardTitle>
          <CardDescription>Expand each step to view recorded data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(lotRun.step_runs ?? []).map((stepRun) => {
            const code = stepRun.process_steps?.step_code?.toUpperCase() ?? ''
            const name = stepRun.process_steps?.step_name ?? stepRun.process_steps?.step_code ?? `Step ${stepRun.id}`
            const expanded = expandedSteps.has(stepRun.id)
            const data = stepData[stepRun.id] ?? {}

            return (
              <div key={stepRun.id} className="rounded-lg border border-olive-light/30 bg-olive-light/5 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleStep(stepRun.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-olive-light/10 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 text-text-dark/60" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-dark/60" />
                    )}
                    <span className="font-medium text-text-dark">{name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">
                      {stepRun.status}
                    </span>
                  </div>
                  <span className="text-sm text-text-dark/50">
                    {formatDateTime(stepRun.started_at)} → {formatDateTime(stepRun.completed_at)}
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-olive-light/20 bg-white px-4 py-4 space-y-4">
                    {stepRun.notes && (
                      <p className="text-sm text-text-dark/70"><strong>Notes:</strong> {stepRun.notes}</p>
                    )}
                    {code === 'WASH' && data.washingRun && (
                      <div className="text-sm space-y-2">
                        <p className="font-medium text-text-dark">Washing run</p>
                        <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-40">
                          {JSON.stringify(data.washingRun, null, 2)}
                        </pre>
                        {Array.isArray(data.washingWaste) && (data.washingWaste as unknown[]).length > 0 && (
                          <>
                            <p className="font-medium text-text-dark mt-2">Waste</p>
                            <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-32">
                              {JSON.stringify(data.washingWaste, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                    {code === 'DRY' && data.dryingRun && (
                      <div className="text-sm">
                        <p className="font-medium text-text-dark">Drying run</p>
                        <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-40">
                          {JSON.stringify(data.dryingRun, null, 2)}
                        </pre>
                      </div>
                    )}
                    {code === 'SORT' && Array.isArray(data.sortingOutputs) && (
                      <div className="text-sm space-y-2">
                        <p className="font-medium text-text-dark">Sorting outputs (WIPs)</p>
                        <ul className="list-disc list-inside space-y-1">
                          {(data.sortingOutputs as { product?: { name?: string }; quantity_kg: number }[]).map((o: { id: number; product?: { name?: string }; quantity_kg: number }, i: number) => (
                            <li key={o.id ?? i}>
                              {o.product?.name ?? 'Product'}: {o.quantity_kg} kg
                            </li>
                          ))}
                        </ul>
                        {Array.isArray(data.sortingWaste) && (data.sortingWaste as unknown[]).length > 0 && (
                          <>
                            <p className="font-medium text-text-dark mt-2">Sorting waste</p>
                            <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-24">
                              {JSON.stringify(data.sortingWaste, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                    {code === 'METAL' && data.metalRun && (
                      <div className="text-sm space-y-2">
                        <p className="font-medium text-text-dark">Metal detection</p>
                        <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-32">
                          {JSON.stringify(data.metalRun, null, 2)}
                        </pre>
                        {Array.isArray(data.metalRejections) && (data.metalRejections as unknown[]).length > 0 && (
                          <>
                            <p className="font-medium text-text-dark mt-2">Rejections</p>
                            <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-24">
                              {JSON.stringify(data.metalRejections, null, 2)}
                            </pre>
                          </>
                        )}
                      </div>
                    )}
                    {code === 'PACK' && data.packagingRun && (
                      <div className="text-sm space-y-3">
                        <p className="font-medium text-text-dark">Packaging run</p>
                        <pre className="text-xs bg-olive-light/10 p-3 rounded overflow-auto max-h-32">
                          {JSON.stringify(data.packagingRun, null, 2)}
                        </pre>
                        {Array.isArray(data.weightChecks) && (data.weightChecks as unknown[]).length > 0 && (
                          <div>
                            <p className="font-medium text-text-dark">Weight checks</p>
                            <ul className="list-disc list-inside">
                              {(data.weightChecks as { check_no: number; weight_kg: number }[]).map((c, i) => (
                                <li key={i}>Check {c.check_no}: {c.weight_kg} kg</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(data.packEntries) && (data.packEntries as unknown[]).length > 0 && (
                          <div>
                            <p className="font-medium text-text-dark flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              Pack entries
                            </p>
                            <ul className="space-y-1">
                              {(data.packEntries as { pack_identifier: string; quantity_kg: number; sorting_output?: { product?: { name?: string } } }[]).map((e, i) => (
                                <li key={i} className="text-sm">
                                  {e.sorting_output?.product?.name ?? 'WIP'} → <strong>{e.pack_identifier}</strong>: {e.quantity_kg} kg
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(data.packagingWaste) && (data.packagingWaste as unknown[]).length > 0 && (
                          <div>
                            <p className="font-medium text-text-dark">Packaging waste</p>
                            <ul className="list-disc list-inside">
                              {(data.packagingWaste as { waste_type: string; quantity_kg: number }[]).map((w, i) => (
                                <li key={i}>{w.waste_type}: {w.quantity_kg} kg</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    {!['WASH', 'DRY', 'SORT', 'METAL', 'PACK'].includes(code) && (
                      <p className="text-sm text-text-dark/50">No step-specific data for this step.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {(lotRun.step_runs?.length ?? 0) === 0 && (
            <p className="text-sm text-text-dark/50 py-4">No step runs recorded.</p>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default CompletedProcessDetail
