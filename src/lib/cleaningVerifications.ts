import { supabase } from '@/lib/supabaseClient'

export type CleaningVerificationStatus = 'DRAFT' | 'COMPLETED'
export type CleaningVerificationFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL'
export type CleaningVerificationResult = 'C' | 'NC'

export interface CleaningVerificationItemInput {
  item_key: string
  area_key: string
  area_name: string
  color_code: string | null
  item_name: string
  result: CleaningVerificationResult | null
  notes: string | null
  sort_order: number
}

export interface CleaningVerificationAreaSignoffInput {
  area_key: string
  area_name: string
  signed_by: string | null
  sort_order: number
}

export interface CleaningVerificationCorrectiveActionInput {
  row_key: string
  action_date: string | null
  non_conformance: string | null
  corrective_action: string | null
  signoff: string | null
  sort_order: number
}

export interface CleaningVerificationSaveInput {
  verification_id?: string | null
  frequency: CleaningVerificationFrequency
  status: CleaningVerificationStatus
  verification_date: string | null
  signoff_by: string | null
  items: CleaningVerificationItemInput[]
  area_signoffs: CleaningVerificationAreaSignoffInput[]
  corrective_actions: CleaningVerificationCorrectiveActionInput[]
}

export interface CleaningVerificationOverviewRecord {
  id: string
  frequency: CleaningVerificationFrequency
  status: CleaningVerificationStatus
  verificationDate: string | null
  signoffBy: string
  signoffById: string | null
  completedAt: string | null
  createdAt: string
  itemCount: number
  nonConformanceCount: number
}

export interface CleaningVerificationRecord extends CleaningVerificationSaveInput {
  id: string
  recorded_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface CleaningVerificationRow {
  id: string
  frequency: CleaningVerificationFrequency
  status: CleaningVerificationStatus
  verification_date: string | null
  signoff_by: string | null
  recorded_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
}

function getProfileLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Pending'
  return profile.full_name?.trim() || profile.email?.trim() || 'Pending'
}

export async function loadCleaningVerificationOverview(
  frequency: CleaningVerificationFrequency
): Promise<CleaningVerificationOverviewRecord[]> {
  const { data: verificationData, error: verificationError } = await supabase
    .from('cleaning_verifications')
    .select('id, frequency, status, verification_date, signoff_by, recorded_by, completed_at, created_at, updated_at')
    .eq('frequency', frequency)
    .order('verification_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (verificationError) throw verificationError

  const verifications = (verificationData ?? []) as CleaningVerificationRow[]
  if (verifications.length === 0) return []

  const verificationIds = verifications.map((verification) => verification.id)
  const profileIds = Array.from(
    new Set(verifications.map((verification) => verification.signoff_by).filter((id): id is string => Boolean(id)))
  )

  const [itemsResult, profilesResult] = await Promise.all([
    supabase
      .from('cleaning_verification_items')
      .select('verification_id, result')
      .in('verification_id', verificationIds),
    profileIds.length > 0
      ? supabase.from('user_profiles').select('id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ])

  if (itemsResult.error) throw itemsResult.error
  if (profilesResult.error) throw profilesResult.error

  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
  const counts = new Map<string, { itemCount: number; nonConformanceCount: number }>()

  ;((itemsResult.data ?? []) as Array<{ verification_id: string; result: CleaningVerificationResult | null }>).forEach((item) => {
    if (!item.result) return
    const current = counts.get(item.verification_id) ?? { itemCount: 0, nonConformanceCount: 0 }
    current.itemCount += 1
    if (item.result === 'NC') current.nonConformanceCount += 1
    counts.set(item.verification_id, current)
  })

  return verifications.map((verification) => {
    const count = counts.get(verification.id) ?? { itemCount: 0, nonConformanceCount: 0 }

    return {
      id: verification.id,
      frequency: verification.frequency,
      status: verification.status,
      verificationDate: verification.verification_date,
      signoffById: verification.signoff_by,
      signoffBy: getProfileLabel(verification.signoff_by ? profiles.get(verification.signoff_by) : undefined),
      completedAt: verification.completed_at,
      createdAt: verification.created_at,
      itemCount: count.itemCount,
      nonConformanceCount: count.nonConformanceCount,
    }
  })
}

export async function loadCleaningVerificationRecord(verificationId: string): Promise<CleaningVerificationRecord> {
  const { data: verificationData, error: verificationError } = await supabase
    .from('cleaning_verifications')
    .select('id, frequency, status, verification_date, signoff_by, recorded_by, completed_at, created_at, updated_at')
    .eq('id', verificationId)
    .maybeSingle()

  if (verificationError) throw verificationError
  if (!verificationData) {
    throw new Error('Cleaning verification record was not found.')
  }

  const [itemsResult, areaSignoffsResult, correctiveActionsResult] = await Promise.all([
    supabase
      .from('cleaning_verification_items')
      .select('item_key, area_key, area_name, color_code, item_name, result, notes, sort_order')
      .eq('verification_id', verificationId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('cleaning_verification_area_signoffs')
      .select('area_key, area_name, signed_by, sort_order')
      .eq('verification_id', verificationId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('cleaning_verification_corrective_actions')
      .select('row_key, action_date, non_conformance, corrective_action, signoff, sort_order')
      .eq('verification_id', verificationId)
      .order('sort_order', { ascending: true }),
  ])

  if (itemsResult.error) throw itemsResult.error
  if (areaSignoffsResult.error) throw areaSignoffsResult.error
  if (correctiveActionsResult.error) throw correctiveActionsResult.error

  const verification = verificationData as CleaningVerificationRow

  return {
    id: verification.id,
    verification_id: verification.id,
    frequency: verification.frequency,
    status: verification.status,
    verification_date: verification.verification_date,
    signoff_by: verification.signoff_by,
    recorded_by: verification.recorded_by,
    completed_at: verification.completed_at,
    created_at: verification.created_at,
    updated_at: verification.updated_at,
    items: (itemsResult.data ?? []) as CleaningVerificationItemInput[],
    area_signoffs: (areaSignoffsResult.data ?? []) as CleaningVerificationAreaSignoffInput[],
    corrective_actions: (correctiveActionsResult.data ?? []) as CleaningVerificationCorrectiveActionInput[],
  }
}

async function saveCleaningVerification(input: CleaningVerificationSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_cleaning_verification', {
    p_verification_id: input.verification_id ?? null,
    p_frequency: input.frequency,
    p_status: input.status,
    p_verification_date: input.verification_date,
    p_signoff_by: input.signoff_by,
    p_items: input.items,
    p_area_signoffs: input.area_signoffs,
    p_corrective_actions: input.corrective_actions,
  })

  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Cleaning verification save did not return a record id.')
  }

  return data
}

export function createCleaningVerificationDraft(
  input: Omit<CleaningVerificationSaveInput, 'status'>
): Promise<string> {
  return saveCleaningVerification({ ...input, status: 'DRAFT' })
}

export function saveCleaningVerificationDraft(
  input: Omit<CleaningVerificationSaveInput, 'status'>
): Promise<string> {
  return saveCleaningVerification({ ...input, status: 'DRAFT' })
}

export function submitCleaningVerification(
  input: Omit<CleaningVerificationSaveInput, 'status'>
): Promise<string> {
  return saveCleaningVerification({ ...input, status: 'COMPLETED' })
}
