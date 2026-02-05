import { useState, FormEvent, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getProcessStepQualityCheck, saveProcessStepQualityCheck } from '@/lib/processExecution'
import type { QualityParameter } from '@/hooks/useQualityParameters'
import { useAuth } from '@/context/AuthContext'

interface StepQCCheckProps {
  stepRunId: number
  qualityParameters: QualityParameter[]
  onPass: (qcData: {
    scores: Record<string, number>
    results: Record<string, string>
    remarks: Record<string, string>
  }) => Promise<void>
  onFail: (
    failedParameters: Array<{ code: string; name: string; remarks: string }>,
    qcData: {
      scores: Record<string, number>
      results: Record<string, string>
      remarks: Record<string, string>
    }
  ) => Promise<void>
  loading?: boolean
}

const SCORE_OPTIONS = [
  { value: 3, label: '3 · Good  ' },
  { value: 2, label: '2 · Needs improvement' },
  { value: 1, label: '1 · Reject' },
  { value: 4, label: '0 · N/A' },
]

export function StepQCCheck({ stepRunId, qualityParameters, onPass, onFail, loading = false }: StepQCCheckProps) {
  const { user } = useAuth()
  const [scores, setScores] = useState<Record<string, number>>({})
  const [remarks, setRemarks] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, string>>({})
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [savedQC, setSavedQC] = useState<{
    qualityCheck: {
      id: number
      status: string
      overall_score: number | null
      remarks: string | null
      evaluated_by: string | null
      evaluated_at: string | null
    } | null
    items: Array<{
      id: number
      parameter_id: number
      score: number
      remarks: string | null
      results: string | null
      quality_parameter: {
        id: number
        code: string
        name: string
      }
    }>
  } | null>(null)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextAutoSaveRef = useRef(false)
  const lastSavedHashRef = useRef<string>('')

  // Load saved QC checks
  useEffect(() => {
    const loadSavedQC = async () => {
      try {
        setScores({})
        setRemarks({})
        setResults({})
        lastSavedHashRef.current = ''
        const qcData = await getProcessStepQualityCheck(stepRunId)
        setSavedQC(qcData)

        // Pre-populate form if QC check exists
        if (qcData.qualityCheck && qcData.items.length > 0) {
          const newScores: Record<string, number> = {}
          const newRemarks: Record<string, string> = {}
          const newResults: Record<string, string> = {}

          qcData.items.forEach((item) => {
            if (item.quality_parameter) {
              const code = item.quality_parameter.code
              newScores[code] = item.score
              newRemarks[code] = item.remarks || ''
              newResults[code] = item.results || ''
            }
          })

          setScores(newScores)
          setRemarks(newRemarks)
          setResults(newResults)
          lastSavedHashRef.current = JSON.stringify({ scores: newScores, results: newResults, remarks: newRemarks })
        }
        skipNextAutoSaveRef.current = true
      } catch (error) {
        // Silently fail if table doesn't exist yet
        if ((error as any)?.code !== 'PGRST205' && (error as any)?.code !== 'PGRST116') {
          console.error('Error loading saved QC check:', error)
        }
      }
    }

    loadSavedQC()
  }, [stepRunId])

  const refreshSavedQC = useCallback(async () => {
    try {
      const qcData = await getProcessStepQualityCheck(stepRunId)
      setSavedQC(qcData)
    } catch (error) {
      if ((error as any)?.code !== 'PGRST205' && (error as any)?.code !== 'PGRST116') {
        console.error('Error refreshing saved QC check:', error)
      }
    }
  }, [stepRunId])

  const handleScoreChange = (code: string, score: number | string) => {
    const scoreNum = score === '' ? 0 : Number(score)
    setScores({ ...scores, [code]: scoreNum })
  }

  const handleRemarksChange = (code: string, value: string) => {
    setRemarks({ ...remarks, [code]: value })
  }

  const handleResultsChange = (code: string, value: string) => {
    setResults({ ...results, [code]: value })
  }

  const hasFinalStatus = savedQC?.qualityCheck?.status === 'PASS' || savedQC?.qualityCheck?.status === 'FAIL'

  // Auto-save QC changes (debounced)
  useEffect(() => {
    if (qualityParameters.length === 0) return
    if (hasFinalStatus) return
    const hasAnyInput =
      Object.values(scores).some((score) => score > 0) ||
      Object.values(results).some((value) => value?.trim()) ||
      Object.values(remarks).some((value) => value?.trim())
    if (!hasAnyInput) return

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false
      return
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    const payloadHash = JSON.stringify({ scores, results, remarks })
    if (payloadHash === lastSavedHashRef.current) return

    autoSaveTimeoutRef.current = setTimeout(async () => {
      autoSaveTimeoutRef.current = null
      setAutoSaving(true)
      try {
        await saveProcessStepQualityCheck(stepRunId, {
          scores,
          results,
          remarks,
          qualityParameters: qualityParameters.map((p) => ({ id: p.id, code: p.code })),
          evaluatedBy: user?.id ?? null,
          isFinal: false,
        })
        lastSavedHashRef.current = payloadHash
        await refreshSavedQC()
      } catch (error) {
        if ((error as any)?.code !== 'PGRST205' && (error as any)?.code !== 'PGRST116') {
          console.error('Error auto-saving QC check:', error)
        }
      } finally {
        setAutoSaving(false)
      }
    }, 600)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
    }
  }, [scores, results, remarks, qualityParameters, stepRunId, user?.id, refreshSavedQC, hasFinalStatus])

  const handleEvaluate = async (e: FormEvent) => {
    e.preventDefault()

    // Check if all parameters have scores
    const allScored = qualityParameters.every((param) => {
      const score = scores[param.code]
      return score !== undefined && score > 0
    })

    if (!allScored) {
      toast.error('Please score all quality parameters')
      return
    }

    setIsEvaluating(true)

    // Determine pass/fail (exclude N/A scores which are 4)
    const failedParameters: Array<{ code: string; name: string; remarks: string }> = []
    qualityParameters.forEach((param) => {
      const score = scores[param.code] || 0
      if (score > 0 && score < 3) {
        failedParameters.push({
          code: param.code,
          name: param.name,
          remarks: remarks[param.code] || 'Quality check failed',
        })
      }
    })

    const qcData = {
      scores,
      results,
      remarks,
    }

    try {
      await saveProcessStepQualityCheck(stepRunId, {
        scores,
        results,
        remarks,
        qualityParameters: qualityParameters.map((p) => ({ id: p.id, code: p.code })),
        evaluatedBy: user?.id ?? null,
        isFinal: true,
      })
      await refreshSavedQC()
      if (failedParameters.length === 0) {
        await onPass(qcData)
        toast.success('QC check passed')
      } else {
        await onFail(failedParameters, qcData)
        toast.warning(`${failedParameters.length} quality parameter(s) failed`)
      }
    } catch (error) {
      console.error('Error evaluating QC check:', error)
      toast.error('Failed to evaluate QC check')
    } finally {
      setIsEvaluating(false)
    }
  }

  const allScored = qualityParameters.every((param) => {
    const score = scores[param.code]
    return score !== undefined && score > 0
  })

  const hasFailures = qualityParameters.some((param) => {
    const score = scores[param.code] || 0
    return score > 0 && score < 3
  })

  const hasSavedQC = savedQC?.qualityCheck !== null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-olive" />
          <h4 className="text-sm font-semibold text-text-dark">
            Quality Control Check
            {hasSavedQC && (
              <span className="ml-2 text-xs font-normal text-text-dark/60">
                ({savedQC?.qualityCheck?.status || 'Saved'})
              </span>
            )}
          </h4>
        </div>
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
                  Result
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
              {qualityParameters.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-text-dark/60">
                    No quality parameters selected for this step. Quality parameters are configured during process creation.
                  </td>
                </tr>
              ) : (
                qualityParameters.map((parameter) => {
                  const score = scores[parameter.code] || 0
                  const isFailed = score > 0 && score < 3 && score !== 4
                  return (
                    <tr key={parameter.code} className={isFailed ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-text-dark">{parameter.name}</p>
                        <p className="text-xs text-text-dark/50 mt-0.5 font-mono">{parameter.code}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="text"
                          value={results[parameter.code] || ''}
                          onChange={(e) => handleResultsChange(parameter.code, e.target.value)}
                          placeholder="Enter result..."
                          disabled={loading || isEvaluating}
                          className="bg-white"
                        />
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
                })
              )}
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
