import { useState, FormEvent, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMetalDetection } from '@/hooks/useMetalDetection'
import type { ProcessStepRun, MetalDetectionFormData, ForeignObjectRejectionFormData } from '@/types/processExecution'
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
  const { session, rejections, saveSession, addRejection, deleteRejection } = useMetalDetection({
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
  const [saving, setSaving] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [rejectionToDeleteId, setRejectionToDeleteId] = useState<number | null>(null)

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

  useEffect(() => {
    if (skipNextSessionSaveRef.current) {
      skipNextSessionSaveRef.current = false
      return
    }
    if (!sessionFormData.start_time) return
    if (sessionSaveTimeoutRef.current) clearTimeout(sessionSaveTimeoutRef.current)
    sessionSaveTimeoutRef.current = setTimeout(async () => {
      sessionSaveTimeoutRef.current = null
      setSaving(true)
      try {
        await saveSession({
          start_time: toISOString(sessionFormData.start_time)!,
          end_time: sessionFormData.end_time ? toISOString(sessionFormData.end_time) : null,
        })
      } catch (error) {
        console.error('Error saving session:', error)
        toast.error('Failed to save session')
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => {
      if (sessionSaveTimeoutRef.current) clearTimeout(sessionSaveTimeoutRef.current)
    }
  }, [sessionFormData.start_time, sessionFormData.end_time])

  // Generate hourly checks based on session times
  const hourlyChecks = useMemo(() => {
    if (!session?.start_time) return []

    const start = new Date(session.start_time)
    const end = session.end_time ? new Date(session.end_time) : new Date()
    const hours: Array<{ hour: string; label: string }> = []

    let current = new Date(start)
    current.setMinutes(0, 0, 0) // Round down to hour

    while (current <= end) {
      hours.push({
        hour: current.toISOString(),
        label: current.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      })
      current.setHours(current.getHours() + 1)
    }

    return hours
  }, [session])

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

      {/* Hourly Verification Grid */}
      {session && hourlyChecks.length > 0 && (
        <div className="border-t border-olive-light/20 pt-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Hourly Verification Checks</h4>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-olive-light/30">
              <thead>
                <tr className="bg-olive-light/20">
                  <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">
                    Hour
                  </th>
                  <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">
                    1.5mm Fe
                  </th>
                  <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">
                    1.5mm Non-Fe
                  </th>
                  <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">
                    1.5mm SS
                  </th>
                  <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">
                    Remarks
                  </th>
                  <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">
                    Corrective Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {hourlyChecks.map((check, index) => (
                  <tr key={check.hour} className={index % 2 === 0 ? 'bg-white' : 'bg-olive-light/5'}>
                    <td className="border border-olive-light/30 px-3 py-2 text-sm text-text-dark">{check.label}</td>
                    <td className="border border-olive-light/30 px-3 py-2 text-center text-sm text-text-dark/70">
                      <select
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        disabled
                        defaultValue=""
                      >
                        <option value="">-</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>
                    <td className="border border-olive-light/30 px-3 py-2 text-center text-sm text-text-dark/70">
                      <select
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        disabled
                        defaultValue=""
                      >
                        <option value="">-</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>
                    <td className="border border-olive-light/30 px-3 py-2 text-center text-sm text-text-dark/70">
                      <select
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        disabled
                        defaultValue=""
                      >
                        <option value="">-</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </td>
                    <td className="border border-olive-light/30 px-3 py-2 text-sm text-text-dark/70">-</td>
                    <td className="border border-olive-light/30 px-3 py-2 text-sm text-text-dark/70">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-text-dark/50 mt-2 italic">
              Note: Hourly verification grid is displayed for reference. Detailed verification data will be captured in
              a future update.
            </p>
          </div>
        </div>
      )}

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
    </div>
  )
}
