import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  History,
  ListChecks,
  Sparkles,
  X,
} from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useDailyChecks } from '@/context/DailyChecksContext'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import ResponsiveTable from '@/components/ResponsiveTable'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DailyCheckHistoryRecord {
  check_date: string
  category: string
  item_key: string
  item_name: string
  note: string | null
  completed: boolean
  completed_at: string | null
  completed_by: string | null
}

interface UserProfileRow {
  auth_user_id: string | null
  full_name: string | null
  email: string | null
}

interface HistoryDay {
  check_date: string
  rows: DailyCheckHistoryRecord[]
  totalCount: number
  completedCount: number
  latestCompletedAt: string | null
  completedByLabels: string[]
}

interface HistoryTableRow {
  check_date: string
  completed_count: number
  total_count: number
  completion_percent: number
  completed_by: string
  latest_completed_at: string | null
  status: string
}

interface ChecklistRowProps {
  categoryId: string
  itemId: string
  itemName: string
  itemNote: string
  completed: boolean
  disabled: boolean
  onToggle: (categoryId: string, itemId: string) => void
}

const HISTORY_WINDOW_DAYS = 14

function getTodayDateInput(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function getRelativeDateInput(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateLong(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`))
}

function formatDisplayDate(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`))
}

function formatDateTime(dateTime: string | null): string {
  if (!dateTime) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateTime))
}

function formatTime(dateTime: string | null): string {
  if (!dateTime) return '—'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateTime))
}

function ChecklistRow({
  categoryId,
  itemId,
  itemName,
  itemNote,
  completed,
  disabled,
  onToggle,
}: ChecklistRowProps) {
  const Icon = completed ? CheckCircle2 : Circle

  return (
    <button
      type="button"
      onClick={() => onToggle(categoryId, itemId)}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive',
        completed
          ? 'border-olive/30 bg-olive/10 text-foreground'
          : 'border-border bg-background text-foreground/90 hover:border-olive/30 hover:bg-muted/40'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-[18px] w-[18px] flex-shrink-0 transition-colors',
          completed ? 'text-olive' : 'text-olive-light'
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5 text-foreground">{itemName}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{itemNote}</p>
      </div>
    </button>
  )
}

