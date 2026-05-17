export type InspectionFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL' | 'WHEN_REQUIRED'

export type InspectionStatusTone = 'olive' | 'amber' | 'emerald' | 'sky'

export interface InspectionChecklistItem {
  id: string
  label: string
  note: string
}

export interface InspectionFieldDefinition {
  id: string
  label: string
  helper: string
  type: 'text' | 'textarea' | 'date' | 'select' | 'person'
  placeholder: string
}

export interface InspectionRegisterItem {
  item: string
  totalQty: string
}

export interface InspectionRegisterGroup {
  area: string
  rows: readonly InspectionRegisterItem[]
}

export interface GlassInspectionEntry {
  id: string
  checkedBy: string
  date: string
  areasChecked: string
  status: string
  statusTone: InspectionStatusTone
}

export interface GlassInspectionTemplate {
  title: string
  checkedByLabel: string
  dateLabel: string
  riskLegend: readonly string[]
  riskOptions: readonly string[]
  entriesTitle: string
  entriesDescription: string
  entriesStartLabel: string
  entriesHeaders: readonly string[]
  registerGroups: readonly InspectionRegisterGroup[]
  signoffLabel: string
}

export interface JobCardChecklistItem {
  label: string
}

export interface JobCardTemplate {
  headerFields: readonly string[]
  serviceTypes: readonly string[]
  beforeProceedingTitle: string
  beforeProceedingChecks: readonly JobCardChecklistItem[]
  completionTitle: string
  completionChecks: readonly JobCardChecklistItem[]
  inventoryTitle: string
  toolsHeaders: readonly string[]
  toolRows: number
  materialsHeaders: readonly string[]
  materialRows: number
  detailLabel: string
  signoffs: readonly string[]
}

export interface ChemicalVerificationTemplate {
  headers: readonly string[]
  rowCount: number
  notes: readonly string[]
  signoffLabel: string
}

export interface CleaningVerificationAreaSection {
  area: string
  colorCode: string
  items: readonly string[]
}

export interface CleaningVerificationTemplate {
  frequencyLabel: string
  sections: readonly CleaningVerificationAreaSection[]
  correctiveActionHeaders: readonly string[]
  correctiveActionRows: number
  signoffLabel: string
}

export interface AblutionFacilityTemplate {
  title: string
  frequencyLabel: string
  dateLabel: string
  checkpoints: readonly string[]
  lockerChecks: readonly string[]
  signoffLabel: string
  legend: string
  correctiveActionLabel: string
}

export interface HygieneRecordTemplate {
  title: string
  checkedByLabel: string
  namesCheckedLabel: string
  requirementsIntro: string
  commentsLabel: string
  requirements: readonly string[]
}

export interface VisitorQuestionnaireTemplate {
  title: string
  headerFields: readonly string[]
  declarationLabel: string
  healthQuestionHeaders: readonly string[]
  healthQuestions: readonly string[]
  recentConditionHeaders: readonly string[]
  recentConditionQuestions: readonly string[]
  travelQuestions: readonly string[]
  notice: string
  inductionTrainingItems: readonly string[]
  declarationText: string
  signoffFields: readonly string[]
  authorizationLabel: string
  additionalObservations: readonly string[]
}

export interface InspectionSectionDefinition {
  key: string
  label: string
  shortLabel: string
  icon: string
  group: string
  frequency: InspectionFrequency
  description: string
  summary: string
  statusLabel: string
  statusTone: InspectionStatusTone
  completionExpectation: string
  evidenceLabel: string
  checklist: InspectionChecklistItem[]
  fields: InspectionFieldDefinition[]
  glassTemplate?: GlassInspectionTemplate
  jobCardTemplate?: JobCardTemplate
  chemicalVerificationTemplate?: ChemicalVerificationTemplate
  cleaningVerificationTemplate?: CleaningVerificationTemplate
  ablutionFacilityTemplate?: AblutionFacilityTemplate
  hygieneRecordTemplate?: HygieneRecordTemplate
  visitorQuestionnaireTemplate?: VisitorQuestionnaireTemplate
}
