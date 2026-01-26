import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SupplyQualityScoreLegend } from '@/constants/supplyQuality'

const SCORE_OPTIONS = [
  { value: 3, label: 'Good' },
  { value: 2, label: 'Rework' },
  { value: 1, label: 'Reject' },
  { value: 4, label: 'N/A' },
]

interface QualityParameter {
  id?: number | null
  code: string
  name: string
  specification: string
  defaultRemarks: string
}

interface QualityEntry {
  score: number | string | null
  remarks: string
  results: string
}

interface QualityEntries {
  [code: string]: QualityEntry
}

interface QualityEvaluationTableProps {
  parameters: QualityParameter[]
  entries: QualityEntries
  legend: SupplyQualityScoreLegend[]
  onEntryChange: (code: string, entry: QualityEntry) => void
}

function QualityEvaluationTable({ parameters, entries, legend, onEntryChange }: QualityEvaluationTableProps) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-olive-light/40 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <table className="min-w-full divide-y divide-olive-light/30 dark:divide-slate-800">
          <thead className="bg-olive-light/20 dark:bg-slate-900/70">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-300">
                Quality parameter
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-300">
                Results
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-300">
                Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-300">
                Remarks / Corrective actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-olive-light/30 bg-white dark:divide-slate-800 dark:bg-slate-900/50">
            {parameters.map((parameter: QualityParameter) => {
              const entry = entries[parameter.code] ?? { score: '', remarks: '', results: '' }
              return (
                <tr key={parameter.code} className="hover:bg-olive-light/10 dark:hover:bg-slate-900/80">
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-text-dark dark:text-slate-100">{parameter.name}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Label htmlFor={`results-${parameter.code}`} className="sr-only">
                      Results for {parameter.name}
                    </Label>
                    <Input
                      id={`results-${parameter.code}`}
                      placeholder="Enter results"
                      value={entry.results}
                      onChange={(event) =>
                        onEntryChange(parameter.code, {
                          ...entry,
                          results: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive"
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Label htmlFor={`score-${parameter.code}`} className="sr-only">
                      Score for {parameter.name}
                    </Label>
                    <select
                      id={`score-${parameter.code}`}
                      className="h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive"
                      value={entry.score === null || entry.score === 4 || entry.score === '4' ? '4' : entry.score === '' ? '' : String(entry.score)}
                      onChange={(event) =>
                        onEntryChange(parameter.code, {
                          ...entry,
                          score:
                            event.target.value === '' 
                              ? ''
                              : event.target.value === '4'
                              ? 4
                              : Number.parseInt(event.target.value, 10),
                        })
                      }
                    >
                      <option value="">Select score</option>
                      {SCORE_OPTIONS.map((option) => (
                        <option key={String(option.value)} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Label htmlFor={`remarks-${parameter.code}`} className="sr-only">
                      Remarks for {parameter.name}
                    </Label>
                    <Input
                      id={`remarks-${parameter.code}`}
                      placeholder="Summarise inspection notes"
                      value={entry.remarks}
                      onChange={(event) =>
                        onEntryChange(parameter.code, {
                          ...entry,
                          remarks: event.target.value,
                        })
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-olive-light/40 bg-olive-light/10 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-dark/70 dark:text-slate-300">
          Evaluation legend
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {legend.map((item: SupplyQualityScoreLegend) => (
            <div
              key={item.score}
              className="rounded-lg border border-olive-light/40 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60"
            >
              <p className="text-sm font-medium text-text-dark dark:text-slate-100">Score {item.score}</p>
              <p className="text-xs text-text-dark/70 dark:text-slate-300">{item.meaning}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QualityEvaluationTable


