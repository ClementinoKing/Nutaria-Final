import { useState, FormEvent, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMetalDetection } from '@/hooks/useMetalDetection'
import type {
  ProcessStepRun,
  MetalDetectionFormData,
  ForeignObjectRejectionFormData,
  MetalDetectorWasteFormData,
} from '@/types/processExecution'

const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']
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

interface MetalDetectionStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
  availableQuantity?: {
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null
  onQuantityChange?: () => void
}

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

export function MetalDetectionStep({
  stepRun,
  loading: externalLoading = false,
  availableQuantity,
  onQuantityChange,
}: MetalDetectionStepProps) {
  const { session, rejections, waste, saveSession, addRejection, deleteRejection, addWaste, deleteWaste } =
    useMetalDetection({
      stepRunId: stepRun.id,
      enabled: true,
    })

  const [sessionFormData, setSessionFormData] = useState<MetalDetectionFormData>({
    start_time: '',
    end_time: '',
  })

  const [rejectionFormData, setRejectionFormData] = useState<ForeignObjectRejectionFormData>({
    rejection_time: '',
    object_type: '',
    weight: '',
    corrective_action: '',
  })

  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const [showWasteForm, setShowWasteForm] = useState(false)
  const [wasteFormData, setWasteFormData] = useState<MetalDetectorWasteFormData>({
    waste_type: '',
    quantity_kg: '',
    remarks: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [rejectionToDeleteId, setRejectionToDeleteId] = useState<number | null>(null)
  const [wasteDeleteAlertOpen, setWasteDeleteAlertOpen] = useState(false)
  const [wasteToDeleteId, setWasteToDeleteId] = useState<number | null>(null)

  const sessionSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSessionSaveRef = useRef(true)

  useEffect(() => {
    if (session) {
      setSessionFormData({
        start_time: toLocalDateTimeInput(session.start_time),
        end_time: toLocalDateTimeInput(session.end_time),
      })
      skipNextSessionSaveRef.current = true
    }
  }, [session])

  const sessionFormDataRef = useRef(sessionFormData)
  sessionFormDataRef.current = sessionFormData

  useEffect(() => {
    if (skipNextSessionSaveRef.current) {
      skipNextSessionSaveRef.current = false
      return
    }
    if (!sessionFormData.start_time) return
    if (sessionSaveTimeoutRef.current) clearTimeout(sessionSaveTimeoutRef.current)
    sessionSaveTimeoutRef.current = setTimeout(() => {
      sessionSaveTimeoutRef.current = null
      saveSession({
        start_time: toISOString(sessionFormData.start_time)!,
        end_time: sessionFormData.end_time ? toISOString(sessionFormData.end_time) : null,
      }).catch((error) => {
        console.error('Error saving session:', error)
        toast.error('Failed to save session')
      })
    }, 10000)
    return () => {
      if (sessionSaveTimeoutRef.current) {
        clearTimeout(sessionSaveTimeoutRef.current)
        sessionSaveTimeoutRef.current = null
      }
    }
  }, [sessionFormData.start_time, sessionFormData.end_time])

  useEffect(() => {
    return () => {
      if (sessionSaveTimeoutRef.current) {
        clearTimeout(sessionSaveTimeoutRef.current)
        sessionSaveTimeoutRef.current = null
        const fd = sessionFormDataRef.current
        if (fd.start_time) {
          saveSession({
            start_time: toISOString(fd.start_time)!,
            end_time: fd.end_time ? toISOString(fd.end_time) : null,
          }).catch((err) => {
            console.error('Error saving session:', err)
            toast.error('Failed to save session')
          })
        }
      }
    }
  }, [saveSession])

  const handleRejectionSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!rejectionFormData.rejection_time) {
      toast.error('Rejection time is required')
      return
    }

    if (!rejectionFormData.object_type.trim()) {
      toast.error('Object type is required')
      return
    }

    setSaving(true)
    try {
      await addRejection({
        rejection_time: toISOString(rejectionFormData.rejection_time)!,
        object_type: rejectionFormData.object_type.trim(),
        weight: rejectionFormData.weight ? parseFloat(rejectionFormData.weight) : null,
        corrective_action: rejectionFormData.corrective_action.trim() || null,
      })
      setRejectionFormData({ rejection_time: '', object_type: '', weight: '', corrective_action: '' })
      setShowRejectionForm(false)
      toast.success('Rejection recorded')
      onQuantityChange?.()
    } catch (error) {
      console.error('Error adding rejection:', error)
      toast.error('Failed to record rejection')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRejection = (rejectionId: number) => {
    setRejectionToDeleteId(rejectionId)
    setDeleteAlertOpen(true)
  }

  const performDeleteRejection = async () => {
    if (rejectionToDeleteId == null) return
    setSaving(true)
    try {
      await deleteRejection(rejectionToDeleteId)
      toast.success('Rejection deleted')
      onQuantityChange?.()
      setDeleteAlertOpen(false)
      setRejectionToDeleteId(null)
    } catch (error) {
      console.error('Error deleting rejection:', error)
      toast.error('Failed to delete rejection')
    } finally {
      setSaving(false)
    }
  }

  const totalRejections = rejections.reduce((sum, r) => sum + (r.weight || 0), 0)
  const totalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)

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
      setWasteDeleteAlertOpen(false)
      setWasteToDeleteId(null)
    } catch (error) {
      console.error('Error deleting waste:', error)
      toast.error('Failed to delete waste record')
    } finally {
      setSaving(false)
    }
  }

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
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Rejections Recorded</p>
              <p className="text-base font-semibold text-text-dark">{totalRejections.toFixed(2)} kg</p>
            </div>
          </div>
        </div>
      )}
      {/* Session times */}
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="start_time">Start Time *</Label>
            <Input
              id="start_time"
              type="datetime-local"
              value={sessionFormData.start_time}
              onChange={(e) => setSessionFormData({ ...sessionFormData, start_time: e.target.value })}
              disabled={saving || externalLoading}
              className="bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_time">End Time</Label>
            <Input
              id="end_time"
              type="datetime-local"
              value={sessionFormData.end_time}
              onChange={(e) => setSessionFormData({ ...sessionFormData, end_time: e.target.value })}
              disabled={saving || externalLoading}
              className="bg-white"
            />
          </div>
        </div>
      </div>

      {/* Foreign Object Rejections */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text-dark">Foreign Object Rejections</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRejectionForm(!showRejectionForm)}
            disabled={saving || externalLoading || !session}
            className="border-olive-light/30"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Rejection
          </Button>
        </div>

        {showRejectionForm && (
          <form onSubmit={handleRejectionSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rejection_time">Rejection Time *</Label>
                <Input
                  id="rejection_time"
                  type="datetime-local"
                  value={rejectionFormData.rejection_time}
                  onChange={(e) => setRejectionFormData({ ...rejectionFormData, rejection_time: e.target.value })}
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="object_type">Object Type *</Label>
                <Input
                  id="object_type"
                  type="text"
                  value={rejectionFormData.object_type}
                  onChange={(e) => setRejectionFormData({ ...rejectionFormData, object_type: e.target.value })}
                  placeholder="e.g., Metal, Plastic, Glass"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rejection_weight">Weight (kg or g)</Label>
                <Input
                  id="rejection_weight"
                  type="number"
                  step="0.001"
                  min="0"
                  value={rejectionFormData.weight}
                  onChange={(e) => setRejectionFormData({ ...rejectionFormData, weight: e.target.value })}
                  placeholder="0.000"
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="corrective_action">Corrective Action</Label>
                <Input
                  id="corrective_action"
                  type="text"
                  value={rejectionFormData.corrective_action}
                  onChange={(e) => setRejectionFormData({ ...rejectionFormData, corrective_action: e.target.value })}
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
                  setShowRejectionForm(false)
                  setRejectionFormData({ rejection_time: '', object_type: '', weight: '', corrective_action: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                Record Rejection
              </Button>
            </div>
          </form>
        )}

        {rejections.length === 0 ? (
          <p className="text-sm text-text-dark/60 py-4 text-center">No rejections recorded yet</p>
        ) : (
          <div className="space-y-2">
            {rejections.map((rejection) => (
              <div
                key={rejection.id}
                className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-text-dark">{rejection.object_type}</span>
                  <span className="text-xs text-text-dark/50">
                    {new Date(rejection.rejection_time).toLocaleString()}
                  </span>
                  {rejection.weight !== null && (
                    <span className="text-sm text-text-dark/70">{rejection.weight} kg/g</span>
                  )}
                  {rejection.corrective_action && (
                    <span className="text-xs text-text-dark/50 italic">{rejection.corrective_action}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRejection(rejection.id)}
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
            disabled={saving || externalLoading}
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
                <Label htmlFor="metal_waste_type">Waste Type</Label>
                <select
                  id="metal_waste_type"
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
                <Label htmlFor="metal_waste_quantity">Quantity (kg)</Label>
                <Input
                  id="metal_waste_quantity"
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
                <Label htmlFor="metal_waste_remarks">Remarks</Label>
                <Input
                  id="metal_waste_remarks"
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
                    setWasteDeleteAlertOpen(true)
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

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setRejectionToDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rejection record?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rejection record?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => performDeleteRejection()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={wasteDeleteAlertOpen} onOpenChange={(open) => { setWasteDeleteAlertOpen(open); if (!open) setWasteToDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete waste record?</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this waste record?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={performDeleteWaste}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
