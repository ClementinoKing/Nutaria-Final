import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface StepRunRow {
  id: number
  seq: number
  step_code: string
  step_name: string
  status: string
  started_at: string | null
  completed_at: string | null
}

function CompletedProcessDetail() {
  const { lotRunId } = useParams<{ lotRunId: string }>()
  const [lotNo, setLotNo] = useState<string | null>(null)
  const [productName, setProductName] = useState<string | null>(null)
  const [processName, setProcessName] = useState<string | null>(null)
  const [processCode, setProcessCode] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [stepRuns, setStepRuns] = useState<StepRunRow[]>([])
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
      const batchSingle = Array.isArray(batch) ? batch[0] : batch
      const processSingle = Array.isArray(process) ? process[0] : process
      setLotNo(batchSingle?.lot_no ?? null)
      setProductName(batchSingle?.products?.name ?? null)
      setProcessName(processSingle?.name ?? null)
      setProcessCode(processSingle?.code ?? null)
      setStartedAt((lotRun as any).started_at ?? null)
      setCompletedAt((lotRun as any).completed_at ?? null)

      const { data: stepRunsData, error: stepRunsError } = await supabase
        .from('process_step_runs')
        .select('id, process_step_id, status, started_at, completed_at')
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
          }))
        )
        setLoading(false)
        return
      }

      const { data: stepsData } = await supabase
        .from('process_steps')
        .select('id, seq, step_name_id')
        .in('id', stepIds)

      const stepsList = (stepsData ?? []) as Array<{
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
      const rows: StepRunRow[] = runs.map((r) => {
        const step = stepsById.get(r.process_step_id)
        const stepNameFromId = step?.step_name_id ? stepNamesMap.get(step.step_name_id) : null
        return {
          id: r.id,
          seq: step?.seq ?? 0,
          step_code: stepNameFromId?.code ?? '',
          step_name: stepNameFromId?.name ?? `Step`,
          status: r.status,
          started_at: r.started_at,
          completed_at: r.completed_at,
        }
      })
      rows.sort((a, b) => a.seq - b.seq)
      setStepRuns(rows)
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
                {lotNo ?? 'Lot'} {productName ? `· ${productName}` : ''}
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
                <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                  <div>
                    <span className="font-medium text-text-dark">
                      {step.step_name || step.step_code || `Step ${step.seq}`}
                    </span>
                    {step.step_code ? (
                      <span className="ml-2 text-xs text-text-dark/60">({step.step_code})</span>
                    ) : null}
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