function DailyChecks() {
  const { categories, toggleItem, remainingCount, totalCount, completedCount, loading } = useDailyChecks()
  const [historyRows, setHistoryRows] = useState<DailyCheckHistoryRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [userLabelsById, setUserLabelsById] = useState<Record<string, string>>({})
  const [checksModalOpen, setChecksModalOpen] = useState(false)
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null)
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0)

  const todayDate = getTodayDateInput()
  const allComplete = remainingCount === 0 && totalCount > 0
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleToggleItem = useCallback(
    async (categoryId: string, itemId: string) => {
      await toggleItem(categoryId, itemId)
      setHistoryRefreshToken((current) => current + 1)
    },
    [toggleItem]
  )

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setHistoryLoading(true)
      setHistoryError(null)

      const { data, error } = await supabase
        .from('daily_checks')
        .select('check_date, category, item_key, item_name, note, completed, completed_at, completed_by')
        .gte('check_date', getRelativeDateInput(HISTORY_WINDOW_DAYS))
        .lte('check_date', todayDate)
        .order('check_date', { ascending: false })
        .order('category', { ascending: true })
        .order('item_key', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('Failed to load daily check history:', error)
        setHistoryRows([])
        setUserLabelsById({})
        setHistoryError('Could not load the recent history right now.')
        setHistoryLoading(false)
        return
      }

      const rows = (data as DailyCheckHistoryRecord[] | null) || []
      const uniqueIds = Array.from(
        new Set(rows.map((row) => row.completed_by).filter((value): value is string => !!value))
      )

      if (uniqueIds.length === 0) {
        setHistoryRows(rows)
        setUserLabelsById({})
        setHistoryLoading(false)
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', uniqueIds)

      if (cancelled) return

      if (profileError) {
        console.error('Failed to load daily check profiles:', profileError)
        const fallbackLabels: Record<string, string> = {}
        uniqueIds.forEach((id) => {
          fallbackLabels[id] = id
        })
        setUserLabelsById(fallbackLabels)
        setHistoryRows(rows)
        setHistoryLoading(false)
        return
      }

      const labels: Record<string, string> = {}
      ;((profileData as UserProfileRow[] | null) || []).forEach((profile) => {
        if (!profile.auth_user_id) return
        labels[profile.auth_user_id] = profile.full_name?.trim() || profile.email?.trim() || profile.auth_user_id
      })
      uniqueIds.forEach((id) => {
        if (!labels[id]) labels[id] = id
      })

      setUserLabelsById(labels)
      setHistoryRows(rows)
      setHistoryLoading(false)
    }

    loadHistory().catch((err) => {
      if (cancelled) return
      console.error('Unexpected daily check history error:', err)
      setHistoryRows([])
      setUserLabelsById({})
      setHistoryError('Could not load the recent history right now.')
      setHistoryLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [historyRefreshToken, todayDate])

  const historyDays = useMemo<HistoryDay[]>(() => {
    const grouped = new Map<string, DailyCheckHistoryRecord[]>()

    historyRows.forEach((row) => {
      const current = grouped.get(row.check_date) ?? []
      current.push(row)
      grouped.set(row.check_date, current)
    })

    return Array.from(grouped.entries())
      .map(([check_date, rows]) => {
        const completedRows = rows.filter((row) => row.completed && row.completed_at)
        const latestCompletedAt =
          completedRows.map((row) => row.completed_at as string).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
          null
        const completedByLabels = Array.from(
          new Set(
            completedRows
              .map((row) => row.completed_by)
              .filter((value): value is string => !!value)
              .map((id) => userLabelsById[id] || id)
          )
        )

        return {
          check_date,
          rows,
          totalCount: rows.length,
          completedCount: completedRows.length,
          latestCompletedAt,
          completedByLabels,
        }
      })
      .sort((a, b) => b.check_date.localeCompare(a.check_date))
  }, [historyRows, userLabelsById])

  const latestHistoryDay = historyDays[0] ?? null
  const selectedHistoryDay = useMemo(
    () => historyDays.find((day) => day.check_date === selectedHistoryDate) ?? null,
    [historyDays, selectedHistoryDate]
  )

  const historyTableRows = useMemo<HistoryTableRow[]>(() => {
    return historyDays.map((day) => {
      const percent = day.totalCount > 0 ? Math.round((day.completedCount / day.totalCount) * 100) : 0
      const status =
        percent === 100
          ? 'Complete'
          : percent > 0
            ? 'In progress'
            : 'Not started'

      return {
        check_date: day.check_date,
        completed_count: day.completedCount,
        total_count: day.totalCount,
        completion_percent: percent,
        completed_by: day.completedByLabels.length > 0 ? day.completedByLabels.join(', ') : '—',
        latest_completed_at: day.latestCompletedAt,
        status,
      }
    })
  }, [historyDays])

  const columns = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        mobileHeader: 'Date',
        render: (row: HistoryTableRow) => (
          <div>
            <div className="font-semibold text-text-dark">{formatDisplayDate(row.check_date)}</div>
            <div className="text-xs text-text-dark/60">{row.check_date}</div>
          </div>
        ),
        cellClassName: 'align-top',
      },
      {
        key: 'progress',
        header: 'Progress',
        mobileHeader: 'Progress',
        render: (row: HistoryTableRow) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-text-dark">
                {row.completed_count}/{row.total_count}
              </span>
              <span className="rounded-full bg-olive-light/10 px-2 py-0.5 text-xs font-semibold text-olive">
                {row.completion_percent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-olive-light/20">
              <div
                className={cn(
                  'h-full rounded-full',
                  row.completion_percent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-olive to-olive-light'
                )}
                style={{ width: `${row.completion_percent}%` }}
              />
            </div>
          </div>
        ),
        cellClassName: 'align-top min-w-[220px]',
      },
      {
        key: 'latest',
        header: 'Last Update',
        mobileHeader: 'Last Update',
        render: (row: HistoryTableRow) => (
          <div>
            <div className="font-medium text-text-dark">{formatTime(row.latest_completed_at)}</div>
            <div className="text-xs text-text-dark/60">{formatDateTime(row.latest_completed_at)}</div>
          </div>
        ),
        cellClassName: 'align-top',
      },
      {
        key: 'completedBy',
        header: 'Completed By',
        mobileHeader: 'Completed By',
        render: (row: HistoryTableRow) => (
          <div className="max-w-[16rem] text-sm text-text-dark">{row.completed_by}</div>
        ),
        cellClassName: 'align-top',
      },
      {
        key: 'status',
        header: 'Status',
        mobileHeader: 'Status',
        render: (row: HistoryTableRow) => (
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
              row.status === 'Complete'
                ? 'bg-emerald-100 text-emerald-800'
                : row.status === 'In progress'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-700'
            )}
          >
            {row.status}
          </span>
        ),
        cellClassName: 'align-top',
      },
    ],
    []
  )

  const handleHistoryRowClick = useCallback((row: HistoryTableRow) => {
    setSelectedHistoryDate(row.check_date)
  }, [])

  return (
    <>
      <PageLayout
        title="Daily Checks"
        activeItem="daily-checks"
        contentClassName="px-4 py-8 sm:px-6 lg:px-8"
      >
        <div className="space-y-8">
          <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(143,149,90,0.22),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(217,185,123,0.16),transparent_34%)]" />
            <div className="relative grid gap-6 p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-olive/20 bg-olive/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-olive">
                  <Sparkles className="h-3.5 w-3.5" />
                  Daily log
                </div>
                <div className="space-y-2">
                  <h2 className="max-w-2xl text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    Track today&apos;s checks and review recent history.
                  </h2>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Open the modal to complete today&apos;s checklist.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-foreground">
                    <CalendarDays className="h-4 w-4 text-olive" />
                    <span>{formatDateLong(todayDate)}</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-foreground">
                    <ListChecks className="h-4 w-4 text-olive" />
                    <span>{totalCount} checks today</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1.5 text-foreground">
                    <History className="h-4 w-4 text-olive" />
                    <span>{historyDays.length} days in history</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="border-border bg-background/80">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Completed today</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{completedCount}</p>
                    </div>
                    <div className="rounded-2xl bg-olive/10 p-3 text-olive">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border bg-background/80">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Remaining</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{remainingCount}</p>
                    </div>
                    <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-700">
                      <Circle className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border bg-background/80">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Progress</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{completionPercent}%</p>
                    </div>
                    <div className="rounded-2xl bg-sky-500/10 p-3 text-sky-700">
                      <Clock3 className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border bg-background/80">
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Latest action</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {latestHistoryDay
                          ? `${formatDisplayDate(latestHistoryDay.check_date)} · ${latestHistoryDay.completedCount}/${latestHistoryDay.totalCount} complete`
                          : 'No check activity yet'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-700">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          {allComplete ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>All daily checks complete</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setChecksModalOpen(true)} className="bg-olive text-white hover:bg-olive-dark">
              Open today&apos;s checks
            </Button>
            <Button variant="outline" onClick={() => setChecksModalOpen(true)}>
              Review checklist
            </Button>
          </div>

          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border/70 bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                <History className="h-5 w-5 text-olive" />
                Recent history
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                A rolling view of the most recent daily check sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {historyLoading ? (
                <div className="px-4 py-6 text-sm text-text-dark/60">Loading history...</div>
              ) : historyError ? (
                <div className="px-4 py-6 text-sm text-destructive">{historyError}</div>
              ) : (
                <ResponsiveTable
                  columns={columns}
                  data={historyTableRows}
                  rowKey="check_date"
                  emptyMessage={`No history yet for the last ${HISTORY_WINDOW_DAYS} days.`}
                  containerClassName="overflow-x-auto"
                  tableClassName="min-w-full divide-y divide-olive-light/20 bg-white"
                  theadClassName="bg-olive-light/10"
                  density="compact"
                  onRowClick={handleHistoryRowClick}
                />
              )}
            </CardContent>
          </Card>

        </div>
      </PageLayout>

      <AlertDialog open={checksModalOpen} onOpenChange={setChecksModalOpen}>
        <AlertDialogContent className="max-h-[90vh] max-w-5xl overflow-hidden p-0">
          <div className="flex max-h-[90vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-olive-light/20 px-4 py-4 sm:px-5">
              <div>
                <AlertDialogHeader className="text-left">
                  <AlertDialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                    <ListChecks className="h-5 w-5 text-olive sm:h-6 sm:w-6" />
                    Today&apos;s checks
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm sm:text-base">
                    Complete the checklist for {formatDateLong(todayDate)}. Changes are saved to the database right away.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>
              <AlertDialogCancel asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-2xl text-text-dark hover:bg-olive-light/10 sm:h-12 sm:w-12"
                >
                  <X className="h-6 w-6 stroke-[2.25]" />
                </Button>
              </AlertDialogCancel>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {loading ? (
                <Card className="border border-border bg-card">
                  <CardContent className="py-6">
                    <p className="text-sm text-muted-foreground">Loading today&apos;s checks...</p>
                  </CardContent>
                </Card>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {categories.map((category) => {
                  const categoryCompleted = category.items.filter((item) => item.completed).length
                  const categoryTotal = category.items.length
                  const categoryPercent = categoryTotal > 0 ? Math.round((categoryCompleted / categoryTotal) * 100) : 0

                  return (
                    <Card key={category.id} className="overflow-hidden border border-border bg-card shadow-sm">
                      <CardHeader className="space-y-2 border-b border-border/70 bg-muted/20 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <CardTitle className="text-base text-foreground">{category.title}</CardTitle>
                            <CardDescription className="mt-1 text-xs leading-5 text-muted-foreground">
                              {category.description}
                            </CardDescription>
                          </div>
                          <div className="rounded-full bg-olive/10 px-2.5 py-1 text-xs font-semibold text-olive">
                            {categoryCompleted}/{categoryTotal}
                          </div>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-olive to-olive-light transition-all"
                            style={{ width: `${categoryPercent}%` }}
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="p-3">
                        <div className="space-y-2.5">
                          {category.items.map((item) => (
                            <ChecklistRow
                              key={item.id}
                              categoryId={category.id}
                              itemId={item.id}
                              itemName={item.name}
                              itemNote={item.note}
                              completed={item.completed}
                              disabled={loading}
                              onToggle={handleToggleItem}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={selectedHistoryDay !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedHistoryDate(null)
        }}
      >
        <AlertDialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <div className="flex max-h-[90vh] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-olive-light/20 px-4 py-4 sm:px-5">
              <div>
                <AlertDialogHeader className="text-left">
                  <AlertDialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                    <History className="h-5 w-5 text-olive sm:h-6 sm:w-6" />
                    {selectedHistoryDay ? formatDisplayDate(selectedHistoryDay.check_date) : 'History details'}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm sm:text-base">
                    {selectedHistoryDay
                      ? `${selectedHistoryDay.completedCount}/${selectedHistoryDay.totalCount} complete`
                      : 'Review the checks recorded for this day.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>
              <AlertDialogCancel asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-2xl text-text-dark hover:bg-olive-light/10 sm:h-12 sm:w-12"
                  onClick={() => setSelectedHistoryDate(null)}
                >
                  <X className="h-6 w-6 stroke-[2.25]" />
                </Button>
              </AlertDialogCancel>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {selectedHistoryDay ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="border-border bg-background/80">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Completed</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">
                          {selectedHistoryDay.completedCount}/{selectedHistoryDay.totalCount}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background/80">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {selectedHistoryDay.completedCount === selectedHistoryDay.totalCount
                            ? 'Complete'
                            : selectedHistoryDay.completedCount > 0
                              ? 'In progress'
                              : 'Not started'}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background/80">
                      <CardContent className="p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Signed off by</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {selectedHistoryDay.completedByLabels.length > 0
                            ? selectedHistoryDay.completedByLabels.join(', ')
                            : '—'}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border border-border bg-card shadow-sm">
                    <CardHeader className="border-b border-border/70 bg-muted/20 p-4">
                      <CardTitle className="text-base text-foreground">Checks for this day</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {selectedHistoryDay.rows.map((row) => (
                          <div
                            key={`${row.check_date}-${row.category}-${row.item_key}`}
                            className={cn(
                              'rounded-lg border px-3 py-2.5 text-sm',
                              row.completed
                                ? 'border-olive/30 bg-olive/10 text-foreground'
                                : 'border-border bg-background text-foreground/90'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold leading-5">{row.item_name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{row.category}</p>
                              </div>
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                                  row.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'
                                )}
                              >
                                {row.completed ? 'Done' : 'Open'}
                              </span>
                            </div>
                            {row.note ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.note}</p> : null}
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>{row.completed_by ? userLabelsById[row.completed_by] || row.completed_by : '—'}</span>
                              <span>•</span>
                              <span>{formatDateTime(row.completed_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default DailyChecks
