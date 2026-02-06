import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMetalDetectorChecks } from '@/hooks/useMetalDetectorChecks'
import { supabase } from '@/lib/supabaseClient'

type CheckAnswer = 'Yes' | 'No' | ''

interface CheckDraftRow {
  fe_1_5mm: CheckAnswer
  non_fe_1_5mm: CheckAnswer
  ss_1_5mm: CheckAnswer
  remarks: string
  corrective_action: string
}

function todayDateInput(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function buildCheckHours(): string[] {
  const hours: string[] = []
  for (let hour = 8; hour <= 17; hour += 1) {
    hours.push(`${String(hour).padStart(2, '0')}:00:00`)
  }
  return hours
}

function hourToLabel(hour: string): string {
  const [hh] = hour.split(':')
  const hourNum = Number(hh)
  const suffix = hourNum >= 12 ? 'PM' : 'AM'
  const display = hourNum % 12 === 0 ? 12 : hourNum % 12
  return `${display}:00 ${suffix}`
}

function createBlankDraft(): CheckDraftRow {
  return {
    fe_1_5mm: '',
    non_fe_1_5mm: '',
    ss_1_5mm: '',
    remarks: '',
    corrective_action: '',
  }
}

function MetalDetectorChecks() {
  const [selectedDate, setSelectedDate] = useState(todayDateInput())
  const [draftByHour, setDraftByHour] = useState<Record<string, CheckDraftRow>>({})
  const [savingHour, setSavingHour] = useState<string | null>(null)
  const [lastAlertKey, setLastAlertKey] = useState<string | null>(null)
  const [editingHour, setEditingHour] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState<CheckDraftRow>(createBlankDraft())
  const [userNamesByAuthId, setUserNamesByAuthId] = useState<Record<string, string>>({})
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    'default'
  )
  const checkHours = useMemo(() => buildCheckHours(), [])
  const { checks, loading, saving, error, refresh, saveCheck } = useMetalDetectorChecks()
  const checkRecordByHour = useMemo(
    () =>
      new Map(
        checks.map((record) => [record.check_hour, record] as const)
      ),
    [checks]
  )
  const editingRecord = editingHour ? checkRecordByHour.get(editingHour) : undefined
  const enteredById = editingRecord?.checked_by || editingRecord?.created_by || null
  const enteredByLabel = enteredById ? userNamesByAuthId[enteredById] || enteredById : 'Unknown'

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }
    setNotificationPermission(window.Notification.permission)
  }, [])

  useEffect(() => {
    refresh(selectedDate).catch((err) => {
      console.error('Failed to load metal detector checks:', err)
      toast.error('Failed to load checks')
    })
  }, [selectedDate, refresh])

  useEffect(() => {
    const byHour: Record<string, CheckDraftRow> = {}

    checkHours.forEach((hour) => {
      byHour[hour] = createBlankDraft()
    })

    checks.forEach((row) => {
      if (!byHour[row.check_hour]) return
      byHour[row.check_hour] = {
        fe_1_5mm: row.fe_1_5mm,
        non_fe_1_5mm: row.non_fe_1_5mm,
        ss_1_5mm: row.ss_1_5mm,
        remarks: row.remarks || '',
        corrective_action: row.corrective_action || '',
      }
    })

    setDraftByHour(byHour)
  }, [checks, checkHours])

  useEffect(() => {
    const loadUserLabels = async () => {
      const ids = Array.from(
        new Set(
          checks
            .map((row) => row.checked_by || row.created_by)
            .filter((value): value is string => !!value)
        )
      )

      if (ids.length === 0) {
        setUserNamesByAuthId({})
        return
      }

      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', ids)

      if (profileError) {
        console.error('Failed to load checker profiles:', profileError)
        const fallbackMap: Record<string, string> = {}
        ids.forEach((id) => {
          fallbackMap[id] = id
        })
        setUserNamesByAuthId(fallbackMap)
        return
      }

      const nextMap: Record<string, string> = {}
      ;(
        (data || []) as Array<{
          auth_user_id: string | null
          full_name: string | null
          email: string | null
        }>
      ).forEach((profile) => {
        if (!profile.auth_user_id) return
        const label = profile.full_name?.trim() || profile.email?.trim() || profile.auth_user_id
        nextMap[profile.auth_user_id] = label
      })

      ids.forEach((id) => {
        if (!nextMap[id]) nextMap[id] = id
      })

      setUserNamesByAuthId(nextMap)
    }

    loadUserLabels().catch((err) => {
      console.error('Unexpected profile loading error:', err)
    })
  }, [checks])

  const completedCount = useMemo(
    () =>
      checkHours.filter((hour) => {
        const row = draftByHour[hour]
        if (!row) return false
        return row.fe_1_5mm !== '' && row.non_fe_1_5mm !== '' && row.ss_1_5mm !== ''
      }).length,
    [checkHours, draftByHour]
  )

  const updateDraft = (hour: string, patch: Partial<CheckDraftRow>) => {
    setDraftByHour((prev) => ({
      ...prev,
      [hour]: { ...(prev[hour] || createBlankDraft()), ...patch },
    }))
  }

  const handleSaveRow = async (hour: string) => {
    const row = draftByHour[hour]
    if (!row) return
    if (row.fe_1_5mm === '' || row.non_fe_1_5mm === '' || row.ss_1_5mm === '') {
      toast.error(`Complete all test-piece results for ${hourToLabel(hour)}`)
      return
    }

    setSavingHour(hour)
    try {
      await saveCheck({
        check_date: selectedDate,
        check_hour: hour,
        fe_1_5mm: row.fe_1_5mm,
        non_fe_1_5mm: row.non_fe_1_5mm,
        ss_1_5mm: row.ss_1_5mm,
        remarks: row.remarks.trim() || null,
        corrective_action: row.corrective_action.trim() || null,
      })
      toast.success(`Saved ${hourToLabel(hour)} check`)
    } catch (err) {
      console.error('Failed to save check row:', err)
      toast.error(`Failed to save ${hourToLabel(hour)} check`)
    } finally {
      setSavingHour(null)
    }
  }

  const openEditModal = (hour: string) => {
    const row = draftByHour[hour]
    if (!row) return
    setEditingHour(hour)
    setEditingDraft({ ...row })
  }

  const handleSaveEdit = async () => {
    if (!editingHour) return
    if (editingDraft.fe_1_5mm === '' || editingDraft.non_fe_1_5mm === '' || editingDraft.ss_1_5mm === '') {
      toast.error('Complete all test-piece results before saving edits')
      return
    }

    setSavingHour(editingHour)
    try {
      await saveCheck({
        check_date: selectedDate,
        check_hour: editingHour,
        fe_1_5mm: editingDraft.fe_1_5mm,
        non_fe_1_5mm: editingDraft.non_fe_1_5mm,
        ss_1_5mm: editingDraft.ss_1_5mm,
        remarks: editingDraft.remarks.trim() || null,
        corrective_action: editingDraft.corrective_action.trim() || null,
      })
      setDraftByHour((prev) => ({ ...prev, [editingHour]: { ...editingDraft } }))
      toast.success(`Updated ${hourToLabel(editingHour)} check`)
      setEditingHour(null)
    } catch (err) {
      console.error('Failed to update check row:', err)
      toast.error(`Failed to update ${hourToLabel(editingHour)} check`)
    } finally {
      setSavingHour(null)
    }
  }

  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Browser notifications are not supported on this device')
      return
    }

    try {
      const permission = await window.Notification.requestPermission()
      setNotificationPermission(permission)
      if (permission === 'granted') {
        toast.success('Browser notifications enabled')
      } else {
        toast.error('Browser notifications were not enabled')
      }
    } catch (err) {
      console.error('Failed to request notification permission:', err)
      toast.error('Could not enable browser notifications')
    }
  }

  useEffect(() => {
    const checkForDuePrompt = () => {
      const today = todayDateInput()
      if (selectedDate !== today) return

      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()

      if (currentHour < 8 || currentHour > 17) return
      if (currentMinute > 2) return

      const hourSlot = `${String(currentHour).padStart(2, '0')}:00:00`
      const alertKey = `${selectedDate}-${hourSlot}`
      if (lastAlertKey === alertKey) return

      const row = draftByHour[hourSlot]
      const isCompleted = !!row && row.fe_1_5mm !== '' && row.non_fe_1_5mm !== '' && row.ss_1_5mm !== ''
      if (!isCompleted) {
        if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
          new window.Notification('Metal Detector Check Due', {
            body: `${hourToLabel(hourSlot)} check is due now. Please check the machine.`,
          })
        } else {
          toast.warning(`Metal detector check due now (${hourToLabel(hourSlot)}). Please check the machine.`)
        }
      }
      setLastAlertKey(alertKey)
    }

    checkForDuePrompt()
    const intervalId = window.setInterval(checkForDuePrompt, 30_000)
    return () => window.clearInterval(intervalId)
  }, [draftByHour, lastAlertKey, selectedDate])

  return (
    <PageLayout title="Metal Detector Checks" activeItem="metal-detector-checks" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Check Date</CardTitle>
            <CardDescription className="text-muted-foreground">
              Record hourly checks from 8:00 AM to 5:00 PM and keep a visible table of recorded checks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="metal-check-date">Date</Label>
              <Input
                id="metal-check-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={loading || saving}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Completed slots: <span className="font-semibold text-foreground">{completedCount}</span> / {checkHours.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={requestNotificationPermission}
                disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
              >
                {notificationPermission === 'granted' ? 'Notifications Enabled' : 'Enable Browser Notifications'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {notificationPermission === 'unsupported'
                  ? 'Not supported by this browser'
                  : `Permission: ${notificationPermission}`}
              </span>
            </div>
            {error && <p className="text-sm text-red-600">Database error: {error.message}</p>}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Hourly Check Records</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter results for Fe, Non-Fe, SS and save each row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse border border-olive-light/30">
                <thead>
                  <tr className="bg-olive-light/20">
                    <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">Hour</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">1.5mm Fe</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">1.5mm Non-Fe</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-center text-xs font-semibold text-text-dark">1.5mm SS</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">Remarks</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">Corrective Action</th>
                    <th className="border border-olive-light/30 px-3 py-2 text-left text-xs font-semibold text-text-dark">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {checkHours.map((hour, index) => {
                    const row = draftByHour[hour] || createBlankDraft()
                    const isChecked = checkRecordByHour.has(hour)
                    return (
                      <tr key={hour} className={index % 2 === 0 ? 'bg-white' : 'bg-olive-light/5'}>
                        <td className="border border-olive-light/30 px-3 py-2 text-sm font-medium text-text-dark">{hourToLabel(hour)}</td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <select
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            value={row.fe_1_5mm}
                            onChange={(e) => updateDraft(hour, { fe_1_5mm: e.target.value as CheckAnswer })}
                            disabled={loading || saving || isChecked}
                          >
                            <option value="">-</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <select
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            value={row.non_fe_1_5mm}
                            onChange={(e) => updateDraft(hour, { non_fe_1_5mm: e.target.value as CheckAnswer })}
                            disabled={loading || saving || isChecked}
                          >
                            <option value="">-</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <select
                            className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                            value={row.ss_1_5mm}
                            onChange={(e) => updateDraft(hour, { ss_1_5mm: e.target.value as CheckAnswer })}
                            disabled={loading || saving || isChecked}
                          >
                            <option value="">-</option>
                            <option value="Yes">Yes</option>
                            <option value="No">No</option>
                          </select>
                        </td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <Input
                            value={row.remarks}
                            onChange={(e) => updateDraft(hour, { remarks: e.target.value })}
                            placeholder="Optional remarks"
                            className="h-8"
                            disabled={loading || saving || isChecked}
                          />
                        </td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <Input
                            value={row.corrective_action}
                            onChange={(e) => updateDraft(hour, { corrective_action: e.target.value })}
                            placeholder="Corrective action"
                            className="h-8"
                            disabled={loading || saving || isChecked}
                          />
                        </td>
                        <td className="border border-olive-light/30 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="bg-olive hover:bg-olive-dark"
                              onClick={() => handleSaveRow(hour)}
                              disabled={loading || saving || savingHour === hour || isChecked}
                            >
                              {isChecked ? 'Checked' : savingHour === hour ? 'Saving...' : 'Save'}
                            </Button>
                            {isChecked && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openEditModal(hour)}
                                disabled={loading || saving}
                              >
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {editingHour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Edit Check - {hourToLabel(editingHour)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Update the saved check details, then save changes.</p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <Label htmlFor="edit-entered-by" className="mb-2 block">Entered by</Label>
                <Input id="edit-entered-by" value={enteredByLabel} disabled />
              </div>
              <div>
                <Label className="mb-2 block">1.5mm Fe</Label>
                <select
                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                  value={editingDraft.fe_1_5mm}
                  onChange={(e) => setEditingDraft((prev) => ({ ...prev, fe_1_5mm: e.target.value as CheckAnswer }))}
                >
                  <option value="">-</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <Label className="mb-2 block">1.5mm Non-Fe</Label>
                <select
                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                  value={editingDraft.non_fe_1_5mm}
                  onChange={(e) => setEditingDraft((prev) => ({ ...prev, non_fe_1_5mm: e.target.value as CheckAnswer }))}
                >
                  <option value="">-</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <Label className="mb-2 block">1.5mm SS</Label>
                <select
                  className="w-full rounded border border-input bg-background px-2 py-2 text-sm"
                  value={editingDraft.ss_1_5mm}
                  onChange={(e) => setEditingDraft((prev) => ({ ...prev, ss_1_5mm: e.target.value as CheckAnswer }))}
                >
                  <option value="">-</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="edit-remarks" className="mb-2 block">Remarks</Label>
                <Input
                  id="edit-remarks"
                  value={editingDraft.remarks}
                  onChange={(e) => setEditingDraft((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Optional remarks"
                />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="edit-corrective-action" className="mb-2 block">Corrective Action</Label>
                <Input
                  id="edit-corrective-action"
                  value={editingDraft.corrective_action}
                  onChange={(e) => setEditingDraft((prev) => ({ ...prev, corrective_action: e.target.value }))}
                  placeholder="Corrective action"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingHour(null)} disabled={saving || savingHour === editingHour}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-olive hover:bg-olive-dark"
                onClick={handleSaveEdit}
                disabled={saving || savingHour === editingHour}
              >
                {savingHour === editingHour ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}

export default MetalDetectorChecks
