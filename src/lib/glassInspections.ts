import { supabase } from '@/lib/supabaseClient'

export type GlassInspectionStatus = 'DRAFT' | 'COMPLETED'
export type GlassRiskClass = '1' | '2' | '3'

export interface GlassInspectionItemInput {
  item_key: string
  area_name: string
  item_name: string
  total_quantity: number
  qty_intact: number | null
  qty_not_intact: number | null
  action_required_nc_no: string | null
  risk_class: GlassRiskClass | null
  action_completed: boolean | null
  signature: string | null
  sort_order: number
}

export interface GlassInspectionSaveInput {
  inspection_id?: string | null
  status: GlassInspectionStatus
  checked_by: string | null
  inspection_date: string | null
  items: GlassInspectionItemInput[]
}

export interface GlassInspectionOverviewRecord {
  id: string
  status: GlassInspectionStatus
  checkedBy: string
  checkedById: string | null
  inspectionDate: string | null
  completedAt: string | null
  createdAt: string
  areasChecked: string
}

export interface GlassInspectionRecord {
  id: string
  status: GlassInspectionStatus
  checkedById: string | null
  recordedById: string | null
  inspectionDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  items: GlassInspectionItemInput[]
}

interface GlassInspectionRow {
  id: string
  status: GlassInspectionStatus
  checked_by: string | null
  recorded_by: string | null
  inspection_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
}

interface GlassInspectionItemRow {
  item_key: string
  area_name: string
  item_name: string
  total_quantity: number
  qty_intact: number | null
  qty_not_intact: number | null
  action_required_nc_no: string | null
  risk_class: GlassRiskClass | null
  action_completed: boolean | null
  signature: string | null
  sort_order: number
}

function getProfileLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Pending'
  return profile.full_name?.trim() || profile.email?.trim() || 'Pending'
}

function normalizeAreas(items: Array<Pick<GlassInspectionItemRow, 'area_name'>>): string {
  const areas = Array.from(new Set(items.map((item) => item.area_name).filter(Boolean)))
  if (areas.length === 0) return 'No item rows'
  if (areas.length <= 3) return areas.join(', ')
  return `${areas.slice(0, 3).join(', ')} +${areas.length - 3} more`
}

export async function loadGlassInspectionOverview(): Promise<GlassInspectionOverviewRecord[]> {
  const { data: inspectionsData, error: inspectionsError } = await supabase
    .from('glass_inspections')
    .select('id, status, checked_by, recorded_by, inspection_date, completed_at, created_at, updated_at')
    .order('inspection_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (inspectionsError) {
    throw inspectionsError
  }

  const inspections = (inspectionsData ?? []) as GlassInspectionRow[]
  if (inspections.length === 0) {
    return []
  }

  const inspectionIds = inspections.map((inspection) => inspection.id)
  const profileIds = Array.from(
    new Set(inspections.map((inspection) => inspection.checked_by).filter((id): id is string => Boolean(id)))
  )

  const [itemsResult, profilesResult] = await Promise.all([
    supabase
      .from('glass_inspection_items')
      .select('inspection_id, area_name')
      .in('inspection_id', inspectionIds)
      .order('sort_order', { ascending: true }),
    profileIds.length > 0
      ? supabase.from('user_profiles').select('id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ])

  if (itemsResult.error) throw itemsResult.error
  if (profilesResult.error) throw profilesResult.error

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  )
  const itemsByInspectionId = new Map<string, Array<{ area_name: string }>>()

  ;((itemsResult.data ?? []) as Array<{ inspection_id: string; area_name: string }>).forEach((item) => {
    const current = itemsByInspectionId.get(item.inspection_id) ?? []
    current.push({ area_name: item.area_name })
    itemsByInspectionId.set(item.inspection_id, current)
  })

  return inspections.map((inspection) => ({
    id: inspection.id,
    status: inspection.status,
    checkedById: inspection.checked_by,
    checkedBy: getProfileLabel(inspection.checked_by ? profiles.get(inspection.checked_by) : undefined),
    inspectionDate: inspection.inspection_date,
    completedAt: inspection.completed_at,
    createdAt: inspection.created_at,
    areasChecked: normalizeAreas(itemsByInspectionId.get(inspection.id) ?? []),
  }))
}

export async function loadGlassInspectionRecord(inspectionId: string): Promise<GlassInspectionRecord> {
  const { data: inspectionData, error: inspectionError } = await supabase
    .from('glass_inspections')
    .select('id, status, checked_by, recorded_by, inspection_date, completed_at, created_at, updated_at')
    .eq('id', inspectionId)
    .maybeSingle()

  if (inspectionError) throw inspectionError
  if (!inspectionData) {
    throw new Error('Glass inspection record was not found.')
  }

  const { data: itemData, error: itemError } = await supabase
    .from('glass_inspection_items')
    .select('item_key, area_name, item_name, total_quantity, qty_intact, qty_not_intact, action_required_nc_no, risk_class, action_completed, signature, sort_order')
    .eq('inspection_id', inspectionId)
    .order('sort_order', { ascending: true })

  if (itemError) throw itemError

  const inspection = inspectionData as GlassInspectionRow

  return {
    id: inspection.id,
    status: inspection.status,
    checkedById: inspection.checked_by,
    recordedById: inspection.recorded_by,
    inspectionDate: inspection.inspection_date,
    completedAt: inspection.completed_at,
    createdAt: inspection.created_at,
    updatedAt: inspection.updated_at,
    items: ((itemData ?? []) as GlassInspectionItemRow[]).map((item) => ({
      item_key: item.item_key,
      area_name: item.area_name,
      item_name: item.item_name,
      total_quantity: item.total_quantity,
      qty_intact: item.qty_intact,
      qty_not_intact: item.qty_not_intact,
      action_required_nc_no: item.action_required_nc_no,
      risk_class: item.risk_class,
      action_completed: item.action_completed,
      signature: item.signature,
      sort_order: item.sort_order,
    })),
  }
}

async function saveGlassInspection(input: GlassInspectionSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_glass_inspection', {
    p_inspection_id: input.inspection_id ?? null,
    p_status: input.status,
    p_checked_by: input.checked_by,
    p_inspection_date: input.inspection_date,
    p_items: input.items,
  })

  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Glass inspection save did not return a record id.')
  }

  return data
}

export function createGlassInspectionDraft(input: Omit<GlassInspectionSaveInput, 'status'>): Promise<string> {
  return saveGlassInspection({ ...input, status: 'DRAFT' })
}

export function saveGlassInspectionDraft(input: Omit<GlassInspectionSaveInput, 'status'>): Promise<string> {
  return saveGlassInspection({ ...input, status: 'DRAFT' })
}

export function submitGlassInspection(input: Omit<GlassInspectionSaveInput, 'status'>): Promise<string> {
  return saveGlassInspection({ ...input, status: 'COMPLETED' })
}
