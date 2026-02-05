import { useState, FormEvent, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWashingRun } from '@/hooks/useWashingRun'
import type { ProcessStepRun, WashingFormData, WashingWasteFormData } from '@/types/processExecution'
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

interface WashingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
  availableQuantity?: {
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null
  onQuantityChange?: () => void
}

const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']

export function WashingStep({
  stepRun,
  loading: externalLoading = false,
  availableQuantity,
  onQuantityChange,
}: WashingStepProps) {
  const { washingRun, waste, loading, saveWashingRun, addWaste, deleteWaste } = useWashingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  const [formData, setFormData] = useState<WashingFormData>({
    washing_water_litres: '',
    oxy_acid_ml: '',
    moisture_percent: '',
    remarks: '',
  })

  const [wasteFormData, setWasteFormData] = useState<WashingWasteFormData>({
    waste_type: '',
    quantity_kg: '',
    remarks: '',
  })
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [wasteToDeleteId, setWasteToDeleteId] = useState<number | null>(null)

  const [showWasteForm, setShowWasteForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSaveRef = useRef(true)
  const formDataRef = useRef(formData)

  formDataRef.current = formData

  useEffect(() => {
    if (washingRun) {
      setFormData({
        washing_water_litres: washingRun.washing_water_litres?.toString() || '',
        oxy_acid_ml: washingRun.oxy_acid_ml?.toString() || '',
        moisture_percent: washingRun.moisture_percent?.toString() || '',
        remarks: washingRun.remarks || '',
      })
      skipNextSaveRef.current = true
    }
  }, [washingRun])

  const flushSave = useCallback(() => {
    const fd = formDataRef.current
    saveWashingRun({
      washing_water_litres: fd.washing_water_litres ? parseFloat(fd.washing_water_litres) : null,
      oxy_acid_ml: fd.oxy_acid_ml ? parseFloat(fd.oxy_acid_ml) : null,
      moisture_percent: fd.moisture_percent ? parseFloat(fd.moisture_percent) : null,
      remarks: fd.remarks.trim() || null,
    }).catch((err) => {
      console.error('Error saving washing data:', err)
      toast.error('Failed to save washing data')
    })
  }, [saveWashingRun])

  // Save on field change (debounced), then hook refetches in background
  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      saveTimeoutRef.current = null
      setSaving(true)
      try {
        await saveWashingRun({
          washing_water_litres: formData.washing_water_litres ? parseFloat(formData.washing_water_litres) : null,
          oxy_acid_ml: formData.oxy_acid_ml ? parseFloat(formData.oxy_acid_ml) : null,
          moisture_percent: formData.moisture_percent ? parseFloat(formData.moisture_percent) : null,
          remarks: formData.remarks.trim() || null,
        })
      } catch (error) {
        console.error('Error saving washing data:', error)
        toast.error('Failed to save washing data')
      } finally {
        setSaving(false)
      }
    }, 300)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        flushSave()
      }
    }
  }, [formData.washing_water_litres, formData.oxy_acid_ml, formData.moisture_percent, formData.remarks])

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
      onQuantityChange?.()
    } catch (error) {
      console.error('Error adding waste:', error)
      toast.error('Failed to add waste record')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWaste = (wasteId: number) => {
    setWasteToDeleteId(wasteId)
    setDeleteAlertOpen(true)
  }

  const performDeleteWaste = async () => {
    if (wasteToDeleteId == null) return
    setSaving(true)
    try {
      await deleteWaste(wasteToDeleteId)
      toast.success('Waste record deleted')
      onQuantityChange?.()
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
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Quantity</p>
              <p className="text-base font-semibold text-text-dark">
                {availableQuantity.availableQty.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Waste Recorded</p>
              <p className="text-base font-semibold text-text-dark">{totalWaste.toFixed(2)} kg</p>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="washing_water_litres">Washing Water (Litres)</Label>
            <Input
              id="washing_water_litres"
              type="number"
              step="0.01"
              min="0"
              value={formData.washing_water_litres}
              onChange={(e) => setFormData({ ...formData, washing_water_litres: e.target.value })}
              placeholder="0.00"
              disabled={saving || externalLoading}
              className="bg-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oxy_acid_ml">Oxy Acid (ml)</Label>
            <Input
              id="oxy_acid_ml"
              type="number"
              step="0.01"
              min="0"
              value={formData.oxy_acid_ml}
              onChange={(e) => setFormData({ ...formData, oxy_acid_ml: e.target.value })}
              placeholder="0.00"
              disabled={saving || externalLoading}
              className="bg-white"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="moisture_percent">Moisture (%)</Label>
            <Input
              id="moisture_percent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.moisture_percent}
              onChange={(e) => setFormData({ ...formData, moisture_percent: e.target.value })}
              placeholder="0.00"
              disabled={saving || externalLoading}
              className="bg-white"
              required
            />
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

      {/* Waste Section */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Waste Records</h4>
            <p className="text-xs text-text-dark/60 mt-1">
              Total Waste: {totalWaste.toFixed(2)} kg
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowWasteForm(!showWasteForm)}
            disabled={saving || externalLoading || !washingRun}
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
                <Label htmlFor="waste_type">Waste Type</Label>
                <select
                  id="waste_type"
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
                <Label htmlFor="waste_quantity">Quantity (kg)</Label>
                <Input
                  id="waste_quantity"
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
                <Label htmlFor="waste_remarks">Remarks</Label>
                <Input
                  id="waste_remarks"
                  type="text"
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
                  onClick={() => handleDeleteWaste(w.id)}
                  disabled={saving || externalLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
            <AlertDialogDescription>
              Are you sure you want to delete this waste record?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => performDeleteWaste()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
