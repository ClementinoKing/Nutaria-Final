import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProcessNonConformance } from '@/types/processExecution'

interface NonConformanceListProps {
  stepRunId: number
  nonConformances: ProcessNonConformance[]
  onResolve: (ncId: number) => Promise<void>
  loading?: boolean
}

const SEVERITY_COLORS: Record<ProcessNonConformance['severity'], string> = {
  LOW: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  MEDIUM: 'bg-orange-100 text-orange-800 border-orange-200',
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  CRITICAL: 'bg-red-200 text-red-900 border-red-300',
}

export function NonConformanceList({
  stepRunId,
  nonConformances,
  onResolve,
  loading = false,
}: NonConformanceListProps) {
  const handleResolve = async (ncId: number) => {
    try {
      await onResolve(ncId)
      toast.success('Non-conformance resolved')
    } catch (error) {
      console.error('Error resolving non-conformance:', error)
      toast.error('Failed to resolve non-conformance')
    }
  }

  const unresolved = nonConformances.filter((nc) => !nc.resolved)
  const resolved = nonConformances.filter((nc) => nc.resolved)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-dark">Non-Conformances</h4>
        {unresolved.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
            {unresolved.length} unresolved
          </span>
        )}
      </div>

      {nonConformances.length === 0 ? (
        <p className="text-sm text-text-dark/60 py-4 text-center">No non-conformances recorded</p>
      ) : (
        <div className="space-y-3">
          {unresolved.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                Unresolved
              </h5>
              {unresolved.map((nc) => (
                <div
                  key={nc.id}
                  className="rounded-lg border border-red-200 bg-red-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm font-semibold text-text-dark">{nc.nc_type}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[nc.severity]}`}
                        >
                          {nc.severity}
                        </span>
                      </div>
                      <p className="text-sm text-text-dark/80 mb-2">{nc.description}</p>
                      {nc.corrective_action && (
                        <p className="text-xs text-text-dark/60">
                          <span className="font-medium">Corrective action:</span> {nc.corrective_action}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleResolve(nc.id)}
                      disabled={loading}
                      className="border-green-300 text-green-700 hover:bg-green-50"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">
                Resolved
              </h5>
              {resolved.map((nc) => (
                <div
                  key={nc.id}
                  className="rounded-lg border border-green-200 bg-green-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm font-semibold text-text-dark">{nc.nc_type}</span>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${SEVERITY_COLORS[nc.severity]}`}
                        >
                          {nc.severity}
                        </span>
                      </div>
                      <p className="text-sm text-text-dark/80 mb-2">{nc.description}</p>
                      {nc.corrective_action && (
                        <p className="text-xs text-text-dark/60">
                          <span className="font-medium">Corrective action:</span> {nc.corrective_action}
                        </p>
                      )}
                      {nc.resolved_at && (
                        <p className="text-xs text-text-dark/50 mt-2">
                          Resolved: {new Date(nc.resolved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
