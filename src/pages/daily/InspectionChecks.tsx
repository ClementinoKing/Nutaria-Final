import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  BadgeCheck,
  Bath,
  CalendarClock,
  CalendarRange,
  CheckCheck,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  ClipboardList,
  FileStack,
  FileText,
  FlaskConical,
  GlassWater,
  Hand,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import PageLayout from '@/components/layout/PageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'
import { useUserProfiles } from '@/hooks/useUserProfiles'
import {
  createGlassInspectionDraft,
  loadGlassInspectionOverview,
  loadGlassInspectionRecord,
  saveGlassInspectionDraft,
  submitGlassInspection,
  type GlassInspectionItemInput,
  type GlassInspectionOverviewRecord,
  type GlassInspectionRecord,
  type GlassRiskClass,
} from '@/lib/glassInspections'
import {
  createChemicalVerificationDraft,
  loadChemicalVerificationOverview,
  loadChemicalVerificationRecord,
  saveChemicalVerificationDraft,
  submitChemicalVerification,
  type ChemicalVerificationItemInput,
  type ChemicalVerificationOverviewRecord,
  type ChemicalVerificationRecord,
} from '@/lib/chemicalVerifications'
import {
  createVisitorQuestionnaireDraft,
  loadVisitorQuestionnaireOverview,
  loadVisitorQuestionnaireRecord,
  saveVisitorQuestionnaireDraft,
  submitVisitorQuestionnaire,
  type VisitorQuestionnaireAnswer,
  type VisitorQuestionnaireInductionInput,
  type VisitorQuestionnaireOverviewRecord,
  type VisitorQuestionnaireQuestionInput,
  type VisitorQuestionnaireRecord,
} from '@/lib/visitorQuestionnaires'
import {
  createCleaningVerificationDraft,
  loadCleaningVerificationOverview,
  loadCleaningVerificationRecord,
  saveCleaningVerificationDraft,
  submitCleaningVerification,
  type CleaningVerificationAreaSignoffInput,
  type CleaningVerificationCorrectiveActionInput,
  type CleaningVerificationFrequency,
  type CleaningVerificationItemInput,
  type CleaningVerificationOverviewRecord,
  type CleaningVerificationRecord,
  type CleaningVerificationResult,
} from '@/lib/cleaningVerifications'
import {
  createAblutionRecordDraft,
  createHygieneRecordDraft,
  loadAblutionRecord,
  loadAblutionRecordOverview,
  loadHygieneRecord,
  loadHygieneRecordOverview,
  saveAblutionRecordDraft,
  saveHygieneRecordDraft,
  submitAblutionRecord,
  submitHygieneRecord,
  type AblutionCheckInput,
  type AblutionOverviewRecord,
  type AblutionRecord,
  type AblutionResult,
  type HygieneOverviewRecord,
  type HygieneRecord,
  type HygieneRequirementInput,
  type HygieneResult,
} from '@/lib/facilityHygieneRecords'
import { inspectionSections } from './inspectionConfig'
import type {
  AblutionFacilityTemplate,
  CleaningVerificationTemplate,
  HygieneRecordTemplate,
  InspectionFieldDefinition,
  InspectionFrequency,
  InspectionRegisterItem,
  InspectionSectionDefinition,
  InspectionStatusTone,
  VisitorQuestionnaireTemplate,
} from '@/types/inspection'

const inspectionIcons = {
  glass: GlassWater,
  shield: ShieldCheck,
  'file-text': FileText,
  flask: FlaskConical,
  sparkles: Sparkles,
  'calendar-check': CheckCheck,
  'calendar-range': CalendarRange,
  'badge-check': BadgeCheck,
  bath: Bath,
  handshake: Hand,
  users: Users,
} as const

function getInspectionIcon(iconKey: InspectionSectionDefinition['icon']) {
  return inspectionIcons[iconKey as keyof typeof inspectionIcons] ?? ClipboardList
}

const frequencyLabels: Record<InspectionFrequency, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  ANNUAL: 'Annual',
  WHEN_REQUIRED: 'When required',
}

const statusToneClasses: Record<InspectionStatusTone, string> = {
  olive: 'border-olive/20 bg-olive/10 text-olive-dark',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
}

const glassStatusToneByStatus: Record<GlassInspectionOverviewRecord['status'], InspectionStatusTone> = {
  DRAFT: 'amber',
  COMPLETED: 'emerald',
}

const glassStatusLabelByStatus: Record<GlassInspectionOverviewRecord['status'], string> = {
  DRAFT: 'In progress',
  COMPLETED: 'Completed',
}

const chemicalStatusToneByStatus: Record<ChemicalVerificationOverviewRecord['status'], InspectionStatusTone> = {
  DRAFT: 'amber',
  COMPLETED: 'emerald',
}

const chemicalStatusLabelByStatus: Record<ChemicalVerificationOverviewRecord['status'], string> = {
  DRAFT: 'In progress',
  COMPLETED: 'Completed',
}

const visitorStatusToneByStatus: Record<VisitorQuestionnaireOverviewRecord['status'], InspectionStatusTone> = {
  DRAFT: 'amber',
  COMPLETED: 'emerald',
}

const visitorStatusLabelByStatus: Record<VisitorQuestionnaireOverviewRecord['status'], string> = {
  DRAFT: 'In progress',
  COMPLETED: 'Completed',
}

const cleaningStatusToneByStatus: Record<CleaningVerificationOverviewRecord['status'], InspectionStatusTone> = {
  DRAFT: 'amber',
  COMPLETED: 'emerald',
}

const cleaningStatusLabelByStatus: Record<CleaningVerificationOverviewRecord['status'], string> = {
  DRAFT: 'In progress',
  COMPLETED: 'Completed',
}

const recordStatusToneByStatus: Record<'DRAFT' | 'COMPLETED', InspectionStatusTone> = {
  DRAFT: 'amber',
  COMPLETED: 'emerald',
}

const recordStatusLabelByStatus: Record<'DRAFT' | 'COMPLETED', string> = {
  DRAFT: 'In progress',
  COMPLETED: 'Completed',
}

type GlassRegisterItemState = GlassInspectionItemInput
type ChemicalVerificationItemState = ChemicalVerificationItemInput
type VisitorQuestionState = VisitorQuestionnaireQuestionInput
type VisitorInductionState = VisitorQuestionnaireInductionInput
type CleaningVerificationItemState = CleaningVerificationItemInput
type CleaningAreaSignoffState = CleaningVerificationAreaSignoffInput
type CleaningCorrectiveActionState = CleaningVerificationCorrectiveActionInput
type AblutionCheckState = AblutionCheckInput
type HygieneRequirementState = HygieneRequirementInput

interface GlassRegisterFormState {
  id: string | null
  checkedBy: string
  inspectionDate: string
  status: GlassInspectionRecord['status']
  items: GlassRegisterItemState[]
}

interface ChemicalVerificationFormState {
  id: string | null
  signoffBy: string
  signoffDate: string
  status: ChemicalVerificationRecord['status']
  items: ChemicalVerificationItemState[]
}

interface VisitorQuestionnaireFormState {
  id: string | null
  visitDate: string
  completedBy: string
  visitorName: string
  company: string
  reasonForVisit: string
  contactNumber: string
  declaration: string
  visitorSignature: string
  employeeSignature: string
  siteContactName: string
  authorizedToProceed: boolean | null
  status: VisitorQuestionnaireRecord['status']
  questions: VisitorQuestionState[]
  inductionItems: VisitorInductionState[]
}

interface CleaningVerificationFormState {
  id: string | null
  frequency: CleaningVerificationFrequency
  verificationDate: string
  signoffBy: string
  status: CleaningVerificationRecord['status']
  items: CleaningVerificationItemState[]
  areaSignoffs: CleaningAreaSignoffState[]
  correctiveActions: CleaningCorrectiveActionState[]
}

interface AblutionRecordFormState {
  id: string | null
  recordDate: string
  signedOffBy: string
  correctiveActions: string
  status: AblutionRecord['status']
  checks: AblutionCheckState[]
}

interface HygieneRecordFormState {
  id: string | null
  recordDate: string
  checkedBy: string
  namesChecked: string
  comments: string
  status: HygieneRecord['status']
  requirements: HygieneRequirementState[]
}

interface UserProfileOption {
  id: string
  label: string
}

function getProfileOptionLabel(profile: Record<string, unknown>): string {
  const fullName = typeof profile.full_name === 'string' ? profile.full_name.trim() : ''
  const email = typeof profile.email === 'string' ? profile.email.trim() : ''
  return fullName || email || 'Unnamed user'
}

function getProfileOptions(profiles: Record<string, unknown>[]): UserProfileOption[] {
  return profiles
    .map((profile) => {
      const id = typeof profile.id === 'string' ? profile.id : ''
      return id ? { id, label: getProfileOptionLabel(profile) } : null
    })
    .filter((profile): profile is UserProfileOption => Boolean(profile))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function formatOverviewDate(value: string | null): string {
  if (!value) return 'Not dated'
  try {
    return format(parseISO(value), 'dd MMM yyyy')
  } catch {
    return value
  }
}

function toGlassItemKey(areaIndex: number, rowIndex: number): string {
  return `area-${areaIndex + 1}-item-${rowIndex + 1}`
}

function parseTotalQuantity(row: InspectionRegisterItem): number {
  const parsed = Number.parseInt(row.totalQty, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function createInitialGlassItems(section: InspectionSectionDefinition): GlassRegisterItemState[] {
  const template = section.glassTemplate
  if (!template) return []

  let sortOrder = 0
  return template.registerGroups.flatMap((group, areaIndex) =>
    group.rows.map((row, rowIndex) => {
      sortOrder += 1
      return {
        item_key: toGlassItemKey(areaIndex, rowIndex),
        area_name: group.area,
        item_name: row.item,
        total_quantity: parseTotalQuantity(row),
        qty_intact: null,
        qty_not_intact: null,
        action_required_nc_no: null,
        risk_class: null,
        action_completed: null,
        signature: null,
        sort_order: sortOrder,
      }
    })
  )
}

function mergeSavedGlassItems(
  section: InspectionSectionDefinition,
  savedItems: GlassInspectionItemInput[]
): GlassRegisterItemState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.item_key, item]))

  return createInitialGlassItems(section).map((item) => {
    const saved = savedByKey.get(item.item_key)
    return saved ? { ...item, ...saved } : item
  })
}

function getGlassItemGroups(items: GlassRegisterItemState[]): Array<{ area: string; rows: GlassRegisterItemState[] }> {
  const groups = new Map<string, GlassRegisterItemState[]>()
  items.forEach((item) => {
    const current = groups.get(item.area_name) ?? []
    current.push(item)
    groups.set(item.area_name, current)
  })

  return Array.from(groups.entries()).map(([area, rows]) => ({
    area,
    rows: rows.sort((a, b) => a.sort_order - b.sort_order),
  }))
}

function validateGlassSubmission(form: GlassRegisterFormState): string | null {
  if (!form.checkedBy) return 'Select the person who checked the inspection.'
  if (!form.inspectionDate) return 'Select the inspection date.'

  for (const item of form.items) {
    const intact = item.qty_intact
    const notIntact = item.qty_not_intact

    if (intact === null || notIntact === null) {
      return `Enter intact and not intact quantities for ${item.item_name}.`
    }

    if (intact < 0 || notIntact < 0) {
      return `Quantities cannot be negative for ${item.item_name}.`
    }

    if (intact + notIntact !== item.total_quantity) {
      return `Intact and not intact quantities must equal total quantity for ${item.item_name}.`
    }

    if (!item.signature?.trim()) {
      return `Add a signature for ${item.item_name}.`
    }

    if (notIntact > 0) {
      if (!item.action_required_nc_no?.trim()) {
        return `Add the NC number for ${item.item_name}.`
      }
      if (!item.risk_class) {
        return `Select a risk class for ${item.item_name}.`
      }
      if (item.action_completed === null) {
        return `Confirm whether the action is completed for ${item.item_name}.`
      }
    }
  }

  return null
}

