import { useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import type { ProcessNonConformance, NonConformanceFormData } from '@/types/processExecution'

interface NonConformanceFormProps {
  stepRunId: number
  onSubmit: (nc: Omit<ProcessNonConformance, 'id' | 'process_step_run_id' | 'resolved' | 'resolved_at'>) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

const SEVERITY_OPTIONS: Array<{ value: ProcessNonConformance['severity']; label: string }> = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
]

const NC_TYPE_SUGGESTIONS = [
  'Quality Defect',
  'Equipment Malfunction',
  'Process Deviation',
  'Material Issue',
  'Documentation Error',
  'Safety Concern',
  'Other',
]

export function NonConformanceForm({
  stepRunId,
  onSubmit,
  onCancel,
  loading = false,
}: NonConformanceFormProps) {
  const [formData, setFormData] = useState<NonConformanceFormData>({
    nc_type: '',
    description: '',
    severity: 'MEDIUM',
    corrective_action: '',
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!formData.nc_type.trim()) {
      return
    }

    if (!formData.description.trim()) {
      return
    }

    try {
      await onSubmit({
        nc_type: formData.nc_type.trim(),
        description: formData.description.trim(),
        severity: formData.severity,
        corrective_action: formData.corrective_action.trim() || null,
      })
      setFormData({
        nc_type: '',
        description: '',
        severity: 'MEDIUM',
        corrective_action: '',
      })
    } catch (error) {
      console.error('Error creating non-conformance:', error)
    }
  }

  return (
    <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-text-dark">Add Non-Conformance</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={loading}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nc_type">Type</Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {NC_TYPE_SUGGESTIONS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFormData({ ...formData, nc_type: type })}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  formData.nc_type === type
                    ? 'border-olive bg-olive text-white'
                    : 'border-olive-light/40 bg-white text-text-dark hover:bg-olive-light/20'
                }`}
                disabled={loading}
              >
                {type}
              </button>
            ))}
          </div>
          <Input
            id="nc_type"
            type="text"
            value={formData.nc_type}
            onChange={(e) => setFormData({ ...formData, nc_type: e.target.value })}
            placeholder="Enter non-conformance type"
            required
            disabled={loading}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nc_description">Description *</Label>
          <textarea
            id="nc_description"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Describe the non-conformance in detail..."
            required
            disabled={loading}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nc_severity">Severity *</Label>
            <select
              id="nc_severity"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.severity}
              onChange={(e) =>
                setFormData({ ...formData, severity: e.target.value as ProcessNonConformance['severity'] })
              }
              required
              disabled={loading}
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nc_corrective_action">Corrective Action</Label>
            <Input
              id="nc_corrective_action"
              type="text"
              value={formData.corrective_action}
              onChange={(e) => setFormData({ ...formData, corrective_action: e.target.value })}
              placeholder="Optional corrective action"
              disabled={loading}
              className="bg-white"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="bg-olive hover:bg-olive-dark">
            Create Non-Conformance
          </Button>
        </div>
      </form>
    </div>
  )
}
