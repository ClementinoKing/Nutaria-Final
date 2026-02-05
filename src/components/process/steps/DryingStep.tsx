import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useDryingRun } from '@/hooks/useDryingRun'
import type { ProcessStepRun, DryingFormData } from '@/types/processExecution'

interface DryingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
  availableQuantity?: {
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null
}

const YES_NO_NA_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'NA', label: 'N/A' },
]

function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const tzOffsetMinutes = date.getTimezoneOffset()
  const localMillis = date.getTime() - tzOffsetMinutes * 60 * 1000
  return new Date(localMillis).toISOString().slice(0, 16)
}

function toISOString(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function DryingStep({
  stepRun,
  loading: externalLoading = false,
  availableQuantity,
}: DryingStepProps) {
  const { dryingRun, saveDryingRun } = useDryingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  const [formData, setFormData] = useState<DryingFormData>({
    dryer_temperature_c: '',
    time_in: '',
    time_out: '',
    moisture_in: '',
    moisture_out: '',
    crates_clean: '',
    insect_infestation: '',
    dryer_hygiene_clean: '',
    remarks: '',
  })

  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSaveRef = useRef(true)

  useEffect(() => {
    if (dryingRun) {
      setFormData({
        dryer_temperature_c: dryingRun.dryer_temperature_c?.toString() || '',
        time_in: toLocalDateTimeInput(dryingRun.time_in),
        time_out: toLocalDateTimeInput(dryingRun.time_out),
        moisture_in: dryingRun.moisture_in?.toString() || '',
        moisture_out: dryingRun.moisture_out?.toString() || '',
        crates_clean: dryingRun.crates_clean || '',
        insect_infestation: dryingRun.insect_infestation || '',
        dryer_hygiene_clean: dryingRun.dryer_hygiene_clean || '',
        remarks: dryingRun.remarks || '',
      })
      skipNextSaveRef.current = true
    }
  }, [dryingRun])

  const performSave = async () => {
    const moistureIn = formData.moisture_in ? parseFloat(formData.moisture_in) : null
    const moistureOut = formData.moisture_out ? parseFloat(formData.moisture_out) : null
    if (moistureIn !== null && moistureOut !== null && moistureOut > moistureIn) {
      toast.error('Moisture out cannot exceed moisture in')
      return
    }
    setSaving(true)
    try {
      await saveDryingRun({
        dryer_temperature_c: formData.dryer_temperature_c ? parseFloat(formData.dryer_temperature_c) : null,
        time_in: formData.time_in ? toISOString(formData.time_in) : null,
        time_out: formData.time_out ? toISOString(formData.time_out) : null,
        moisture_in: moistureIn,
        moisture_out: moistureOut,
        crates_clean: formData.crates_clean ? (formData.crates_clean as 'Yes' | 'No' | 'NA') : null,
        insect_infestation: formData.insect_infestation ? (formData.insect_infestation as 'Yes' | 'No' | 'NA') : null,
        dryer_hygiene_clean: formData.dryer_hygiene_clean ? (formData.dryer_hygiene_clean as 'Yes' | 'No' | 'NA') : null,
        remarks: formData.remarks.trim() || null,
      })
    } catch (error) {
      console.error('Error saving drying data:', error)
      toast.error('Failed to save drying data')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      performSave()
    }, 600)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [
    formData.dryer_temperature_c,
    formData.time_in,
    formData.time_out,
    formData.moisture_in,
    formData.moisture_out,
    formData.crates_clean,
    formData.insect_infestation,
    formData.dryer_hygiene_clean,
    formData.remarks,
  ])

  return (
    <div className="space-y-6">
      {/* Available Quantity Info */}
      {availableQuantity && (
        <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Quantity</p>
            <p className="text-base font-semibold text-text-dark">
              {availableQuantity.availableQty.toFixed(2)} kg
            </p>
          </div>
        </div>
      )}
      <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dryer_temperature_c">Dryer Temperature (°C)</Label>
          <Input
            id="dryer_temperature_c"
            type="number"
            step="0.1"
            value={formData.dryer_temperature_c}
            onChange={(e) => setFormData({ ...formData, dryer_temperature_c: e.target.value })}
            placeholder="0.0"
            disabled={saving || externalLoading}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time_in">Time In</Label>
          <Input
            id="time_in"
            type="datetime-local"
            value={formData.time_in}
            onChange={(e) => setFormData({ ...formData, time_in: e.target.value })}
            disabled={saving || externalLoading}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time_out">Time Out</Label>
          <Input
            id="time_out"
            type="datetime-local"
            value={formData.time_out}
            onChange={(e) => setFormData({ ...formData, time_out: e.target.value })}
            disabled={saving || externalLoading}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="moisture_in">Moisture In (%)</Label>
          <Input
            id="moisture_in"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={formData.moisture_in}
            onChange={(e) => setFormData({ ...formData, moisture_in: e.target.value })}
            placeholder="0.00"
            disabled={saving || externalLoading}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="moisture_out">Moisture Out (%)</Label>
          <Input
            id="moisture_out"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={formData.moisture_out}
            onChange={(e) => setFormData({ ...formData, moisture_out: e.target.value })}
            placeholder="0.00"
            disabled={saving || externalLoading}
            className="bg-white"
          />
        </div>
      </div>

      <div className="border-t border-olive-light/20 pt-4">
        <h4 className="text-sm font-semibold text-text-dark mb-4">Hygiene Checks</h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="crates_clean">Crates Clean</Label>
            <select
              id="crates_clean"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.crates_clean}
              onChange={(e) => setFormData({ ...formData, crates_clean: e.target.value as '' | 'Yes' | 'No' | 'NA' })}
              disabled={saving || externalLoading}
            >
              {YES_NO_NA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="insect_infestation">Insect Infestation</Label>
            <select
              id="insect_infestation"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.insect_infestation}
              onChange={(e) =>
                setFormData({ ...formData, insect_infestation: e.target.value as '' | 'Yes' | 'No' | 'NA' })
              }
              disabled={saving || externalLoading}
            >
              {YES_NO_NA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dryer_hygiene_clean">Dryer Hygiene Clean</Label>
            <select
              id="dryer_hygiene_clean"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.dryer_hygiene_clean}
              onChange={(e) =>
                setFormData({ ...formData, dryer_hygiene_clean: e.target.value as '' | 'Yes' | 'No' | 'NA' })
              }
              disabled={saving || externalLoading}
            >
              {YES_NO_NA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="remarks">Remarks</Label>
        <textarea
          id="remarks"
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.remarks}
          onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          placeholder="Add any remarks or notes..."
          disabled={saving || externalLoading}
        />
      </div>

    </div>
    </div>
  )
}