function createInitialChemicalItems(rowCount: number): ChemicalVerificationItemState[] {
  return Array.from({ length: rowCount }).map((_, index) => ({
    row_key: `chemical-row-${index + 1}`,
    issue_date: null,
    chemical_name: null,
    batch_details: null,
    quantity_issued: null,
    dilution_verified_by: null,
    issued_to: null,
    issued_by: null,
    sort_order: index + 1,
  }))
}

function mergeSavedChemicalItems(
  rowCount: number,
  savedItems: ChemicalVerificationItemInput[]
): ChemicalVerificationItemState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.row_key, item]))
  return createInitialChemicalItems(rowCount).map((item) => {
    const saved = savedByKey.get(item.row_key)
    return saved ? { ...item, ...saved } : item
  })
}

function hasChemicalItemValue(item: ChemicalVerificationItemState): boolean {
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

function validateChemicalSubmission(form: ChemicalVerificationFormState): string | null {
  if (!form.signoffBy) return 'Select the supervisor signing off this verification.'
  if (!form.signoffDate) return 'Select the signoff date.'

  const enteredItems = form.items.filter(hasChemicalItemValue)
  if (enteredItems.length === 0) {
    return 'Add at least one chemical issue row before submitting.'
  }

  for (const item of enteredItems) {
    const rowLabel = `row ${item.sort_order}`
    if (!item.issue_date) return `Select a date for ${rowLabel}.`
    if (!item.chemical_name?.trim()) return `Enter the chemical name for ${rowLabel}.`
    if (!item.batch_details?.trim()) return `Enter batch details for ${rowLabel}.`
    if (!item.quantity_issued?.trim()) return `Enter quantity issued for ${rowLabel}.`
    if (!item.dilution_verified_by?.trim()) return `Enter who verified dilution concentration for ${rowLabel}.`
    if (!item.issued_to?.trim()) return `Enter who the chemical was issued to for ${rowLabel}.`
    if (!item.issued_by?.trim()) return `Enter who issued the chemical for ${rowLabel}.`
  }

  return null
}

function toKey(prefix: string, value: string, index: number): string {
  return `${prefix}-${index + 1}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
}

function createInitialVisitorQuestions(template: VisitorQuestionnaireTemplate): VisitorQuestionState[] {
  const questions: VisitorQuestionState[] = []
  let sortOrder = 0

  template.healthQuestions.forEach((question, index) => {
    sortOrder += 1
    questions.push({
      question_key: toKey('health', question, index),
      section_key: 'health-history',
      question_text: question,
      answer: null,
      details: null,
      sort_order: sortOrder,
    })
  })

  template.recentConditionQuestions.forEach((question, index) => {
    sortOrder += 1
    questions.push({
      question_key: toKey('recent', question, index),
      section_key: 'recent-conditions',
      question_text: question,
      answer: null,
      details: null,
      sort_order: sortOrder,
    })
  })

  template.travelQuestions.forEach((question, index) => {
    sortOrder += 1
    questions.push({
      question_key: toKey('travel', question, index),
      section_key: 'travel-and-physical-condition',
      question_text: question,
      answer: null,
      details: null,
      sort_order: sortOrder,
    })
  })

  return questions
}

function createInitialVisitorInductionItems(template: VisitorQuestionnaireTemplate): VisitorInductionState[] {
  return template.inductionTrainingItems.map((item, index) => ({
    item_key: toKey('induction', item, index),
    item_text: item,
    acknowledged: null,
    sort_order: index + 1,
  }))
}

function mergeSavedVisitorQuestions(
  template: VisitorQuestionnaireTemplate,
  savedQuestions: VisitorQuestionnaireQuestionInput[]
): VisitorQuestionState[] {
  const savedByKey = new Map(savedQuestions.map((question) => [question.question_key, question]))
  return createInitialVisitorQuestions(template).map((question) => {
    const saved = savedByKey.get(question.question_key)
    return saved ? { ...question, ...saved } : question
  })
}

function mergeSavedVisitorInductionItems(
  template: VisitorQuestionnaireTemplate,
  savedItems: VisitorQuestionnaireInductionInput[]
): VisitorInductionState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.item_key, item]))
  return createInitialVisitorInductionItems(template).map((item) => {
    const saved = savedByKey.get(item.item_key)
    return saved ? { ...item, ...saved } : item
  })
}

function getCleaningFrequency(section: InspectionSectionDefinition): CleaningVerificationFrequency {
  if (section.frequency === 'DAILY') return 'DAILY'
  if (section.frequency === 'WEEKLY') return 'WEEKLY'
  if (section.frequency === 'MONTHLY') return 'MONTHLY'
  return 'ANNUAL'
}

function createInitialCleaningItems(template: CleaningVerificationTemplate): CleaningVerificationItemState[] {
  const items: CleaningVerificationItemState[] = []
  let sortOrder = 0

  template.sections.forEach((area, areaIndex) => {
    const areaKey = toKey('area', area.area, areaIndex)

    area.items.forEach((item, itemIndex) => {
      sortOrder += 1
      items.push({
        item_key: `${areaKey}-item-${itemIndex + 1}`,
        area_key: areaKey,
        area_name: area.area,
        color_code: area.colorCode,
        item_name: item,
        result: null,
        notes: null,
        sort_order: sortOrder,
      })
    })
  })

  return items
}

function createInitialCleaningAreaSignoffs(template: CleaningVerificationTemplate): CleaningAreaSignoffState[] {
  return template.sections.map((area, index) => ({
    area_key: toKey('area', area.area, index),
    area_name: area.area,
    signed_by: null,
    sort_order: index + 1,
  }))
}

function createInitialCleaningCorrectiveActions(rowCount: number): CleaningCorrectiveActionState[] {
  return Array.from({ length: rowCount }).map((_, index) => ({
    row_key: `corrective-action-${index + 1}`,
    action_date: null,
    non_conformance: null,
    corrective_action: null,
    signoff: null,
    sort_order: index + 1,
  }))
}

function mergeSavedCleaningItems(
  template: CleaningVerificationTemplate,
  savedItems: CleaningVerificationItemInput[]
): CleaningVerificationItemState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.item_key, item]))
  return createInitialCleaningItems(template).map((item) => {
    const saved = savedByKey.get(item.item_key)
    return saved ? { ...item, ...saved } : item
  })
}

function mergeSavedCleaningAreaSignoffs(
  template: CleaningVerificationTemplate,
  savedItems: CleaningVerificationAreaSignoffInput[]
): CleaningAreaSignoffState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.area_key, item]))
  return createInitialCleaningAreaSignoffs(template).map((item) => {
    const saved = savedByKey.get(item.area_key)
    return saved ? { ...item, ...saved } : item
  })
}

function mergeSavedCleaningCorrectiveActions(
  rowCount: number,
  savedItems: CleaningVerificationCorrectiveActionInput[]
): CleaningCorrectiveActionState[] {
  const savedByKey = new Map(savedItems.map((item) => [item.row_key, item]))
  return createInitialCleaningCorrectiveActions(rowCount).map((item) => {
    const saved = savedByKey.get(item.row_key)
    return saved ? { ...item, ...saved } : item
  })
}

function getCleaningItemGroups(items: CleaningVerificationItemState[]) {
  const groups = new Map<string, { areaKey: string; areaName: string; colorCode: string | null; rows: CleaningVerificationItemState[] }>()

  items.forEach((item) => {
    const current = groups.get(item.area_key) ?? {
      areaKey: item.area_key,
      areaName: item.area_name,
      colorCode: item.color_code,
      rows: [],
    }
    current.rows.push(item)
    groups.set(item.area_key, current)
  })

  return Array.from(groups.values()).map((group) => ({
    ...group,
    rows: group.rows.sort((a, b) => a.sort_order - b.sort_order),
  }))
}

function hasCorrectiveActionValue(action: CleaningCorrectiveActionState): boolean {
  return [
    action.action_date,
    action.non_conformance,
    action.corrective_action,
    action.signoff,
  ].some((value) => Boolean(value?.trim()))
}

function validateCleaningSubmission(form: CleaningVerificationFormState): string | null {
  if (!form.verificationDate) return 'Select the verification date.'
  if (!form.signoffBy) return 'Select the person signing off this verification.'

  const incompleteItem = form.items.find((item) => !item.result)
  if (incompleteItem) return `Mark ${incompleteItem.item_name} as C or NC.`

  const unsignedArea = form.areaSignoffs.find((area) => !area.signed_by?.trim())
  if (unsignedArea) return `Add sign off for ${unsignedArea.area_name}.`

  const startedActions = form.correctiveActions.filter(hasCorrectiveActionValue)
  for (const action of startedActions) {
    const rowLabel = `corrective action row ${action.sort_order}`
    if (!action.action_date) return `Select a date for ${rowLabel}.`
    if (!action.non_conformance?.trim()) return `Enter the non-conformance for ${rowLabel}.`
    if (!action.corrective_action?.trim()) return `Enter the corrective action for ${rowLabel}.`
    if (!action.signoff?.trim()) return `Enter sign off for ${rowLabel}.`
  }

  return null
}

function createInitialAblutionChecks(template: AblutionFacilityTemplate): AblutionCheckState[] {
  const groups = [
    { groupKey: 'ablution-facility-check-point', groupLabel: 'Ablution Facility Check Point', items: template.checkpoints },
    { groupKey: 'lockers', groupLabel: 'Lockers', items: template.lockerChecks },
  ]
  const checks: AblutionCheckState[] = []
  let sortOrder = 0

  groups.forEach((group) => {
    group.items.forEach((item, index) => {
      sortOrder += 1
      checks.push({
        check_key: `${group.groupKey}-${index + 1}`,
        group_key: group.groupKey,
        group_label: group.groupLabel,
        check_label: item,
        result: null,
        notes: null,
        sort_order: sortOrder,
      })
    })
  })

  return checks
}

function mergeSavedAblutionChecks(
  template: AblutionFacilityTemplate,
  savedChecks: AblutionCheckInput[]
): AblutionCheckState[] {
  const savedByKey = new Map(savedChecks.map((check) => [check.check_key, check]))
  return createInitialAblutionChecks(template).map((check) => {
    const saved = savedByKey.get(check.check_key)
    return saved ? { ...check, ...saved } : check
  })
}

function getAblutionCheckGroups(checks: AblutionCheckState[]) {
  const groups = new Map<string, { groupKey: string; groupLabel: string; checks: AblutionCheckState[] }>()
  checks.forEach((check) => {
    const current = groups.get(check.group_key) ?? {
      groupKey: check.group_key,
      groupLabel: check.group_label,
      checks: [],
    }
    current.checks.push(check)
    groups.set(check.group_key, current)
  })
  return Array.from(groups.values()).map((group) => ({
    ...group,
    checks: group.checks.sort((a, b) => a.sort_order - b.sort_order),
  }))
}

function validateAblutionSubmission(form: AblutionRecordFormState): string | null {
  if (!form.recordDate) return 'Select the record date.'
  if (!form.signedOffBy) return 'Select the person signing off this record.'

  const incompleteCheck = form.checks.find((check) => !check.result)
  if (incompleteCheck) return `Mark ${incompleteCheck.check_label} as C or NC.`

  return null
}

function createInitialHygieneRequirements(template: HygieneRecordTemplate): HygieneRequirementState[] {
  return template.requirements.map((requirement, index) => ({
    requirement_key: toKey('requirement', requirement, index),
    requirement_label: requirement,
    result: null,
    notes: null,
    sort_order: index + 1,
  }))
}

function mergeSavedHygieneRequirements(
  template: HygieneRecordTemplate,
  savedRequirements: HygieneRequirementInput[]
): HygieneRequirementState[] {
  const savedByKey = new Map(savedRequirements.map((requirement) => [requirement.requirement_key, requirement]))
  return createInitialHygieneRequirements(template).map((requirement) => {
    const saved = savedByKey.get(requirement.requirement_key)
    return saved ? { ...requirement, ...saved } : requirement
  })
}

function validateHygieneSubmission(form: HygieneRecordFormState): string | null {
  if (!form.recordDate) return 'Select the record date.'
  if (!form.checkedBy) return 'Select who completed the hygiene check.'
  if (!form.namesChecked.trim()) return 'Enter the names of personnel checked or sampled.'

  const incompleteRequirement = form.requirements.find((requirement) => !requirement.result)
  if (incompleteRequirement) return `Mark ${incompleteRequirement.requirement_label} as pass or fail.`

  return null
}

function validateVisitorSubmission(form: VisitorQuestionnaireFormState): string | null {
  if (!form.visitDate) return 'Select the visit date.'
  if (!form.completedBy) return 'Select the responsible person.'
  if (!form.visitorName.trim()) return 'Enter the visitor or contractor name.'
  if (!form.company.trim()) return 'Enter the visitor company.'
  if (!form.reasonForVisit.trim()) return 'Enter the reason for visit.'
  if (!form.contactNumber.trim()) return 'Enter the visitor contact number.'
  if (!form.visitorSignature.trim()) return 'Capture the visitor signature.'
  if (!form.employeeSignature.trim()) return 'Capture the employee signature.'
  if (!form.siteContactName.trim()) return 'Enter the site contact name.'
  if (form.authorizedToProceed === null) return 'Confirm whether the visitor is authorized to proceed.'

  const unansweredQuestion = form.questions.find((question) => !question.answer)
  if (unansweredQuestion) return `Answer the screening question: ${unansweredQuestion.question_text}`

  const unacknowledgedInduction = form.inductionItems.find((item) => item.acknowledged === null)
  if (unacknowledgedInduction) return `Confirm the induction item: ${unacknowledgedInduction.item_text}`

  return null
}

function InspectionSidebar({
  groups,
  selectedKey,
  onSelect,
}: {
  groups: Array<[string, InspectionSectionDefinition[]]>
  selectedKey: string
  onSelect: (key: string) => void
}) {
  return (
    <Sidebar collapsible="none" className="lg:sticky lg:top-24">
      <SidebarHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-olive/10 p-2 text-olive">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Inspection Library</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map(([group, sections]) => (
          <SidebarGroup key={group}>
            <SidebarGroupContent>
              <SidebarMenu>
              {sections.map((section) => {
                const isActive = section.key === selectedKey
                const SectionIcon = getInspectionIcon(section.icon)

                return (
                  <SidebarMenuItem key={section.key}>
                  <SidebarMenuButton
                    key={section.key}
                    type="button"
                    onClick={() => onSelect(section.key)}
                    isActive={isActive}
                    className="items-start"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                        isActive ? 'bg-olive text-white' : 'bg-background text-muted-foreground'
                      )}
                    >
                      <SectionIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm font-semibold leading-5',
                          isActive ? 'text-foreground' : 'text-foreground/90'
                        )}
                      >
                        {section.label}
                      </p>
                    </div>
                  </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          Inspection sections stay visible here so operators can move between records without switching modes.
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function InspectionHeader({ section }: { section: InspectionSectionDefinition }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
                  statusToneClasses[section.statusTone]
                )}
              >
                {section.statusLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                {frequencyLabels[section.frequency]}
              </span>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                {section.label}
              </h2>
              {section.key !== 'glass-inspection' ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {section.description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[340px]">
            <HeaderMetric
              icon={CalendarClock}
              label="Cadence"
              value={frequencyLabels[section.frequency]}
            />
            <HeaderMetric
              icon={ShieldCheck}
              label="Expectation"
              value={section.completionExpectation}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function HeaderMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-background p-2 text-olive shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-medium leading-6 text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

function GlassStatusBadge({ status }: { status: GlassInspectionOverviewRecord['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        statusToneClasses[glassStatusToneByStatus[status]]
      )}
    >
      {glassStatusLabelByStatus[status]}
    </span>
  )
}

function InspectionChecklistBlock({ section }: { section: InspectionSectionDefinition }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Checklist Preview</CardTitle>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-olive" />
            {section.checklist.length} checkpoints
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {section.checklist.map((item, index) => (
          <div
            key={item.id}
            className="rounded-xl border border-border/70 bg-background px-4 py-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-olive/10 text-sm font-semibold text-olive">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.note}</p>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function InspectionMetadataBlock({ section }: { section: InspectionSectionDefinition }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-lg">Record Authoring Surface</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 md:grid-cols-2">
        {section.fields.map((field) => (
          <FieldPreview key={field.id} field={field} />
        ))}
      </CardContent>
    </Card>
  )
}

function FieldPreview({ field }: { field: InspectionFieldDefinition }) {
  const isTextArea = field.type === 'textarea'
  const isSelectLike = field.type === 'select' || field.type === 'person'

  return (
    <div className={cn('space-y-2', isTextArea && 'md:col-span-2')}>
      <div>
        <p className="text-sm font-semibold text-foreground">{field.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{field.helper}</p>
      </div>
      {isTextArea ? (
        <textarea
          rows={5}
          readOnly
          placeholder={field.placeholder}
          className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      ) : isSelectLike ? (
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
        >
          <span>{field.placeholder}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : (
        <Input readOnly placeholder={field.placeholder} />
      )}
    </div>
  )
}

function InspectionSupportPanel({ section }: { section: InspectionSectionDefinition }) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-lg">Evidence and Signoff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-background p-2 text-olive shadow-sm">
              <Paperclip className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Evidence placeholder</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{section.evidenceLabel}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SupportTile
            icon={FileStack}
            title="Record metadata"
            body="Future save state, version label, and reference number will appear here."
          />
          <SupportTile
            icon={ShieldCheck}
            title="Approval routing"
            body="Assigned by, reviewed by, and signoff placeholders are staged for the backend phase."
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary">
            Save Draft Placeholder
          </Button>
          <Button type="button" variant="outline">
            Submit for Review Placeholder
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function GlassInspectionOverview({
  section,
  entries,
  loading,
  error,
  onStartInspection,
  onOpenInspection,
}: {
  section: InspectionSectionDefinition
  onStartInspection: () => void
  entries: GlassInspectionOverviewRecord[]
  loading: boolean
  error: string | null
  onOpenInspection: (recordId: string) => void
}) {
  const template = section.glassTemplate

  if (!template) return null

  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{template.entriesTitle}</CardTitle>
            <CardDescription>{template.entriesDescription}</CardDescription>
          </div>
          <Button type="button" onClick={onStartInspection} className="sm:self-start">
            {template.entriesStartLabel}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                {template.entriesHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 text-left font-semibold text-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={template.entriesHeaders.length} className="px-4 py-12 text-center text-muted-foreground">
                    Loading glass inspection records...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={template.entriesHeaders.length} className="px-4 py-12 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={template.entriesHeaders.length} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-md space-y-2">
                      <p className="text-sm font-semibold text-foreground">No glass inspections recorded yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Start an inspection to save a draft or submit a completed weekly register.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={cn(
                    'border-b border-border/60 transition-colors hover:bg-slate-50',
                    index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                  )}
                >
                  <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.inspectionDate)}</td>
                  <td className="px-4 py-4 text-foreground">{entry.checkedBy}</td>
                  <td className="px-4 py-4 text-muted-foreground">{entry.areasChecked}</td>
                  <td className="px-4 py-4">
                    <GlassStatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenInspection(entry.id)}>
                      Open
                    </Button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function GlassInspectionRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.glassTemplate

  if (!template) return null

  const [activeArea, setActiveArea] = useState(template.registerGroups[0]?.area ?? '')
  const [form, setForm] = useState<GlassRegisterFormState>(() => ({
    id: recordId,
    checkedBy: '',
    inspectionDate: '',
    status: 'DRAFT',
    items: createInitialGlassItems(section),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'
  const itemGroups = useMemo(() => getGlassItemGroups(form.items), [form.items])

  useEffect(() => {
    let ignore = false

    const loadRecord = async () => {
      if (!recordId) {
        setForm({
          id: null,
          checkedBy: '',
          inspectionDate: '',
          status: 'DRAFT',
          items: createInitialGlassItems(section),
        })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }

      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadGlassInspectionRecord(recordId)
        if (ignore) return

        setForm({
          id: record.id,
          checkedBy: record.checkedById ?? '',
          inspectionDate: record.inspectionDate ?? '',
          status: record.status,
          items: mergeSavedGlassItems(section, record.items),
        })
      } catch (error) {
        if (!ignore) {
          const message = error instanceof Error ? error.message : 'Unable to load glass inspection.'
          setLoadError(message)
        }
      } finally {
        if (!ignore) {
          setLoadingRecord(false)
        }
      }
    }

    loadRecord()

    return () => {
      ignore = true
    }
  }, [recordId, section])

  const updateItem = useCallback(
    (itemKey: string, patch: Partial<GlassRegisterItemState>) => {
      setForm((current) => ({
        ...current,
        items: current.items.map((item) => (item.item_key === itemKey ? { ...item, ...patch } : item)),
      }))
    },
    []
  )

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const savedId = form.id
        ? await saveGlassInspectionDraft({
            inspection_id: form.id,
            checked_by: form.checkedBy || null,
            inspection_date: form.inspectionDate || null,
            items: form.items,
          })
        : await createGlassInspectionDraft({
            inspection_id: null,
            checked_by: form.checkedBy || null,
            inspection_date: form.inspectionDate || null,
            items: form.items,
          })

      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Glass inspection draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save glass inspection draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitInspection = async () => {
    if (isReadOnly) return
    const validationError = validateGlassSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      const savedId = await submitGlassInspection({
        inspection_id: form.id,
        checked_by: form.checkedBy,
        inspection_date: form.inspectionDate,
        items: form.items,
      })

      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Glass inspection submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit glass inspection.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-8 text-sm text-muted-foreground">Loading glass inspection...</CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-8">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={onBackToOverview}>
            Back to entries
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToOverview}
          className="border-olive/20 bg-olive/10 text-olive hover:bg-olive/15 hover:text-olive-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to entries
        </Button>
        {isReadOnly ? (
          <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Read-only completed record
          </span>
        ) : null}
      </div>
      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="glass-checked-by" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.checkedByLabel}
            </Label>
            <SearchableSelect
              id="glass-checked-by"
              value={form.checkedBy}
              options={userOptions.map((user) => ({ value: user.id, label: user.label }))}
              onChange={(value) => setForm((current) => ({ ...current, checkedBy: value }))}
              placeholder="Select checker"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="glass-inspection-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.dateLabel}
            </Label>
            <DatePicker
              id="glass-inspection-date"
              value={form.inspectionDate}
              onChange={(value) => setForm((current) => ({ ...current, inspectionDate: value }))}
              placeholder="Select inspection date"
              disabled={isReadOnly || saving}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">{template.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {itemGroups.map((group) => {
            const isOpen = activeArea === group.area

            return (
              <div key={group.area} className="overflow-hidden rounded-2xl border border-border/70 bg-white">
                <button
                  type="button"
                  onClick={() => setActiveArea((current) => (current === group.area ? '' : group.area))}
                  className="flex w-full items-center justify-between gap-4 bg-white px-5 py-4 text-left transition-colors hover:bg-slate-50"
                  aria-expanded={isOpen}
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">{group.area}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {group.rows.length} item{group.rows.length === 1 ? '' : 's'} in this area
                    </p>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      isOpen ? 'rotate-90' : ''
                    )}
                  />
                </button>

                {isOpen ? (
                  <div className="border-t border-border/70">
                    <div className="overflow-x-auto">
                      <table className="min-w-[1120px] w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border/70 bg-white">
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Item</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Total Qty</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Qty Intact</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Qty Not Intact</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Action Required / NC No.</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Risk Class</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Action Completed</th>
                            <th className="px-4 py-3 text-left font-semibold text-foreground">Signature</th>
                          </tr>
                        </thead>
                        <tbody>
                          <GlassInspectionGroupRows
                            group={group}
                            riskOptions={template.riskOptions}
                            disabled={isReadOnly || saving}
                            onUpdateItem={updateItem}
                          />
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.signoffLabel}
            </p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              The row signatures above form the saved signoff evidence for this register.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button type="button" onClick={submitInspection} disabled={isReadOnly || saving}>
              {saving ? 'Submitting...' : 'Submit Inspection'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function GlassInspectionGroupRows({
  group,
  riskOptions,
  disabled,
  onUpdateItem,
}: {
  group: { area: string; rows: GlassRegisterItemState[] }
  riskOptions: readonly string[]
  disabled: boolean
  onUpdateItem: (itemKey: string, patch: Partial<GlassRegisterItemState>) => void
}) {
  return (
    <>
      {group.rows.map((row, index) => (
        <tr
          key={`${group.area}-${row.item_key}-${index}`}
          className={cn(
            'align-top transition-colors hover:bg-slate-50',
            index % 2 === 0 ? 'bg-white' : 'bg-slate-50',
            index === group.rows.length - 1 ? 'border-b border-border/60' : ''
          )}
        >
          <td className="px-4 py-3 text-foreground">{row.item_name}</td>
          <td className="px-4 py-3 text-foreground">{row.total_quantity}</td>
          <td className="px-4 py-3">
            <Input
              type="number"
              min={0}
              value={row.qty_intact ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onUpdateItem(row.item_key, {
                  qty_intact: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              className="h-9 min-w-[84px]"
            />
          </td>
          <td className="px-4 py-3">
            <Input
              type="number"
              min={0}
              value={row.qty_not_intact ?? ''}
              disabled={disabled}
              onChange={(event) =>
                onUpdateItem(row.item_key, {
                  qty_not_intact: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              className="h-9 min-w-[84px]"
            />
          </td>
          <td className="px-4 py-3">
            <Input
              value={row.action_required_nc_no ?? ''}
              disabled={disabled}
              onChange={(event) => onUpdateItem(row.item_key, { action_required_nc_no: event.target.value || null })}
              placeholder="NC number"
              className="h-9 min-w-[150px]"
            />
          </td>
          <td className="px-4 py-3">
            <div className="flex gap-2">
              {riskOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={disabled}
                  onClick={() => onUpdateItem(row.item_key, { risk_class: option as GlassRiskClass })}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
                    row.risk_class === option
                      ? 'border-olive bg-olive text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-olive/40'
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </td>
          <td className="px-4 py-3">
            <select
              value={row.action_completed === null ? '' : row.action_completed ? 'yes' : 'no'}
              disabled={disabled}
              onChange={(event) =>
                onUpdateItem(row.item_key, {
                  action_completed: event.target.value === '' ? null : event.target.value === 'yes',
                })
              }
              className="h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select</option>
              <option value="yes">Completed</option>
              <option value="no">Open</option>
            </select>
          </td>
          <td className="px-4 py-3">
            <Input
              value={row.signature ?? ''}
              disabled={disabled}
              onChange={(event) => onUpdateItem(row.item_key, { signature: event.target.value || null })}
              placeholder="Initials / name"
              className="h-9 min-w-[150px]"
            />
          </td>
        </tr>
      ))}
    </>
  )
}

function JobCardTemplateView({ section }: { section: InspectionSectionDefinition }) {
  const template = section.jobCardTemplate

  if (!template) return null

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {template.headerFields.map((field) => (
            <div key={field} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {field}
              </p>
              <div className="h-11 rounded-lg border border-dashed border-border bg-muted/20" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Type of Service</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          {template.serviceTypes.map((type) => (
            <div
              key={type}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-4 py-3"
            >
              <div className="h-5 w-5 rounded border border-dashed border-border bg-muted/20" />
              <span className="text-sm font-medium text-foreground">{type}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <JobCardChecklistCard title={template.beforeProceedingTitle} items={template.beforeProceedingChecks} />
        <JobCardChecklistCard title={template.completionTitle} items={template.completionChecks} />
      </div>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">{template.inventoryTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-5">
          <JobCardInventoryTable headers={template.toolsHeaders} rows={template.toolRows} />
          <JobCardInventoryTable headers={template.materialsHeaders} rows={template.materialRows} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">{template.detailLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="min-h-[180px] rounded-xl border border-dashed border-border bg-muted/20" />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-3">
          {template.signoffs.map((signoff) => (
            <div key={signoff} className="space-y-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {signoff}
                </p>
                <div className="h-11 rounded-lg border border-dashed border-border bg-muted/20" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Date
                </p>
                <div className="h-11 rounded-lg border border-dashed border-border bg-muted/20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function JobCardChecklistCard({
  title,
  items,
}: {
  title: string
  items: readonly { label: string }[]
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_88px_88px_220px]"
          >
            <div className="text-sm font-medium text-foreground">{item.label}</div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border border-dashed border-border bg-muted/20" />
              <span className="text-sm text-muted-foreground">Yes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border border-dashed border-border bg-muted/20" />
              <span className="text-sm text-muted-foreground">No</span>
            </div>
            <div className="h-10 rounded-md border border-dashed border-border bg-muted/20" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function JobCardInventoryTable({
  headers,
  rows,
}: {
  headers: readonly string[]
  rows: number
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/30">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-left font-semibold text-foreground">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <tr key={index} className="border-b border-border/60 last:border-b-0">
              {headers.map((header) => (
                <td key={`${index}-${header}`} className="px-4 py-3">
                  <div className="h-10 rounded-md border border-dashed border-border bg-muted/20" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChemicalStatusBadge({ status }: { status: ChemicalVerificationOverviewRecord['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        statusToneClasses[chemicalStatusToneByStatus[status]]
      )}
    >
      {chemicalStatusLabelByStatus[status]}
    </span>
  )
}

function ChemicalVerificationOverview({
  section,
  entries,
  loading,
  error,
  onStartVerification,
  onOpenVerification,
}: {
  section: InspectionSectionDefinition
  entries: ChemicalVerificationOverviewRecord[]
  loading: boolean
  error: string | null
  onStartVerification: () => void
  onOpenVerification: (recordId: string) => void
}) {
  const template = section.chemicalVerificationTemplate

  if (!template) return null

  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Chemical Verification Records</CardTitle>
            <CardDescription>Review saved dilution verification records before starting a new entry.</CardDescription>
          </div>
          <Button type="button" onClick={onStartVerification} className="sm:self-start">
            Start Verification
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Signoff date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Signed by</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Rows recorded</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Loading chemical verification records...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-md space-y-2">
                      <p className="text-sm font-semibold text-foreground">No chemical verifications recorded yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Start a verification to save a draft or submit a signed record.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-border/60 transition-colors hover:bg-slate-50',
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.signoffDate)}</td>
                    <td className="px-4 py-4 text-foreground">{entry.signoffBy}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.rowCount}</td>
                    <td className="px-4 py-4">
                      <ChemicalStatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenVerification(entry.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function ChemicalVerificationRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.chemicalVerificationTemplate

  if (!template) return null

  const [form, setForm] = useState<ChemicalVerificationFormState>(() => ({
    id: recordId,
    signoffBy: '',
    signoffDate: '',
    status: 'DRAFT',
    items: createInitialChemicalItems(template.rowCount),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'

  useEffect(() => {
    let ignore = false

    const loadRecord = async () => {
      if (!recordId) {
        setForm({
          id: null,
          signoffBy: '',
          signoffDate: '',
          status: 'DRAFT',
          items: createInitialChemicalItems(template.rowCount),
        })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }

      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadChemicalVerificationRecord(recordId)
        if (ignore) return

        setForm({
          id: record.id,
          signoffBy: record.signoffById ?? '',
          signoffDate: record.signoffDate ?? '',
          status: record.status,
          items: mergeSavedChemicalItems(template.rowCount, record.items),
        })
      } catch (error) {
        if (!ignore) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load chemical verification.')
        }
      } finally {
        if (!ignore) {
          setLoadingRecord(false)
        }
      }
    }

    loadRecord()

    return () => {
      ignore = true
    }
  }, [recordId, template.rowCount])

  const updateItem = useCallback((rowKey: string, patch: Partial<ChemicalVerificationItemState>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.row_key === rowKey ? { ...item, ...patch } : item)),
    }))
  }, [])

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const savedId = form.id
        ? await saveChemicalVerificationDraft({
            verification_id: form.id,
            signoff_by: form.signoffBy || null,
            signoff_date: form.signoffDate || null,
            items: form.items,
          })
        : await createChemicalVerificationDraft({
            verification_id: null,
            signoff_by: form.signoffBy || null,
            signoff_date: form.signoffDate || null,
            items: form.items,
          })

      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Chemical verification draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save chemical verification draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitVerification = async () => {
    if (isReadOnly) return
    const validationError = validateChemicalSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      const savedId = await submitChemicalVerification({
        verification_id: form.id,
        signoff_by: form.signoffBy,
        signoff_date: form.signoffDate,
        items: form.items,
      })

      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Chemical verification submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit chemical verification.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-8 text-sm text-muted-foreground">Loading chemical verification...</CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-8">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={onBackToOverview}>
            Back to records
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToOverview}
          className="border-olive/20 bg-olive/10 text-olive hover:bg-olive/15 hover:text-olive-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to records
        </Button>
        {isReadOnly ? (
          <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Read-only completed record
          </span>
        ) : null}
      </div>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Chemical Issue Dilution Verification</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[1260px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-muted/30">
                  {template.headers.map((header) => (
                    <th key={header} className="px-4 py-3 text-left font-semibold text-foreground">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, index) => (
                  <tr
                    key={item.row_key}
                    className={cn(
                      'border-b border-border/60 last:border-b-0',
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <DatePicker
                        value={item.issue_date ?? ''}
                        onChange={(value) => updateItem(item.row_key, { issue_date: value || null })}
                        placeholder="Select date"
                        disabled={isReadOnly || saving}
                        triggerClassName="h-9 min-w-[150px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.chemical_name ?? ''}
                        onChange={(event) => updateItem(item.row_key, { chemical_name: event.target.value || null })}
                        placeholder="Chemical"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[170px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.batch_details ?? ''}
                        onChange={(event) => updateItem(item.row_key, { batch_details: event.target.value || null })}
                        placeholder="Batch"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[150px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.quantity_issued ?? ''}
                        onChange={(event) => updateItem(item.row_key, { quantity_issued: event.target.value || null })}
                        placeholder="Quantity"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[130px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.dilution_verified_by ?? ''}
                        onChange={(event) => updateItem(item.row_key, { dilution_verified_by: event.target.value || null })}
                        placeholder="Verified by"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[190px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.issued_to ?? ''}
                        onChange={(event) => updateItem(item.row_key, { issued_to: event.target.value || null })}
                        placeholder="Issued to"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[150px]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        value={item.issued_by ?? ''}
                        onChange={(event) => updateItem(item.row_key, { issued_by: event.target.value || null })}
                        placeholder="Issued by"
                        disabled={isReadOnly || saving}
                        className="h-9 min-w-[150px]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="space-y-3 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Note</p>
          {template.notes.map((note) => (
            <div key={note} className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">
              {note}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="chemical-signoff-by" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.signoffLabel}
            </Label>
            <SearchableSelect
              id="chemical-signoff-by"
              value={form.signoffBy}
              options={userOptions.map((user) => ({ value: user.id, label: user.label }))}
              onChange={(value) => setForm((current) => ({ ...current, signoffBy: value }))}
              placeholder="Select supervisor"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chemical-signoff-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Date
            </Label>
            <DatePicker
              id="chemical-signoff-date"
              value={form.signoffDate}
              onChange={(value) => setForm((current) => ({ ...current, signoffDate: value }))}
              placeholder="Select date"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button type="button" onClick={submitVerification} disabled={isReadOnly || saving}>
              {saving ? 'Submitting...' : 'Submit Verification'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function CleaningStatusBadge({ status }: { status: CleaningVerificationOverviewRecord['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
        statusToneClasses[cleaningStatusToneByStatus[status]]
      )}
    >
      {cleaningStatusLabelByStatus[status]}
    </span>
  )
}

function CleaningVerificationOverview({
  section,
  entries,
  loading,
  error,
  onStartVerification,
  onOpenVerification,
}: {
  section: InspectionSectionDefinition
  entries: CleaningVerificationOverviewRecord[]
  loading: boolean
  error: string | null
  onStartVerification: () => void
  onOpenVerification: (recordId: string) => void
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{section.label} Records</CardTitle>
            <CardDescription>Review saved {frequencyLabels[section.frequency].toLowerCase()} cleaning verifications.</CardDescription>
          </div>
          <Button type="button" onClick={onStartVerification} className="sm:self-start">
            Start Verification
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Frequency</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Sign off</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Items checked</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">NC items</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    Loading cleaning verifications...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-md space-y-2">
                      <p className="text-sm font-semibold text-foreground">No cleaning verifications recorded yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Start a verification to save a draft or submit a completed cleaning record.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-border/60 transition-colors hover:bg-slate-50',
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.verificationDate)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{frequencyLabels[entry.frequency]}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.signoffBy}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.itemCount}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.nonConformanceCount}</td>
                    <td className="px-4 py-4">
                      <CleaningStatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenVerification(entry.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function ResultButtons({
  value,
  disabled,
  onChange,
}: {
  value: CleaningVerificationResult | null
  disabled: boolean
  onChange: (value: CleaningVerificationResult) => void
}) {
  return (
    <div className="flex gap-2">
      {(['C', 'NC'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-9 w-12 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            value === option
              ? option === 'C'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-amber-600 bg-amber-600 text-white'
              : 'border-border bg-background text-muted-foreground hover:border-olive/40'
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function CleaningVerificationRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.cleaningVerificationTemplate

  if (!template) return null

  const frequency = getCleaningFrequency(section)
  const [form, setForm] = useState<CleaningVerificationFormState>(() => ({
    id: recordId,
    frequency,
    verificationDate: '',
    signoffBy: '',
    status: 'DRAFT',
    items: createInitialCleaningItems(template),
    areaSignoffs: createInitialCleaningAreaSignoffs(template),
    correctiveActions: createInitialCleaningCorrectiveActions(template.correctiveActionRows),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'

  useEffect(() => {
    let ignore = false

    const loadRecord = async () => {
      if (!recordId) {
        setForm({
          id: null,
          frequency,
          verificationDate: '',
          signoffBy: '',
          status: 'DRAFT',
          items: createInitialCleaningItems(template),
          areaSignoffs: createInitialCleaningAreaSignoffs(template),
          correctiveActions: createInitialCleaningCorrectiveActions(template.correctiveActionRows),
        })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }

      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadCleaningVerificationRecord(recordId)
        if (ignore) return

        setForm({
          id: record.id,
          frequency: record.frequency,
          verificationDate: record.verification_date ?? '',
          signoffBy: record.signoff_by ?? '',
          status: record.status,
          items: mergeSavedCleaningItems(template, record.items),
          areaSignoffs: mergeSavedCleaningAreaSignoffs(template, record.area_signoffs),
          correctiveActions: mergeSavedCleaningCorrectiveActions(template.correctiveActionRows, record.corrective_actions),
        })
      } catch (error) {
        if (!ignore) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load cleaning verification.')
        }
      } finally {
        if (!ignore) {
          setLoadingRecord(false)
        }
      }
    }

    loadRecord()

    return () => {
      ignore = true
    }
  }, [frequency, recordId, template])

  const updateItem = useCallback((itemKey: string, patch: Partial<CleaningVerificationItemState>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.item_key === itemKey ? { ...item, ...patch } : item)),
    }))
  }, [])

  const updateAreaSignoff = useCallback((areaKey: string, signedBy: string) => {
    setForm((current) => ({
      ...current,
      areaSignoffs: current.areaSignoffs.map((area) =>
        area.area_key === areaKey ? { ...area, signed_by: signedBy } : area
      ),
    }))
  }, [])

  const updateCorrectiveAction = useCallback((rowKey: string, patch: Partial<CleaningCorrectiveActionState>) => {
    setForm((current) => ({
      ...current,
      correctiveActions: current.correctiveActions.map((action) =>
        action.row_key === rowKey ? { ...action, ...patch } : action
      ),
    }))
  }, [])

  const buildSaveInput = () => ({
    verification_id: form.id,
    frequency: form.frequency,
    verification_date: form.verificationDate || null,
    signoff_by: form.signoffBy || null,
    items: form.items,
    area_signoffs: form.areaSignoffs,
    corrective_actions: form.correctiveActions,
  })

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const input = buildSaveInput()
      const savedId = form.id
        ? await saveCleaningVerificationDraft(input)
        : await createCleaningVerificationDraft(input)

      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Cleaning verification draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save cleaning verification draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitVerification = async () => {
    if (isReadOnly) return
    const validationError = validateCleaningSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      const savedId = await submitCleaningVerification(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Cleaning verification submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit cleaning verification.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-8 text-sm text-muted-foreground">Loading cleaning verification...</CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-8">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={onBackToOverview}>
            Back to records
          </Button>
        </CardContent>
      </Card>
    )
  }

  const areaGroups = getCleaningItemGroups(form.items)
  const signoffByAreaKey = new Map(form.areaSignoffs.map((area) => [area.area_key, area]))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBackToOverview} className="w-fit gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to records
        </Button>
        <CleaningStatusBadge status={form.status} />
      </div>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">{section.label}</CardTitle>
          <CardDescription>{template.frequencyLabel}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="cleaning-verification-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Date
            </Label>
            <DatePicker
              id="cleaning-verification-date"
              value={form.verificationDate}
              onChange={(value) => setForm((current) => ({ ...current, verificationDate: value }))}
              placeholder="Select date"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cleaning-signoff-by" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.signoffLabel}
            </Label>
            <SearchableSelect
              id="cleaning-signoff-by"
              value={form.signoffBy}
              options={userOptions.map((user) => ({ value: user.id, label: user.label }))}
              onChange={(value) => setForm((current) => ({ ...current, signoffBy: value }))}
              placeholder="Select responsible person"
              disabled={isReadOnly || saving}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {areaGroups.map((area) => (
          <Card key={area.areaKey} className="border-border/70">
            <CardHeader className="border-b border-border/70">
              <div className="space-y-2">
                <CardTitle className="text-lg">{area.areaName}</CardTitle>
                {area.colorCode ? (
                  <div className="inline-flex w-fit rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
                    {area.colorCode}
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-5">
              {area.rows.map((item) => (
                <div
                  key={item.item_key}
                  className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_112px_minmax(180px,0.75fr)]"
                >
                  <div className="text-sm font-medium text-foreground">{item.item_name}</div>
                  <ResultButtons
                    value={item.result}
                    disabled={isReadOnly || saving}
                    onChange={(value) => updateItem(item.item_key, { result: value })}
                  />
                  <Input
                    value={item.notes ?? ''}
                    onChange={(event) => updateItem(item.item_key, { notes: event.target.value })}
                    placeholder="Notes"
                    disabled={isReadOnly || saving}
                  />
                </div>
              ))}
              <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.75fr)]">
                <div className="text-sm font-semibold text-foreground">Sign Off</div>
                <Input
                  value={signoffByAreaKey.get(area.areaKey)?.signed_by ?? ''}
                  onChange={(event) => updateAreaSignoff(area.areaKey, event.target.value)}
                  placeholder="Name or initials"
                  disabled={isReadOnly || saving}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Corrective Action Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-white">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Non-conformance Reported</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Corrective action made</th>
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Sign off</th>
                </tr>
              </thead>
              <tbody>
                {form.correctiveActions.map((action) => (
                  <tr key={action.row_key} className="border-b border-border/60">
                    <td className="px-4 py-3 align-top">
                      <DatePicker
                        value={action.action_date ?? ''}
                        onChange={(value) => updateCorrectiveAction(action.row_key, { action_date: value || null })}
                        placeholder="Select date"
                        disabled={isReadOnly || saving}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input
                        value={action.non_conformance ?? ''}
                        onChange={(event) => updateCorrectiveAction(action.row_key, { non_conformance: event.target.value })}
                        placeholder="Non-conformance"
                        disabled={isReadOnly || saving}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input
                        value={action.corrective_action ?? ''}
                        onChange={(event) => updateCorrectiveAction(action.row_key, { corrective_action: event.target.value })}
                        placeholder="Corrective action"
                        disabled={isReadOnly || saving}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Input
                        value={action.signoff ?? ''}
                        onChange={(event) => updateCorrectiveAction(action.row_key, { signoff: event.target.value })}
                        placeholder="Sign off"
                        disabled={isReadOnly || saving}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="flex flex-wrap gap-3 p-5">
          <Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button type="button" onClick={submitVerification} disabled={isReadOnly || saving}>
            {saving ? 'Submitting...' : 'Submit Verification'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function FacilityRecordStatusBadge({ status }: { status: 'DRAFT' | 'COMPLETED' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
        statusToneClasses[recordStatusToneByStatus[status]]
      )}
    >
      {recordStatusLabelByStatus[status]}
    </span>
  )
}

function AblutionFacilityOverview({
  entries,
  loading,
  error,
  onStartRecord,
  onOpenRecord,
}: {
  entries: AblutionOverviewRecord[]
  loading: boolean
  error: string | null
  onStartRecord: () => void
  onOpenRecord: (recordId: string) => void
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Ablution Facility Records</CardTitle>
            <CardDescription>Review saved facility records before starting a new check.</CardDescription>
          </div>
          <Button type="button" onClick={onStartRecord} className="sm:self-start">
            Start Record
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Signed off by</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Checks</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">NC</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Loading ablution facility records...</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-destructive">{error}</td></tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <p className="text-sm font-semibold text-foreground">No ablution facility records yet.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Start a record to save a draft or submit a completed facility check.</p>
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                  <tr key={entry.id} className={cn('border-b border-border/60 hover:bg-slate-50', index % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                    <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.recordDate)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.signedOffBy}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.checkedCount}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.nonConformanceCount}</td>
                    <td className="px-4 py-4"><FacilityRecordStatusBadge status={entry.status} /></td>
                    <td className="px-4 py-4">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenRecord(entry.id)}>Open</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function AblutionFacilityRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.ablutionFacilityTemplate
  if (!template) return null

  const [form, setForm] = useState<AblutionRecordFormState>(() => ({
    id: recordId,
    recordDate: '',
    signedOffBy: '',
    correctiveActions: '',
    status: 'DRAFT',
    checks: createInitialAblutionChecks(template),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'

  useEffect(() => {
    let ignore = false
    const loadRecord = async () => {
      if (!recordId) {
        setForm({ id: null, recordDate: '', signedOffBy: '', correctiveActions: '', status: 'DRAFT', checks: createInitialAblutionChecks(template) })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }
      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadAblutionRecord(recordId)
        if (ignore) return
        setForm({
          id: record.id,
          recordDate: record.record_date ?? '',
          signedOffBy: record.signed_off_by ?? '',
          correctiveActions: record.corrective_actions ?? '',
          status: record.status,
          checks: mergeSavedAblutionChecks(template, record.checks),
        })
      } catch (error) {
        if (!ignore) setLoadError(error instanceof Error ? error.message : 'Unable to load ablution facility record.')
      } finally {
        if (!ignore) setLoadingRecord(false)
      }
    }
    loadRecord()
    return () => {
      ignore = true
    }
  }, [recordId, template])

  const updateCheck = useCallback((checkKey: string, patch: Partial<AblutionCheckState>) => {
    setForm((current) => ({
      ...current,
      checks: current.checks.map((check) => (check.check_key === checkKey ? { ...check, ...patch } : check)),
    }))
  }, [])

  const buildSaveInput = () => ({
    record_id: form.id,
    record_date: form.recordDate || null,
    signed_off_by: form.signedOffBy || null,
    corrective_actions: form.correctiveActions || null,
    checks: form.checks,
  })

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const savedId = form.id ? await saveAblutionRecordDraft(buildSaveInput()) : await createAblutionRecordDraft(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Ablution facility draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save ablution facility draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitRecord = async () => {
    if (isReadOnly) return
    const validationError = validateAblutionSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSaving(true)
    try {
      const savedId = await submitAblutionRecord(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Ablution facility record submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit ablution facility record.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) return <Card className="border-border/70"><CardContent className="p-8 text-sm text-muted-foreground">Loading ablution facility record...</CardContent></Card>
  if (loadError) return <Card className="border-border/70"><CardContent className="space-y-4 p-8"><p className="text-sm text-destructive">{loadError}</p><Button type="button" variant="outline" onClick={onBackToOverview}>Back to records</Button></CardContent></Card>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBackToOverview} className="w-fit gap-2"><ArrowLeft className="h-4 w-4" />Back to records</Button>
        <FacilityRecordStatusBadge status={form.status} />
      </div>
      <Card className="border-border/70">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{template.frequencyLabel}</Label>
            <Input value="Daily" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ablution-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{template.dateLabel}</Label>
            <DatePicker id="ablution-date" value={form.recordDate} onChange={(value) => setForm((current) => ({ ...current, recordDate: value }))} placeholder="Select date" disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ablution-signed-off" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{template.signoffLabel}</Label>
            <SearchableSelect id="ablution-signed-off" value={form.signedOffBy} options={userOptions.map((user) => ({ value: user.id, label: user.label }))} onChange={(value) => setForm((current) => ({ ...current, signedOffBy: value }))} placeholder="Select responsible person" disabled={isReadOnly || saving} />
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70"><CardTitle className="text-lg">{template.title}</CardTitle><CardDescription>{template.legend}</CardDescription></CardHeader>
        <CardContent className="space-y-4 p-5">
          {getAblutionCheckGroups(form.checks).map((group) => (
            <div key={group.groupKey} className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{group.groupLabel}</div>
              {group.checks.map((check) => (
                <div key={check.check_key} className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_112px_minmax(180px,0.75fr)]">
                  <div className="text-sm font-medium text-foreground">{check.check_label}</div>
                  <ResultButtons value={check.result} disabled={isReadOnly || saving} onChange={(value) => updateCheck(check.check_key, { result: value as AblutionResult })} />
                  <Input value={check.notes ?? ''} onChange={(event) => updateCheck(check.check_key, { notes: event.target.value })} placeholder="Notes" disabled={isReadOnly || saving} />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70"><CardTitle className="text-lg">{template.correctiveActionLabel}</CardTitle></CardHeader>
        <CardContent className="p-5">
          <textarea value={form.correctiveActions} onChange={(event) => setForm((current) => ({ ...current, correctiveActions: event.target.value }))} placeholder="Record corrective actions" disabled={isReadOnly || saving} className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
        </CardContent>
      </Card>
      <Card className="border-border/70"><CardContent className="flex flex-wrap gap-3 p-5"><Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>{saving ? 'Saving...' : 'Save Draft'}</Button><Button type="button" onClick={submitRecord} disabled={isReadOnly || saving}>{saving ? 'Submitting...' : 'Submit Record'}</Button></CardContent></Card>
    </div>
  )
}

function HygieneRecordOverview({
  entries,
  loading,
  error,
  onStartRecord,
  onOpenRecord,
}: {
  entries: HygieneOverviewRecord[]
  loading: boolean
  error: string | null
  onStartRecord: () => void
  onOpenRecord: (recordId: string) => void
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Hygiene Records</CardTitle>
            <CardDescription>Review saved hygiene checks before starting a new record.</CardDescription>
          </div>
          <Button type="button" onClick={onStartRecord} className="sm:self-start">Start Record</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Checked by</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">People sampled</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Checks</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Failed</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading hygiene records...</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-destructive">{error}</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center"><p className="text-sm font-semibold text-foreground">No hygiene records yet.</p><p className="mt-1 text-sm text-muted-foreground">Start a record to save a draft or submit a completed hygiene check.</p></td></tr>
              ) : (
                entries.map((entry, index) => (
                  <tr key={entry.id} className={cn('border-b border-border/60 hover:bg-slate-50', index % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                    <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.recordDate)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.checkedBy}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.namesChecked || 'Not captured'}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.checkedCount}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.failedCount}</td>
                    <td className="px-4 py-4"><FacilityRecordStatusBadge status={entry.status} /></td>
                    <td className="px-4 py-4"><Button type="button" variant="outline" size="sm" onClick={() => onOpenRecord(entry.id)}>Open</Button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function HygieneResultButtons({
  value,
  disabled,
  onChange,
}: {
  value: HygieneResult | null
  disabled: boolean
  onChange: (value: HygieneResult) => void
}) {
  return (
    <div className="flex gap-2">
      {[
        { label: 'Pass', value: 'PASS' as const },
        { label: 'Fail', value: 'FAIL' as const },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-9 w-16 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            value === option.value
              ? option.value === 'PASS'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-amber-600 bg-amber-600 text-white'
              : 'border-border bg-background text-muted-foreground hover:border-olive/40'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function HygieneRecordRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.hygieneRecordTemplate
  if (!template) return null

  const [form, setForm] = useState<HygieneRecordFormState>(() => ({
    id: recordId,
    recordDate: '',
    checkedBy: '',
    namesChecked: '',
    comments: '',
    status: 'DRAFT',
    requirements: createInitialHygieneRequirements(template),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'

  useEffect(() => {
    let ignore = false
    const loadRecord = async () => {
      if (!recordId) {
        setForm({ id: null, recordDate: '', checkedBy: '', namesChecked: '', comments: '', status: 'DRAFT', requirements: createInitialHygieneRequirements(template) })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }
      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadHygieneRecord(recordId)
        if (ignore) return
        setForm({
          id: record.id,
          recordDate: record.record_date ?? '',
          checkedBy: record.checked_by ?? '',
          namesChecked: record.names_checked ?? '',
          comments: record.comments ?? '',
          status: record.status,
          requirements: mergeSavedHygieneRequirements(template, record.requirements),
        })
      } catch (error) {
        if (!ignore) setLoadError(error instanceof Error ? error.message : 'Unable to load hygiene record.')
      } finally {
        if (!ignore) setLoadingRecord(false)
      }
    }
    loadRecord()
    return () => {
      ignore = true
    }
  }, [recordId, template])

  const updateRequirement = useCallback((requirementKey: string, patch: Partial<HygieneRequirementState>) => {
    setForm((current) => ({
      ...current,
      requirements: current.requirements.map((requirement) =>
        requirement.requirement_key === requirementKey ? { ...requirement, ...patch } : requirement
      ),
    }))
  }, [])

  const buildSaveInput = () => ({
    record_id: form.id,
    record_date: form.recordDate || null,
    checked_by: form.checkedBy || null,
    names_checked: form.namesChecked || null,
    comments: form.comments || null,
    requirements: form.requirements,
  })

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const savedId = form.id ? await saveHygieneRecordDraft(buildSaveInput()) : await createHygieneRecordDraft(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Hygiene record draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save hygiene record draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitRecord = async () => {
    if (isReadOnly) return
    const validationError = validateHygieneSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setSaving(true)
    try {
      const savedId = await submitHygieneRecord(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Hygiene record submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit hygiene record.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) return <Card className="border-border/70"><CardContent className="p-8 text-sm text-muted-foreground">Loading hygiene record...</CardContent></Card>
  if (loadError) return <Card className="border-border/70"><CardContent className="space-y-4 p-8"><p className="text-sm text-destructive">{loadError}</p><Button type="button" variant="outline" onClick={onBackToOverview}>Back to records</Button></CardContent></Card>

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBackToOverview} className="w-fit gap-2"><ArrowLeft className="h-4 w-4" />Back to records</Button>
        <FacilityRecordStatusBadge status={form.status} />
      </div>
      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70"><CardTitle className="text-lg">{template.title}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hygiene-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Date</Label>
            <DatePicker id="hygiene-date" value={form.recordDate} onChange={(value) => setForm((current) => ({ ...current, recordDate: value }))} placeholder="Select date" disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hygiene-checked-by" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{template.checkedByLabel}</Label>
            <SearchableSelect id="hygiene-checked-by" value={form.checkedBy} options={userOptions.map((user) => ({ value: user.id, label: user.label }))} onChange={(value) => setForm((current) => ({ ...current, checkedBy: value }))} placeholder="Select responsible person" disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hygiene-names" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{template.namesCheckedLabel}</Label>
            <Input id="hygiene-names" value={form.namesChecked} onChange={(event) => setForm((current) => ({ ...current, namesChecked: event.target.value }))} placeholder="Enter sampled names" disabled={isReadOnly || saving} />
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-5">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-foreground">{template.requirementsIntro}</div>
          {form.requirements.map((requirement) => (
            <div key={requirement.requirement_key} className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_140px_minmax(180px,0.75fr)]">
              <div className="text-sm font-medium text-foreground">{requirement.requirement_label}</div>
              <HygieneResultButtons value={requirement.result} disabled={isReadOnly || saving} onChange={(value) => updateRequirement(requirement.requirement_key, { result: value })} />
              <Input value={requirement.notes ?? ''} onChange={(event) => updateRequirement(requirement.requirement_key, { notes: event.target.value })} placeholder="Notes" disabled={isReadOnly || saving} />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70"><CardTitle className="text-lg">{template.commentsLabel}</CardTitle></CardHeader>
        <CardContent className="p-5">
          <textarea value={form.comments} onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))} placeholder="Add hygiene observations" disabled={isReadOnly || saving} className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" />
        </CardContent>
      </Card>
      <Card className="border-border/70"><CardContent className="flex flex-wrap gap-3 p-5"><Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>{saving ? 'Saving...' : 'Save Draft'}</Button><Button type="button" onClick={submitRecord} disabled={isReadOnly || saving}>{saving ? 'Submitting...' : 'Submit Record'}</Button></CardContent></Card>
    </div>
  )
}

function VisitorStatusBadge({ status }: { status: VisitorQuestionnaireOverviewRecord['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
        statusToneClasses[visitorStatusToneByStatus[status]]
      )}
    >
      {visitorStatusLabelByStatus[status]}
    </span>
  )
}

function VisitorQuestionnaireOverview({
  entries,
  loading,
  error,
  onStartQuestionnaire,
  onOpenQuestionnaire,
}: {
  entries: VisitorQuestionnaireOverviewRecord[]
  loading: boolean
  error: string | null
  onStartQuestionnaire: () => void
  onOpenQuestionnaire: (recordId: string) => void
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Visitor Questionnaire Records</CardTitle>
            <CardDescription>Review saved visitor declarations before starting a new questionnaire.</CardDescription>
          </div>
          <Button type="button" onClick={onStartQuestionnaire} className="sm:self-start">
            Start Questionnaire
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-white">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Visit date</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Visitor</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Company</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Authorized</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    Loading visitor questionnaires...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="mx-auto max-w-md space-y-2">
                      <p className="text-sm font-semibold text-foreground">No visitor questionnaires recorded yet.</p>
                      <p className="text-sm text-muted-foreground">
                        Start a questionnaire to save a draft or submit a completed visitor declaration.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-border/60 transition-colors hover:bg-slate-50',
                      index % 2 === 0 ? 'bg-white' : 'bg-slate-50'
                    )}
                  >
                    <td className="px-4 py-4 text-foreground">{formatOverviewDate(entry.visitDate)}</td>
                    <td className="px-4 py-4 text-foreground">{entry.visitorName}</td>
                    <td className="px-4 py-4 text-muted-foreground">{entry.company || 'Not captured'}</td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {entry.authorizedToProceed === null ? 'Pending' : entry.authorizedToProceed ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-4">
                      <VisitorStatusBadge status={entry.status} />
                    </td>
                    <td className="px-4 py-4">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenQuestionnaire(entry.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function AnswerButtons({
  value,
  disabled,
  onChange,
}: {
  value: VisitorQuestionnaireAnswer | null
  disabled: boolean
  onChange: (value: VisitorQuestionnaireAnswer) => void
}) {
  return (
    <div className="flex gap-2">
      {(['YES', 'NO'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            'flex h-9 w-14 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            value === option
              ? 'border-olive bg-olive text-white'
              : 'border-border bg-background text-muted-foreground hover:border-olive/40'
          )}
        >
          {option === 'YES' ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  )
}

function BooleanButtons({
  value,
  disabled,
  onChange,
}: {
  value: boolean | null
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex gap-2">
      {[
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-9 w-14 items-center justify-center rounded-md border text-xs font-semibold transition-colors',
            value === option.value
              ? 'border-olive bg-olive text-white'
              : 'border-border bg-background text-muted-foreground hover:border-olive/40'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function VisitorQuestionnaireRegister({
  section,
  recordId,
  userOptions,
  onBackToOverview,
  onSaved,
}: {
  section: InspectionSectionDefinition
  recordId: string | null
  userOptions: UserProfileOption[]
  onBackToOverview: () => void
  onSaved: (recordId: string) => Promise<void>
}) {
  const template = section.visitorQuestionnaireTemplate

  if (!template) return null

  const [form, setForm] = useState<VisitorQuestionnaireFormState>(() => ({
    id: recordId,
    visitDate: '',
    completedBy: '',
    visitorName: '',
    company: '',
    reasonForVisit: '',
    contactNumber: '',
    declaration: '',
    visitorSignature: '',
    employeeSignature: '',
    siteContactName: '',
    authorizedToProceed: null,
    status: 'DRAFT',
    questions: createInitialVisitorQuestions(template),
    inductionItems: createInitialVisitorInductionItems(template),
  }))
  const [loadingRecord, setLoadingRecord] = useState(Boolean(recordId))
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const isReadOnly = form.status === 'COMPLETED'

  useEffect(() => {
    let ignore = false

    const loadRecord = async () => {
      if (!recordId) {
        setForm({
          id: null,
          visitDate: '',
          completedBy: '',
          visitorName: '',
          company: '',
          reasonForVisit: '',
          contactNumber: '',
          declaration: '',
          visitorSignature: '',
          employeeSignature: '',
          siteContactName: '',
          authorizedToProceed: null,
          status: 'DRAFT',
          questions: createInitialVisitorQuestions(template),
          inductionItems: createInitialVisitorInductionItems(template),
        })
        setLoadingRecord(false)
        setLoadError(null)
        return
      }

      setLoadingRecord(true)
      setLoadError(null)
      try {
        const record = await loadVisitorQuestionnaireRecord(recordId)
        if (ignore) return

        setForm({
          id: record.id,
          visitDate: record.visit_date ?? '',
          completedBy: record.completed_by ?? '',
          visitorName: record.visitor_name ?? '',
          company: record.company ?? '',
          reasonForVisit: record.reason_for_visit ?? '',
          contactNumber: record.contact_number ?? '',
          declaration: record.declaration ?? '',
          visitorSignature: record.visitor_signature ?? '',
          employeeSignature: record.employee_signature ?? '',
          siteContactName: record.site_contact_name ?? '',
          authorizedToProceed: record.authorized_to_proceed,
          status: record.status,
          questions: mergeSavedVisitorQuestions(template, record.questions),
          inductionItems: mergeSavedVisitorInductionItems(template, record.induction_items),
        })
      } catch (error) {
        if (!ignore) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load visitor questionnaire.')
        }
      } finally {
        if (!ignore) {
          setLoadingRecord(false)
        }
      }
    }

    loadRecord()

    return () => {
      ignore = true
    }
  }, [recordId, template])

  const updateQuestion = useCallback((questionKey: string, patch: Partial<VisitorQuestionState>) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.question_key === questionKey ? { ...question, ...patch } : question
      ),
    }))
  }, [])

  const updateInductionItem = useCallback((itemKey: string, patch: Partial<VisitorInductionState>) => {
    setForm((current) => ({
      ...current,
      inductionItems: current.inductionItems.map((item) =>
        item.item_key === itemKey ? { ...item, ...patch } : item
      ),
    }))
  }, [])

  const buildSaveInput = () => ({
    questionnaire_id: form.id,
    visit_date: form.visitDate || null,
    completed_by: form.completedBy || null,
    visitor_name: form.visitorName || null,
    company: form.company || null,
    reason_for_visit: form.reasonForVisit || null,
    contact_number: form.contactNumber || null,
    declaration: form.declaration || null,
    visitor_signature: form.visitorSignature || null,
    employee_signature: form.employeeSignature || null,
    site_contact_name: form.siteContactName || null,
    authorized_to_proceed: form.authorizedToProceed,
    questions: form.questions,
    induction_items: form.inductionItems,
  })

  const saveDraft = async () => {
    if (isReadOnly) return
    setSaving(true)
    try {
      const input = buildSaveInput()
      const savedId = form.id
        ? await saveVisitorQuestionnaireDraft(input)
        : await createVisitorQuestionnaireDraft(input)

      setForm((current) => ({ ...current, id: savedId }))
      await onSaved(savedId)
      toast.success('Visitor questionnaire draft saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save visitor questionnaire draft.')
    } finally {
      setSaving(false)
    }
  }

  const submitQuestionnaire = async () => {
    if (isReadOnly) return
    const validationError = validateVisitorSubmission(form)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    try {
      const savedId = await submitVisitorQuestionnaire(buildSaveInput())
      setForm((current) => ({ ...current, id: savedId, status: 'COMPLETED' }))
      await onSaved(savedId)
      toast.success('Visitor questionnaire submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit visitor questionnaire.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingRecord) {
    return (
      <Card className="border-border/70">
        <CardContent className="p-8 text-sm text-muted-foreground">Loading visitor questionnaire...</CardContent>
      </Card>
    )
  }

  if (loadError) {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-8">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={onBackToOverview}>
            Back to records
          </Button>
        </CardContent>
      </Card>
    )
  }

  const groupedQuestions = [
    { label: template.healthQuestionHeaders[0] ?? 'Health history', rows: form.questions.filter((question) => question.section_key === 'health-history') },
    { label: template.recentConditionHeaders[0] ?? 'Recent conditions', rows: form.questions.filter((question) => question.section_key === 'recent-conditions') },
    { label: 'Travel and physical condition', rows: form.questions.filter((question) => question.section_key === 'travel-and-physical-condition') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToOverview}
          className="border-olive/20 bg-olive/10 text-olive hover:bg-olive/15 hover:text-olive-dark"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to records
        </Button>
        {isReadOnly ? (
          <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Read-only completed record
          </span>
        ) : null}
      </div>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">{template.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="visitor-date" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Date
            </Label>
            <DatePicker
              id="visitor-date"
              value={form.visitDate}
              onChange={(value) => setForm((current) => ({ ...current, visitDate: value }))}
              placeholder="Select date"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visitor-completed-by" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Responsible person
            </Label>
            <SearchableSelect
              id="visitor-completed-by"
              value={form.completedBy}
              options={userOptions.map((user) => ({ value: user.id, label: user.label }))}
              onChange={(value) => setForm((current) => ({ ...current, completedBy: value }))}
              placeholder="Select responsible person"
              disabled={isReadOnly || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visitor-name" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Visitor / Contractor / Name
            </Label>
            <Input id="visitor-name" value={form.visitorName} onChange={(event) => setForm((current) => ({ ...current, visitorName: event.target.value }))} disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visitor-company" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Company
            </Label>
            <Input id="visitor-company" value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visitor-reason" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Reason for visit
            </Label>
            <Input id="visitor-reason" value={form.reasonForVisit} onChange={(event) => setForm((current) => ({ ...current, reasonForVisit: event.target.value }))} disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="visitor-contact" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Contact Number
            </Label>
            <Input id="visitor-contact" value={form.contactNumber} onChange={(event) => setForm((current) => ({ ...current, contactNumber: event.target.value }))} disabled={isReadOnly || saving} />
          </div>
          <div className="space-y-2 md:col-span-2 xl:col-span-3">
            <Label htmlFor="visitor-declaration" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {template.declarationLabel}
            </Label>
            <textarea
              id="visitor-declaration"
              rows={4}
              value={form.declaration}
              onChange={(event) => setForm((current) => ({ ...current, declaration: event.target.value }))}
              disabled={isReadOnly || saving}
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Health Screening</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          {groupedQuestions.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </div>
              {group.rows.map((question) => (
                <div
                  key={question.question_key}
                  className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_130px_260px]"
                >
                  <div className="text-sm font-medium text-foreground">{question.question_text}</div>
                  <AnswerButtons
                    value={question.answer}
                    disabled={isReadOnly || saving}
                    onChange={(value) => updateQuestion(question.question_key, { answer: value })}
                  />
                  <Input
                    value={question.details ?? ''}
                    onChange={(event) => updateQuestion(question.question_key, { details: event.target.value || null })}
                    placeholder="Details"
                    disabled={isReadOnly || saving}
                    className="h-9"
                  />
                </div>
              ))}
            </div>
          ))}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {template.notice}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Induction Training</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {form.inductionItems.map((item) => (
            <div
              key={item.item_key}
              className="grid gap-3 rounded-xl border border-border/70 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_130px]"
            >
              <div className="text-sm font-medium text-foreground">{item.item_text}</div>
              <BooleanButtons
                value={item.acknowledged}
                disabled={isReadOnly || saving}
                onChange={(value) => updateInductionItem(item.item_key, { acknowledged: value })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardContent className="space-y-5 p-5">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-4 text-sm leading-6 text-foreground">
            {template.declarationText}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="visitor-signature" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Visitor Signature
              </Label>
              <Input id="visitor-signature" value={form.visitorSignature} onChange={(event) => setForm((current) => ({ ...current, visitorSignature: event.target.value }))} disabled={isReadOnly || saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee-signature" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Employee Signature
              </Label>
              <Input id="employee-signature" value={form.employeeSignature} onChange={(event) => setForm((current) => ({ ...current, employeeSignature: event.target.value }))} disabled={isReadOnly || saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-contact-name" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Site contact name
              </Label>
              <Input id="site-contact-name" value={form.siteContactName} onChange={(event) => setForm((current) => ({ ...current, siteContactName: event.target.value }))} disabled={isReadOnly || saving} />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_130px] lg:items-center">
            <p className="text-sm font-semibold text-foreground">{template.authorizationLabel}</p>
            <BooleanButtons
              value={form.authorizedToProceed}
              disabled={isReadOnly || saving}
              onChange={(value) => setForm((current) => ({ ...current, authorizedToProceed: value }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={saveDraft} disabled={isReadOnly || saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button type="button" onClick={submitQuestionnaire} disabled={isReadOnly || saving}>
              {saving ? 'Submitting...' : 'Submit Questionnaire'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="text-lg">Additional Observations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5">
          {template.additionalObservations.map((item) => (
            <div key={item} className="rounded-xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function SupportTile({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FileStack
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-muted/40 p-2 text-olive">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  )
}

function InspectionChecks() {
  const [searchParams, setSearchParams] = useSearchParams()
  const sectionKey = searchParams.get('section')
  const mode = searchParams.get('mode')
  const glassRecordId = searchParams.get('recordId')
  const chemicalRecordId = searchParams.get('recordId')
  const visitorRecordId = searchParams.get('recordId')
  const cleaningRecordId = searchParams.get('recordId')
  const ablutionRecordId = searchParams.get('recordId')
  const hygieneRecordId = searchParams.get('recordId')
  const { profiles } = useUserProfiles()
  const userOptions = useMemo(() => getProfileOptions(profiles), [profiles])
  const [glassEntries, setGlassEntries] = useState<GlassInspectionOverviewRecord[]>([])
  const [glassEntriesLoading, setGlassEntriesLoading] = useState(true)
  const [glassEntriesError, setGlassEntriesError] = useState<string | null>(null)
  const [chemicalEntries, setChemicalEntries] = useState<ChemicalVerificationOverviewRecord[]>([])
  const [chemicalEntriesLoading, setChemicalEntriesLoading] = useState(true)
  const [chemicalEntriesError, setChemicalEntriesError] = useState<string | null>(null)
  const [visitorEntries, setVisitorEntries] = useState<VisitorQuestionnaireOverviewRecord[]>([])
  const [visitorEntriesLoading, setVisitorEntriesLoading] = useState(true)
  const [visitorEntriesError, setVisitorEntriesError] = useState<string | null>(null)
  const [cleaningEntries, setCleaningEntries] = useState<CleaningVerificationOverviewRecord[]>([])
  const [cleaningEntriesLoading, setCleaningEntriesLoading] = useState(true)
  const [cleaningEntriesError, setCleaningEntriesError] = useState<string | null>(null)
  const [ablutionEntries, setAblutionEntries] = useState<AblutionOverviewRecord[]>([])
  const [ablutionEntriesLoading, setAblutionEntriesLoading] = useState(true)
  const [ablutionEntriesError, setAblutionEntriesError] = useState<string | null>(null)
  const [hygieneEntries, setHygieneEntries] = useState<HygieneOverviewRecord[]>([])
  const [hygieneEntriesLoading, setHygieneEntriesLoading] = useState(true)
  const [hygieneEntriesError, setHygieneEntriesError] = useState<string | null>(null)

  const selectedSection = useMemo(
    () => inspectionSections.find((section) => section.key === sectionKey) ?? inspectionSections[0]!,
    [sectionKey]
  )
  const isGlassInspection = selectedSection.key === 'glass-inspection'
  const isChemicalVerification = selectedSection.key === 'chemical-issue-dilution-verification'
  const isVisitorQuestionnaire = selectedSection.key === 'visitors-questionnaire'
  const isCleaningVerification = Boolean(selectedSection.cleaningVerificationTemplate)
  const isAblutionRecord = selectedSection.key === 'ablution-facility-record'
  const isHygieneRecord = selectedSection.key === 'hygiene-record'
  const glassMode = isGlassInspection && mode === 'register' ? 'register' : 'overview'
  const chemicalMode = isChemicalVerification && mode === 'record' ? 'record' : 'overview'
  const visitorMode = isVisitorQuestionnaire && mode === 'record' ? 'record' : 'overview'
  const cleaningMode = isCleaningVerification && mode === 'record' ? 'record' : 'overview'
  const ablutionMode = isAblutionRecord && mode === 'record' ? 'record' : 'overview'
  const hygieneMode = isHygieneRecord && mode === 'record' ? 'record' : 'overview'

  const groupedSections = useMemo(() => {
    const groups = new Map<string, InspectionSectionDefinition[]>()

    inspectionSections.forEach((section) => {
      const current = groups.get(section.group) ?? []
      current.push(section)
      groups.set(section.group, current)
    })

    return Array.from(groups.entries())
  }, [])

  const refreshGlassEntries = useCallback(async () => {
    setGlassEntriesLoading(true)
    setGlassEntriesError(null)
    try {
      const entries = await loadGlassInspectionOverview()
      setGlassEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load glass inspection records.'
      setGlassEntriesError(message)
    } finally {
      setGlassEntriesLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshGlassEntries()
  }, [refreshGlassEntries])

  const refreshChemicalEntries = useCallback(async () => {
    setChemicalEntriesLoading(true)
    setChemicalEntriesError(null)
    try {
      const entries = await loadChemicalVerificationOverview()
      setChemicalEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load chemical verification records.'
      setChemicalEntriesError(message)
    } finally {
      setChemicalEntriesLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshChemicalEntries()
  }, [refreshChemicalEntries])

  const refreshVisitorEntries = useCallback(async () => {
    setVisitorEntriesLoading(true)
    setVisitorEntriesError(null)
    try {
      const entries = await loadVisitorQuestionnaireOverview()
      setVisitorEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load visitor questionnaires.'
      setVisitorEntriesError(message)
    } finally {
      setVisitorEntriesLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshVisitorEntries()
  }, [refreshVisitorEntries])

  const refreshCleaningEntries = useCallback(async () => {
    if (!selectedSection.cleaningVerificationTemplate) {
      setCleaningEntries([])
      setCleaningEntriesLoading(false)
      setCleaningEntriesError(null)
      return
    }

    setCleaningEntriesLoading(true)
    setCleaningEntriesError(null)
    try {
      const entries = await loadCleaningVerificationOverview(getCleaningFrequency(selectedSection))
      setCleaningEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load cleaning verifications.'
      setCleaningEntriesError(message)
    } finally {
      setCleaningEntriesLoading(false)
    }
  }, [selectedSection])

  useEffect(() => {
    refreshCleaningEntries()
  }, [refreshCleaningEntries])

  const refreshAblutionEntries = useCallback(async () => {
    setAblutionEntriesLoading(true)
    setAblutionEntriesError(null)
    try {
      const entries = await loadAblutionRecordOverview()
      setAblutionEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load ablution facility records.'
      setAblutionEntriesError(message)
    } finally {
      setAblutionEntriesLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshAblutionEntries()
  }, [refreshAblutionEntries])

  const refreshHygieneEntries = useCallback(async () => {
    setHygieneEntriesLoading(true)
    setHygieneEntriesError(null)
    try {
      const entries = await loadHygieneRecordOverview()
      setHygieneEntries(entries)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load hygiene records.'
      setHygieneEntriesError(message)
    } finally {
      setHygieneEntriesLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshHygieneEntries()
  }, [refreshHygieneEntries])

  const handleSelectSection = (key: string) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', key)
    if (key === 'glass-inspection') {
      nextParams.set('mode', 'overview')
    } else if (key === 'chemical-issue-dilution-verification') {
      nextParams.set('mode', 'overview')
    } else if (key === 'visitors-questionnaire') {
      nextParams.set('mode', 'overview')
    } else if (key === 'ablution-facility-record') {
      nextParams.set('mode', 'overview')
    } else if (key === 'hygiene-record') {
      nextParams.set('mode', 'overview')
    } else if (inspectionSections.find((section) => section.key === key)?.cleaningVerificationTemplate) {
      nextParams.set('mode', 'overview')
    } else {
      nextParams.delete('mode')
    }
    nextParams.delete('recordId')
    setSearchParams(nextParams, { replace: true })
  }

  const handleGlassModeChange = (nextMode: 'overview' | 'register', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'glass-inspection')
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleGlassSaved = async (recordId: string) => {
    await refreshGlassEntries()
    handleGlassModeChange('register', recordId)
  }

  const handleChemicalModeChange = (nextMode: 'overview' | 'record', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'chemical-issue-dilution-verification')
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleChemicalSaved = async (recordId: string) => {
    await refreshChemicalEntries()
    handleChemicalModeChange('record', recordId)
  }

  const handleVisitorModeChange = (nextMode: 'overview' | 'record', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'visitors-questionnaire')
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleVisitorSaved = async (recordId: string) => {
    await refreshVisitorEntries()
    handleVisitorModeChange('record', recordId)
  }

  const handleCleaningModeChange = (nextMode: 'overview' | 'record', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', selectedSection.key)
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleCleaningSaved = async (recordId: string) => {
    await refreshCleaningEntries()
    handleCleaningModeChange('record', recordId)
  }

  const handleAblutionModeChange = (nextMode: 'overview' | 'record', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'ablution-facility-record')
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleAblutionSaved = async (recordId: string) => {
    await refreshAblutionEntries()
    handleAblutionModeChange('record', recordId)
  }

  const handleHygieneModeChange = (nextMode: 'overview' | 'record', recordId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('section', 'hygiene-record')
    nextParams.set('mode', nextMode)
    if (recordId) {
      nextParams.set('recordId', recordId)
    } else {
      nextParams.delete('recordId')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleHygieneSaved = async (recordId: string) => {
    await refreshHygieneEntries()
    handleHygieneModeChange('record', recordId)
  }

  return (
    <PageLayout title="Inspection" activeItem="checks">
      <div className="space-y-6">
        <SidebarProvider
          defaultOpen={true}
          className="items-start"
          style={
            {
              '--sidebar-width': '19rem',
              '--sidebar-width-mobile': '19rem',
            } as React.CSSProperties
          }
        >
          <InspectionSidebar
            groups={groupedSections}
            selectedKey={selectedSection.key}
            onSelect={handleSelectSection}
          />

          <SidebarInset className="space-y-6">
            <InspectionHeader section={selectedSection} />

            {selectedSection.glassTemplate ? (
              glassMode === 'register' ? (
                <GlassInspectionRegister
                  section={selectedSection}
                  recordId={glassRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleGlassModeChange('overview')}
                  onSaved={handleGlassSaved}
                />
              ) : (
                <GlassInspectionOverview
                  section={selectedSection}
                  entries={glassEntries}
                  loading={glassEntriesLoading}
                  error={glassEntriesError}
                  onStartInspection={() => handleGlassModeChange('register')}
                  onOpenInspection={(recordId) => handleGlassModeChange('register', recordId)}
                />
              )
            ) : selectedSection.jobCardTemplate ? (
              <JobCardTemplateView section={selectedSection} />
            ) : selectedSection.chemicalVerificationTemplate ? (
              chemicalMode === 'record' ? (
                <ChemicalVerificationRegister
                  section={selectedSection}
                  recordId={chemicalRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleChemicalModeChange('overview')}
                  onSaved={handleChemicalSaved}
                />
              ) : (
                <ChemicalVerificationOverview
                  section={selectedSection}
                  entries={chemicalEntries}
                  loading={chemicalEntriesLoading}
                  error={chemicalEntriesError}
                  onStartVerification={() => handleChemicalModeChange('record')}
                  onOpenVerification={(recordId) => handleChemicalModeChange('record', recordId)}
                />
              )
            ) : selectedSection.cleaningVerificationTemplate ? (
              cleaningMode === 'record' ? (
                <CleaningVerificationRegister
                  section={selectedSection}
                  recordId={cleaningRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleCleaningModeChange('overview')}
                  onSaved={handleCleaningSaved}
                />
              ) : (
                <CleaningVerificationOverview
                  section={selectedSection}
                  entries={cleaningEntries}
                  loading={cleaningEntriesLoading}
                  error={cleaningEntriesError}
                  onStartVerification={() => handleCleaningModeChange('record')}
                  onOpenVerification={(recordId) => handleCleaningModeChange('record', recordId)}
                />
              )
            ) : selectedSection.ablutionFacilityTemplate ? (
              ablutionMode === 'record' ? (
                <AblutionFacilityRegister
                  section={selectedSection}
                  recordId={ablutionRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleAblutionModeChange('overview')}
                  onSaved={handleAblutionSaved}
                />
              ) : (
                <AblutionFacilityOverview
                  entries={ablutionEntries}
                  loading={ablutionEntriesLoading}
                  error={ablutionEntriesError}
                  onStartRecord={() => handleAblutionModeChange('record')}
                  onOpenRecord={(recordId) => handleAblutionModeChange('record', recordId)}
                />
              )
            ) : selectedSection.hygieneRecordTemplate ? (
              hygieneMode === 'record' ? (
                <HygieneRecordRegister
                  section={selectedSection}
                  recordId={hygieneRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleHygieneModeChange('overview')}
                  onSaved={handleHygieneSaved}
                />
              ) : (
                <HygieneRecordOverview
                  entries={hygieneEntries}
                  loading={hygieneEntriesLoading}
                  error={hygieneEntriesError}
                  onStartRecord={() => handleHygieneModeChange('record')}
                  onOpenRecord={(recordId) => handleHygieneModeChange('record', recordId)}
                />
              )
            ) : selectedSection.visitorQuestionnaireTemplate ? (
              visitorMode === 'record' ? (
                <VisitorQuestionnaireRegister
                  section={selectedSection}
                  recordId={visitorRecordId}
                  userOptions={userOptions}
                  onBackToOverview={() => handleVisitorModeChange('overview')}
                  onSaved={handleVisitorSaved}
                />
              ) : (
                <VisitorQuestionnaireOverview
                  entries={visitorEntries}
                  loading={visitorEntriesLoading}
                  error={visitorEntriesError}
                  onStartQuestionnaire={() => handleVisitorModeChange('record')}
                  onOpenQuestionnaire={(recordId) => handleVisitorModeChange('record', recordId)}
                />
              )
            ) : (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <InspectionChecklistBlock section={selectedSection} />
                <div className="space-y-6">
                  <InspectionMetadataBlock section={selectedSection} />
                  <InspectionSupportPanel section={selectedSection} />
                </div>
              </div>
            )}
          </SidebarInset>
        </SidebarProvider>
      </div>
    </PageLayout>
  )
}

export default InspectionChecks
