import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SCORE_OPTIONS = [
  { value: 3, label: '3 · Good' },
  { value: 2, label: '2 · Needs improvement' },
  { value: 1, label: '1 · Reject' },
]

function QualityEvaluationTable({ parameters, entries, legend, onEntryChange }) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-olive-light/40 shadow-sm">
        <table className="min-w-full divide-y divide-olive-light/30">
          <thead className="bg-olive-light/20">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                Quality parameter
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                Specification / Standard
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                Remarks / Corrective actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-olive-light/30 bg-white">
            {parameters.map((parameter) => {
              const entry = entries[parameter.code] ?? { score: '', remarks: '' }
              return (
                <tr key={parameter.code} className="hover:bg-olive-light/10">
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-text-dark">{parameter.name}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="text-sm text-text-dark/70">{parameter.specification}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <Label htmlFor={`score-${parameter.code}`} className="sr-only">
                      Score for {parameter.name}
                    </Label>
                    <select
                      id={`score-${parameter.code}`}
                      className="h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40"
                      value={entry.score}
                      onChange={(event) =>
                        onEntryChange(parameter.code, {
                          ...entry,
                          score:
                            event.target.value === ''
                              ? ''
                              : Number.parseInt(event.target.value, 10),
                        })
                      }
                    >
                      <option value="">Select score</option>
                      {SCORE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
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

      <div className="rounded-xl border border-olive-light/40 bg-olive-light/10 p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-text-dark/70">Evaluation legend</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {legend.map((item) => (
            <div key={item.score} className="rounded-lg border border-olive-light/40 bg-white px-3 py-2">
              <p className="text-sm font-medium text-text-dark">Score {item.score}</p>
              <p className="text-xs text-text-dark/70">{item.meaning}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QualityEvaluationTable


