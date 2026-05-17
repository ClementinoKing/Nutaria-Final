import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'
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
import { Eye, Search, Trash2, X } from 'lucide-react'

interface Lot {
  id: number
  lot_no: string
  product_id: number
  received_qty: number
  current_qty: number
  process_status: string
  supplies?: {
    doc_no?: string
    category_code?: 'PRODUCT' | 'SERVICE' | string | null
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
  product_summary: string
  lot_count: number
  total_qty: number
  unit_symbol: string
  started_at: string | null
}

function ProcessSteps() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { lots, loading: loadingDefinitions, error: definitionsError, refresh: refreshProcessDefinitions } = useProcessDefinitions()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedLotIds, setSelectedLotIds] = useState<number[]>([])
  const [selectedLotQuantities, setSelectedLotQuantities] = useState<Record<number, string>>({})
  const [lotSearchQuery, setLotSearchQuery] = useState('')
  const [lotStatusFilter, setLotStatusFilter] = useState('all')
  const [lotProductFilter, setLotProductFilter] = useState('all')
  const [factoryProcessFilter, setFactoryProcessFilter] = useState('all')
  const [showSelectableLotsOnly, setShowSelectableLotsOnly] = useState(false)
  const [startingProcess, setStartingProcess] = useState(false)
  const [startingMetalChecks, setStartingMetalChecks] = useState(false)
  const [activeMetalSession, setActiveMetalSession] = useState<{ ends_at: string } | null>(null)
  const [processingRuns, setProcessingRuns] = useState<CurrentProcessingRun[]>([])
  const [processingRunSearchQuery, setProcessingRunSearchQuery] = useState('')
  const [processingRunTypeFilter, setProcessingRunTypeFilter] = useState('all')
  const [processingRunProcessFilter, setProcessingRunProcessFilter] = useState('all')
  const [processingRunLotCountFilter, setProcessingRunLotCountFilter] = useState('all')
  const [loadingProcessingRuns, setLoadingProcessingRuns] = useState(false)
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [productIdsWithFactoryProcess, setProductIdsWithFactoryProcess] = useState<number[]>([])

  const selectableLots = useMemo(
    () =>
      (lots as Lot[]).filter(
        (lot) => (lot.process_status ?? '').toUpperCase() === 'UNPROCESSED' && (Number(lot.current_qty ?? lot.received_qty) || 0) > 0
      ),
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

  const lotStatusOptions = useMemo(
    () =>
      Array.from(new Set(allLots.map((lot) => (lot.process_status ?? 'UNKNOWN').toUpperCase()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [allLots]
  )

  const lotProductOptions = useMemo(
    () =>
      Array.from(
        new Map(
          allLots
            .map((lot) => {
              const productName = lot.products?.name ?? 'Unnamed product'
              const sku = lot.products?.sku ? ` (${lot.products.sku})` : ''
              return [String(lot.product_id), `${productName}${sku}`] as const
            })
            .sort((a, b) => a[1].localeCompare(b[1]))
        ).entries()
      ),
    [allLots]
  )

  const filteredLots = useMemo(() => {
    const searchTerm = lotSearchQuery.trim().toLowerCase()

    return allLots.filter((lot) => {
      const availableQty = Number(lot.current_qty ?? lot.received_qty) || 0
      const status = (lot.process_status ?? 'UNKNOWN').toUpperCase()
      const isSelectable = status === 'UNPROCESSED' && availableQty > 0
      const matchesSelectable = !showSelectableLotsOnly || isSelectable
      const matchesStatus = lotStatusFilter === 'all' || status === lotStatusFilter
      const matchesProduct = lotProductFilter === 'all' || String(lot.product_id) === lotProductFilter
      const hasFactoryProcess = productIdsWithFactoryProcess.includes(lot.product_id)
      const matchesFactoryProcess =
        factoryProcessFilter === 'all' ||
        (factoryProcessFilter === 'assigned' && hasFactoryProcess) ||
        (factoryProcessFilter === 'not_assigned' && !hasFactoryProcess)
      const searchableText = [
        lot.lot_no,
        lot.supplies?.doc_no,
        lot.products?.name,
        lot.products?.sku,
        status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = searchTerm.length === 0 || searchableText.includes(searchTerm)

      return matchesSelectable && matchesStatus && matchesProduct && matchesFactoryProcess && matchesSearch
    })
  }, [allLots, factoryProcessFilter, lotProductFilter, lotSearchQuery, lotStatusFilter, productIdsWithFactoryProcess, showSelectableLotsOnly])

  const selectedLots = useMemo(
    () => selectableLots.filter((lot) => selectedLotIds.includes(lot.id)),
    [selectableLots, selectedLotIds]
  )

  const selectedLotsTotalKg = useMemo(
    () => selectedLots.reduce((sum, lot) => sum + (Number(selectedLotQuantities[lot.id]) || 0), 0),
    [selectedLots, selectedLotQuantities]
  )

  const hasInvalidSelectedQuantity = useMemo(
    () =>
      selectedLots.some((lot) => {
        const quantity = Number(selectedLotQuantities[lot.id])
        const availableQty = Number(lot.current_qty ?? lot.received_qty) || 0
        return !Number.isFinite(quantity) || quantity <= 0 || quantity > availableQty
      }),
    [selectedLots, selectedLotQuantities]
  )

  const processingRunProcessOptions = useMemo(
    () =>
      Array.from(
        new Map(
          processingRuns
            .map((run) => [`${run.process_code}::${run.process_name}`, `${run.process_name} (${run.process_code})`] as const)
            .sort((a, b) => a[1].localeCompare(b[1]))
        ).entries()
      ),
    [processingRuns]
  )

  const filteredProcessingRuns = useMemo(() => {
    const searchTerm = processingRunSearchQuery.trim().toLowerCase()

    return processingRuns.filter((run) => {
      const runType = run.is_rework ? 'rework' : 'standard'
      const processKey = `${run.process_code}::${run.process_name}`
      const lotCountGroup = run.lot_count > 1 ? 'combined' : 'single'
      const matchesType = processingRunTypeFilter === 'all' || processingRunTypeFilter === runType
      const matchesProcess = processingRunProcessFilter === 'all' || processingRunProcessFilter === processKey
      const matchesLotCount = processingRunLotCountFilter === 'all' || processingRunLotCountFilter === lotCountGroup
      const searchableText = [
        run.process_name,
        run.process_code,
        run.lot_summary,
        run.product_summary,
        runType,
        `${run.total_qty}`,
        run.unit_symbol,
        run.started_at ? new Date(run.started_at).toLocaleString() : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = searchTerm.length === 0 || searchableText.includes(searchTerm)

      return matchesType && matchesProcess && matchesLotCount && matchesSearch
    })
  }, [processingRunLotCountFilter, processingRunProcessFilter, processingRuns, processingRunSearchQuery, processingRunTypeFilter])

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
            allocated_qty,
            supply_batches:supply_batch_id (
              lot_no,
              current_qty,
              received_qty,
              products:product_id (
                name,
                sku
              ),
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
        .map((item: any) => ({
          ...(Array.isArray(item.supply_batches) ? item.supply_batches[0] : item.supply_batches),
          allocated_qty: Number(item.allocated_qty) || 0,
        }))
        .filter((item: any) => item?.lot_no)
      const primaryLot = Array.isArray(row.primary_supply_batch) ? row.primary_supply_batch[0] : row.primary_supply_batch
      const lots = runLots.length > 0 ? runLots : (primaryLot?.lot_no ? [primaryLot] : [])
      const runLotCount = lots.length || 1
      const totalQty = lots.reduce((sum: number, lot: any) => sum + (Number(lot?.allocated_qty ?? lot?.current_qty ?? lot?.received_qty) || 0), 0)
      const unitSymbol = lots.find((lot: any) => lot?.units?.symbol)?.units?.symbol ?? 'kg'
      const productSummary = Array.from(
        new Set(
          lots
            .map((lot: any) => {
              const name = lot?.products?.name
              if (!name) return null
              return lot?.products?.sku ? `${name} (${lot.products.sku})` : name
            })
            .filter((value: string | null): value is string => Boolean(value))
        )
      ).join(', ')

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
        product_summary: productSummary || 'Unknown product',
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
  }, [loadProcessingRuns])

  useEffect(() => {
    const loadProductProcessAssignments = async () => {
      const uniqueProductIds = Array.from(new Set((lots as Lot[]).map((lot) => Number(lot.product_id)).filter((id) => Number.isInteger(id) && id > 0)))
      if (uniqueProductIds.length === 0) {
        setProductIdsWithFactoryProcess([])
        return
      }

      const { data, error } = await supabase
        .from('product_processes')
        .select('product_id')
        .in('product_id', uniqueProductIds)

      if (error) {
        setProductIdsWithFactoryProcess([])
        return
      }

      const assignedIds = Array.from(
        new Set(
          ((data ?? []) as Array<{ product_id: number | null }>)
            .map((row) => Number(row.product_id))
            .filter((id) => Number.isInteger(id) && id > 0)
        )
      )
      setProductIdsWithFactoryProcess(assignedIds)
    }

    loadProductProcessAssignments().catch(() => {
      setProductIdsWithFactoryProcess([])
    })
  }, [lots])

  useEffect(() => {
    if (!activeMetalSession) return
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [activeMetalSession])

  useEffect(() => {
    const refreshId = window.setInterval(() => {
      loadActiveSession().catch(() => undefined)
    }, 15000)
    return () => {
      window.clearInterval(refreshId)
    }
  }, [])

  const handleDeleteRun = async (runId: number) => {
    const confirmed = window.confirm('Delete this process run? Linked lots will be set back to UNPROCESSED.')
    if (!confirmed) return

    setDeletingRunId(runId)
    try {
      await deleteProcessLotRun(runId)
      toast.success('Process run deleted')
      await loadProcessingRuns()
      await refreshProcessDefinitions()
    } catch (error) {
      console.error('Failed to delete process run:', error)
      const message = error instanceof Error ? error.message : 'Failed to delete process run'
      toast.error(message)
    } finally {
      setDeletingRunId(null)
    }
  }

  const toggleLot = (lotId: number, checked: boolean) => {
    if (checked) {
      const lot = selectableLots.find((item) => item.id === lotId)
      const availableQty = Number(lot?.current_qty ?? lot?.received_qty) || 0
      setSelectedLotQuantities((quantities) => ({
        ...quantities,
        [lotId]: availableQty > 0 ? String(availableQty) : '',
      }))
    } else {
      setSelectedLotQuantities((quantities) => {
        const next = { ...quantities }
        delete next[lotId]
        return next
      })
    }

    setSelectedLotIds((prev) => {
      if (checked) {
        if (prev.includes(lotId)) return prev
        return [...prev, lotId]
      }
      return prev.filter((id) => id !== lotId)
    })
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelectedLotIds([])
    setSelectedLotQuantities({})
  }

  const resetLotFilters = () => {
    setLotSearchQuery('')
    setLotStatusFilter('all')
    setLotProductFilter('all')
    setFactoryProcessFilter('all')
    setShowSelectableLotsOnly(false)
  }

  const resetProcessingRunFilters = () => {
    setProcessingRunSearchQuery('')
    setProcessingRunTypeFilter('all')
    setProcessingRunProcessFilter('all')
    setProcessingRunLotCountFilter('all')
  }

  const updateSelectedLotQuantity = (lotId: number, value: string) => {
    setSelectedLotQuantities((prev) => ({
      ...prev,
      [lotId]: value,
    }))
  }

  const handleStartProcess = async () => {
    if (selectedLots.length === 0) {
      toast.error('Select at least one lot to start process')
      return
    }

    if (hasInvalidSelectedQuantity) {
      toast.error('Enter a valid process quantity for every selected lot.')
      return
    }

    setStartingProcess(true)
    try {
      const uniqueProductIds = Array.from(new Set(selectedLots.map((lot) => lot.product_id)))

      const { data: chainMembersData, error: chainMembersError } = await supabase
        .from('product_processing_chain_members')
        .select('product_id, chain_id')
        .in('product_id', uniqueProductIds)

      if (chainMembersError) {
        throw chainMembersError
      }

      const chainIdsByProductId = new Map<number, Set<number>>()
      ;((chainMembersData ?? []) as Array<{ product_id: number; chain_id: number }>).forEach((row) => {
        if (!chainIdsByProductId.has(row.product_id)) {
          chainIdsByProductId.set(row.product_id, new Set<number>())
        }
        chainIdsByProductId.get(row.product_id)!.add(row.chain_id)
      })

      for (const productId of uniqueProductIds) {
        const chainIds = chainIdsByProductId.get(productId)
        if (!chainIds || chainIds.size === 0) {
          toast.error('Each selected lot product must be linked to a processing chain.')
          return
        }
      }

      const selectedChainIdSets = uniqueProductIds
        .map((productId) => chainIdsByProductId.get(productId))
        .filter((chainIds): chainIds is Set<number> => Boolean(chainIds))

      const sharedChainIds = selectedChainIdSets.reduce<number[]>((sharedIds, chainIds, index) => {
        const currentIds = Array.from(chainIds)
        if (index === 0) return currentIds
        return sharedIds.filter((chainId) => chainIds.has(chainId))
      }, [])

      if (sharedChainIds.length === 0) {
        toast.error('Selected lots must belong to the same processing chain.')
        return
      }

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

      const lotRun = await createProcessRunWithLots(
        selectedLots.map((lot) => ({
          lotId: lot.id,
          quantity: Number(selectedLotQuantities[lot.id]),
        }))
      )
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
          <CardContent className="py-4">
            <div className="font-medium">We could not load process definitions.</div>
            <div className="mt-1 text-sm">
              {getUserFriendlyErrorMessage(definitionsError, 'Please refresh the page and try again.')}
            </div>
          </CardContent>
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
                <Button onClick={handleStartProcess} disabled={startingProcess || selectedLotIds.length === 0 || hasInvalidSelectedQuantity}>
                  {startingProcess ? 'Starting...' : `Start Process (${selectedLotIds.length})`}
                </Button>
                <Button variant="outline" onClick={cancelSelection} disabled={startingProcess}>
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Total allocated</p>
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
                <>
                  <div className="rounded-xl border border-olive-light/30 bg-cream/40 p-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.65fr)_minmax(220px,0.85fr)_minmax(200px,0.75fr)_auto] lg:items-end">
                      <div className="space-y-1.5">
                        <label htmlFor="lot-search" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          Search lots
                        </label>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
                          <Input
                            id="lot-search"
                            value={lotSearchQuery}
                            onChange={(event) => setLotSearchQuery(event.target.value)}
                            placeholder="Search lot, supply document, product, SKU..."
                            className="pl-9"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="lot-status-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          Status
                        </label>
                        <select
                          id="lot-status-filter"
                          value={lotStatusFilter}
                          onChange={(event) => setLotStatusFilter(event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="all">All statuses</option>
                          {lotStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="lot-product-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          Product
                        </label>
                        <select
                          id="lot-product-filter"
                          value={lotProductFilter}
                          onChange={(event) => setLotProductFilter(event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="all">All products</option>
                          {lotProductOptions.map(([productId, label]) => (
                            <option key={productId} value={productId}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="lot-factory-process-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          Factory Process
                        </label>
                        <select
                          id="lot-factory-process-filter"
                          value={factoryProcessFilter}
                          onChange={(event) => setFactoryProcessFilter(event.target.value)}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="all">All assignments</option>
                          <option value="assigned">Assigned</option>
                          <option value="not_assigned">Not assigned</option>
                        </select>
                      </div>

                      <Button type="button" variant="outline" onClick={resetLotFilters} className="gap-2">
                        <X className="h-4 w-4" />
                        Reset
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-text-dark/75">
                        <input
                          type="checkbox"
                          checked={showSelectableLotsOnly}
                          onChange={(event) => setShowSelectableLotsOnly(event.target.checked)}
                          className="h-4 w-4 rounded border-olive-light/50 accent-olive"
                        />
                        Show selectable lots only
                      </label>
                      <p className="text-xs font-medium text-text-dark/55">
                        Showing {filteredLots.length} of {allLots.length} lots
                      </p>
                    </div>
                  </div>

                  {filteredLots.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-olive-light/40 bg-white p-6 text-center">
                      <p className="text-sm font-semibold text-text-dark">No lots match these filters.</p>
                      <p className="mt-1 text-xs text-text-dark/60">Adjust the search, status, product, or selectable-only filter.</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {filteredLots.map((lot) => {
                    const checked = selectedLotIds.includes(lot.id)
                    const availableQty = Number(lot.current_qty ?? lot.received_qty) || 0
                    const selectedQuantity = selectedLotQuantities[lot.id] ?? ''
                    const selectedQuantityNumber = Number(selectedQuantity)
                    const isQuantityInvalid =
                      checked && (!Number.isFinite(selectedQuantityNumber) || selectedQuantityNumber <= 0 || selectedQuantityNumber > availableQty)
                    const isSelectable = (lot.process_status ?? '').toUpperCase() === 'UNPROCESSED' && availableQty > 0
                    const hasFactoryProcess = productIdsWithFactoryProcess.includes(lot.product_id)
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
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-text-dark">{lot.lot_no}</p>
                              {hasFactoryProcess ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                                  Factory Process Assigned
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate('/process/processes', {
                                      state: { openCreateForProductId: lot.product_id },
                                    })
                                  }
                                  className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-200"
                                >
                                  No Factory Process
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-text-dark/60">{lot.supplies?.doc_no ?? 'Unknown document'}</p>
                            <p className="text-xs text-text-dark/70">
                              {lot.products?.name ?? 'Unnamed product'} ({lot.products?.sku ?? 'N/A'})
                            </p>
                            <p className="text-xs text-text-dark/70">
                              Available: {availableQty.toFixed(2)} {lot.units?.symbol ?? 'kg'}
                            </p>
                            {checked && (
                              <div className="mt-3 max-w-xs space-y-1">
                                <label className="text-xs font-medium text-text-dark/70" htmlFor={`lot-quantity-${lot.id}`}>
                                  Quantity to process
                                </label>
                                <Input
                                  id={`lot-quantity-${lot.id}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={selectedQuantity}
                                  onChange={(event) => updateSelectedLotQuantity(lot.id, event.target.value)}
                                  className={isQuantityInvalid ? 'border-red-300 focus-visible:ring-red-500' : ''}
                                />
                                {isQuantityInvalid && (
                                  <p className="text-xs text-red-700">
                                    Enter a quantity greater than 0 and not above {availableQty.toFixed(2)} {lot.units?.symbol ?? 'kg'}.
                                  </p>
                                )}
                              </div>
                            )}
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
                </>
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
            <>
              <div className="rounded-xl border border-olive-light/30 bg-cream/40 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.65fr)_minmax(220px,0.9fr)_minmax(170px,0.65fr)_auto] lg:items-end">
                  <div className="space-y-1.5">
                    <label htmlFor="processing-run-search" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Search runs
                    </label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
                      <Input
                        id="processing-run-search"
                        value={processingRunSearchQuery}
                        onChange={(event) => setProcessingRunSearchQuery(event.target.value)}
                        placeholder="Search process, code, lot, quantity..."
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="processing-run-type-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Type
                    </label>
                    <select
                      id="processing-run-type-filter"
                      value={processingRunTypeFilter}
                      onChange={(event) => setProcessingRunTypeFilter(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="all">All types</option>
                      <option value="standard">Standard</option>
                      <option value="rework">Rework</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="processing-run-process-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Process
                    </label>
                    <select
                      id="processing-run-process-filter"
                      value={processingRunProcessFilter}
                      onChange={(event) => setProcessingRunProcessFilter(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="all">All processes</option>
                      {processingRunProcessOptions.map(([processKey, label]) => (
                        <option key={processKey} value={processKey}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="processing-run-lot-count-filter" className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                      Lots
                    </label>
                    <select
                      id="processing-run-lot-count-filter"
                      value={processingRunLotCountFilter}
                      onChange={(event) => setProcessingRunLotCountFilter(event.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="all">All runs</option>
                      <option value="single">Single lot</option>
                      <option value="combined">Combined lots</option>
                    </select>
                  </div>

                  <Button type="button" variant="outline" onClick={resetProcessingRunFilters} className="gap-2">
                    <X className="h-4 w-4" />
                    Reset
                  </Button>
                </div>

                <div className="mt-3 flex justify-end">
                  <p className="text-xs font-medium text-text-dark/55">
                    Showing {filteredProcessingRuns.length} of {processingRuns.length} active runs
                  </p>
                </div>
              </div>

              {filteredProcessingRuns.length === 0 ? (
                <div className="rounded-lg border border-dashed border-olive-light/40 bg-white p-6 text-center">
                  <p className="text-sm font-semibold text-text-dark">No active runs match these filters.</p>
                  <p className="mt-1 text-xs text-text-dark/60">Adjust the search, type, process, or lot-count filter.</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filteredProcessingRuns.map((run) => (
                    <div key={run.id} className="rounded-md border border-olive-light/40 p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
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
                          <p className="text-xs text-text-dark/70">Products: {run.product_summary}</p>
                          <p className="text-xs text-text-dark/70">Lots: {run.lot_summary}</p>
                          <p className="text-xs text-text-dark/70">
                            Total Qty: {run.total_qty.toFixed(2)} {run.unit_symbol}
                          </p>
                          <p className="text-xs text-text-dark/60">
                            Started: {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-start">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 border-olive-light/40 text-text-dark hover:bg-olive-light/20"
                            onClick={() => navigate(`/process/process-steps/run/${run.id}`)}
                            aria-label={`Open process run ${run.process_name}`}
                            title="Open process run"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-9 w-9 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteRun(run.id)}
                            disabled={deletingRunId === run.id}
                            aria-label={`Delete process run ${run.process_name}`}
                            title={deletingRunId === run.id ? 'Deleting...' : 'Delete process run'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default ProcessSteps
