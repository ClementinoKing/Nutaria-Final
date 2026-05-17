import { supabase } from '@/lib/supabaseClient'

export type ChemicalVerificationStatus = 'DRAFT' | 'COMPLETED'

export interface ChemicalVerificationItemInput {
  row_key: string
  issue_date: string | null
  chemical_name: string | null
  batch_details: string | null
  quantity_issued: string | null
  dilution_verified_by: string | null
  issued_to: string | null
  issued_by: string | null
  sort_order: number
}

export interface ChemicalVerificationSaveInput {
  verification_id?: string | null
  status: ChemicalVerificationStatus
  signoff_by: string | null
  signoff_date: string | null
  items: ChemicalVerificationItemInput[]
}

export interface ChemicalVerificationOverviewRecord {
  id: string
  status: ChemicalVerificationStatus
  signoffBy: string
  signoffById: string | null
  signoffDate: string | null
  completedAt: string | null
  createdAt: string
  rowCount: number
}

export interface ChemicalVerificationRecord {
  id: string
  status: ChemicalVerificationStatus
  signoffById: string | null
  recordedById: string | null
  signoffDate: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  items: ChemicalVerificationItemInput[]
}

interface ChemicalVerificationRow {
  id: string
  status: ChemicalVerificationStatus
  signoff_by: string | null
  recorded_by: string | null
  signoff_date: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface ChemicalVerificationItemRow {
  row_key: string
  issue_date: string | null
  chemical_name: string | null
  batch_details: string | null
  quantity_issued: string | null
  dilution_verified_by: string | null
  issued_to: string | null
  issued_by: string | null
  sort_order: number
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

function hasChemicalItemValue(item: Pick<ChemicalVerificationItemInput, 'issue_date' | 'chemical_name' | 'batch_details' | 'quantity_issued' | 'dilution_verified_by' | 'issued_to' | 'issued_by'>): boolean {
  return [
    item.issue_date,
    item.chemical_name,
    item.batch_details,
    item.quantity_issued,
    item.dilution_verified_by,
    item.issued_to,
    item.issued_by,
  ].some((value) => Boolean(value?.trim()))
}

export async function loadChemicalVerificationOverview(): Promise<ChemicalVerificationOverviewRecord[]> {
  const { data: verificationData, error: verificationError } = await supabase
    .from('chemical_issue_dilution_verifications')
    .select('id, status, signoff_by, recorded_by, signoff_date, completed_at, created_at, updated_at')
    .order('signoff_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (verificationError) throw verificationError

  const verifications = (verificationData ?? []) as ChemicalVerificationRow[]
  if (verifications.length === 0) return []

  const verificationIds = verifications.map((verification) => verification.id)
  const profileIds = Array.from(
    new Set(verifications.map((verification) => verification.signoff_by).filter((id): id is string => Boolean(id)))
  )

  const [itemsResult, profilesResult] = await Promise.all([
    supabase
      .from('chemical_issue_dilution_verification_items')
      .select('verification_id, issue_date, chemical_name, batch_details, quantity_issued, dilution_verified_by, issued_to, issued_by')
      .in('verification_id', verificationIds),
    profileIds.length > 0
      ? supabase.from('user_profiles').select('id, full_name, email').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ])

  if (itemsResult.error) throw itemsResult.error
  if (profilesResult.error) throw profilesResult.error

  const profiles = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile])
  )
  const rowCountByVerificationId = new Map<string, number>()

  ;((itemsResult.data ?? []) as Array<ChemicalVerificationItemInput & { verification_id: string }>).forEach((item) => {
    if (!hasChemicalItemValue(item)) return
    rowCountByVerificationId.set(item.verification_id, (rowCountByVerificationId.get(item.verification_id) ?? 0) + 1)
  })

  return verifications.map((verification) => ({
    id: verification.id,
    status: verification.status,
    signoffById: verification.signoff_by,
    signoffBy: getProfileLabel(verification.signoff_by ? profiles.get(verification.signoff_by) : undefined),
    signoffDate: verification.signoff_date,
    completedAt: verification.completed_at,
    createdAt: verification.created_at,
    rowCount: rowCountByVerificationId.get(verification.id) ?? 0,
  }))
}

export async function loadChemicalVerificationRecord(verificationId: string): Promise<ChemicalVerificationRecord> {
  const { data: verificationData, error: verificationError } = await supabase
    .from('chemical_issue_dilution_verifications')
    .select('id, status, signoff_by, recorded_by, signoff_date, completed_at, created_at, updated_at')
    .eq('id', verificationId)
    .maybeSingle()

  if (verificationError) throw verificationError
  if (!verificationData) {
    throw new Error('Chemical verification record was not found.')
  }

  const { data: itemData, error: itemError } = await supabase
    .from('chemical_issue_dilution_verification_items')
    .select('row_key, issue_date, chemical_name, batch_details, quantity_issued, dilution_verified_by, issued_to, issued_by, sort_order')
    .eq('verification_id', verificationId)
    .order('sort_order', { ascending: true })

  if (itemError) throw itemError

  const verification = verificationData as ChemicalVerificationRow

  return {
    id: verification.id,
    status: verification.status,
    signoffById: verification.signoff_by,
    recordedById: verification.recorded_by,
    signoffDate: verification.signoff_date,
    completedAt: verification.completed_at,
    createdAt: verification.created_at,
    updatedAt: verification.updated_at,
    items: ((itemData ?? []) as ChemicalVerificationItemRow[]).map((item) => ({
      row_key: item.row_key,
      issue_date: item.issue_date,
      chemical_name: item.chemical_name,
      batch_details: item.batch_details,
      quantity_issued: item.quantity_issued,
      dilution_verified_by: item.dilution_verified_by,
      issued_to: item.issued_to,
      issued_by: item.issued_by,
      sort_order: item.sort_order,
    })),
  }
}

async function saveChemicalVerification(input: ChemicalVerificationSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_chemical_issue_dilution_verification', {
    p_verification_id: input.verification_id ?? null,
    p_status: input.status,
    p_signoff_by: input.signoff_by,
    p_signoff_date: input.signoff_date,
    p_items: input.items,
  })

  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Chemical verification save did not return a record id.')
  }

  return data
}

export function createChemicalVerificationDraft(
  input: Omit<ChemicalVerificationSaveInput, 'status'>
): Promise<string> {
  return saveChemicalVerification({ ...input, status: 'DRAFT' })
}

export function saveChemicalVerificationDraft(
  input: Omit<ChemicalVerificationSaveInput, 'status'>
): Promise<string> {
  return saveChemicalVerification({ ...input, status: 'DRAFT' })
}

export function submitChemicalVerification(
  input: Omit<ChemicalVerificationSaveInput, 'status'>
): Promise<string> {
  return saveChemicalVerification({ ...input, status: 'COMPLETED' })
}
