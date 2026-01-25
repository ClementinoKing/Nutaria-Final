import { useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProcessMeasurement, MeasurementFormData } from '@/types/processExecution'

interface MeasurementsCaptureProps {
  stepRunId: number
  measurements: ProcessMeasurement[]
  onAdd: (measurement: Omit<ProcessMeasurement, 'id' | 'process_step_run_id' | 'recorded_at'>) => Promise<void>
  onDelete: (measurementId: number) => Promise<void>
  loading?: boolean
}

const METRIC_OPTIONS: Array<{ value: ProcessMeasurement['metric']; label: string }> = [
  { value: 'moisture_in', label: 'Moisture In (%)' },
  { value: 'moisture_out', label: 'Moisture Out (%)' },
  { value: 'weight', label: 'Weight' },
  { value: 'temp', label: 'Temperature' },
]

const DEFAULT_UNITS: Record<ProcessMeasurement['metric'], string> = {
  moisture_in: '%',
  moisture_out: '%',
  weight: 'kg',
  temp: '°C',
}

export function MeasurementsCapture({
  stepRunId,
  measurements,
  onAdd,
  onDelete,
  loading = false,
}: MeasurementsCaptureProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState<MeasurementFormData>({
    metric: 'weight',
    value: '',
    unit: 'kg',
    recorded_at: new Date().toISOString().slice(0, 16),
  })

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const valueNum = parseFloat(formData.value)
    if (isNaN(valueNum) || valueNum <= 0) {
      toast.error('Please enter a valid positive number for the measurement value')
      return
    }

    if (!formData.unit.trim()) {
      toast.error('Please enter a unit')
      return
    }

    setIsAdding(true)
    try {
      await onAdd({
        metric: formData.metric,
        value: valueNum,
        unit: formData.unit.trim(),
      })
      setFormData({
        metric: 'weight',
        value: '',
        unit: DEFAULT_UNITS[formData.metric],
        recorded_at: new Date().toISOString().slice(0, 16),
      })
      setIsAdding(false)
    } catch (error) {
      console.error('Error adding measurement:', error)
      toast.error('Failed to add measurement')
      setIsAdding(false)
    }
  }

  const handleMetricChange = (metric: ProcessMeasurement['metric']) => {
    setFormData({
      ...formData,
      metric,
      unit: DEFAULT_UNITS[metric],
    })
  }

  const handleDelete = async (measurementId: number) => {
    if (!confirm('Are you sure you want to delete this measurement?')) {
      return
    }

    try {
      await onDelete(measurementId)
    } catch (error) {
      console.error('Error deleting measurement:', error)
      toast.error('Failed to delete measurement')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text-dark">Process Measurements</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
          disabled={loading}
          className="border-olive-light/30"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Measurement
        </Button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="measurement_metric">Metric</Label>
              <select
                id="measurement_metric"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.metric}
                onChange={(e) => handleMetricChange(e.target.value as ProcessMeasurement['metric'])}
                disabled={isAdding}
              >
                {METRIC_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="measurement_value">Value</Label>
              <Input
                id="measurement_value"
                type="number"
                step="0.01"
                min="0"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="0.00"
                required
                disabled={isAdding}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="measurement_unit">Unit</Label>
              <Input
                id="measurement_unit"
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="kg, %, °C"
                required
                disabled={isAdding}
                className="bg-white"
              />
            </div>

            <div className="flex items-end">
              <div className="flex gap-2 w-full">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isAdding || loading}
                  className="flex-1 bg-olive hover:bg-olive-dark"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false)
                    setFormData({
                      metric: 'weight',
                      value: '',
                      unit: 'kg',
                      recorded_at: new Date().toISOString().slice(0, 16),
                    })
                  }}
                  disabled={isAdding}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {measurements.length === 0 ? (
        <p className="text-sm text-text-dark/60 py-4 text-center">No measurements recorded yet</p>
      ) : (
        <div className="space-y-2">
          {measurements.map((measurement) => (
            <div
              key={measurement.id}
              className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
            >
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-text-dark capitalize">
                  {measurement.metric.replace('_', ' ')}
                </span>
                <span className="text-sm text-text-dark/70">
                  {measurement.value} {measurement.unit}
                </span>
                <span className="text-xs text-text-dark/50">
                  {new Date(measurement.recorded_at).toLocaleString()}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(measurement.id)}
                disabled={loading}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
