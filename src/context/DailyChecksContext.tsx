import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface CheckTemplateItem {
  id: string
  name: string
  note: string
}

interface CheckTemplateCategory {
  id: string
  title: string
  description: string
  items: CheckTemplateItem[]
}

interface CheckItem extends CheckTemplateItem {
  completed: boolean
}

interface CheckCategory {
  id: string
  title: string
  description: string
  items: CheckItem[]
}

interface DailyCheckRecord {
  id: number
  check_date: string
  category: string
  item_key: string
  item_name: string
  note: string | null
  completed: boolean
  completed_at: string | null
  completed_by: string | null
}

interface DailyChecksContextValue {
  categories: CheckCategory[]
  toggleItem: (categoryId: string, itemId: string) => Promise<void>
  resetAll: () => Promise<void>
  totalCount: number
  completedCount: number
  remainingCount: number
  loading: boolean
}

const DailyChecksContext = createContext<DailyChecksContextValue | null>(null)

const initialCategories: CheckTemplateCategory[] = [
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Ensure all equipment is cleaned, calibrated, and ready for production.',
    items: [
      { id: 'dryer', name: 'Dryer Sanitised', note: 'Inspect and sanitise dryer drum and lint traps.' },
      { id: 'roaster', name: 'Roaster Heat Check', note: 'Verify roaster reach operating temp and record reading.' },
      { id: 'packaging', name: 'Packaging Line Prepared', note: 'Check conveyor belts and sealers for debris.' },
    ],
  },
  {
    id: 'facility',
    title: 'Facility',
    description: 'Daily housekeeping items to keep the facility compliant.',
    items: [
      { id: 'floor', name: 'Production Floor Clean', note: 'Sweep and sanitise processing areas.' },
      { id: 'storeroom', name: 'Storeroom Secured', note: 'Confirm cold storage doors sealed and locked.' },
      { id: 'waste', name: 'Waste Disposal Cleared', note: 'Remove waste bins and replace liners.' },
    ],
  },
  {
    id: 'documentation',
    title: 'Documentation',
    description: 'Paperwork and quality checks that must be logged daily.',
    items: [
      { id: 'logs', name: 'Production Logs Updated', note: 'Record batch counts and downtimes.' },
      { id: 'qc', name: 'Quality Control Sign-off', note: 'Complete QC checklist and capture signatures.' },
      { id: 'shipments', name: 'Outgoing Shipments Verified', note: 'Match shipment paperwork with physical orders.' },
    ],
  },
]

function getTodayDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function buildTemplateState(): CheckCategory[] {
  return initialCategories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({ ...item, completed: false })),
  }))
}

function mapRecordsToCategories(records: DailyCheckRecord[]): CheckCategory[] {
  const completedByKey = new Map<string, boolean>()
  records.forEach((record) => {
    completedByKey.set(record.item_key, !!record.completed)
  })

  return initialCategories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      completed: completedByKey.get(item.id) ?? false,
    })),
  }))
}

function buildSeedRows(checkDate: string) {
  return initialCategories.flatMap((category) =>
    category.items.map((item) => ({
      check_date: checkDate,
      category: category.title,
      item_key: item.id,
      item_name: item.name,
      note: item.note,
      completed: false,
    }))
  )
}

interface DailyChecksProviderProps {
  children: ReactNode
}

export function DailyChecksProvider({ children }: DailyChecksProviderProps) {
  const [categories, setCategories] = useState<CheckCategory[]>(() => buildTemplateState())
  const [loading, setLoading] = useState(true)

  const syncTodayChecks = useCallback(async () => {
    const checkDate = getTodayDate()
    setLoading(true)

    const { data, error } = await supabase
      .from('daily_checks')
      .select('*')
      .eq('check_date', checkDate)

    if (error) {
      console.error('Failed to load daily checks:', error)
      setCategories(buildTemplateState())
      setLoading(false)
      return
    }

    const records = ((data as DailyCheckRecord[]) || [])
    const existingKeys = new Set(records.map((record) => record.item_key))
    const missingRows = buildSeedRows(checkDate).filter((row) => !existingKeys.has(row.item_key))

    if (missingRows.length > 0) {
      const { error: seedError } = await supabase.from('daily_checks').upsert(missingRows, {
        onConflict: 'check_date,item_key',
      })
      if (seedError) {
        console.error('Failed to seed daily checks:', seedError)
      }

      const { data: refreshedData, error: refreshError } = await supabase
        .from('daily_checks')
        .select('*')
        .eq('check_date', checkDate)

      if (refreshError) {
        console.error('Failed to refresh daily checks:', refreshError)
        setCategories(buildTemplateState())
        setLoading(false)
        return
      }

      setCategories(mapRecordsToCategories((refreshedData as DailyCheckRecord[]) || []))
      setLoading(false)
      return
    }

    setCategories(mapRecordsToCategories(records))
    setLoading(false)
  }, [])

  useEffect(() => {
    syncTodayChecks().catch((error) => {
      console.error('Failed to initialize daily checks:', error)
      setLoading(false)
    })
  }, [syncTodayChecks])

  const toggleItem = useCallback(
    async (categoryId: string, itemId: string) => {
      const currentCategory = categories.find((category) => category.id === categoryId)
      const currentItem = currentCategory?.items.find((item) => item.id === itemId)
      if (!currentItem) return

      const nextCompleted = !currentItem.completed

      setCategories((prev) =>
        prev.map((category) =>
          category.id !== categoryId
            ? category
            : {
                ...category,
                items: category.items.map((item) =>
                  item.id === itemId ? { ...item, completed: nextCompleted } : item
                ),
              }
        )
      )

      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      const { error } = await supabase
        .from('daily_checks')
        .update({
          completed: nextCompleted,
          completed_at: nextCompleted ? new Date().toISOString() : null,
          completed_by: nextCompleted ? userId : null,
        })
        .eq('check_date', getTodayDate())
        .eq('item_key', itemId)

      if (error) {
        console.error('Failed to toggle daily check:', error)
        await syncTodayChecks()
      }
    },
    [categories, syncTodayChecks]
  )

  const resetAll = useCallback(async () => {
    setCategories(buildTemplateState())

    const { error } = await supabase
      .from('daily_checks')
      .update({
        completed: false,
        completed_at: null,
        completed_by: null,
      })
      .eq('check_date', getTodayDate())

    if (error) {
      console.error('Failed to reset daily checks:', error)
      await syncTodayChecks()
    }
  }, [syncTodayChecks])

  const counts = useMemo(() => {
    const total = categories.reduce((sum, category) => sum + category.items.length, 0)
    const completed = categories.reduce(
      (sum, category) => sum + category.items.filter((item) => item.completed).length,
      0
    )
    return {
      total,
      completed,
      remaining: total - completed,
    }
  }, [categories])

  const value = useMemo(
    () => ({
      categories,
      toggleItem,
      resetAll,
      totalCount: counts.total,
      completedCount: counts.completed,
      remainingCount: counts.remaining,
      loading,
    }),
    [categories, toggleItem, resetAll, counts, loading]
  )

  return <DailyChecksContext.Provider value={value}>{children}</DailyChecksContext.Provider>
}

export function useDailyChecks(): DailyChecksContextValue {
  const context = useContext(DailyChecksContext)
  if (!context) {
    throw new Error('useDailyChecks must be used within a DailyChecksProvider')
  }
  return context
}
