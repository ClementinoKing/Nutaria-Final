import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExternalLink } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { useProcessDefinitions } from '@/hooks/useProcessDefinitions'

interface Lot {
  id: number
  lot_no: string
  supply_id: number
  product_id: number
  unit_id: number
  received_qty: number
  accepted_qty: number
  rejected_qty: number
  current_qty: number
  process_status: string
  quality_status: string
  expiry_date?: string | null
  created_at: string
  supplies?: {
    doc_no?: string
    received_at?: string
    supplier_id?: number
    warehouse_id?: number
  } | null
  products?: {
    name?: string
    sku?: string
  } | null
  units?: {
    name?: string
    symbol?: string
  } | null
}

function ProcessSteps() {
  const navigate = useNavigate()
  const {
    lots,
    loading: loadingDefinitions,
    error: definitionsError,
  } = useProcessDefinitions()

  const lotsByStatus = useMemo(() => {
    const groups = new Map<string, Lot[]>()
    lots.forEach((lot: Lot) => {
      const status = (lot.process_status ?? 'UNPROCESSED').toUpperCase()
      if (!groups.has(status)) {
        groups.set(status, [])
      }
      groups.get(status)!.push(lot)
    })
    return groups
  }, [lots])

  const getLotStatusStyles = (status: string | null | undefined): string => {
    switch ((status ?? '').toUpperCase()) {
      case 'PROCESSING':
        return 'border-orange-300 bg-orange-100 text-orange-800'
      case 'PROCESSED':
        return 'border-green-200 bg-green-100 text-green-800'
      default:
        return 'border-slate-300 bg-slate-100 text-slate-700'
    }
  }

  const formatLotStatus = (status: string | null | undefined): string => {
    const value = (status ?? '').toLowerCase()
    if (!value) return 'Unknown'
    return value.charAt(0).toUpperCase() + value.slice(1)
  }

  const handleNavigate = (lotId: number) => {
    navigate(`/process/process-steps/${lotId}`)
  }

  return (
    <PageLayout
      title="Available Process Lots"
      activeItem="process"
      stickyHeader={false}
      contentClassName="py-8 space-y-6"
    >
      <div className="rounded-md border border-olive-light/40 bg-olive-light/20 px-4 py-3 text-sm text-text-dark/70">
        Select a lot to manage its process execution. Progress tracking now lives on a dedicated page for clarity.
      </div>

      {definitionsError && (
        <Card className="border-red-300 bg-red-50 text-red-700">
          <CardContent className="py-4">
            We could not load process definitions. Please try refreshing the page.
          </CardContent>
        </Card>
      )}

      <Card className="bg-white border-olive-light/30">
        <CardHeader>
          <CardTitle className="text-text-dark">Available Lots</CardTitle>
          <CardDescription>
            Lots currently awaiting processing or already in progress. Select one to manage its process steps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingDefinitions ? (
            <div className="text-sm text-text-dark/60">Loading lots…</div>
          ) : lots.length === 0 ? (
            <div className="text-sm text-text-dark/60">There are currently no lots waiting to be processed.</div>
          ) : (
            Array.from(lotsByStatus.entries()).map(([status, statusLots]: [string, Lot[]]) => (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                    {formatLotStatus(status)}
                  </span>
                  <span className="text-xs text-text-dark/40">({statusLots.length})</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {statusLots.map((lot: Lot) => (
                    <Card
                      key={lot.id}
                      className="cursor-pointer border border-olive-light/40 transition-all hover:border-olive hover:shadow-md"
                      onClick={() => handleNavigate(lot.id)}
                    >
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text-dark">{lot.lot_no}</div>
                            <div className="text-xs text-text-dark/60">{lot.supplies?.doc_no ?? 'Unknown document'}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${getLotStatusStyles(
                                lot.process_status,
                              )}`}
                            >
                              {formatLotStatus(lot.process_status)}
                            </span>
                            <ExternalLink className="h-4 w-4 text-olive" />
                          </div>
                        </div>
                        <div className="text-sm text-text-dark">
                          {lot.products?.name ?? 'Unnamed product'} ({lot.products?.sku ?? 'N/A'})
                        </div>
                        <div className="flex items-center justify-between text-xs text-text-dark/60">
                          <span>Available Qty</span>
                          <span className="font-medium text-text-dark">
                            {lot.current_qty ?? lot.received_qty ?? '—'} {lot.units?.symbol ?? ''}
                          </span>
                        </div>
                        {lot.expiry_date && (
                          <div className="flex items-center justify-between text-xs text-text-dark/60">
                            <span>Expiry</span>
                            <span>{new Date(lot.expiry_date).toLocaleDateString()}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </PageLayout>
  )
}

export default ProcessSteps


