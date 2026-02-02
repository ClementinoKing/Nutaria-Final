import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { PostgrestError } from '@supabase/supabase-js'
import { Eye, CheckCircle2 } from 'lucide-react'

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

interface CompletedProcessRun {
  id: number
  status: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  supply_batch_id: number
  process_id: number
  supply_batches: SupplyBatch | null
  processes: Process | null
}

function CompletedProcessesList() {
  const navigate = useNavigate()
  const [runs, setRuns] = useState<CompletedProcessRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchCompletedRuns = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
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
      .eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setRuns([])
    } else {
      setRuns((data as CompletedProcessRun[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCompletedRuns()
  }, [fetchCompletedRuns])

  const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  const getBatch = (run: CompletedProcessRun) => {
    const batch = run.supply_batches
    if (Array.isArray(batch)) return batch[0] ?? null
    return batch ?? null
  }

  const getProcess = (run: CompletedProcessRun) => {
    const proc = run.processes
    if (Array.isArray(proc)) return proc[0] ?? null
    return proc ?? null
  }

  const columns = [
    {
      key: 'lot',
      header: 'Lot',
      render: (run: CompletedProcessRun) => {
        const batch = getBatch(run)
        return (
          <div>
            <div className="font-medium text-text-dark">{batch?.lot_no ?? '—'}</div>
            <div className="text-xs text-text-dark/60">{batch?.supplies?.doc_no ?? '—'}</div>
          </div>
        )
      },
      mobileRender: (run: CompletedProcessRun) => getBatch(run)?.lot_no ?? '—',
    },
    {
      key: 'product',
      header: 'Product',
      render: (run: CompletedProcessRun) => {
        const batch = getBatch(run)
        return (
          <div>
            <div className="text-text-dark font-medium">{batch?.products?.name ?? '—'}</div>
            <div className="text-xs text-text-dark/60">{batch?.products?.sku ?? '—'}</div>
          </div>
        )
      },
      mobileRender: (run: CompletedProcessRun) => getBatch(run)?.products?.name ?? '—',
    },
    {
      key: 'process',
      header: 'Process',
      render: (run: CompletedProcessRun) => {
        const proc = getProcess(run)
        return (
          <div>
            <div className="text-sm font-medium text-text-dark">{proc?.name ?? '—'}</div>
            <div className="text-xs text-text-dark/60">{proc?.code ?? '—'}</div>
          </div>
        )
      },
      mobileRender: (run: CompletedProcessRun) => getProcess(run)?.name ?? '—',
    },
    {
      key: 'started_at',
      header: 'Started',
      render: (run: CompletedProcessRun) => formatDateTime(run.started_at),
      mobileRender: (run: CompletedProcessRun) => formatDateTime(run.started_at),
      cellClassName: 'text-sm text-text-dark/70',
    },
    {
      key: 'completed_at',
      header: 'Completed',
      render: (run: CompletedProcessRun) => formatDateTime(run.completed_at),
      mobileRender: (run: CompletedProcessRun) => formatDateTime(run.completed_at),
      cellClassName: 'text-sm text-text-dark/70',
    },
    {
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (run: CompletedProcessRun) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/process/completed/${run.id}`)}
          className="border-olive-light/30 hover:bg-olive-light/10"
        >
          <Eye className="mr-2 h-4 w-4" />
          View details
        </Button>
      ),
      mobileRender: (run: CompletedProcessRun) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/process/completed/${run.id}`)}
          className="w-full border-olive-light/30"
        >
          <Eye className="mr-2 h-4 w-4" />
          View details
        </Button>
      ),
      mobileHeader: 'Actions',
    },
  ]

  return (
    <PageLayout
      title="Completed Processes"
      activeItem="process"
      stickyHeader={false}
      contentClassName="py-8 space-y-6"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-text-dark">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Completed Processes
          </CardTitle>
          <CardDescription>
            List of all completed process runs. Click "View details" to see full information for each run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">
              {error.message}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-2 border-olive border-t-transparent rounded-full animate-spin" />
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center text-text-dark/60">
              No completed processes found.
            </div>
          ) : (
            <ResponsiveTable data={runs} columns={columns} keyExtractor={(run) => String(run.id)} />
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default CompletedProcessesList
