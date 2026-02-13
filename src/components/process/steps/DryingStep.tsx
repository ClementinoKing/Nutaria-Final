import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDryingRun } from '@/hooks/useDryingRun'
import type { ProcessStepRun, DryingFormData, DryingWasteFormData } from '@/types/processExecution'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']

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
  const { dryingRun, waste, saveDryingRun, addWaste, deleteWaste } = useDryingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  const [wasteFormData, setWasteFormData] = useState<DryingWasteFormData>({
    waste_type: '',
    quantity_kg: '',
    remarks: '',
  })
  const [showWasteForm, setShowWasteForm] = useState(false)
  const [wasteToDeleteId, setWasteToDeleteId] = useState<number | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)

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

  const formDataRef = useRef(formData)
  formDataRef.current = formData

  const flushSave = useCallback(() => {
    const fd = formDataRef.current
    const moistureIn = fd.moisture_in ? parseFloat(fd.moisture_in) : null
    const moistureOut = fd.moisture_out ? parseFloat(fd.moisture_out) : null
    if (moistureIn !== null && moistureOut !== null && moistureOut > moistureIn) return
    saveDryingRun({
      dryer_temperature_c: fd.dryer_temperature_c ? parseFloat(fd.dryer_temperature_c) : null,
      time_in: fd.time_in ? toISOString(fd.time_in) : null,
      time_out: fd.time_out ? toISOString(fd.time_out) : null,
      moisture_in: moistureIn,
      moisture_out: moistureOut,
      crates_clean: fd.crates_clean ? (fd.crates_clean as 'Yes' | 'No' | 'NA') : null,
      insect_infestation: fd.insect_infestation ? (fd.insect_infestation as 'Yes' | 'No' | 'NA') : null,
      dryer_hygiene_clean: fd.dryer_hygiene_clean ? (fd.dryer_hygiene_clean as 'Yes' | 'No' | 'NA') : null,
      remarks: fd.remarks.trim() || null,
    }).catch((err) => {
      console.error('Error saving drying data:', err)
      toast.error('Failed to save drying data')
    })
  }, [saveDryingRun])

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      flushSave()
    }, 10000)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        flushSave()
      }
    }
  }, [flushSave])

  const handleWasteSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const quantity = parseFloat(wasteFormData.quantity_kg)
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }
    if (!wasteFormData.waste_type.trim()) {
      toast.error('Please select a waste type')
      return
    }
    setSaving(true)
    try {
      await addWaste({
        waste_type: wasteFormData.waste_type.trim(),
        quantity_kg: quantity,
        remarks: wasteFormData.remarks.trim() || null,
      })
      setWasteFormData({ waste_type: '', quantity_kg: '', remarks: '' })
      setShowWasteForm(false)
      toast.success('Waste record added')
    } catch (error) {
      console.error('Error adding waste:', error)
      toast.error('Failed to add waste record')
    } finally {
      setSaving(false)
    }
  }

  const performDeleteWaste = async () => {
    if (wasteToDeleteId == null) return
    setSaving(true)
    try {
      await deleteWaste(wasteToDeleteId)
      toast.success('Waste record deleted')
      setDeleteAlertOpen(false)
      setWasteToDeleteId(null)
    } catch (error) {
      console.error('Error deleting waste:', error)
      toast.error('Failed to delete waste record')
    } finally {
      setSaving(false)
    }
  }

  const totalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)

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
            required
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
            required
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
            required
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
            required
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
            required
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
              onChange={(e) => setFormData({ ...formData, crates_clean: e.target.value as 'Yes' | 'No' | 'NA' })}
              disabled={saving || externalLoading}
              required
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
                setFormData({ ...formData, insect_infestation: e.target.value as 'Yes' | 'No' | 'NA' })
              }
              disabled={saving || externalLoading}
              required
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
                setFormData({ ...formData, dryer_hygiene_clean: e.target.value as 'Yes' | 'No' | 'NA' })
              }
              disabled={saving || externalLoading}
              required
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

      {/* Waste Section */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Waste Records</h4>
            <p className="text-xs text-text-dark/60 mt-1">Total Waste: {totalWaste.toFixed(2)} kg</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowWasteForm(!showWasteForm)}
            disabled={saving || externalLoading || !dryingRun}
            className="border-olive-light/30"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Waste
          </Button>
        </div>
        {showWasteForm && (
          <form onSubmit={handleWasteSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="drying_waste_type">Waste Type</Label>
                <select
                  id="drying_waste_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={wasteFormData.waste_type}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, waste_type: e.target.value })}
                  required
                  disabled={saving || externalLoading}
                >
                  <option value="">Select type</option>
                  {WASTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_waste_quantity">Quantity (kg)</Label>
                <Input
                  id="drying_waste_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wasteFormData.quantity_kg}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, quantity_kg: e.target.value })}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_waste_remarks">Remarks</Label>
                <Input
                  id="drying_waste_remarks"
                  value={wasteFormData.remarks}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, remarks: e.target.value })}
                  placeholder="Optional"
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowWasteForm(false)
                  setWasteFormData({ waste_type: '', quantity_kg: '', remarks: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                Add Waste
              </Button>
            </div>
          </form>
        )}
        {waste.length === 0 ? (
          <p className="text-sm text-text-dark/60 py-4 text-center">No waste records yet</p>
        ) : (
          <div className="space-y-2">
            {waste.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-text-dark">{w.waste_type}</span>
                  <span className="text-sm text-text-dark/70">{w.quantity_kg} kg</span>
                  {w.remarks && (
                    <span className="text-xs text-text-dark/50 italic">{w.remarks}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWasteToDeleteId(w.id)
                    setDeleteAlertOpen(true)
                  }}
                  disabled={saving || externalLoading}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setWasteToDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete waste record?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this waste record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={performDeleteWaste}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  )
}
