import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { supabase } from '@/lib/supabaseClient'
import {
  createProcessRunWithLots,
  deleteProcessLotRun,
  getActiveGlobalMetalDetectorSession,
  getDefaultProcessForProduct,
  startGlobalMetalDetectorSession,
  stopGlobalMetalDetectorSession,
} from '@/lib/processExecution'
import { formatSecondsToHms } from '@/lib/metalDetectorTimer'
import { useAuth } from '@/context/AuthContext'

interface Lot {
  id: number
  lot_no: string
  product_id: number
  received_qty: number
  current_qty: number
  process_status: string
  supplies?: {
    doc_no?: string
  } | null
  products?: {
    name?: string
    sku?: string
  } | null
  units?: {
    symbol?: string
  } | null
}

interface CurrentProcessingRun {
  id: number
  process_name: string
  process_code: string
  is_rework: boolean
  lot_summary: string
  lot_count: number
  total_qty: number
  unit_symbol: string
  started_at: string | null
}

function ProcessSteps() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { lots, loading: loadingDefinitions, error: definitionsError } = useProcessDefinitions()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedLotIds, setSelectedLotIds] = useState<number[]>([])
  const [startingProcess, setStartingProcess] = useState(false)
  const [startingMetalChecks, setStartingMetalChecks] = useState(false)
  const [activeMetalSession, setActiveMetalSession] = useState<{ ends_at: string } | null>(null)
  const [processingRuns, setProcessingRuns] = useState<CurrentProcessingRun[]>([])
  const [loadingProcessingRuns, setLoadingProcessingRuns] = useState(false)
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const selectableLots = useMemo(
    () => (lots as Lot[]).filter((lot) => (lot.process_status ?? '').toUpperCase() === 'UNPROCESSED'),
    [lots]
  )

  const allLots = useMemo(
    () =>
      [...(lots as Lot[])].sort((a, b) => {
        const statusA = (a.process_status ?? '').toUpperCase()
        const statusB = (b.process_status ?? '').toUpperCase()
        if (statusA !== statusB) return statusA.localeCompare(statusB)
        return (a.lot_no ?? '').localeCompare(b.lot_no ?? '')
      }),
    [lots]
  )

  const selectedLots = useMemo(
    () => selectableLots.filter((lot) => selectedLotIds.includes(lot.id)),
    [selectableLots, selectedLotIds]
  )

  const selectedLotsTotalKg = useMemo(
    () => selectedLots.reduce((sum, lot) => sum + (Number(lot.current_qty ?? lot.received_qty) || 0), 0),
    [selectedLots]
  )

  const metalRemainingSeconds = useMemo(() => {
    if (!activeMetalSession?.ends_at) return 0
    return Math.max(0, Math.ceil((new Date(activeMetalSession.ends_at).getTime() - nowMs) / 1000))
  }, [activeMetalSession, nowMs])

  const loadActiveSession = async () => {
    const activeSession = await getActiveGlobalMetalDetectorSession()
    if (!activeSession) {
      setActiveMetalSession(null)
      return
    }
    setActiveMetalSession({ ends_at: activeSession.ends_at })
  }

  const loadProcessingRuns = useCallback(async () => {
    setLoadingProcessingRuns(true)
    const { data, error } = await supabase
      .from('process_lot_runs')
      .select(`
          id,
          process_id,
          is_rework,
          started_at,
          primary_supply_batch:supply_batch_id (
            lot_no,
            current_qty,
            received_qty,
            units:unit_id (
              symbol
            )
          ),
          processes:process_id (
            name,
            code
          ),
          process_lot_run_batches (
            supply_batches:supply_batch_id (
              lot_no,
              current_qty,
              received_qty,
              units:unit_id (
                symbol
              )
            )
          )
        `)
      .eq('status', 'IN_PROGRESS')
      .order('started_at', { ascending: false })

    if (error) {
      setProcessingRuns([])
      setLoadingProcessingRuns(false)
      return
    }

    const byRunId = new Map<number, CurrentProcessingRun>()

    ;((data || []) as any[]).forEach((row) => {
      const runId = Number(row.id)
      if (!Number.isFinite(runId)) return
      const process = Array.isArray(row.processes) ? row.processes[0] : row.processes
      const runLots = (row.process_lot_run_batches || [])
        .map((item: any) => (Array.isArray(item.supply_batches) ? item.supply_batches[0] : item.supply_batches))
        .filter((item: any) => item?.lot_no)
      const primaryLot = Array.isArray(row.primary_supply_batch) ? row.primary_supply_batch[0] : row.primary_supply_batch
      const lots = runLots.length > 0 ? runLots : (primaryLot?.lot_no ? [primaryLot] : [])
      const runLotCount = lots.length || 1
      const totalQty = lots.reduce((sum: number, lot: any) => sum + (Number(lot?.current_qty ?? lot?.received_qty) || 0), 0)
      const unitSymbol = lots.find((lot: any) => lot?.units?.symbol)?.units?.symbol ?? 'kg'

      byRunId.set(runId, {
        id: runId,
        process_name: process?.name ?? 'Unknown process',
        process_code: process?.code ?? '—',
        is_rework: row.is_rework === true,
        lot_summary:
          row.is_rework === true
            ? runLotCount > 1
              ? `Rework combined lots (${runLotCount})`
              : `Rework lot (${lots[0]?.lot_no ?? 'Unknown lot'})`
            : runLotCount > 1
              ? `Combined lots (${runLotCount})`
              : (lots[0]?.lot_no ?? 'Unknown lot'),
        lot_count: runLotCount,
        total_qty: totalQty,
        unit_symbol: unitSymbol,
        started_at: row.started_at ?? null,
      })
    })

    setProcessingRuns(Array.from(byRunId.values()))
    setLoadingProcessingRuns(false)
  }, [])

  useEffect(() => {
    loadActiveSession().catch(() => undefined)
    loadProcessingRuns().catch(() => undefined)
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    const refreshId = window.setInterval(() => {
      loadActiveSession().catch(() => undefined)
      loadProcessingRuns().catch(() => undefined)
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
      window.clearInterval(refreshId)
    }
  }, [loadProcessingRuns])

  const handleDeleteRun = async (runId: number) => {
    const confirmed = window.confirm('Delete this process run? Linked lots will be set back to UNPROCESSED.')
    if (!confirmed) return

    setDeletingRunId(runId)
    try {
      await deleteProcessLotRun(runId)
      toast.success('Process run deleted')
      await loadProcessingRuns()
    } catch (error) {
      console.error('Failed to delete process run:', error)
      const message = error instanceof Error ? error.message : 'Failed to delete process run'
      toast.error(message)
    } finally {
      setDeletingRunId(null)
    }
  }

  const toggleLot = (lotId: number, checked: boolean) => {
    setSelectedLotIds((prev) => {
      if (checked) {
        if (prev.includes(lotId)) return prev
        return [...prev, lotId]
      }
      return prev.filter((id) => id !== lotId)
    })
  }

  const handleStartProcess = async () => {
    if (selectedLots.length === 0) {
      toast.error('Select at least one lot to start process')
      return
    }

    setStartingProcess(true)
    try {
      const uniqueProductIds = Array.from(new Set(selectedLots.map((lot) => lot.product_id)))
      const processIdEntries = await Promise.all(
        uniqueProductIds.map(async (productId) => ({
          productId,
          processId: await getDefaultProcessForProduct(productId),
        }))
      )

      const processByProduct = new Map(processIdEntries.map((entry) => [entry.productId, entry.processId]))
      const selectedProcessIds = selectedLots
        .map((lot) => processByProduct.get(lot.product_id))
        .filter((id): id is number => typeof id === 'number')

      if (selectedProcessIds.length !== selectedLots.length) {
        toast.error('One or more selected lots have no process assigned')
        return
      }

      if (new Set(selectedProcessIds).size > 1) {
        toast.error('Selected lots must resolve to the same process')
        return
      }

      const lotRun = await createProcessRunWithLots(selectedLots.map((lot) => lot.id))
      toast.success('Process run started')
      navigate(`/process/process-steps/run/${lotRun.id}`)
    } catch (error) {
      console.error('Failed to start process run:', error)
      const message = error instanceof Error ? error.message : 'Failed to start process run'
      toast.error(message)
    } finally {
      setStartingProcess(false)
    }
  }

  const handleStartMetalChecks = async () => {
    setStartingMetalChecks(true)
    try {
      const session = await startGlobalMetalDetectorSession({
        durationMinutes: 60,
        startedBy: user?.id ?? null,
      })
      setActiveMetalSession({ ends_at: session.ends_at })
      toast.success('Metal detector checks started (global)')
    } catch (error) {
      console.error('Failed to start metal checks:', error)
      toast.error('Failed to start metal detector checks')
    } finally {
      setStartingMetalChecks(false)
    }
  }

  const handleStopMetalChecks = async () => {
    try {
      await stopGlobalMetalDetectorSession(user?.id ?? null)
      setActiveMetalSession(null)
      toast.success('Metal detector checks stopped')
    } catch (error) {
      console.error('Failed to stop metal checks:', error)
      toast.error('Failed to stop metal detector checks')
    }
  }

  return (
    <PageLayout title="Process Steps" activeItem="process" stickyHeader={false} contentClassName="py-8 space-y-6">
      {definitionsError && (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <CardContent className="py-4">We could not load process definitions. Please refresh.</CardContent>
        </Card>
      )}

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Start Process</CardTitle>
          <CardDescription>
            Start a shared process run, select multiple lots (same process), and start global metal detector checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {!selectionMode ? (
              <Button onClick={() => setSelectionMode(true)}>Start Process</Button>
            ) : (
              <>
                <Button onClick={handleStartProcess} disabled={startingProcess || selectedLotIds.length === 0}>
                  {startingProcess ? 'Starting...' : `Start Process (${selectedLotIds.length})`}
                </Button>
                <Button variant="outline" onClick={() => setSelectionMode(false)} disabled={startingProcess}>
                  Cancel
                </Button>
              </>
            )}

            {!activeMetalSession || metalRemainingSeconds === 0 ? (
              <Button variant="outline" onClick={handleStartMetalChecks} disabled={startingMetalChecks}>
                {startingMetalChecks ? 'Starting...' : 'Start Metal Detector Checks'}
              </Button>
            ) : (
              <Button variant="outline" onClick={handleStopMetalChecks}>
                Stop Metal Checks ({formatSecondsToHms(metalRemainingSeconds)})
              </Button>
            )}
          </div>

          {selectionMode && (
            <div className="space-y-3">
              {selectedLots.length > 0 && (
                <div className="rounded-md border border-olive-light/40 bg-olive-light/10 p-3">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">Selected lots</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedLots.map((lot) => (
                          <span
                            key={`selected-${lot.id}`}
                            className="inline-flex items-center rounded-full border border-olive-light/50 bg-white px-3 py-1 text-xs text-text-dark/80"
                          >
                            {lot.lot_no}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-left md:text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Total combined</p>
                      <p className="text-2xl font-bold text-text-dark">{selectedLotsTotalKg.toFixed(2)} kg</p>
                    </div>
                  </div>
                </div>
              )}

              {loadingDefinitions ? (
                <p className="text-sm text-text-dark/60">Loading lots...</p>
              ) : allLots.length === 0 ? (
                <p className="text-sm text-text-dark/60">No lots available.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {allLots.map((lot) => {
                    const checked = selectedLotIds.includes(lot.id)
                    const isSelectable = (lot.process_status ?? '').toUpperCase() === 'UNPROCESSED'
                    return (
                      <div key={lot.id} className="rounded-md border border-olive-light/40 p-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!isSelectable}
                            onChange={(event) => toggleLot(lot.id, event.target.checked)}
                            aria-label={`Select ${lot.lot_no}`}
                            className="mt-0.5 h-4 w-4 accent-olive"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-text-dark">{lot.lot_no}</p>
                            <p className="text-xs text-text-dark/60">{lot.supplies?.doc_no ?? 'Unknown document'}</p>
                            <p className="text-xs text-text-dark/70">
                              {lot.products?.name ?? 'Unnamed product'} ({lot.products?.sku ?? 'N/A'})
                            </p>
                            <p className="text-xs text-text-dark/70">
                              Qty: {lot.current_qty ?? lot.received_qty ?? '—'} {lot.units?.symbol ?? ''}
                            </p>
                            <p className="text-xs text-text-dark/60">
                              Status: {(lot.process_status ?? 'UNKNOWN').toUpperCase()}
                            </p>
                            {!isSelectable && (
                              <p className="text-xs text-amber-700">Not selectable (already in processing flow)</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Current Processing Runs</CardTitle>
          <CardDescription>Active process runs currently in progress.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingProcessingRuns ? (
            <p className="text-sm text-text-dark/60">Loading current processing runs...</p>
          ) : processingRuns.length === 0 ? (
            <p className="text-sm text-text-dark/60">No active processing runs.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {processingRuns.map((run) => (
                <div key={run.id} className="rounded-md border border-olive-light/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-dark">
                        {run.process_name} <span className="text-text-dark/60">({run.process_code})</span>
                      </p>
                      <p className="text-xs text-text-dark/70">
                        Type:{' '}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            run.is_rework
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-olive-light/30 text-olive-dark'
                          }`}
                        >
                          {run.is_rework ? 'REWORK' : 'STANDARD'}
                        </span>
                      </p>
                      <p className="text-xs text-text-dark/70">Lots: {run.lot_summary}</p>
                      <p className="text-xs text-text-dark/70">
                        Total Qty: {run.total_qty.toFixed(2)} {run.unit_symbol}
                      </p>
                      <p className="text-xs text-text-dark/60">
                        Started: {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/process/process-steps/run/${run.id}`)}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteRun(run.id)}
                      disabled={deletingRunId === run.id}
                    >
                      {deletingRunId === run.id ? 'Deleting...' : 'Delete Run'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default ProcessSteps
