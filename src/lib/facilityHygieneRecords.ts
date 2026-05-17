import { supabase } from '@/lib/supabaseClient'

export type RecordStatus = 'DRAFT' | 'COMPLETED'
export type AblutionResult = 'C' | 'NC'
export type HygieneResult = 'PASS' | 'FAIL'

export interface AblutionCheckInput {
  check_key: string
  group_key: string
  group_label: string
  check_label: string
  result: AblutionResult | null
  notes: string | null
  sort_order: number
}

export interface AblutionRecordSaveInput {
  record_id?: string | null
  status: RecordStatus
  record_date: string | null
  signed_off_by: string | null
  corrective_actions: string | null
  checks: AblutionCheckInput[]
}

export interface AblutionOverviewRecord {
  id: string
  status: RecordStatus
  recordDate: string | null
  signedOffBy: string
  signedOffById: string | null
  completedAt: string | null
  createdAt: string
  checkedCount: number
  nonConformanceCount: number
}

export interface AblutionRecord extends AblutionRecordSaveInput {
  id: string
  recorded_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface HygieneRequirementInput {
  requirement_key: string
  requirement_label: string
  result: HygieneResult | null
  notes: string | null
  sort_order: number
}

export interface HygieneRecordSaveInput {
  record_id?: string | null
  status: RecordStatus
  record_date: string | null
  checked_by: string | null
  names_checked: string | null
  comments: string | null
  requirements: HygieneRequirementInput[]
}

export interface HygieneOverviewRecord {
  id: string
  status: RecordStatus
  recordDate: string | null
  checkedBy: string
  checkedById: string | null
  namesChecked: string | null
  completedAt: string | null
  createdAt: string
  checkedCount: number
  failedCount: number
}

export interface HygieneRecord extends HygieneRecordSaveInput {
  id: string
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

function profileLabel(profile: ProfileRow | undefined): string {
  if (!profile) return 'Pending'
  return profile.full_name?.trim() || profile.email?.trim() || 'Pending'
}

async function loadProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('user_profiles').select('id, full_name, email').in('id', ids)
  if (error) throw error
  return new Map(((data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
}

export async function loadAblutionRecordOverview(): Promise<AblutionOverviewRecord[]> {
  const { data, error } = await supabase
    .from('ablution_facility_records')
    .select('id, status, record_date, signed_off_by, recorded_by, corrective_actions, completed_at, created_at, updated_at')
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  const records = (data ?? []) as Array<{
    id: string
    status: RecordStatus
    record_date: string | null
    signed_off_by: string | null
    completed_at: string | null
    created_at: string
  }>
  if (records.length === 0) return []

  const recordIds = records.map((record) => record.id)
  const profileIds = Array.from(new Set(records.map((record) => record.signed_off_by).filter((id): id is string => Boolean(id))))
  const [profiles, checksResult] = await Promise.all([
    loadProfiles(profileIds),
    supabase.from('ablution_facility_record_checks').select('record_id, result').in('record_id', recordIds),
  ])

  if (checksResult.error) throw checksResult.error

  const counts = new Map<string, { checkedCount: number; nonConformanceCount: number }>()
  ;((checksResult.data ?? []) as Array<{ record_id: string; result: AblutionResult | null }>).forEach((check) => {
    if (!check.result) return
    const current = counts.get(check.record_id) ?? { checkedCount: 0, nonConformanceCount: 0 }
    current.checkedCount += 1
    if (check.result === 'NC') current.nonConformanceCount += 1
    counts.set(check.record_id, current)
  })

  return records.map((record) => {
    const count = counts.get(record.id) ?? { checkedCount: 0, nonConformanceCount: 0 }
    return {
      id: record.id,
      status: record.status,
      recordDate: record.record_date,
      signedOffById: record.signed_off_by,
      signedOffBy: profileLabel(record.signed_off_by ? profiles.get(record.signed_off_by) : undefined),
      completedAt: record.completed_at,
      createdAt: record.created_at,
      checkedCount: count.checkedCount,
      nonConformanceCount: count.nonConformanceCount,
    }
  })
}

export async function loadAblutionRecord(recordId: string): Promise<AblutionRecord> {
  const { data, error } = await supabase
    .from('ablution_facility_records')
    .select('id, status, record_date, signed_off_by, recorded_by, corrective_actions, completed_at, created_at, updated_at')
    .eq('id', recordId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Ablution facility record was not found.')

  const { data: checks, error: checksError } = await supabase
    .from('ablution_facility_record_checks')
    .select('check_key, group_key, group_label, check_label, result, notes, sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true })

  if (checksError) throw checksError
  const record = data as AblutionRecord

  return {
    id: record.id,
    record_id: record.id,
    status: record.status,
    record_date: record.record_date,
    signed_off_by: record.signed_off_by,
    recorded_by: record.recorded_by,
    corrective_actions: record.corrective_actions,
    completed_at: record.completed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
    checks: (checks ?? []) as AblutionCheckInput[],
  }
}

async function saveAblutionRecord(input: AblutionRecordSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_ablution_facility_record', {
    p_record_id: input.record_id ?? null,
    p_status: input.status,
    p_record_date: input.record_date,
    p_signed_off_by: input.signed_off_by,
    p_corrective_actions: input.corrective_actions,
    p_checks: input.checks,
  })

  if (error) throw error
  if (typeof data !== 'string') throw new Error('Ablution facility save did not return a record id.')
  return data
}

export function createAblutionRecordDraft(input: Omit<AblutionRecordSaveInput, 'status'>): Promise<string> {
  return saveAblutionRecord({ ...input, status: 'DRAFT' })
}

export function saveAblutionRecordDraft(input: Omit<AblutionRecordSaveInput, 'status'>): Promise<string> {
  return saveAblutionRecord({ ...input, status: 'DRAFT' })
}

export function submitAblutionRecord(input: Omit<AblutionRecordSaveInput, 'status'>): Promise<string> {
  return saveAblutionRecord({ ...input, status: 'COMPLETED' })
}

export async function loadHygieneRecordOverview(): Promise<HygieneOverviewRecord[]> {
  const { data, error } = await supabase
    .from('hygiene_records')
    .select('id, status, record_date, checked_by, recorded_by, names_checked, comments, completed_at, created_at, updated_at')
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  const records = (data ?? []) as Array<{
    id: string
    status: RecordStatus
    record_date: string | null
    checked_by: string | null
    names_checked: string | null
    completed_at: string | null
    created_at: string
  }>
  if (records.length === 0) return []

  const recordIds = records.map((record) => record.id)
  const profileIds = Array.from(new Set(records.map((record) => record.checked_by).filter((id): id is string => Boolean(id))))
  const [profiles, requirementsResult] = await Promise.all([
    loadProfiles(profileIds),
    supabase.from('hygiene_record_requirements').select('record_id, result').in('record_id', recordIds),
  ])

  if (requirementsResult.error) throw requirementsResult.error

  const counts = new Map<string, { checkedCount: number; failedCount: number }>()
  ;((requirementsResult.data ?? []) as Array<{ record_id: string; result: HygieneResult | null }>).forEach((requirement) => {
    if (!requirement.result) return
    const current = counts.get(requirement.record_id) ?? { checkedCount: 0, failedCount: 0 }
    current.checkedCount += 1
    if (requirement.result === 'FAIL') current.failedCount += 1
    counts.set(requirement.record_id, current)
  })

  return records.map((record) => {
    const count = counts.get(record.id) ?? { checkedCount: 0, failedCount: 0 }
    return {
      id: record.id,
      status: record.status,
      recordDate: record.record_date,
      checkedById: record.checked_by,
      checkedBy: profileLabel(record.checked_by ? profiles.get(record.checked_by) : undefined),
      namesChecked: record.names_checked,
      completedAt: record.completed_at,
      createdAt: record.created_at,
      checkedCount: count.checkedCount,
      failedCount: count.failedCount,
    }
  })
}

export async function loadHygieneRecord(recordId: string): Promise<HygieneRecord> {
  const { data, error } = await supabase
    .from('hygiene_records')
    .select('id, status, record_date, checked_by, recorded_by, names_checked, comments, completed_at, created_at, updated_at')
    .eq('id', recordId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Hygiene record was not found.')

  const { data: requirements, error: requirementsError } = await supabase
    .from('hygiene_record_requirements')
    .select('requirement_key, requirement_label, result, notes, sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true })

  if (requirementsError) throw requirementsError
  const record = data as HygieneRecord

  return {
    id: record.id,
    record_id: record.id,
    status: record.status,
    record_date: record.record_date,
    checked_by: record.checked_by,
    recorded_by: record.recorded_by,
    names_checked: record.names_checked,
    comments: record.comments,
    completed_at: record.completed_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
    requirements: (requirements ?? []) as HygieneRequirementInput[],
  }
}

async function saveHygieneRecord(input: HygieneRecordSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_hygiene_record', {
    p_record_id: input.record_id ?? null,
    p_status: input.status,
    p_record_date: input.record_date,
    p_checked_by: input.checked_by,
    p_names_checked: input.names_checked,
    p_comments: input.comments,
    p_requirements: input.requirements,
  })

  if (error) throw error
  if (typeof data !== 'string') throw new Error('Hygiene record save did not return a record id.')
  return data
}

export function createHygieneRecordDraft(input: Omit<HygieneRecordSaveInput, 'status'>): Promise<string> {
  return saveHygieneRecord({ ...input, status: 'DRAFT' })
}

export function saveHygieneRecordDraft(input: Omit<HygieneRecordSaveInput, 'status'>): Promise<string> {
  return saveHygieneRecord({ ...input, status: 'DRAFT' })
}

export function submitHygieneRecord(input: Omit<HygieneRecordSaveInput, 'status'>): Promise<string> {
  return saveHygieneRecord({ ...input, status: 'COMPLETED' })
}
