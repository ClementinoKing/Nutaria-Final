import { supabase } from '@/lib/supabaseClient'

export type VisitorQuestionnaireStatus = 'DRAFT' | 'COMPLETED'
export type VisitorQuestionnaireAnswer = 'YES' | 'NO'

export interface VisitorQuestionnaireQuestionInput {
  question_key: string
  section_key: string
  question_text: string
  answer: VisitorQuestionnaireAnswer | null
  details: string | null
  sort_order: number
}

export interface VisitorQuestionnaireInductionInput {
  item_key: string
  item_text: string
  acknowledged: boolean | null
  sort_order: number
}

export interface VisitorQuestionnaireSaveInput {
  questionnaire_id?: string | null
  status: VisitorQuestionnaireStatus
  visit_date: string | null
  completed_by: string | null
  visitor_name: string | null
  company: string | null
  reason_for_visit: string | null
  contact_number: string | null
  declaration: string | null
  visitor_signature: string | null
  employee_signature: string | null
  site_contact_name: string | null
  authorized_to_proceed: boolean | null
  questions: VisitorQuestionnaireQuestionInput[]
  induction_items: VisitorQuestionnaireInductionInput[]
}

export interface VisitorQuestionnaireOverviewRecord {
  id: string
  status: VisitorQuestionnaireStatus
  visitDate: string | null
  visitorName: string
  company: string | null
  completedBy: string
  completedById: string | null
  authorizedToProceed: boolean | null
  completedAt: string | null
  createdAt: string
}

export interface VisitorQuestionnaireRecord extends VisitorQuestionnaireSaveInput {
  id: string
  recorded_by: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface VisitorQuestionnaireRow {
  id: string
  status: VisitorQuestionnaireStatus
  visit_date: string | null
  completed_by: string | null
  recorded_by: string | null
  visitor_name: string | null
  company: string | null
  reason_for_visit: string | null
  contact_number: string | null
  declaration: string | null
  visitor_signature: string | null
  employee_signature: string | null
  site_contact_name: string | null
  authorized_to_proceed: boolean | null
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

export async function loadVisitorQuestionnaireOverview(): Promise<VisitorQuestionnaireOverviewRecord[]> {
  const { data: questionnaireData, error: questionnaireError } = await supabase
    .from('visitor_questionnaires')
    .select('id, status, visit_date, completed_by, recorded_by, visitor_name, company, reason_for_visit, contact_number, declaration, visitor_signature, employee_signature, site_contact_name, authorized_to_proceed, completed_at, created_at, updated_at')
    .order('visit_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (questionnaireError) throw questionnaireError

  const questionnaires = (questionnaireData ?? []) as VisitorQuestionnaireRow[]
  if (questionnaires.length === 0) return []

  const profileIds = Array.from(
    new Set(questionnaires.map((questionnaire) => questionnaire.completed_by).filter((id): id is string => Boolean(id)))
  )

  const { data: profilesData, error: profilesError } = profileIds.length > 0
    ? await supabase.from('user_profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] as ProfileRow[], error: null }

  if (profilesError) throw profilesError

  const profiles = new Map(((profilesData ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))

  return questionnaires.map((questionnaire) => ({
    id: questionnaire.id,
    status: questionnaire.status,
    visitDate: questionnaire.visit_date,
    visitorName: questionnaire.visitor_name?.trim() || 'Unnamed visitor',
    company: questionnaire.company,
    completedById: questionnaire.completed_by,
    completedBy: getProfileLabel(questionnaire.completed_by ? profiles.get(questionnaire.completed_by) : undefined),
    authorizedToProceed: questionnaire.authorized_to_proceed,
    completedAt: questionnaire.completed_at,
    createdAt: questionnaire.created_at,
  }))
}

export async function loadVisitorQuestionnaireRecord(questionnaireId: string): Promise<VisitorQuestionnaireRecord> {
  const { data: questionnaireData, error: questionnaireError } = await supabase
    .from('visitor_questionnaires')
    .select('id, status, visit_date, completed_by, recorded_by, visitor_name, company, reason_for_visit, contact_number, declaration, visitor_signature, employee_signature, site_contact_name, authorized_to_proceed, completed_at, created_at, updated_at')
    .eq('id', questionnaireId)
    .maybeSingle()

  if (questionnaireError) throw questionnaireError
  if (!questionnaireData) {
    throw new Error('Visitor questionnaire was not found.')
  }

  const [questionsResult, inductionResult] = await Promise.all([
    supabase
      .from('visitor_questionnaire_questions')
      .select('question_key, section_key, question_text, answer, details, sort_order')
      .eq('questionnaire_id', questionnaireId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('visitor_questionnaire_induction_items')
      .select('item_key, item_text, acknowledged, sort_order')
      .eq('questionnaire_id', questionnaireId)
      .order('sort_order', { ascending: true }),
  ])

  if (questionsResult.error) throw questionsResult.error
  if (inductionResult.error) throw inductionResult.error

  const questionnaire = questionnaireData as VisitorQuestionnaireRow

  return {
    id: questionnaire.id,
    questionnaire_id: questionnaire.id,
    status: questionnaire.status,
    visit_date: questionnaire.visit_date,
    completed_by: questionnaire.completed_by,
    recorded_by: questionnaire.recorded_by,
    visitor_name: questionnaire.visitor_name,
    company: questionnaire.company,
    reason_for_visit: questionnaire.reason_for_visit,
    contact_number: questionnaire.contact_number,
    declaration: questionnaire.declaration,
    visitor_signature: questionnaire.visitor_signature,
    employee_signature: questionnaire.employee_signature,
    site_contact_name: questionnaire.site_contact_name,
    authorized_to_proceed: questionnaire.authorized_to_proceed,
    completed_at: questionnaire.completed_at,
    created_at: questionnaire.created_at,
    updated_at: questionnaire.updated_at,
    questions: (questionsResult.data ?? []) as VisitorQuestionnaireQuestionInput[],
    induction_items: (inductionResult.data ?? []) as VisitorQuestionnaireInductionInput[],
  }
}

async function saveVisitorQuestionnaire(input: VisitorQuestionnaireSaveInput): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_visitor_questionnaire', {
    p_questionnaire_id: input.questionnaire_id ?? null,
    p_status: input.status,
    p_visit_date: input.visit_date,
    p_completed_by: input.completed_by,
    p_visitor_name: input.visitor_name,
    p_company: input.company,
    p_reason_for_visit: input.reason_for_visit,
    p_contact_number: input.contact_number,
    p_declaration: input.declaration,
    p_visitor_signature: input.visitor_signature,
    p_employee_signature: input.employee_signature,
    p_site_contact_name: input.site_contact_name,
    p_authorized_to_proceed: input.authorized_to_proceed,
    p_questions: input.questions,
    p_induction_items: input.induction_items,
  })

  if (error) throw error
  if (typeof data !== 'string') {
    throw new Error('Visitor questionnaire save did not return a record id.')
  }

  return data
}

export function createVisitorQuestionnaireDraft(input: Omit<VisitorQuestionnaireSaveInput, 'status'>): Promise<string> {
  return saveVisitorQuestionnaire({ ...input, status: 'DRAFT' })
}

export function saveVisitorQuestionnaireDraft(input: Omit<VisitorQuestionnaireSaveInput, 'status'>): Promise<string> {
  return saveVisitorQuestionnaire({ ...input, status: 'DRAFT' })
}

export function submitVisitorQuestionnaire(input: Omit<VisitorQuestionnaireSaveInput, 'status'>): Promise<string> {
  return saveVisitorQuestionnaire({ ...input, status: 'COMPLETED' })
}
