import { useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Shield, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { SUPPLY_QUALITY_PARAMETERS } from '@/constants/supplyQuality'

interface StepQCCheckProps {
  stepRunId: number
  onPass: () => Promise<void>
  onFail: (failedParameters: Array<{ code: string; name: string; remarks: string }>) => Promise<void>
  loading?: boolean
}

const SCORE_OPTIONS = [
  { value: 3, label: '3 · Good' },
  { value: 2, label: '2 · Needs improvement' },
  { value: 1, label: '1 · Reject' },
]

export function StepQCCheck({ stepRunId, onPass, onFail, loading = false }: StepQCCheckProps) {
  const [scores, setScores] = useState<Record<string, number>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [isEvaluating, setIsEvaluating] = useState(false)

  const handleScoreChange = (code: string, score: number | string) => {
    const scoreNum = score === '' ? 0 : Number(score)
    setScores({ ...scores, [code]: scoreNum })
  }

  const handleRemarksChange = (code: string, value: string) => {
    setRemarks({ ...remarks, [code]: value })
  }

  const handleEvaluate = async (e: FormEvent) => {
    e.preventDefault()

    // Check if all parameters have scores
    const allScored = SUPPLY_QUALITY_PARAMETERS.every((param) => {
      const score = scores[param.code]
      return score !== undefined && score > 0
    })

    if (!allScored) {
      toast.error('Please score all quality parameters')
      return
    }

    setIsEvaluating(true)

    // Determine pass/fail
    const failedParameters: Array<{ code: string; name: string; remarks: string }> = []
    SUPPLY_QUALITY_PARAMETERS.forEach((param) => {
      const score = scores[param.code] || 0
      if (score < 3) {
        failedParameters.push({
          code: param.code,
          name: param.name,
          remarks: remarks[param.code] || 'Quality check failed',
        })
      }
    })

    try {
      if (failedParameters.length === 0) {
        await onPass()
        toast.success('QC check passed')
      } else {
        await onFail(failedParameters)
        toast.warning(`${failedParameters.length} quality parameter(s) failed`)
      }
    } catch (error) {
      console.error('Error evaluating QC check:', error)
      toast.error('Failed to evaluate QC check')
    } finally {
      setIsEvaluating(false)
    }
  }

  const allScored = SUPPLY_QUALITY_PARAMETERS.every((param) => {
    const score = scores[param.code]
    return score !== undefined && score > 0
  })

  const hasFailures = SUPPLY_QUALITY_PARAMETERS.some((param) => {
    const score = scores[param.code] || 0
    return score < 3
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-olive" />
        <h4 className="text-sm font-semibold text-text-dark">Quality Control Check</h4>
      </div>

      <form onSubmit={handleEvaluate} className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-olive-light/40">
          <table className="min-w-full divide-y divide-olive-light/30">
            <thead className="bg-olive-light/20">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                  Parameter
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                  Specification
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                  Score
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                  Remarks
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-olive-light/30 bg-white">
              {SUPPLY_QUALITY_PARAMETERS.map((parameter) => {
                const score = scores[parameter.code] || 0
                const isFailed = score > 0 && score < 3
                return (
                  <tr key={parameter.code} className={isFailed ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-dark">{parameter.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-text-dark/70">{parameter.specification}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className={`h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ${
                          isFailed ? 'border-red-300' : ''
                        }`}
                        value={score || ''}
                        onChange={(e) => handleScoreChange(parameter.code, e.target.value)}
                        required
                        disabled={loading || isEvaluating}
                      >
                        <option value="">Select score</option>
                        {SCORE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="text"
                        value={remarks[parameter.code] || ''}
                        onChange={(e) => handleRemarksChange(parameter.code, e.target.value)}
                        placeholder="Add remarks..."
                        disabled={loading || isEvaluating}
                        className="bg-white"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-olive-light/10 p-3">
          <div className="flex items-center gap-2">
            {allScored && (
              <>
                {hasFailures ? (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm font-medium text-red-800">QC Check Failed</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">QC Check Passed</span>
                  </>
                )}
              </>
            )}
          </div>
          <Button
            type="submit"
            disabled={!allScored || loading || isEvaluating}
            className="bg-olive hover:bg-olive-dark"
          >
            {isEvaluating ? 'Evaluating...' : 'Evaluate QC Check'}
          </Button>
        </div>
      </form>
    </div>
  )
}
