import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, ChevronRight } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { Spinner } from '@/components/ui/spinner'

interface RunRow {
  id: number
  lot_no: string
  product_name: string
  process_name: string
  process_code: string
  started_at: string | null
  completed_at: string | null
}

function CompletedProcessesList() {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('process_lot_runs')
        .select(`
          id,
          started_at,
          completed_at,
          supply_batches: supply_batch_id (
            lot_no,
            products: product_id (name, sku)
          ),
          processes: process_id (id, code, name)
        `)
        .eq('status', 'COMPLETED')
        .order('completed_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setRuns([])
        setLoading(false)
        return
      }

      const list = (data ?? []) as Array<{
        id: number
        started_at: string | null
        completed_at: string | null
        supply_batches: { lot_no: string; products: { name: string; sku: string | null } | null } | { lot_no: string; products: { name: string; sku: string | null } | null }[] | null
        processes: { id: number; code: string; name: string } | { id: number; code: string; name: string }[] | null
      }>

      const rows: RunRow[] = list.map((run) => {
        const batch = Array.isArray(run.supply_batches) ? run.supply_batches[0] : run.supply_batches
        const process = Array.isArray(run.processes) ? run.processes[0] : run.processes
        return {
          id: run.id,
          lot_no: batch?.lot_no ?? '—',
          product_name: batch?.products?.name ?? '—',
          process_name: process?.name ?? '—',
          process_code: process?.code ?? '—',
          started_at: run.started_at ?? null,
          completed_at: run.completed_at ?? null,
        }
      })
      setRuns(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load completed processes')
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const formatDateTime = (value: string | null): string => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  const columns = [
    {
      key: 'lot',
      header: 'Lot',
      render: (r: RunRow) => (
        <span className="font-medium text-text-dark">{r.lot_no}</span>
      ),
      mobileRender: (r: RunRow) => (
        <span className="font-medium text-text-dark">{r.lot_no}</span>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: (r: RunRow) => <span className="text-text-dark/90">{r.product_name}</span>,
      mobileRender: (r: RunRow) => <span className="text-text-dark/90">{r.product_name}</span>,
    },
    {
      key: 'process',
      header: 'Process',
      render: (r: RunRow) => (
        <span className="text-text-dark/90">
          {r.process_name} <span className="text-text-dark/60">({r.process_code})</span>
        </span>
      ),
      mobileRender: (r: RunRow) => (
        <span className="text-text-dark/90">{r.process_name}</span>
      ),
    },
    {
      key: 'started',
      header: 'Started',
      cellClassName: 'text-text-dark/70 text-sm',
      render: (r: RunRow) => formatDateTime(r.started_at),
      mobileRender: (r: RunRow) => formatDateTime(r.started_at),
    },
    {
      key: 'completed',
      header: 'Completed',
      cellClassName: 'text-text-dark/70 text-sm',
      render: (r: RunRow) => formatDateTime(r.completed_at),
      mobileRender: (r: RunRow) => formatDateTime(r.completed_at),
    },
    {
      key: 'action',
      header: '',
      headerClassName: 'w-24 text-right',
      cellClassName: 'text-right',
      render: (r: RunRow) => (
        <Link
          to={`/process/completed/${r.id}`}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-olive hover:underline"
        >
          View <ChevronRight className="h-4 w-4" />
        </Link>
      ),
      mobileRender: (r: RunRow) => (
        <Link
          to={`/process/completed/${r.id}`}
          className="inline-flex items-center gap-0.5 text-sm font-medium text-olive hover:underline"
        >
          View <ChevronRight className="h-4 w-4" />
        </Link>
      ),
    },
  ]

  if (loading) {
    return (
      <PageLayout
        title="Completed Processes"
        activeItem="process"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading completed processes..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Completed Processes"
      activeItem="process"
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle className="text-text-dark">Completed Processes</CardTitle>
              <CardDescription>
                View completed process runs by lot, product, and process.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {error}
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-md border border-dashed border-olive-light/60 bg-olive-light/10 p-8 text-center text-sm text-text-dark/70">
              No completed processes found.
            </div>
          ) : (
            <ResponsiveTable
              columns={columns}
              data={runs}
              rowKey="id"
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

export default CompletedProcessesList
