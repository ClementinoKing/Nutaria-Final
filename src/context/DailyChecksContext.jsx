import { createContext, useContext, useMemo, useState } from 'react'

const DailyChecksContext = createContext(null)

const initialCategories = [
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

function buildInitialState() {
  return initialCategories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({
      ...item,
      completed: false,
    })),
  }))
}

export function DailyChecksProvider({ children }) {
  const [categories, setCategories] = useState(() => buildInitialState())

  const toggleItem = (categoryId, itemId) => {
    setCategories((prev) =>
      prev.map((category) => {
        if (category.id !== categoryId) return category

        return {
          ...category,
          items: category.items.map((item) => {
            if (item.id !== itemId) return item
            return { ...item, completed: !item.completed }
          }),
        }
      })
    )
  }

  const resetAll = () => {
    setCategories(buildInitialState())
  }

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
    }),
    [categories, toggleItem, counts]
  )

  return <DailyChecksContext.Provider value={value}>{children}</DailyChecksContext.Provider>
}

export function useDailyChecks() {
  const context = useContext(DailyChecksContext)
  if (!context) {
    throw new Error('useDailyChecks must be used within a DailyChecksProvider')
  }
  return context
}


