import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Briefcase, CalendarRange, ChevronLeft, ChevronRight, Package, Plus, Sparkles, Trash2, X } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useSettingsTour, type TourStep } from '@/hooks/useSettingsTour'
import QualityEvaluationTable from '@/components/supplies/QualityEvaluationTable'
import { SUPPLY_QUALITY_SCORE_LEGEND } from '@/constants/supplyQuality'
import { Spinner } from '@/components/ui/spinner'
import { SupplyDocumentsStep, SupplyDocument } from '@/components/supplies/SupplyDocumentsStep'
import { VehicleInspectionsStep, VehicleInspection } from '@/components/supplies/VehicleInspectionsStep'
import { PackagingQualityStep, PackagingQuality } from '@/components/supplies/PackagingQualityStep'
import { SupplierSignOffStep, SupplierSignOff } from '@/components/supplies/SupplierSignOffStep'
import { buildStorageObjectPath, deleteStoredFile, uploadStoredFile } from '@/lib/fileStorage'
import SettingsTour from '@/components/tour/SettingsTour'

interface QualityEntry {
  score: number | string | null
  remarks: string
  results: string
}

interface QualityEntries {
  [code: string]: QualityEntry
}

interface SupplyBatch {
  batch_id?: number | null
  temp_key?: string
  lot_no?: string
  is_locked?: boolean
  product_id: string
  unit_id: string
  qty: string
  accepted_qty: string
  rejected_qty: string
  unit_price: string
  amount_paid: string
  production_date: string
  expiry_date: string
  coa_document_id?: number | null
  coa_document_name: string
  coa_storage_path?: string
  coa_expiry_date: string
  coa_file: File | null
}

interface FormData {
  category_code: 'PRODUCT' | 'SERVICE'
  doc_no: string
  warehouse_id: string
  supplier_id: string
  received_at: string
  received_by: string
  doc_status: string
  supply_batches: SupplyBatch[]
}

interface Supply {
  id: number
  category_code?: 'PRODUCT' | 'SERVICE'
  doc_no?: string
  supplier_id?: number
  warehouse_id?: number
  supplier_name?: string
  warehouse_name?: string
  received_at?: string
  created_at?: string
  doc_status?: string
  reference?: string
  [key: string]: unknown
}

interface SupplyBatchData {
  id: number
  supply_id: number
  current_qty?: number
  received_qty?: number
  accepted_qty?: number
  rejected_qty?: number
  unit_price?: number | null
  production_date?: string | null
  expiry_date?: string | null
  quality_status?: string
  [key: string]: unknown
}

interface Warehouse {
  id: number
  name: string
  [key: string]: unknown
}

interface Product {
  id: number
  name: string
  sku?: string
  product_type?: 'RAW' | 'WIP' | 'FINISHED' | 'OP' | null
  base_unit_id?: number | null
  [key: string]: unknown
}

interface Unit {
  id: number
  name: string
  symbol?: string
  [key: string]: unknown
}

interface UserProfile {
  id: number
  full_name?: string
  email?: string
  [key: string]: unknown
}

interface OperationalSupplyLine {
  temp_key?: string
  batch_id?: number | null
  product_id: string
  unit_id: string
  received_as_unit_id: string
  outer_unit_qty: string
  inner_units_per_outer: string
  qty: string
  unit_price: string
  amount_paid: string
  notes: string
}

interface QualityParameterWithId {
  id?: number | null
  code: string
  name: string
  specification: string
  defaultRemarks: string
}

interface SupplierTypeCategory {
  code: string
  category_code: 'PRODUCT' | 'SERVICE'
}

interface CategoryOption {
  code: 'PRODUCT' | 'SERVICE'
  name: string
  description: string
  icon: typeof Package
}

function toYesNoNa(value: unknown): 'YES' | 'NO' | 'NA' | '' {
  const normalised = String(value ?? '').toUpperCase()
  if (normalised === 'YES' || normalised === 'NO' || normalised === 'NA') {
    return normalised
  }
  return ''
}

function toStrengthIntegrity(value: unknown): 'GOOD' | 'BAD' | 'NA' | '' {
  const normalised = String(value ?? '').toUpperCase()
  if (normalised === 'GOOD' || normalised === 'BAD' || normalised === 'NA') {
    return normalised
  }
  return ''
}

function formatDateTime(value: string | Date | number | null | undefined): string {
  if (!value) {
    return 'Not set'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toLocalDateTimeInput(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const tzOffsetMinutes = date.getTimezoneOffset()
  const localMillis = date.getTime() - tzOffsetMinutes * 60 * 1000
  return new Date(localMillis).toISOString().slice(0, 16)
}

const STATUS_BADGES = {
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const STATUS_OPTIONS = ['ACCEPTED', 'REJECTED']

function toDate(value: string | Date | number | null | undefined): Date | null {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (match && match[1] && match[2] && match[3]) {
      const [, yearStr, monthStr, dayStr] = match
      const year = Number.parseInt(yearStr, 10)
      const month = Number.parseInt(monthStr, 10)
      const day = Number.parseInt(dayStr, 10)
      const localDate = new Date(year, month - 1, day)
      if (!Number.isNaN(localDate.getTime())) {
        localDate.setHours(0, 0, 0, 0)
        return localDate
      }
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, amount: number): Date {
  const newDate = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  return newDate
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isBetween(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false
  return date >= start && date <= end
}

function toLocalDateKey(date: Date): string {
  if (!(date instanceof Date)) {
    return ''
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toDateEndOfDay(value: string | Date | number | null | undefined): Date | null {
  const date = toDate(value)
  if (!date) {
    return null
  }
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function getMonthGrid(monthDate: Date): Date[] {
  const startMonth = startOfMonth(monthDate)
  const startDay = startMonth.getDay()
  const gridStart = new Date(startMonth)
  gridStart.setDate(gridStart.getDate() - startDay)

  const days = []
  for (let i = 0; i < 42; i += 1) {
    const current = new Date(gridStart)
    current.setDate(gridStart.getDate() + i)
    days.push(current)
  }
  return days
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const STEPS = [
  'Supply category',
  'Basic information',
  'Supply documents',
  'Vehicle inspections',
  'Packaging quality parameters',
  'Supply batches',
  'Quality evaluation',
  'Supplier sign-off',
]

const OPERATIONAL_STEPS = [
  'Supply category',
  'Receiving checklist',
  'Operational supply batches',
  'Packaging quality parameters',
  'Review',
]

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    code: 'PRODUCT',
    name: 'Product supply',
    description: 'Use the full receiving workflow for raw/material supplies.',
    icon: Package,
  },
  {
    code: 'SERVICE',
    name: 'Operational supply',
    description: 'Use the operational receiving flow for packaging, gas, pallets, wraps, and chemicals.',
    icon: Briefcase,
  },
]

function createInitialQualityEntries(parameters: QualityParameterWithId[] = []): QualityEntries {
  return parameters.reduce((accumulator: QualityEntries, parameter) => {
    accumulator[parameter.code] = {
      score: 3,
      remarks: '',
      results: '',
    }
    return accumulator
  }, {} as QualityEntries)
}

function createBatchTempKey(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function createEmptySupplyBatch(): SupplyBatch {
  return {
    batch_id: null,
    temp_key: createBatchTempKey(),
    lot_no: '',
    is_locked: false,
    product_id: '',
    unit_id: '',
    qty: '',
    accepted_qty: '0',
    rejected_qty: '0',
    unit_price: '',
    amount_paid: '',
    production_date: '',
    expiry_date: '',
    coa_document_id: null,
    coa_document_name: '',
    coa_storage_path: '',
    coa_expiry_date: '',
    coa_file: null,
  }
}

function getSupplyBatchQualityKey(batch: SupplyBatch, index: number): string {
  if (batch.batch_id != null && Number.isFinite(Number(batch.batch_id))) {
    return `batch:${Number(batch.batch_id)}`
  }
  const tempKey = batch.temp_key?.trim()
  return tempKey ? `temp:${tempKey}` : `temp:index_${index}`
}

function syncQualityEntriesWithParameters(
  parameters: QualityParameterWithId[],
  currentEntries: QualityEntries | undefined,
): QualityEntries {
  const entries = { ...(currentEntries ?? {}) }
  let changed = !currentEntries

  parameters.forEach((parameter) => {
    if (!entries[parameter.code]) {
      entries[parameter.code] = {
        score: 3,
        remarks: '',
        results: '',
      }
      changed = true
    }
  })

  Object.keys(entries).forEach((code) => {
    if (!parameters.some((parameter) => parameter.code === code)) {
      delete entries[code]
      changed = true
    }
  })

  return changed ? entries : (currentEntries as QualityEntries)
}

function parseNullableNumber(value: string): number | null {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizePackagingParameterCode(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolvePackagingParameterId(
  parameterMap: Map<string, number>,
  ...candidates: string[]
): number | undefined {
  for (const candidate of candidates) {
    const id = parameterMap.get(normalizePackagingParameterCode(candidate))
    if (id != null) {
      return id
    }
  }
  return undefined
}

function createEmptyOperationalSupplyLine(): OperationalSupplyLine {
  return {
    temp_key: createBatchTempKey(),
    batch_id: null,
    product_id: '',
    unit_id: '',
    received_as_unit_id: '',
    outer_unit_qty: '',
    inner_units_per_outer: '',
    qty: '',
    unit_price: '',
    amount_paid: '',
    notes: '',
  }
}

function normalizeUnitDescriptor(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

function isOuterPackagingUnit(unit: Unit | null | undefined): boolean {
  if (!unit) return false
  const name = normalizeUnitDescriptor(unit.name)
  const symbol = normalizeUnitDescriptor(unit.symbol)
  return name === 'BOX' || name === 'BALE' || symbol === 'BOX' || symbol === 'BALE'
}

function computeOperationalInnerQuantity(line: OperationalSupplyLine, units: Unit[]): number | null {
  const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
  if (isOuterPackagingUnit(receivedAsUnit)) {
    const outerQty = Number.parseFloat(line.outer_unit_qty)
    const innerPerOuter = Number.parseFloat(line.inner_units_per_outer)
    if (!Number.isFinite(outerQty) || outerQty <= 0 || !Number.isFinite(innerPerOuter) || innerPerOuter <= 0) {
      return null
    }
    return Math.round(outerQty * innerPerOuter * 100) / 100
  }

  const qty = Number.parseFloat(line.qty)
  return Number.isFinite(qty) && qty > 0 ? qty : null
}

function calculateAverageScore(entries: QualityEntries): number | null {
  const scores = Object.values(entries)
    .map((entry) => entry.score)
    .filter((score) => score !== null && score !== '' && score !== undefined && score !== 4 && score !== '4')
    .map((score) => Number(score))
    .filter((value) => Number.isFinite(value))

  if (scores.length === 0) {
    return null
  }

  const total = scores.reduce((sum, value) => sum + value, 0)
  return Math.round((total / scores.length) * 100) / 100
}

function createEmptyPackagingQuality(): PackagingQuality {
  return {
    inaccurateLabelling: '',
    visibleDamage: '',
    specifiedQuantity: '',
    odor: '',
    strengthIntegrity: '',
  }
}

function isPackagingQualityComplete(packaging: PackagingQuality): boolean {
  return (
    packaging.inaccurateLabelling !== '' &&
    packaging.visibleDamage !== '' &&
    packaging.specifiedQuantity !== '' &&
    packaging.odor !== '' &&
    packaging.strengthIntegrity !== ''
  )
}

function getOperationalLineKey(line: OperationalSupplyLine, index: number): string {
  if (line.batch_id != null && Number.isFinite(Number(line.batch_id))) {
    return `batch:${String(line.batch_id)}`
  }
  return `temp:${line.temp_key ?? index}`
}

function normalizePackagingQualityState(packaging: PackagingQuality): PackagingQuality {
  return {
    inaccurateLabelling: toYesNoNa(packaging.inaccurateLabelling),
    visibleDamage: toYesNoNa(packaging.visibleDamage),
    specifiedQuantity: packaging.specifiedQuantity ?? '',
    odor: toYesNoNa(packaging.odor),
    strengthIntegrity: toStrengthIntegrity(packaging.strengthIntegrity),
  }
}

function evaluateBatchQuality(entries: QualityEntries): { hasQualityIssues: boolean; checkStatus: 'PASS' | 'FAIL'; overallScore: number | null } {
  const hasLowScore = Object.values(entries).some((entry) => {
    const score = entry?.score
    if (score === null || score === '' || score === 4 || score === '4') {
      return false
    }
    const numericScore = Number(score)
    return Number.isFinite(numericScore) && numericScore < 3
  })
  const hasQualityIssues = hasLowScore

  return {
    hasQualityIssues,
    checkStatus: hasQualityIssues ? 'FAIL' : 'PASS',
    overallScore: calculateAverageScore(entries),
  }
}

function sanitiseRejectedQuantityInput(value: string | number | null | undefined): string {
  if (value === undefined || value === null) {
    return ''
  }

  const stringValue = String(value).trim()
  if (stringValue === '') {
    return ''
  }

  if (stringValue === '0' || stringValue.startsWith('0.')) {
    return stringValue
  }

  const normalised = stringValue.replace(/^0+(?=\d)/, '')
  return normalised === '' ? '0' : normalised
}

interface SuppliesProps {
  modalOnly?: boolean
  initialTab?: 'product' | 'operational'
}

function Supplies({ modalOnly = false, initialTab = 'product' }: SuppliesProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { supplyId: routeSupplyId } = useParams<{ supplyId?: string }>()
  const isDirectEditRoute = Boolean(routeSupplyId && location.pathname.endsWith('/edit'))
  const { user, accessContext } = useAuth()
  const { suppliers: supplierOptions, loading: suppliersLoading, error: suppliersError } = useSuppliers({
    pageSize: 500,
  })
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [supplyBatches, setSupplyBatches] = useState<SupplyBatchData[]>([])
  const [supplyQualityChecks, setSupplyQualityChecks] = useState<{ [key: string]: unknown }[]>([])
  const [supplyQualityItems, setSupplyQualityItems] = useState<{ [key: string]: unknown }[]>([])
  const [fetchedSupplyDocuments, setFetchedSupplyDocuments] = useState<{ [key: string]: unknown }[]>([])
  const [vehicleInspections, setVehicleInspections] = useState<{ [key: string]: unknown }[]>([])
  const [packagingChecks, setPackagingChecks] = useState<{ [key: string]: unknown }[]>([])
  const [packagingItems, setPackagingItems] = useState<{ [key: string]: unknown }[]>([])
  const [supplierSignOffs, setSupplierSignOffs] = useState<{ [key: string]: unknown }[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([])
  const [qualityParameters, setQualityParameters] = useState<QualityParameterWithId[]>([])
  const [supplierTypeCategories, setSupplierTypeCategories] = useState<SupplierTypeCategory[]>([])
  const [qualityEntriesByBatchKey, setQualityEntriesByBatchKey] = useState<Record<string, QualityEntries>>({})
  const [supplyDocuments, setSupplyDocuments] = useState<SupplyDocument>(() => ({
    invoiceNumber: '',
    driverLicenseName: '',
    batchNumber: '',
    invoiceFile: null,
  }))
  const [vehicleInspection, setVehicleInspection] = useState<VehicleInspection>(() => ({
    vehicleClean: '',
    noForeignObjects: '',
    noPestInfestation: '',
    remarks: '',
  }))
  const [packagingQuality, setPackagingQuality] = useState<PackagingQuality>(() => ({
    inaccurateLabelling: '',
    visibleDamage: '',
    specifiedQuantity: '',
    odor: '',
    strengthIntegrity: '',
  }))
  const [operationalPackagingQualityByLineKey, setOperationalPackagingQualityByLineKey] = useState<
    Record<string, PackagingQuality>
  >({})
  const [supplierSignOff, setSupplierSignOff] = useState<SupplierSignOff>(() => ({
    signatureType: '',
    signatureData: null,
    documentFile: null,
    signedByName: '',
    remarks: '',
  }))
  const [categorySuppliersLoading, setCategorySuppliersLoading] = useState(false)
  const [categorySuppliers, setCategorySuppliers] = useState<Array<{ id: number | string; name?: unknown; supplier_type?: unknown }>>([])
  const [editingSupplyId, setEditingSupplyId] = useState<number | null>(null)
  const [editLoadDone, setEditLoadDone] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  type SupplyTabId = 'product' | 'operational'
  const [activeSupplyTab, setActiveSupplyTab] = useState<SupplyTabId>(initialTab)
  const [receivedFrom, setReceivedFrom] = useState('')
  const [receivedTo, setReceivedTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingSupplyId, setDeletingSupplyId] = useState<number | null>(null)
  const pageSize = 20
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [displayedMonth, setDisplayedMonth] = useState(() => startOfMonth(new Date()))
  const datePickerRef = useRef<HTMLDivElement | null>(null)
  const today = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [])
  const monthGrid = useMemo(() => getMonthGrid(displayedMonth), [displayedMonth])
  const [profileId, setProfileId] = useState<number | null>(null)
  const [userProfileName, setUserProfileName] = useState<string>('')
  const currentUserName = useMemo(() => {
    if (userProfileName) {
      return userProfileName
    }
    return user?.user_metadata?.full_name || user?.email || ''
  }, [userProfileName, user])

  useEffect(() => {
    if (editingSupplyId != null) {
      return
    }
    if (
      packagingQuality.inaccurateLabelling === 'NO' &&
      packagingQuality.visibleDamage === 'NO' &&
      packagingQuality.odor === 'NO' &&
      packagingQuality.specifiedQuantity === ''
    ) {
      setPackagingQuality((previous) => ({
        ...previous,
        specifiedQuantity: '0',
      }))
    }
  }, [
    editingSupplyId,
    packagingQuality.inaccurateLabelling,
    packagingQuality.visibleDamage,
    packagingQuality.odor,
    packagingQuality.specifiedQuantity,
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [operationalDeliveryReference, setOperationalDeliveryReference] = useState('')
  const [operationalCondition, setOperationalCondition] = useState<'PASS' | 'HOLD' | 'REJECT' | ''>('')
  const [operationalRemarks, setOperationalRemarks] = useState('')
  const [operationalSupplyLines, setOperationalSupplyLines] = useState<OperationalSupplyLine[]>([
    createEmptyOperationalSupplyLine(),
  ])
  const [operationalMappedProducts, setOperationalMappedProducts] = useState<Product[]>([])
  const [tourFlow, setTourFlow] = useState<'PRODUCT' | 'OPERATIONAL' | null>(null)
  const isEditingSupply = editingSupplyId != null

  useEffect(() => {
    setActiveSupplyTab(initialTab)
  }, [initialTab])

  const computeNextDocNumber = useCallback(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const datePart = `${year}${month}${day}`

    let maxSequence = 0
    supplies.forEach((supply) => {
      const docNumber = String(supply?.doc_no ?? '')
      const match = /^SUP-\d{8}-(\d+)$/.exec(docNumber)
      if (match && match[1]) {
        const sequence = Number.parseInt(match[1], 10)
        if (!Number.isNaN(sequence) && sequence > maxSequence) {
          maxSequence = sequence
        }
      }
    })

    const nextSequence = maxSequence + 1
    return `SUP-${datePart}-${String(nextSequence).padStart(3, '0')}`
  }, [supplies])

  const getInitialFormData = useCallback(
    (): FormData => ({
      category_code: 'PRODUCT',
      doc_no: computeNextDocNumber(),
      warehouse_id: '',
      supplier_id: '',
      received_at: toLocalDateTimeInput(),
      received_by: currentUserName,
      doc_status: STATUS_OPTIONS[0]!,
      supply_batches: [createEmptySupplyBatch()],
    }),
    [computeNextDocNumber, currentUserName],
  )

  const [formData, setFormData] = useState<FormData>(() => getInitialFormData())
  const isOperationalFlow = formData.category_code === 'SERVICE'
  const canDeleteSupply = useMemo(
    () =>
      Boolean(
        accessContext?.is_super_admin ||
          accessContext?.roles?.some((role) => role.name === 'Super Admin') ||
          accessContext?.legacy_role === 'Super Admin'
      ),
    [accessContext]
  )
  const operationalMappedProductOptions = useMemo(
    () =>
      operationalMappedProducts.map((product) => ({
        value: String(product.id),
        label: `${String(product.name)}${product.sku ? ` (${String(product.sku)})` : ''}`,
      })),
    [operationalMappedProducts]
  )
  const operationalMappedProductIdSet = useMemo(
    () => new Set(operationalMappedProducts.map((product) => String(product.id))),
    [operationalMappedProducts]
  )

  useEffect(() => {
    if (!isOperationalFlow) {
      setOperationalPackagingQualityByLineKey({})
      return
    }

    setOperationalPackagingQualityByLineKey((previous) => {
      const next: Record<string, PackagingQuality> = {}
      let changed = false

      operationalSupplyLines.forEach((line, index) => {
        const lineKey = getOperationalLineKey(line, index)
        const existing = previous[lineKey]
        const normalized = normalizePackagingQualityState(existing ?? createEmptyPackagingQuality())
        next[lineKey] = normalized
        if (!existing || existing !== normalized) {
          changed = true
        }
      })

      Object.keys(previous).forEach((lineKey) => {
        if (!(lineKey in next)) {
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [isOperationalFlow, operationalSupplyLines])

  const supplierList = useMemo(() => (Array.isArray(supplierOptions) ? supplierOptions : []), [supplierOptions])

  const supplierTypeCategoryMap = useMemo(() => {
    const map = new Map<string, 'PRODUCT' | 'SERVICE'>()
    supplierTypeCategories.forEach((entry) => {
      if (entry?.code && entry?.category_code) {
        map.set(String(entry.code).trim().toUpperCase(), entry.category_code)
      }
    })
    if (!map.has('GS')) map.set('GS', 'PRODUCT')
    if (!map.has('NS')) map.set('NS', 'PRODUCT')
    if (!map.has('SS')) map.set('SS', 'PRODUCT')
    if (!map.has('OS')) map.set('OS', 'SERVICE')
    return map
  }, [supplierTypeCategories])

  const allowedSupplierTypeCodes = useMemo(
    () => {
      if (formData.category_code === 'SERVICE') {
        return ['OS']
      }

      const codes = Array.from(supplierTypeCategoryMap.entries())
        .filter(([, categoryCode]) => categoryCode === formData.category_code)
        .map(([code]) => code)
        .filter(Boolean)

      return codes
    },
    [supplierTypeCategoryMap, formData.category_code],
  )

  useEffect(() => {
    let cancelled = false

    const loadCategorySuppliers = async () => {
      if (allowedSupplierTypeCodes.length === 0) {
        setCategorySuppliers([])
        return
      }

      setCategorySuppliersLoading(true)
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, supplier_type')
        .in('supplier_type', allowedSupplierTypeCodes)
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('Unable to load suppliers for selected category', error)
        setCategorySuppliers([])
      } else {
        setCategorySuppliers((data ?? []) as Array<{ id: number | string; name?: unknown; supplier_type?: unknown }>)
      }
      setCategorySuppliersLoading(false)
    }

    void loadCategorySuppliers()

    return () => {
      cancelled = true
    }
  }, [allowedSupplierTypeCodes])

  const filteredSupplierList = useMemo(() => {
    return categorySuppliers.filter((supplier) => {
      const supplierType = String(supplier?.supplier_type ?? '').trim().toUpperCase()
      if (formData.category_code === 'SERVICE') {
        return supplierType === 'OS'
      }
      return supplierTypeCategoryMap.get(supplierType) === formData.category_code
    })
  }, [categorySuppliers, supplierTypeCategoryMap, formData.category_code])

  const supplierSelectOptions = useMemo(() => {
    return filteredSupplierList.map((supplier) => ({
      value: String(supplier.id),
      label: String(supplier.name ?? ''),
    }))
  }, [filteredSupplierList])

  const supplierLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    const mergedSupplierList = [...supplierList, ...categorySuppliers]
    mergedSupplierList.forEach((supplier) => {
      const supplierId = typeof supplier?.id === 'number' ? supplier.id : Number(supplier?.id)
      if (supplierId !== undefined && !Number.isNaN(supplierId) && supplierId !== null) {
        map.set(supplierId, String(supplier.name ?? ''))
      }
    })
    return map
  }, [supplierList, categorySuppliers])

  const getUnitPriceSuffix = useCallback((unitId: string): string => {
    if (!unitId) return ''
    const unit = units.find((entry) => String(entry.id) === unitId)
    if (!unit) return ''
    const suffixSource = String(unit.symbol || unit.name || '').trim()
    if (!suffixSource) return ''
    return `/${suffixSource.toLowerCase()}`
  }, [units])

  const rawProducts = useMemo(() => products.filter((product) => product.product_type === 'RAW'), [products])
  const operationalProductMap = useMemo(
    () => new Map(operationalMappedProducts.map((product) => [String(product.id), product])),
    [operationalMappedProducts],
  )

  useEffect(() => {
    operationalSupplyLines.forEach((line, index) => {
      if (!line.product_id) return

      const product = operationalProductMap.get(line.product_id)
      const baseUnitId = product?.base_unit_id ?? null
      const baseUnit = baseUnitId != null ? units.find((entry) => entry.id === baseUnitId) ?? null : null

      console.debug('[Operational supply stock unit lookup]', {
        lineIndex: index,
        productId: line.product_id,
        productName: product?.name ?? null,
        baseUnitId,
        baseUnit,
      })
    })
  }, [operationalProductMap, operationalSupplyLines, units])
  const rawProductOptions = useMemo(
    () =>
      rawProducts.map((product) => ({
        value: String(product.id),
        label: `${String(product.name)}${product.sku ? ` (${String(product.sku)})` : ''}`,
      })),
    [rawProducts]
  )

  const qualityParameterIdMap = useMemo(() => {
    const map = new Map<string, number | null>()
    qualityParameters.forEach((parameter) => {
      if (parameter?.code) {
        map.set(parameter.code, parameter.id ?? null)
      }
    })
    return map
  }, [qualityParameters])

  const warehouseLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    warehouses.forEach((warehouse) => {
      if (warehouse?.id !== undefined && warehouse?.id !== null) {
        map.set(warehouse.id, String(warehouse.name ?? ''))
      }
    })
    return map
  }, [warehouses])

  const displaySupplies = useMemo(() =>
    supplies.map((supply) => ({
      ...supply,
      supplier_name: String(supply.supplier_name ?? supplierLabelMap.get(supply.supplier_id as number) ?? ''),
      warehouse_name: String(supply.warehouse_name ?? warehouseLabelMap.get(supply.warehouse_id as number) ?? ''),
    })),
  [supplies, supplierLabelMap, warehouseLabelMap])

  const tabSupplies = useMemo(() => {
    return displaySupplies.filter((supply) => {
      const category = String(supply.category_code ?? 'PRODUCT').toUpperCase()
      if (activeSupplyTab === 'operational') {
        return category === 'SERVICE'
      }
      return category !== 'SERVICE'
    })
  }, [displaySupplies, activeSupplyTab])

  const filteredSupplies = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    const fromDate = toDate(receivedFrom)
    const toDateValue = toDateEndOfDay(receivedTo)

    return tabSupplies.filter((supply) => {
      const supplierNameLower = (supply.supplier_name ?? '').toLowerCase()
      const warehouseNameLower = (supply.warehouse_name ?? '').toLowerCase()
      const docNoLower = (supply.doc_no ?? '').toLowerCase()

      const matchesSearch =
        normalised.length === 0 ||
        docNoLower.includes(normalised) ||
        warehouseNameLower.includes(normalised) ||
        supplierNameLower.includes(normalised)

      const receivedAt = toDate(supply.received_at)
      const matchesFrom = !fromDate || (receivedAt && receivedAt >= fromDate)
      const matchesTo = !toDateValue || (receivedAt && receivedAt <= toDateValue)

      return matchesSearch && matchesFrom && matchesTo
    })
  }, [searchTerm, receivedFrom, receivedTo, tabSupplies])

  const totalPages = Math.max(1, Math.ceil(filteredSupplies.length / pageSize))
  const paginatedSupplies = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredSupplies.slice(startIndex, startIndex + pageSize)
  }, [filteredSupplies, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, receivedFrom, receivedTo, activeSupplyTab])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const qualityAverageScore = useMemo(() => {
    const scores = formData.supply_batches
      .map((batch, index) => {
        const key = getSupplyBatchQualityKey(batch, index)
        return calculateAverageScore(qualityEntriesByBatchKey[key] ?? createInitialQualityEntries(qualityParameters))
      })
      .filter((score): score is number => score != null && Number.isFinite(score))

    if (scores.length === 0) {
      return null
    }
    const total = scores.reduce((sum, score) => sum + score, 0)
    return Math.round((total / scores.length) * 100) / 100
  }, [formData.supply_batches, qualityEntriesByBatchKey, qualityParameters])

  const totalAcceptedKg = useMemo(
    () =>
      filteredSupplies.reduce((total, supply) => {
        const batches = supplyBatches.filter((batch) => batch.supply_id === supply.id)
        const accepted = batches.reduce(
          (accumulator, batch) => accumulator + (Number(batch.accepted_qty) || 0),
          0,
        )
        return total + accepted
      }, 0),
    [filteredSupplies, supplyBatches],
  )

  const pendingQualityKg = useMemo(
    () =>
      filteredSupplies.reduce((total, supply) => {
        const batches = supplyBatches.filter((batch) => batch.supply_id === supply.id)
        const pending = batches.reduce((accumulator, batch) => {
          const status = (batch.quality_status ?? '').toUpperCase()
          if (status === 'PENDING') {
            return accumulator + (Number(batch.current_qty) || Number(batch.received_qty) || 0)
          }
          return accumulator
        }, 0)
        return total + pending
      }, 0),
    [filteredSupplies, supplyBatches],
  )

  const handleDeleteSupply = useCallback(
    async (supply: Supply) => {
      if (!canDeleteSupply) {
        toast.error('You do not have permission to delete supplies.')
        return
      }

      const supplyLabel = String(supply.doc_no ?? `#${supply.id}`)
      const confirmed = window.confirm(`Delete supply ${supplyLabel}? This cannot be undone.`)
      if (!confirmed) {
        return
      }

      setDeletingSupplyId(supply.id)
      const { error } = await supabase.rpc('force_delete_supply', {
        p_supply_id: supply.id,
      })

      if (error) {
        const message =
          error.code === '42501'
            ? 'Only Super Admin can force delete supplies.'
            : error.code === '23503'
              ? 'This supply still has protected downstream links and could not be removed.'
            : error.message ?? 'Unable to delete supply.'
        toast.error(message)
        setDeletingSupplyId(null)
        return
      }

      setSupplies((previous) => previous.filter((item) => item.id !== supply.id))
      setDeletingSupplyId(null)
      toast.success('Supply deleted successfully.')
    },
    [canDeleteSupply]
  )

  const columns = [
    {
      key: 'document',
      header: 'Document',
      render: (supply: Supply) => (
        <div>
          <div className="font-medium text-text-dark">{String(supply.doc_no ?? '')}</div>
          <div className="text-xs text-text-dark/60">Created {formatDateTime(supply.created_at)}</div>
        </div>
      ),
      mobileRender: (supply: Supply) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{String(supply.doc_no ?? '')}</div>
          <div className="text-xs text-text-dark/60">{formatDateTime(supply.created_at)}</div>
        </div>
      ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      accessor: 'warehouse_name',
      cellClassName: 'text-text-dark/70',
      mobileValueClassName: 'text-text-dark',
    },
    {
      key: 'received',
      header: 'Received At',
      render: (supply: Supply) => formatDateTime(supply.received_at),
      mobileRender: (supply: Supply) => formatDateTime(supply.received_at),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'status',
      header: 'Status',
      render: (supply: Supply) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            STATUS_BADGES[supply.doc_status as keyof typeof STATUS_BADGES] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {supply.doc_status}
        </span>
      ),
      mobileRender: (supply: Supply) => String(supply.doc_status ?? ''),
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (supply: Supply) => (
        <div>
          <div className="font-medium text-text-dark">{String(supply.supplier_name || 'Not specified')}</div>
          <div className="text-xs text-text-dark/60">{String(supply.reference || 'No reference')}</div>
        </div>
      ),
      mobileRender: (supply: Supply) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{supply.supplier_name || 'Not specified'}</div>
          <div className="text-xs text-text-dark/60">{supply.reference || 'No reference'}</div>
        </div>
      ),
    },
    ...(canDeleteSupply
      ? [
          {
            key: 'actions',
            header: 'Actions',
            headerClassName: 'text-right',
            cellClassName: 'text-right',
            mobileValueClassName: 'text-right',
            render: (supply: Supply) => (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  disabled={deletingSupplyId === supply.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleDeleteSupply(supply)
                  }}
                  aria-label={`Delete supply ${String(supply.doc_no ?? supply.id)}`}
                  title="Delete supply"
                >
                  <Trash2 className={`h-4 w-4 ${deletingSupplyId === supply.id ? 'animate-pulse' : ''}`} />
                </Button>
              </div>
            ),
            mobileRender: (supply: Supply) => (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  disabled={deletingSupplyId === supply.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleDeleteSupply(supply)
                  }}
                >
                  <Trash2 className={`mr-2 h-4 w-4 ${deletingSupplyId === supply.id ? 'animate-pulse' : ''}`} />
                  Delete
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]


  useEffect(() => {
    if (!isDatePickerOpen) {
      return
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && event.target instanceof Node && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDatePickerOpen])

  const handleToggleDatePicker = () => {
    setDraftFrom(receivedFrom)
    setDraftTo(receivedTo)
    const baseDate =
      toDate(receivedFrom) ||
      toDate(receivedTo) ||
      today
    setDisplayedMonth(startOfMonth(baseDate))
    setIsDatePickerOpen((prev) => !prev)
  }

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      received_by: currentUserName,
    }))
  }, [currentUserName])

  useEffect(() => {
    if (currentStep !== 5) {
      return
    }

    setFormData((previous) => {
      let changed = false
      const nextBatches = previous.supply_batches.map((batch) => {
        if (batch.is_locked) {
          return batch
        }
        const quantity = Number.parseFloat(batch.qty)
        const rejected = Number.parseFloat(batch.rejected_qty)

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return batch
        }
        const normalizedRejected = Number.isFinite(rejected) ? Math.min(Math.max(rejected, 0), quantity) : 0
        const normalizedAccepted = Math.max(quantity - normalizedRejected, 0)
        const nextRejected = normalizedRejected === 0 ? '0' : normalizedRejected.toString()
        const nextAccepted = normalizedAccepted === 0 ? '0' : normalizedAccepted.toString()

        if (batch.rejected_qty !== nextRejected || batch.accepted_qty !== nextAccepted) {
          changed = true
          return {
            ...batch,
            rejected_qty: nextRejected,
            accepted_qty: nextAccepted,
          }
        }

        return batch
      })

      return changed ? { ...previous, supply_batches: nextBatches } : previous
    })
  }, [currentStep])

  const handleApplyDateRange = () => {
    setReceivedFrom(draftFrom)
    setReceivedTo(draftTo || draftFrom)
    setIsDatePickerOpen(false)
  }

  const handleClearDateRange = () => {
    setDraftFrom('')
    setDraftTo('')
    setReceivedFrom('')
    setReceivedTo('')
    setIsDatePickerOpen(false)
  }

  const formatDisplayDate = (value: string | Date | null | undefined): string => {
    if (!value) return ''
    const date = toDate(value)
    if (!date) return ''
    return new Intl.DateTimeFormat('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  const dateRangeLabel = useMemo(() => {
    if (!receivedFrom && !receivedTo) {
      return 'Select date range'
    }
    const fromLabel = formatDisplayDate(receivedFrom)
    const toLabel = formatDisplayDate(receivedTo)
    if (fromLabel && toLabel) {
      return `${fromLabel} – ${toLabel}`
    }
    return fromLabel || toLabel || 'Select date range'
  }, [receivedFrom, receivedTo])

  const draftFromDate = useMemo(() => toDate(draftFrom), [draftFrom])
  const draftToDate = useMemo(() => toDate(draftTo), [draftTo])

  const canGoNextMonth =
    displayedMonth.getFullYear() < today.getFullYear() ||
    (displayedMonth.getFullYear() === today.getFullYear() &&
      displayedMonth.getMonth() < today.getMonth())

  const handlePrevMonth = () => {
    setDisplayedMonth((prev) => addMonths(prev, -1))
  }

  const handleNextMonth = () => {
    if (canGoNextMonth) {
      setDisplayedMonth((prev) => addMonths(prev, 1))
    }
  }

  const handleDaySelect = (day: Date) => {
    if (day > today) {
      return
    }

    const dayKey = toLocalDateKey(day)

    if (!draftFromDate || (draftFromDate && draftToDate)) {
      setDraftFrom(dayKey)
      setDraftTo('')
      return
    }

    if (day < draftFromDate) {
      setDraftFrom(dayKey)
      setDraftTo('')
      return
    }

    setDraftTo(dayKey)
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  useEffect(() => {
    if (!formData.supplier_id) {
      return
    }
    const supplierStillAvailable = filteredSupplierList.some(
      (supplier) => String(supplier.id) === formData.supplier_id,
    )
    if (!supplierStillAvailable) {
      setFormData((previous) => ({
        ...previous,
        supplier_id: '',
      }))
    }
  }, [formData.supplier_id, filteredSupplierList])

  const getBatchProductOptions = useCallback(
    (currentProductId: string, batchIndex: number) => {
      const selectedByOtherBatches = new Set(
        formData.supply_batches
          .filter((_, idx) => idx !== batchIndex)
          .map((batch) => batch.product_id)
          .filter(Boolean),
      )
      const availableRawOptions = rawProductOptions.filter(
        (option) => option.value === currentProductId || !selectedByOtherBatches.has(option.value),
      )

      if (!currentProductId) {
        return availableRawOptions
      }

      const existsInRawOptions = availableRawOptions.some((option) => option.value === currentProductId)
      if (existsInRawOptions) {
        return availableRawOptions
      }

      const fallbackProduct = products.find((product) => String(product.id) === currentProductId)
      if (!fallbackProduct) {
        return availableRawOptions
      }

      return [
        {
          value: String(fallbackProduct.id),
          label: `${String(fallbackProduct.name)}${fallbackProduct.sku ? ` (${String(fallbackProduct.sku)})` : ''}`,
        },
        ...availableRawOptions,
      ]
    },
    [products, rawProductOptions, formData.supply_batches]
  )

  const handleSupplyBatchChange = (index: number, field: keyof SupplyBatch, value: string | File | null) => {
    const next = [...formData.supply_batches]
    if (!next[index] || next[index]!.is_locked) {
      return
    }
    if (
      field === 'product_id' &&
      typeof value === 'string' &&
      value &&
      next.some((batch, idx) => idx !== index && batch.product_id === value)
    ) {
      toast.error('This raw material is already selected in another batch.')
      return
    }
    const batchAt = next[index]
    if (batchAt) {
      if (field === 'coa_file') {
        ;(batchAt as unknown as Record<string, File | null>)[field] = value instanceof File ? value : null
      } else {
        const incomingValue =
          field === 'rejected_qty' && typeof value === 'string' ? sanitiseRejectedQuantityInput(value) : value
        ;(batchAt as unknown as Record<string, string | File | null>)[field] = incomingValue
      }
    }

    const currentBatch = next[index]
    if (!currentBatch) return

    if ((field === 'rejected_qty' || field === 'qty') && typeof value === 'string') {
      const quantityNumber = Number.parseFloat(currentBatch.qty)
      const rejectedNumber = Number.parseFloat(currentBatch.rejected_qty)
      const hasQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0
      const hasRejected = Number.isFinite(rejectedNumber) && rejectedNumber >= 0

      if (hasQuantity && hasRejected && rejectedNumber > quantityNumber) {
        toast.error('Rejected quantity cannot exceed received quantity.')
        currentBatch.rejected_qty = quantityNumber.toString()
        currentBatch.accepted_qty = '0'
      } else if (hasQuantity && hasRejected) {
        const accepted = Math.max(quantityNumber - rejectedNumber, 0)
        currentBatch.accepted_qty = accepted === 0 ? '0' : accepted.toString()
      } else if (hasQuantity) {
        currentBatch.rejected_qty = '0'
        currentBatch.accepted_qty = quantityNumber.toString()
      } else {
        currentBatch.rejected_qty = ''
        currentBatch.accepted_qty = ''
      }
    } else if (field === 'coa_file') {
      if (value instanceof File) {
        currentBatch.coa_document_name = value.name
      } else if (!currentBatch.coa_document_id) {
        currentBatch.coa_document_name = ''
      }
    }

    setFormData((prev) => ({
      ...prev,
      supply_batches: next,
    }))
  }

  const addSupplyBatch = () => {
    setFormData((prev) => ({
      ...prev,
      supply_batches: [...prev.supply_batches, createEmptySupplyBatch()],
    }))
  }

  const removeSupplyBatch = (index: number) => {
    const targetBatch = formData.supply_batches[index]
    if (targetBatch?.is_locked) {
      toast.error('This lot has already started processing and cannot be edited.')
      return
    }
    setFormData((prev) => ({
      ...prev,
      supply_batches: prev.supply_batches.filter((_, i) => i !== index),
    }))
  }

  const generateLotNumberPreview = (index: number): string => {
    const currentBatch = formData.supply_batches[index]
    if (currentBatch?.lot_no?.trim()) {
      return currentBatch.lot_no.trim()
    }
    const currentYear = new Date().getFullYear()
    const nextBatchNumber = supplyBatches.length + 1
    return `LOT-${currentYear}-${String(nextBatchNumber + index).padStart(3, '0')}`
  }

  const handleQualityEntryChange = (batchKey: string, code: string, entry: QualityEntry) => {
    setQualityEntriesByBatchKey((previous) => ({
      ...previous,
      [batchKey]: {
        ...(previous[batchKey] ?? createInitialQualityEntries(qualityParameters)),
        [code]: {
          score: entry.score,
          remarks: entry.remarks,
          results: entry.results,
        },
      },
    }))
  }

  const addOperationalSupplyLine = () => {
    setOperationalSupplyLines((previous) => [...previous, createEmptyOperationalSupplyLine()])
  }

  const removeOperationalSupplyLine = (index: number) => {
    setOperationalSupplyLines((previous) => {
      if (previous.length <= 1) return previous
      return previous.filter((_, i) => i !== index)
    })
  }

  const updateOperationalSupplyLine = (
    index: number,
    field: keyof OperationalSupplyLine,
    value: string
  ) => {
    setOperationalSupplyLines((previous) =>
      previous.map((line, i) => {
        if (i !== index) {
          return line
        }

        const nextLine = { ...line, [field]: value }

        if (field === 'product_id') {
          const product = operationalProductMap.get(value)
          nextLine.unit_id = product?.base_unit_id != null ? String(product.base_unit_id) : ''
        }

        if (field === 'received_as_unit_id') {
          const unit = units.find((entry) => String(entry.id) === value)
          if (!isOuterPackagingUnit(unit)) {
            nextLine.outer_unit_qty = ''
            nextLine.inner_units_per_outer = ''
          }
        }

        const computedQty = computeOperationalInnerQuantity(nextLine, units)
        nextLine.qty = computedQty != null ? String(computedQty) : ''
        return nextLine
      }),
    )
  }

  const handleOperationalPackagingQualityChange = (lineKey: string, packaging: PackagingQuality) => {
    const normalized = normalizePackagingQualityState(packaging)
    setOperationalPackagingQualityByLineKey((previous) => ({
      ...previous,
      [lineKey]: normalized,
    }))
  }

  const validateStep = useCallback(
    (step: number): boolean => {
      if (isOperationalFlow) {
        if (step === 0 && !formData.category_code) {
          toast.error('Select a supply category before continuing.')
          return false
        }
        if (step === 1) {
          if (!formData.warehouse_id || !formData.supplier_id || !formData.received_at) {
            toast.error('Complete receiving details before continuing.')
            return false
          }
          if (!operationalDeliveryReference.trim()) {
            toast.error('Enter a delivery reference before continuing.')
            return false
          }
          if (!operationalCondition) {
            toast.error('Select received condition before continuing.')
            return false
          }
        }
        if (step === 2) {
          if (operationalSupplyLines.length === 0) {
            toast.error('Add at least one operational supply batch before continuing.')
            return false
          }
          if (operationalMappedProducts.length === 0) {
            toast.error('No operational products found. Create OP products first.')
            return false
          }
          const invalidLine = operationalSupplyLines.find((line) => {
            const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
            const isOuterUnit = isOuterPackagingUnit(receivedAsUnit)
            const qty = computeOperationalInnerQuantity(line, units)
            const unitPrice = Number.parseFloat(line.unit_price)
            const product = operationalProductMap.get(line.product_id)
            return (
              !line.product_id ||
              !line.received_as_unit_id ||
              !operationalMappedProductIdSet.has(line.product_id) ||
              qty == null ||
              !Number.isFinite(unitPrice) ||
              unitPrice <= 0 ||
              (isOuterUnit && (
                product?.base_unit_id == null ||
                !Number.isFinite(Number.parseFloat(line.outer_unit_qty)) ||
                Number.parseFloat(line.outer_unit_qty) <= 0 ||
                !Number.isFinite(Number.parseFloat(line.inner_units_per_outer)) ||
                Number.parseFloat(line.inner_units_per_outer) <= 0
              ))
            )
          })
          if (invalidLine) {
            toast.error('Each operational batch must include a received unit, valid quantity, and unit price. Box and bale receipts also require a stock unit and inner quantity.')
            return false
          }
        }
        if (step === 3) {
          const invalidLine = operationalSupplyLines.find((line, index) => {
            const qty = computeOperationalInnerQuantity(line, units)
            const unitPrice = Number.parseFloat(line.unit_price)
            if (
              !line.product_id ||
              !line.received_as_unit_id ||
              !operationalMappedProductIdSet.has(line.product_id) ||
              qty == null ||
              !Number.isFinite(unitPrice) ||
              unitPrice <= 0
            ) {
              return false
            }
            const lineKey = getOperationalLineKey(line, index)
            return !isPackagingQualityComplete(
              normalizePackagingQualityState(
                operationalPackagingQualityByLineKey[lineKey] ?? createEmptyPackagingQuality(),
              ),
            )
          })
          if (invalidLine) {
            toast.error('Complete packaging quality parameters for every operational supply line before continuing.')
            return false
          }
        }
        return true
      }

      if (step === 0) {
        if (!formData.category_code) {
          toast.error('Select a supply category before continuing.')
          return false
        }
      }

      if (step === 1) {
        if (
          !formData.warehouse_id ||
          !formData.supplier_id ||
          !formData.received_at
        ) {
          toast.error('Complete all required fields before continuing.')
          return false
        }
      }

      if (step === 2) {
        // Supply documents validation
        if (!supplyDocuments.invoiceNumber || !supplyDocuments.driverLicenseName || !supplyDocuments.batchNumber) {
          toast.error('Complete all required document fields before continuing.')
          return false
        }
      }

      if (step === 3) {
        // Vehicle inspections validation
        if (
          vehicleInspection.vehicleClean === '' ||
          vehicleInspection.noForeignObjects === '' ||
          vehicleInspection.noPestInfestation === ''
        ) {
          toast.error('Complete all vehicle inspection fields before continuing.')
          return false
        }
      }

      if (step === 4) {
        // Packaging quality parameters validation
        if (
          packagingQuality.inaccurateLabelling === '' ||
          packagingQuality.visibleDamage === '' ||
          !packagingQuality.specifiedQuantity ||
          packagingQuality.odor === '' ||
          packagingQuality.strengthIntegrity === ''
        ) {
          toast.error('Complete all packaging quality parameters before continuing.')
          return false
        }
      }

      if (step === 5) {
        // Supply batches validation
        const editableBatches = formData.supply_batches.filter((batch) => !batch.is_locked)
        if (formData.supply_batches.length === 0) {
          toast.error('Add at least one batch to continue.')
          return false
        }

        const productIds = formData.supply_batches
          .map((batch) => (batch.product_id || '').trim())
          .filter(Boolean)
        const duplicateProductIds = productIds.filter(
          (productId, idx) => productIds.indexOf(productId) !== idx
        )
        if (duplicateProductIds.length > 0) {
          toast.error('Each raw material can only be used once in supply batches.')
          return false
        }

        let errorMessage = ''
        const invalidBatch = editableBatches.find((batch) => {
          const quantity = Number.parseFloat(batch.qty)
          const rejected = Number.parseFloat(batch.rejected_qty)

          if (!batch.product_id || !batch.unit_id || !batch.qty) {
            errorMessage = 'Complete all batch details before submitting.'
            return true
          }

          if (!Number.isFinite(quantity) || quantity <= 0) {
            errorMessage = 'Received quantity must be greater than zero.'
            return true
          }

          if (!Number.isFinite(rejected) || rejected < 0) {
            errorMessage = 'Rejected quantity cannot be negative.'
            return true
          }

          if (rejected > quantity) {
            errorMessage = 'Rejected quantity cannot exceed received quantity.'
            return true
          }

          if (!batch.production_date || !batch.expiry_date) {
            errorMessage = 'Production and expiry dates are required for each batch.'
            return true
          }

          if (!batch.coa_file && !batch.coa_document_id) {
            errorMessage = 'Upload a COA certificate for each batch.'
            return true
          }

          const unitPrice = Number.parseFloat(batch.unit_price)
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            errorMessage = 'Unit price is required and must be greater than zero for each batch.'
            return true
          }

          return false
        })

        if (invalidBatch) {
          toast.error(errorMessage || 'Resolve issues with batch details before submitting.')
          return false
        }

      }

      if (step === 6) {
        // Per-batch quality evaluation validation
        for (let batchIndex = 0; batchIndex < formData.supply_batches.length; batchIndex += 1) {
          const batch = formData.supply_batches[batchIndex]!
          const batchKey = getSupplyBatchQualityKey(batch, batchIndex)
          const batchEntries = qualityEntriesByBatchKey[batchKey] ?? createInitialQualityEntries(qualityParameters)

          const invalidParameter = qualityParameters.find((parameter) => {
            const entry = batchEntries[parameter.code]
            const score = entry?.score
            if (score === null || score === '' || score === 4 || score === '4') {
              return false
            }
            const scoreNum = Number(score)
            return !Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 3
          })

          if (invalidParameter) {
            const batchLabel = batch.lot_no?.trim() || `Batch ${batchIndex + 1}`
            toast.error(`${batchLabel}: provide a valid score for ${invalidParameter.name}.`)
            return false
          }
        }
      }

      if (step === 7) {
        // Supplier sign-off validation
        if (!supplierSignOff.signatureType) {
          toast.error('Select a signature type before submitting.')
          return false
        }
        if (!supplierSignOff.signedByName) {
          toast.error('Enter the signer name before submitting.')
          return false
        }
        if (supplierSignOff.signatureType === 'E_SIGNATURE' && !supplierSignOff.signatureData) {
          toast.error('Please provide an e-signature before submitting.')
          return false
        }
        if (supplierSignOff.signatureType === 'UPLOADED_DOCUMENT' && !supplierSignOff.documentFile) {
          toast.error('Please upload a signature document before submitting.')
          return false
        }
      }

      return true
    },
    [
      formData,
      isOperationalFlow,
      operationalCondition,
      operationalDeliveryReference,
      operationalMappedProductIdSet,
      operationalMappedProducts.length,
      operationalProductMap,
      operationalPackagingQualityByLineKey,
      operationalSupplyLines,
      packagingQuality,
      qualityEntriesByBatchKey,
      qualityParameters,
      supplierSignOff,
      supplyDocuments,
      units,
      vehicleInspection,
    ],
  )

  const handleStepBack = () => {
    setCurrentStep((previous) => Math.max(previous - 1, minimumModalStepIndex))
  }

  const handleStepClick = (targetStep: number) => {
    if (isSubmitting || !isEditingSupply) {
      return
    }
    if (targetStep < minimumModalStepIndex || targetStep > lastModalStepIndex) {
      return
    }
    setCurrentStep(targetStep)
  }

  const handleSaveOperationalSupply = async () => {
    if (isSubmitting) {
      return
    }

    const warehouseId = parseInt(formData.warehouse_id, 10)
    if (!Number.isFinite(warehouseId)) {
      toast.error('Select a warehouse before saving.')
      return
    }

    const supplierId = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null
    if (!supplierId || !Number.isFinite(supplierId)) {
      toast.error('Select a supplier before saving.')
      return
    }

    const mappedLines = operationalSupplyLines
      .map((line) => {
        const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
        const computedQty = computeOperationalInnerQuantity(line, units)
        const unitPrice = Number.parseFloat(line.unit_price)
        const amountPaid = Number.parseFloat(line.amount_paid)
        const outerUnitQty = Number.parseFloat(line.outer_unit_qty)
        const innerUnitsPerOuter = Number.parseFloat(line.inner_units_per_outer)
        const product = operationalProductMap.get(line.product_id)
        return {
          ...line,
          qty_number: computedQty ?? NaN,
          unit_price_number: Number.isFinite(unitPrice) ? unitPrice : null,
          amount_paid_number: Number.isFinite(amountPaid) ? amountPaid : 0,
          outer_unit_qty_number: Number.isFinite(outerUnitQty) ? outerUnitQty : null,
          inner_units_per_outer_number: Number.isFinite(innerUnitsPerOuter) ? innerUnitsPerOuter : null,
          received_as_unit_id_number: line.received_as_unit_id ? Number.parseInt(line.received_as_unit_id, 10) : null,
          stock_unit_id_number:
            product?.base_unit_id != null && isOuterPackagingUnit(receivedAsUnit)
              ? Number(product.base_unit_id)
              : line.unit_id
                ? Number.parseInt(line.unit_id, 10)
                : null,
        }
      })
      .filter(
        (line) =>
          Boolean(line.product_id) &&
          Boolean(line.received_as_unit_id) &&
          operationalMappedProductIdSet.has(line.product_id) &&
          Number.isFinite(line.qty_number) &&
          line.qty_number > 0
      )

    if (mappedLines.length === 0) {
      toast.error('Add at least one valid operational supply batch before saving.')
      return
    }

    const invalidPriceLine = mappedLines.find((line) => !Number.isFinite(line.unit_price_number) || (line.unit_price_number ?? 0) <= 0)
    if (invalidPriceLine) {
      toast.error('Unit price is required for every operational batch and must be greater than zero.')
      return
    }

    const invalidPackagingLine = mappedLines.find((line, index) => {
      const lineKey = getOperationalLineKey(line, index)
      return !isPackagingQualityComplete(
        normalizePackagingQualityState(
          operationalPackagingQualityByLineKey[lineKey] ?? createEmptyPackagingQuality(),
        ),
      )
    })
    if (invalidPackagingLine) {
      toast.error('Complete packaging quality parameters for every operational supply line before saving.')
      return
    }

    const nowISO = new Date().toISOString()
    const receivedAtISO = formData.received_at ? new Date(formData.received_at).toISOString() : nowISO
    let insertedSupplyId: number | null = null

    setIsSubmitting(true)
    try {
      if (editingSupplyId) {
        const { error: updateSupplyError } = await supabase
          .from('supplies')
          .update({
            category_code: 'SERVICE',
            warehouse_id: warehouseId,
            supplier_id: supplierId,
            reference: operationalDeliveryReference.trim() || null,
            received_at: receivedAtISO,
            received_by: profileId ?? null,
            doc_status: formData.doc_status,
            quality_status: 'PASSED',
            transport_reference: operationalDeliveryReference.trim() || null,
            notes: operationalRemarks.trim() || null,
            updated_at: nowISO,
          })
          .eq('id', editingSupplyId)
        if (updateSupplyError) {
          throw updateSupplyError
        }
        insertedSupplyId = editingSupplyId
      } else {
        const { data: insertedSupply, error: insertSupplyError } = await supabase
          .from('supplies')
          .insert({
            category_code: 'SERVICE',
            doc_no: formData.doc_no || computeNextDocNumber(),
            warehouse_id: warehouseId,
            supplier_id: supplierId,
            reference: operationalDeliveryReference.trim() || null,
            received_at: receivedAtISO,
            expected_at: null,
            received_by: profileId ?? null,
            doc_status: formData.doc_status,
            quality_status: 'PASSED',
            transport_reference: operationalDeliveryReference.trim() || null,
            pallets_received: null,
            notes: operationalRemarks.trim() || null,
            created_at: nowISO,
            updated_at: nowISO,
          })
          .select('id')
          .single()

        if (insertSupplyError) {
          throw insertSupplyError
        }
        insertedSupplyId = Number(insertedSupply.id)
      }

      // Replace operational batches so edit reflects exact current form state.
      const { error: deleteBatchesError } = await supabase
        .from('supply_batches')
        .delete()
        .eq('supply_id', insertedSupplyId)
      if (deleteBatchesError) {
        throw deleteBatchesError
      }

      const supplyBatchRows = mappedLines.map((line, index) => ({
        supply_id: insertedSupplyId,
        lot_no: `LOT-${insertedSupplyId}-${String(index + 1).padStart(3, '0')}`,
        product_id: parseInt(line.product_id, 10),
        unit_id: Number.isFinite(line.stock_unit_id_number) ? line.stock_unit_id_number : null,
        outer_unit_id: Number.isFinite(line.received_as_unit_id_number) ? line.received_as_unit_id_number : null,
        outer_unit_qty: line.outer_unit_qty_number,
        inner_units_per_outer: line.inner_units_per_outer_number,
        received_qty: line.qty_number,
        accepted_qty: line.qty_number,
        rejected_qty: 0,
        current_qty: line.qty_number,
        quality_status: 'PASSED',
        unit_price: line.unit_price_number,
        created_at: nowISO,
      }))

      const { data: insertedBatches, error: batchesError } = await supabase
        .from('supply_batches')
        .insert(supplyBatchRows)
        .select('id, product_id, received_qty, lot_no')
      if (batchesError) {
        throw batchesError
      }

      const savedBatches = (insertedBatches ?? []) as Array<{
        id: number
        product_id: number
        received_qty: number | null
        lot_no?: string | null
      }>

      const { data: existingPackagingChecks, error: existingPackagingChecksError } = await supabase
        .from('supply_packaging_quality_checks')
        .select('id, lot_id')
        .eq('supply_id', insertedSupplyId)
      if (existingPackagingChecksError) {
        throw existingPackagingChecksError
      }

      const legacyPackagingCheckIds = (existingPackagingChecks ?? [])
        .filter((row) => (row as { lot_id?: number | null }).lot_id == null)
        .map((row) => Number((row as { id?: number | null }).id))
        .filter((id) => Number.isFinite(id))
      if (legacyPackagingCheckIds.length > 0) {
        const { error: deleteLegacyPackagingChecksError } = await supabase
          .from('supply_packaging_quality_checks')
          .delete()
          .in('id', legacyPackagingCheckIds)
        if (deleteLegacyPackagingChecksError) {
          throw deleteLegacyPackagingChecksError
        }
      }

      const existingPackagingCheckMap = new Map<number, number>()
      ;(existingPackagingChecks ?? []).forEach((row) => {
        const lotId = Number((row as { lot_id?: number | null }).lot_id)
        const id = Number((row as { id?: number | null }).id)
        if (Number.isFinite(lotId) && Number.isFinite(id)) {
          existingPackagingCheckMap.set(lotId, id)
        }
      })

      const { data: packagingParams, error: packagingParamsError } = await supabase
        .from('packaging_quality_parameters')
        .select('id, code, name')
      if (packagingParamsError) {
        throw packagingParamsError
      }

      const packagingParamsMap = new Map<string, number>()
      ;(packagingParams ?? []).forEach((p: { id: number; code: string | null; name?: string | null }) => {
        packagingParamsMap.set(normalizePackagingParameterCode(p.code), p.id)
        packagingParamsMap.set(normalizePackagingParameterCode(p.name), p.id)
      })

      for (const [index, line] of mappedLines.entries()) {
        const savedBatch = savedBatches[index]
        if (!savedBatch?.id) {
          continue
        }

        const lineKey = getOperationalLineKey(line, index)
        const packaging = normalizePackagingQualityState(
          operationalPackagingQualityByLineKey[lineKey] ?? createEmptyPackagingQuality(),
        )

        let packagingCheckId = existingPackagingCheckMap.get(Number(savedBatch.id))
        if (!packagingCheckId) {
          const { data: newPackagingCheck, error: newPackagingCheckError } = await supabase
            .from('supply_packaging_quality_checks')
            .insert({
              supply_id: insertedSupplyId,
              lot_id: savedBatch.id,
              checked_by: profileId ?? null,
              remarks: line.notes?.trim() || null,
            })
            .select('id')
            .single()
          if (newPackagingCheckError) {
            throw newPackagingCheckError
          }
          packagingCheckId = Number(newPackagingCheck.id)
        } else {
          const { error: updatePackagingCheckError } = await supabase
            .from('supply_packaging_quality_checks')
            .update({
              checked_by: profileId ?? null,
              checked_at: nowISO,
              remarks: line.notes?.trim() || null,
            })
            .eq('id', packagingCheckId)
          if (updatePackagingCheckError) {
            throw updatePackagingCheckError
          }

          const { error: deletePackagingItemsError } = await supabase
            .from('supply_packaging_quality_check_items')
            .delete()
            .eq('packaging_check_id', packagingCheckId)
          if (deletePackagingItemsError) {
            throw deletePackagingItemsError
          }
        }

        const packagingItemsPayload = [
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'INACCURATE_LABELLING'),
            value: packaging.inaccurateLabelling,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'VISIBLE_DAMAGE'),
            value: packaging.visibleDamage,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'SPECIFIED_QUANTITY', 'SPECIFIED_QUANTITY_UNITS'),
            value: null,
            numeric_value: parseNullableNumber(packaging.specifiedQuantity),
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'ODOR', 'ODOUR'),
            value: packaging.odor,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'STRENGTH_INTEGRITY'),
            value: packaging.strengthIntegrity,
            numeric_value: null,
          },
        ].filter((item) => item.parameter_id != null)

        if (packagingItemsPayload.length > 0) {
          const { error: packagingItemsError } = await supabase
            .from('supply_packaging_quality_check_items')
            .insert(packagingItemsPayload)
          if (packagingItemsError) {
            throw packagingItemsError
          }
        }
      }

      const { error: opEntryError } = await supabase
        .from('operational_supply_entries')
        .upsert(
          {
            supply_id: insertedSupplyId,
            delivery_reference: operationalDeliveryReference.trim(),
            received_condition: operationalCondition,
            remarks: operationalRemarks.trim() || null,
            updated_at: nowISO,
          },
          { onConflict: 'supply_id' }
        )
      if (opEntryError) {
        throw opEntryError
      }

      if (!editingSupplyId) {
        for (const [index, line] of mappedLines.entries()) {
          if (line.amount_paid_number > 0) {
            const { error: paymentError } = await supabase.from('supply_payments').insert({
              supply_id: insertedSupplyId,
              amount: line.amount_paid_number,
              paid_at: receivedAtISO,
              reference: `Operational batch ${index + 1}`,
            })
            if (paymentError) {
              console.warn('Could not save amount paid for operational batch:', index + 1, paymentError)
              toast.warning('Operational supply saved but some batch payments could not be recorded. You can add them from the Payments page.')
            }
          }
        }
      }

      toast.success(editingSupplyId ? 'Operational supply updated successfully.' : 'Operational supply captured successfully.')
      closeModal()
      loadSuppliesData()
      navigate(`/supplies/operational/${insertedSupplyId}`, { replace: true })
    } catch (error) {
      if (!editingSupplyId && insertedSupplyId) {
        await supabase.from('supplies').delete().eq('id', insertedSupplyId)
      }
      console.error('Error capturing operational supply', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to capture operational supply.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (currentStep < lastModalStepIndex) {
      if (validateStep(currentStep)) {
        setCurrentStep((previous) => Math.min(previous + 1, lastModalStepIndex))
      }
      return
    }

    for (let step = minimumModalStepIndex; step < lastModalStepIndex; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step)
        return
      }
    }

    if (!validateStep(currentStep)) {
      return
    }

    if (isOperationalFlow) {
      await handleSaveOperationalSupply()
      return
    }

    await handleSaveSupply()
  }

  const handleSaveSupply = async () => {
    if (isSubmitting) {
      return
    }

    const warehouseId = parseInt(formData.warehouse_id, 10)
    if (!Number.isFinite(warehouseId)) {
      toast.error('Select a warehouse before saving.')
      return
    }

    const supplierId = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null
    const nowISO = new Date().toISOString()
    const receivedAtISO = formData.received_at ? new Date(formData.received_at).toISOString() : nowISO

    const validLines = formData.supply_batches
      .map((batch) => {
        const trimmedQty = batch.qty?.trim() ?? ''
        const trimmedRejected = batch.rejected_qty?.trim() ?? ''
        const quantityNumber = Number.parseFloat(trimmedQty)
        const rejectedNumber = Number.parseFloat(trimmedRejected)
        const computedRejected =
          Number.isFinite(quantityNumber) && Number.isFinite(rejectedNumber)
            ? Math.min(Math.max(rejectedNumber, 0), quantityNumber)
            : 0
        const computedAccepted =
          Number.isFinite(quantityNumber)
            ? Math.max(quantityNumber - computedRejected, 0)
            : ''

        return {
          ...batch,
          qty: trimmedQty,
          accepted_qty: computedAccepted === '' ? '' : computedAccepted.toString(),
          rejected_qty: computedRejected.toString(),
        }
      })
      .filter((batch) => batch.product_id && batch.unit_id && batch.qty)

    if (validLines.length === 0) {
      toast.error('Add at least one supply batch before saving.')
      return
    }

    const batchAssessments = validLines.map((batch, index) => {
      const qualityKey = getSupplyBatchQualityKey(batch, index)
      const entries = qualityEntriesByBatchKey[qualityKey] ?? createInitialQualityEntries(qualityParameters)
      return {
        qualityKey,
        entries,
        ...evaluateBatchQuality(entries),
      }
    })
    const qualityStatus = batchAssessments.some((assessment) => assessment.hasQualityIssues)
      ? 'FAILED'
      : 'PASSED'

    const managedSupplyDocumentCodes = ['INVOICE', 'DRIVER_LICENSE', 'BATCH_NUMBER', 'PRODUCTION_DATE', 'EXPIRY_DATE']
    const supplyDocumentTypeDefaults: Record<string, { name: string; is_required: boolean; allows_file_upload: boolean }> = {
      INVOICE: { name: 'Invoice Number', is_required: true, allows_file_upload: true },
      DRIVER_LICENSE: { name: 'Driver License/Name', is_required: true, allows_file_upload: false },
      BATCH_NUMBER: { name: 'Supply Batch Number', is_required: true, allows_file_upload: false },
    }

    const ensureSupplyDocumentTypes = async (codes: string[]): Promise<Set<string>> => {
      const uniqueCodes = Array.from(new Set(codes.filter(Boolean)))
      if (uniqueCodes.length === 0) {
        return new Set()
      }

      const { data: existingTypes, error: existingTypesError } = await supabase
        .from('supply_document_types')
        .select('code')
        .in('code', uniqueCodes)
      if (existingTypesError) throw existingTypesError

      const existingSet = new Set((existingTypes ?? []).map((row) => String(row.code)))
      const missingCodes = uniqueCodes.filter((code) => !existingSet.has(code))

      if (missingCodes.length > 0) {
        const payload = missingCodes.map((code) => {
          const defaults = supplyDocumentTypeDefaults[code] ?? {
            name: code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
            is_required: false,
            allows_file_upload: false,
          }
          return {
            code,
            name: defaults.name,
            is_required: defaults.is_required,
            allows_file_upload: defaults.allows_file_upload,
          }
        })

        const { error: upsertTypesError } = await supabase
          .from('supply_document_types')
          .upsert(payload, { onConflict: 'code' })
        if (upsertTypesError) {
          console.warn('Unable to auto-create supply document types. Falling back to existing configured types.', upsertTypesError)
        }
      }

      const { data: refreshedTypes, error: refreshedTypesError } = await supabase
        .from('supply_document_types')
        .select('code')
        .in('code', uniqueCodes)
      if (refreshedTypesError) throw refreshedTypesError

      return new Set((refreshedTypes ?? []).map((row) => String(row.code)))
    }

    const saveBatchCoaDocument = async (batchId: number, batch: SupplyBatch) => {
      const existingDocumentId = batch.coa_document_id != null && Number.isFinite(Number(batch.coa_document_id))
        ? Number(batch.coa_document_id)
        : null
      const existingStoragePath = batch.coa_storage_path?.trim() || null
      const expiryToUse = batch.coa_expiry_date?.trim() ? batch.coa_expiry_date.trim() : null
      const documentName = batch.coa_file?.name || batch.coa_document_name?.trim() || 'COA'
      const existingDocument = existingDocumentId
        ? { id: existingDocumentId, storage_path: existingStoragePath, name: batch.coa_document_name?.trim() || 'COA' }
        : null

      if (!batch.coa_file && !existingDocument) {
        throw new Error(`Upload a COA certificate for batch ${batch.lot_no?.trim() || batchId}.`)
      }

      if (batch.coa_file) {
        const storagePath = buildStorageObjectPath(
          `supply_batches/${batchId}/certificates`,
          `coa_${batch.coa_file.name}`,
        )
        await uploadStoredFile(storagePath, batch.coa_file)

        if (existingDocument?.id) {
          const { error: updateDocumentError } = await supabase
            .from('documents')
            .update({
              name: documentName,
              storage_path: storagePath,
              doc_type: 'COA',
              document_type_code: 'COA',
              expiry_date: expiryToUse,
              uploaded_by: profileId ?? null,
            })
            .eq('id', existingDocument.id)
          if (updateDocumentError) throw updateDocumentError

          if (existingDocument.storage_path && existingDocument.storage_path !== storagePath) {
            try {
              await deleteStoredFile(existingDocument.storage_path)
            } catch (deleteError) {
              console.warn('Unable to remove the previous COA file for a batch.', deleteError)
            }
          }
        } else {
          const { error: insertDocumentError } = await supabase.from('documents').insert({
            owner_type: 'supply_batch',
            owner_id: batchId,
            name: documentName,
            doc_type: 'COA',
            document_type_code: 'COA',
            storage_path: storagePath,
            expiry_date: expiryToUse,
            uploaded_by: profileId ?? null,
          })
          if (insertDocumentError) throw insertDocumentError
        }

        return
      }

      if (existingDocument?.id) {
        const { error: updateDocumentError } = await supabase
          .from('documents')
          .update({
            name: documentName,
            doc_type: 'COA',
            document_type_code: 'COA',
            expiry_date: expiryToUse,
            uploaded_by: profileId ?? null,
          })
          .eq('id', existingDocument.id)
        if (updateDocumentError) throw updateDocumentError
      }
    }

    setIsSubmitting(true)
    try {
      if (editingSupplyId) {
        let lockedLotsDetected = false
        const { error: updateSupplyError } = await supabase
          .from('supplies')
          .update({
            category_code: formData.category_code,
            warehouse_id: warehouseId,
            supplier_id: supplierId,
            received_at: receivedAtISO,
            received_by: profileId ?? null,
            doc_status: formData.doc_status,
            quality_status: qualityStatus,
            updated_at: nowISO,
          })
          .eq('id', editingSupplyId)
        if (updateSupplyError) throw updateSupplyError

        const { data: existingBatchesData, error: existingBatchesError } = await supabase
          .from('supply_batches')
          .select('id')
          .eq('supply_id', editingSupplyId)
        if (existingBatchesError) throw existingBatchesError

        const existingBatchRows = (existingBatchesData ?? []) as Array<{ id: number }>
        const existingBatchIds = existingBatchRows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
        const existingBatchIdSet = new Set(existingBatchIds)
        const lockedBatchIds = new Set<number>()
        if (existingBatchIds.length > 0) {
          const { data: linkedRuns, error: linkedRunsError } = await supabase
            .from('process_lot_runs')
            .select('supply_batch_id')
            .in('supply_batch_id', existingBatchIds)
          if (linkedRunsError) throw linkedRunsError
          ;(linkedRuns ?? []).forEach((row) => {
            const batchId = Number((row as { supply_batch_id: number | null }).supply_batch_id)
            if (Number.isFinite(batchId)) {
              lockedBatchIds.add(batchId)
            }
          })
        }

        const editableValidLines = formData.supply_batches
          .filter((batch) => {
            if (batch.batch_id && lockedBatchIds.has(batch.batch_id)) {
              lockedLotsDetected = true
              return false
            }
            return !batch.is_locked
          })
          .map((batch) => ({
            ...batch,
            qty: batch.qty?.trim() ?? '',
            accepted_qty: batch.accepted_qty?.trim() ?? '',
          }))
          .filter((batch) => batch.product_id && batch.unit_id && batch.qty)

        const invalidEditablePriceLine = editableValidLines.find((line) => {
          const unitPrice = Number.parseFloat(line.unit_price?.trim() ?? '')
          return !Number.isFinite(unitPrice) || unitPrice <= 0
        })
        if (invalidEditablePriceLine) {
          toast.error('Unit price is required for every editable batch and must be greater than zero.')
          setIsSubmitting(false)
          return
        }

        const batchAssessmentByKey = new Map(
          batchAssessments.map((assessment) => [assessment.qualityKey, assessment]),
        )
        const upsertedBatchQualityRows: Array<{
          batchId: number
          checkStatus: 'PASS' | 'FAIL'
          overallScore: number | null
          entries: QualityEntries
        }> = []

        const rowsToDelete = existingBatchRows.filter(
          (row) =>
            !lockedBatchIds.has(row.id) &&
            !formData.supply_batches.some((batch) => Number(batch.batch_id) === row.id),
        )
        const batchIdsToDelete = rowsToDelete.map((row) => row.id)
        if (batchIdsToDelete.length > 0) {
          const { error: deleteBatchQualityChecksError } = await supabase
            .from('supply_quality_checks')
            .delete()
            .eq('supply_id', editingSupplyId)
            .in('lot_id', batchIdsToDelete)
          if (deleteBatchQualityChecksError) throw deleteBatchQualityChecksError

          const { error: deleteEditableBatchesError } = await supabase
            .from('supply_batches')
            .delete()
            .in('id', batchIdsToDelete)
          if (deleteEditableBatchesError) throw deleteEditableBatchesError
        }

        for (let index = 0; index < editableValidLines.length; index += 1) {
          const line = editableValidLines[index]!
          const qualityKey = getSupplyBatchQualityKey(line, index)
          const assessment = batchAssessmentByKey.get(qualityKey) ?? {
            entries: createInitialQualityEntries(qualityParameters),
            checkStatus: 'PASS' as const,
            overallScore: null,
            hasQualityIssues: false,
          }
          const quantity = Number.parseFloat(line.qty) || 0
          const rejectedRaw = Number.parseFloat(line.rejected_qty)
          const rejectedQty = Number.isFinite(rejectedRaw) ? Math.min(Math.max(rejectedRaw, 0), quantity) : 0
          const acceptedQty = Math.max(quantity - rejectedQty, 0)
          const unitPriceRaw = line.unit_price?.trim()
          const unitPrice = unitPriceRaw && Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : null

          const existingBatchId = Number(line.batch_id)
          const hasExistingBatch = Number.isFinite(existingBatchId) && existingBatchIdSet.has(existingBatchId)
          if (hasExistingBatch && lockedBatchIds.has(existingBatchId)) {
            lockedLotsDetected = true
            continue
          }

          const batchQualityStatus = assessment.hasQualityIssues ? 'FAILED' : 'PASSED'
          const batchPayload = {
            supply_id: editingSupplyId,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            current_qty: acceptedQty,
            quality_status: batchQualityStatus,
            unit_price: unitPrice,
            production_date: line.production_date?.trim() || null,
            expiry_date: line.expiry_date?.trim() || null,
          }

          if (hasExistingBatch) {
            const { error: updateBatchError } = await supabase
              .from('supply_batches')
              .update(batchPayload)
              .eq('id', existingBatchId)
              .eq('supply_id', editingSupplyId)
            if (updateBatchError) throw updateBatchError
            await saveBatchCoaDocument(existingBatchId, line)
            upsertedBatchQualityRows.push({
              batchId: existingBatchId,
              checkStatus: assessment.checkStatus,
              overallScore: assessment.overallScore,
              entries: assessment.entries,
            })
          } else {
            const lotNumber = line.lot_no?.trim()
              ? line.lot_no.trim()
              : `LOT-${editingSupplyId}-${String(existingBatchRows.length + index + 1).padStart(3, '0')}`
            const { data: insertedBatch, error: insertBatchError } = await supabase
              .from('supply_batches')
              .insert({
                ...batchPayload,
                lot_no: lotNumber,
                created_at: nowISO,
              })
              .select('id')
              .single()
            if (insertBatchError) throw insertBatchError
            if (insertedBatch?.id) {
              await saveBatchCoaDocument(Number(insertedBatch.id), line)
              upsertedBatchQualityRows.push({
                batchId: Number(insertedBatch.id),
                checkStatus: assessment.checkStatus,
                overallScore: assessment.overallScore,
                entries: assessment.entries,
              })
            }
          }
        }

        const supplyDocumentsPayload: { supply_id: number; document_type_code: string; value: string | null; date_value: string | null; boolean_value: boolean | null; document_id: number | null }[] = []
        if (supplyDocuments.invoiceNumber) {
          supplyDocumentsPayload.push({
            supply_id: editingSupplyId,
            document_type_code: 'INVOICE',
            value: supplyDocuments.invoiceNumber,
            date_value: null,
            boolean_value: null,
            document_id: null,
          })
        }
        if (supplyDocuments.driverLicenseName) {
          supplyDocumentsPayload.push({
            supply_id: editingSupplyId,
            document_type_code: 'DRIVER_LICENSE',
            value: supplyDocuments.driverLicenseName,
            date_value: null,
            boolean_value: null,
            document_id: null,
          })
        }
        if (supplyDocuments.batchNumber) {
          supplyDocumentsPayload.push({
            supply_id: editingSupplyId,
            document_type_code: 'BATCH_NUMBER',
            value: supplyDocuments.batchNumber,
            date_value: null,
            boolean_value: null,
            document_id: null,
          })
        }
        const availableDocumentTypes = await ensureSupplyDocumentTypes(
          supplyDocumentsPayload.map((row) => row.document_type_code),
        )
        const filteredDocumentsPayload = supplyDocumentsPayload.filter((row) =>
          availableDocumentTypes.has(row.document_type_code),
        )
        const suppliedCodes = new Set(filteredDocumentsPayload.map((row) => row.document_type_code))
        const staleCodes = managedSupplyDocumentCodes.filter((code) => !suppliedCodes.has(code))
        if (staleCodes.length > 0) {
          const { error: deleteStaleDocsError } = await supabase
            .from('supply_documents')
            .delete()
            .eq('supply_id', editingSupplyId)
            .in('document_type_code', staleCodes)
          if (deleteStaleDocsError) throw deleteStaleDocsError
        }
        if (filteredDocumentsPayload.length > 0) {
          const { error: documentsError } = await supabase
            .from('supply_documents')
            .upsert(filteredDocumentsPayload, { onConflict: 'supply_id,document_type_code' })
          if (documentsError) throw documentsError
        } else if (supplyDocumentsPayload.length > 0) {
          throw new Error('Supply document types are not configured. Please configure supply document types in settings.')
        }

        if (vehicleInspection.vehicleClean && vehicleInspection.noForeignObjects && vehicleInspection.noPestInfestation) {
          const { data: existingVehicle } = await supabase
            .from('supply_vehicle_inspections')
            .select('id')
            .eq('supply_id', editingSupplyId)
            .maybeSingle()
          if (existingVehicle?.id) {
            await supabase.from('supply_vehicle_inspections').update({
              vehicle_clean: vehicleInspection.vehicleClean,
              no_foreign_objects: vehicleInspection.noForeignObjects,
              no_pest_infestation: vehicleInspection.noPestInfestation,
              remarks: vehicleInspection.remarks?.trim() || null,
            }).eq('id', existingVehicle.id)
          } else {
            await supabase.from('supply_vehicle_inspections').insert({
              supply_id: editingSupplyId,
              vehicle_clean: vehicleInspection.vehicleClean,
              no_foreign_objects: vehicleInspection.noForeignObjects,
              no_pest_infestation: vehicleInspection.noPestInfestation,
              inspected_by: profileId ?? null,
              remarks: vehicleInspection.remarks?.trim() || null,
            })
          }
        }

        const { data: existingPackaging } = await supabase
          .from('supply_packaging_quality_checks')
          .select('id')
          .eq('supply_id', editingSupplyId)
          .maybeSingle()
        let packagingCheckId = existingPackaging?.id
        if (!packagingCheckId && (packagingQuality.inaccurateLabelling || packagingQuality.visibleDamage)) {
          const { data: newPack } = await supabase.from('supply_packaging_quality_checks').insert({
            supply_id: editingSupplyId,
            checked_by: profileId ?? null,
            remarks: null,
          }).select('id').single()
          packagingCheckId = newPack?.id
        }
        if (packagingCheckId && packagingQuality.inaccurateLabelling && packagingQuality.visibleDamage && packagingQuality.specifiedQuantity && packagingQuality.odor && packagingQuality.strengthIntegrity) {
          if (existingPackaging?.id) {
            const { error: deletePackagingItemsError } = await supabase
              .from('supply_packaging_quality_check_items')
              .delete()
              .eq('packaging_check_id', existingPackaging.id)
            if (deletePackagingItemsError) {
              throw deletePackagingItemsError
            }
          }
          const { data: packagingParams, error: packagingParamsError } = await supabase
            .from('packaging_quality_parameters')
            .select('id, code, name')
          if (packagingParamsError) {
            throw packagingParamsError
          }
          const map = new Map<string, number>()
          ;(packagingParams ?? []).forEach((p: { id: number; code: string | null; name?: string | null }) => {
            map.set(normalizePackagingParameterCode(p.code), p.id)
            map.set(normalizePackagingParameterCode(p.name), p.id)
          })
          const packagingItemsPayload = [
            {
              packaging_check_id: packagingCheckId,
              parameter_id: resolvePackagingParameterId(map, 'INACCURATE_LABELLING'),
              value: packagingQuality.inaccurateLabelling,
              numeric_value: null,
            },
            {
              packaging_check_id: packagingCheckId,
              parameter_id: resolvePackagingParameterId(map, 'VISIBLE_DAMAGE'),
              value: packagingQuality.visibleDamage,
              numeric_value: null,
            },
            {
              packaging_check_id: packagingCheckId,
              parameter_id: resolvePackagingParameterId(map, 'SPECIFIED_QUANTITY', 'SPECIFIED_QUANTITY_UNITS'),
              value: null,
              numeric_value: parseNullableNumber(packagingQuality.specifiedQuantity),
            },
            {
              packaging_check_id: packagingCheckId,
              parameter_id: resolvePackagingParameterId(map, 'ODOR', 'ODOUR'),
              value: packagingQuality.odor,
              numeric_value: null,
            },
            {
              packaging_check_id: packagingCheckId,
              parameter_id: resolvePackagingParameterId(map, 'STRENGTH_INTEGRITY'),
              value: packagingQuality.strengthIntegrity,
              numeric_value: null,
            },
          ].filter((i) => i.parameter_id != null)
          if (packagingItemsPayload.length > 0) {
            const { error: packagingItemsError } = await supabase
              .from('supply_packaging_quality_check_items')
              .insert(packagingItemsPayload)
            if (packagingItemsError) {
              throw packagingItemsError
            }
          }
        }

        const { data: existingQualityChecksData, error: existingQualityChecksError } = await supabase
          .from('supply_quality_checks')
          .select('id, lot_id')
          .eq('supply_id', editingSupplyId)
        if (existingQualityChecksError) {
          throw existingQualityChecksError
        }
        const existingQualityCheckByLotId = new Map<number, number>()
        ;(existingQualityChecksData ?? []).forEach((row) => {
          const lotId = Number((row as { lot_id: number | null }).lot_id)
          const checkId = Number((row as { id: number }).id)
          if (Number.isFinite(lotId) && Number.isFinite(checkId)) {
            existingQualityCheckByLotId.set(lotId, checkId)
          }
        })

        const parameterIdLookup = new Map(qualityParameterIdMap)
        for (const qualityRow of upsertedBatchQualityRows) {
          const existingCheckId = existingQualityCheckByLotId.get(qualityRow.batchId)
          let qualityCheckId = existingCheckId ?? null

          if (!qualityCheckId) {
            const { data: insertedQualityCheck, error: insertQualityCheckError } = await supabase
              .from('supply_quality_checks')
              .insert({
                supply_id: editingSupplyId,
                lot_id: qualityRow.batchId,
                check_name: formData.doc_no ? `Receiving inspection - ${formData.doc_no}` : 'Receiving inspection',
                status: qualityRow.checkStatus,
                result: qualityRow.checkStatus,
                performed_by: profileId ?? null,
                performed_at: nowISO,
                evaluated_at: nowISO,
                evaluated_by: profileId ?? null,
                overall_score: qualityRow.overallScore,
              })
              .select('id')
              .single()
            if (insertQualityCheckError) throw insertQualityCheckError
            qualityCheckId = insertedQualityCheck?.id ?? null
          } else {
            const { error: updateQualityCheckError } = await supabase
              .from('supply_quality_checks')
              .update({
                status: qualityRow.checkStatus,
                result: qualityRow.checkStatus,
                lot_id: qualityRow.batchId,
                evaluated_at: nowISO,
                overall_score: qualityRow.overallScore,
              })
              .eq('id', qualityCheckId)
            if (updateQualityCheckError) throw updateQualityCheckError
          }

          if (!qualityCheckId) {
            continue
          }

          const { error: deleteItemsError } = await supabase
            .from('supply_quality_check_items')
            .delete()
            .eq('quality_check_id', qualityCheckId)
          if (deleteItemsError) throw deleteItemsError

          const qualityItemsPayload = qualityParameters
            .map((parameter) => {
              const entry = qualityRow.entries[parameter.code]
              if (!entry) return null
              const parameterId = parameterIdLookup.get(parameter.code)
              if (!parameterId) return null
              const scoreValue =
                entry.score === null || entry.score === '' || entry.score === 4 || entry.score === '4'
                  ? 4
                  : Number(entry.score)
              return {
                quality_check_id: qualityCheckId,
                parameter_id: parameterId,
                score: scoreValue,
                remarks: entry.remarks?.trim() ? entry.remarks.trim() : null,
                results: entry.results?.trim() ? entry.results.trim() : null,
              }
            })
            .filter(Boolean)

          if (qualityItemsPayload.length > 0) {
            const { error: insertItemsError } = await supabase
              .from('supply_quality_check_items')
              .insert(qualityItemsPayload)
            if (insertItemsError) throw insertItemsError
          }
        }

        const { error: deleteLegacyQualityChecksError } = await supabase
          .from('supply_quality_checks')
          .delete()
          .eq('supply_id', editingSupplyId)
          .is('lot_id', null)
        if (deleteLegacyQualityChecksError) throw deleteLegacyQualityChecksError

        const { data: existingSignOff } = await supabase.from('supply_supplier_sign_offs').select('id').eq('supply_id', editingSupplyId).maybeSingle()
        if (supplierSignOff.signatureType && supplierSignOff.signedByName) {
          const signOffPayload: Record<string, unknown> = {
            supply_id: editingSupplyId,
            signed_by_name: supplierSignOff.signedByName,
            signature_type: supplierSignOff.signatureType,
            remarks: supplierSignOff.remarks?.trim() || null,
            signed_at: nowISO,
          }
          if (supplierSignOff.signatureType === 'E_SIGNATURE' && supplierSignOff.signatureData) {
            signOffPayload.signature_data = supplierSignOff.signatureData
          }
        if (existingSignOff?.id) {
          await supabase.from('supply_supplier_sign_offs').update(signOffPayload).eq('id', existingSignOff.id)
        } else {
          await supabase.from('supply_supplier_sign_offs').insert(signOffPayload)
        }
      }

        await supabase.from('supply_activities').insert({
          supply_id: editingSupplyId,
          type: 'SUPPLY_UPDATED',
          description: `Supply updated (${validLines.length} batches, ${formData.supply_batches.length} lots)`,
          actor: profileId ?? null,
        })

        if (lockedLotsDetected) {
          toast.success('Supply updated. Lots that already started processing were locked and left unchanged.')
        } else {
          toast.success('Supply updated successfully.')
        }
        setEditingSupplyId(null)
        setEditLoadDone(false)
        closeModal()
        loadSuppliesData()
        return
      }

      const { data: insertedSupply, error: insertSupplyError } = await supabase
        .from('supplies')
        .insert({
          category_code: formData.category_code,
          doc_no: formData.doc_no || computeNextDocNumber(),
          warehouse_id: warehouseId,
          supplier_id: supplierId,
          reference: null,
          received_at: receivedAtISO,
          expected_at: null,
          received_by: profileId ?? null,
          doc_status: formData.doc_status,
          quality_status: qualityStatus,
          transport_reference: null,
          pallets_received: null,
          notes: null,
          created_at: nowISO,
          updated_at: nowISO,
        })
        .select('*')
        .single()

      if (insertSupplyError) {
        throw insertSupplyError
      }

      const newSupplyId = insertedSupply.id

      const invalidCreatePriceLine = validLines.find((line) => {
        const unitPrice = Number.parseFloat(line.unit_price?.trim() ?? '')
        return !Number.isFinite(unitPrice) || unitPrice <= 0
      })
      if (invalidCreatePriceLine) {
        toast.error('Unit price is required for every batch and must be greater than zero.')
        setIsSubmitting(false)
        return
      }

      let insertedBatchesForQuality: Array<{ id: number; lot_no: string; quality_status: string | null; process_status: string | null }> = []
      if (validLines.length > 0) {
        const supplyBatchRows = validLines.map((line, index) => {
          const qualityKey = getSupplyBatchQualityKey(line, index)
          const assessment = batchAssessments.find((entry) => entry.qualityKey === qualityKey)
          const quantity = Number.parseFloat(line.qty) || 0
          const rejectedRaw = Number.parseFloat(line.rejected_qty)
          const rejectedQty = Number.isFinite(rejectedRaw) ? Math.min(Math.max(rejectedRaw, 0), quantity) : 0
          const acceptedQty = Math.max(quantity - rejectedQty, 0)
          const lotNumber = `LOT-${newSupplyId}-${String(index + 1).padStart(3, '0')}`
          const batchQualityStatus = assessment?.hasQualityIssues ? 'FAILED' : 'PASSED'
          const unitPriceRaw = line.unit_price?.trim()
          const unitPrice = unitPriceRaw && Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : null

          return {
            supply_id: newSupplyId,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            lot_no: lotNumber,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            current_qty: acceptedQty,
            quality_status: batchQualityStatus,
            unit_price: unitPrice,
            production_date: line.production_date?.trim() || null,
            expiry_date: line.expiry_date?.trim() || null,
            created_at: nowISO,
          }
        })

        const { error: batchesError, data: insertedBatches } = await supabase
          .from('supply_batches')
          .insert(supplyBatchRows)
          .select('id, lot_no, product_id, quality_status, process_status')
        if (batchesError) {
          throw batchesError
        }

        insertedBatchesForQuality = (insertedBatches ?? []) as Array<{
          id: number
          lot_no: string
          quality_status: string | null
          process_status: string | null
        }>

        // Process lot runs are created manually from the process flow.
      }

      const parameterIdLookup = new Map(qualityParameterIdMap)
      const batchByLotNo = new Map<string, { id: number }>()
      insertedBatchesForQuality.forEach((batch) => {
        if (batch.lot_no) {
          batchByLotNo.set(String(batch.lot_no), { id: Number(batch.id) })
        }
      })

      for (let index = 0; index < validLines.length; index += 1) {
        const lotNo = `LOT-${newSupplyId}-${String(index + 1).padStart(3, '0')}`
        const insertedBatch = batchByLotNo.get(lotNo)
        if (!insertedBatch) {
          continue
        }

        const assessment = batchAssessments[index] ?? {
          entries: createInitialQualityEntries(qualityParameters),
          checkStatus: 'PASS' as const,
          overallScore: null,
        }

        await saveBatchCoaDocument(insertedBatch.id, validLines[index]!)

        const { data: qualityCheckRow, error: qualityCheckError } = await supabase
          .from('supply_quality_checks')
          .insert({
            supply_id: newSupplyId,
            lot_id: insertedBatch.id,
            check_name: formData.doc_no ? `Receiving inspection - ${formData.doc_no}` : 'Receiving inspection',
            status: assessment.checkStatus,
            result: assessment.checkStatus,
            performed_by: profileId ?? null,
            performed_at: nowISO,
            evaluated_at: nowISO,
            evaluated_by: profileId ?? null,
            overall_score: assessment.overallScore,
          })
          .select('id')
          .single()
        if (qualityCheckError) throw qualityCheckError

        const qualityItemsPayload = qualityParameters
          .map((parameter) => {
            const entry = assessment.entries[parameter.code]
            if (!entry) {
              return null
            }
            const parameterId = parameterIdLookup.get(parameter.code)
            if (!parameterId) {
              throw new Error(`Quality parameter ${parameter.code} is missing an id.`)
            }
            const scoreValue =
              entry.score === null || entry.score === '' || entry.score === 4 || entry.score === '4'
                ? 4
                : Number(entry.score)
            return {
              quality_check_id: qualityCheckRow.id,
              parameter_id: parameterId,
              score: scoreValue,
              remarks: entry.remarks?.trim() ? entry.remarks.trim() : null,
              results: entry.results?.trim() ? entry.results.trim() : null,
            }
          })
          .filter(Boolean)

        if (qualityItemsPayload.length > 0) {
          const { error: qualityItemsError } = await supabase
            .from('supply_quality_check_items')
            .insert(qualityItemsPayload)
          if (qualityItemsError) throw qualityItemsError
        }
      }

      // Save supply documents
      const supplyDocumentsPayload = []
      
      // Invoice number
      if (supplyDocuments.invoiceNumber) {
        let invoiceDocumentId = null
        if (supplyDocuments.invoiceFile) {
          const storagePath = buildStorageObjectPath(
            `supplies/${newSupplyId}/documents`,
            `invoice_${supplyDocuments.invoiceFile.name}`
          )
          await uploadStoredFile(storagePath, supplyDocuments.invoiceFile)

          const { data: docData, error: docError } = await supabase
            .from('documents')
            .insert({
              owner_type: 'supply',
              owner_id: newSupplyId,
              name: supplyDocuments.invoiceFile.name,
              storage_path: storagePath,
              doc_type: 'INVOICE',
              document_type_code: 'INVOICE',
              uploaded_by: profileId ?? null,
            })
            .select('id')
            .single()

          if (docError) {
            throw docError
          }

          if (docData) {
            invoiceDocumentId = docData.id
          }
        }
        
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'INVOICE',
          value: supplyDocuments.invoiceNumber,
          date_value: null,
          boolean_value: null,
          document_id: invoiceDocumentId,
        })
      }

      // Driver license/name
      if (supplyDocuments.driverLicenseName) {
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'DRIVER_LICENSE',
          value: supplyDocuments.driverLicenseName,
          date_value: null,
          boolean_value: null,
          document_id: null,
        })
      }

      // Batch number
      if (supplyDocuments.batchNumber) {
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'BATCH_NUMBER',
          value: supplyDocuments.batchNumber,
          date_value: null,
          boolean_value: null,
          document_id: null,
        })
      }

      // COA available
      const availableDocumentTypes = await ensureSupplyDocumentTypes(
        supplyDocumentsPayload.map((row) => String((row as { document_type_code: unknown }).document_type_code ?? '')),
      )
      const filteredDocumentsPayload = supplyDocumentsPayload.filter((row) =>
        availableDocumentTypes.has(String((row as { document_type_code: unknown }).document_type_code ?? '')),
      )
      if (filteredDocumentsPayload.length > 0) {
        const { error: documentsError } = await supabase
          .from('supply_documents')
          .insert(filteredDocumentsPayload)
        if (documentsError) {
          throw documentsError
        }
      } else if (supplyDocumentsPayload.length > 0) {
        throw new Error('Supply document types are not configured. Please configure supply document types in settings.')
      }

      // Save vehicle inspection
      if (vehicleInspection.vehicleClean && vehicleInspection.noForeignObjects && vehicleInspection.noPestInfestation) {
        const { error: vehicleError } = await supabase
          .from('supply_vehicle_inspections')
          .insert({
            supply_id: newSupplyId,
            vehicle_clean: vehicleInspection.vehicleClean,
            no_foreign_objects: vehicleInspection.noForeignObjects,
            no_pest_infestation: vehicleInspection.noPestInfestation,
            inspected_by: profileId ?? null,
            remarks: vehicleInspection.remarks?.trim() || null,
          })
        if (vehicleError) {
          throw vehicleError
        }
      }

      // Save packaging quality checks
      if (
        packagingQuality.inaccurateLabelling &&
        packagingQuality.visibleDamage &&
        packagingQuality.specifiedQuantity &&
        packagingQuality.odor &&
        packagingQuality.strengthIntegrity
      ) {
        const { data: packagingCheckData, error: packagingCheckError } = await supabase
          .from('supply_packaging_quality_checks')
          .insert({
            supply_id: newSupplyId,
            checked_by: profileId ?? null,
            remarks: null,
          })
          .select('id')
          .single()

        if (packagingCheckError) {
          throw packagingCheckError
        }

        const packagingCheckId = packagingCheckData.id

        // Get packaging parameter IDs
        const { data: packagingParams, error: paramsError } = await supabase
          .from('packaging_quality_parameters')
          .select('id, code, name')
        
        if (paramsError) {
          throw paramsError
        }

        const packagingParamsMap = new Map<string, number>()
        ;(packagingParams || []).forEach((p: { id: number; code: string | null; name?: string | null }) => {
          packagingParamsMap.set(normalizePackagingParameterCode(p.code), p.id)
          packagingParamsMap.set(normalizePackagingParameterCode(p.name), p.id)
        })

        const packagingItemsPayload = [
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'INACCURATE_LABELLING'),
            value: packagingQuality.inaccurateLabelling,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'VISIBLE_DAMAGE'),
            value: packagingQuality.visibleDamage,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'SPECIFIED_QUANTITY', 'SPECIFIED_QUANTITY_UNITS'),
            value: null,
            numeric_value: parseNullableNumber(packagingQuality.specifiedQuantity),
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'ODOR', 'ODOUR'),
            value: packagingQuality.odor,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: resolvePackagingParameterId(packagingParamsMap, 'STRENGTH_INTEGRITY'),
            value: packagingQuality.strengthIntegrity,
            numeric_value: null,
          },
        ].filter((item) => item.parameter_id !== undefined)

        if (packagingItemsPayload.length > 0) {
          const { error: packagingItemsError } = await supabase
            .from('supply_packaging_quality_check_items')
            .insert(packagingItemsPayload)
          if (packagingItemsError) {
            throw packagingItemsError
          }
        }
      }

      // Save supplier sign-off
      console.log('Checking supplier sign-off:', {
        signatureType: supplierSignOff.signatureType,
        signedByName: supplierSignOff.signedByName,
        hasSignatureData: !!supplierSignOff.signatureData,
        hasDocumentFile: !!supplierSignOff.documentFile,
      })
      
      if (supplierSignOff.signatureType && supplierSignOff.signedByName) {
        let signOffDocumentId = null
        
        if (supplierSignOff.signatureType === 'UPLOADED_DOCUMENT' && supplierSignOff.documentFile) {
          const storagePath = buildStorageObjectPath(
            `supplies/${newSupplyId}/signatures`,
            `signature_${supplierSignOff.documentFile.name}`
          )
          await uploadStoredFile(storagePath, supplierSignOff.documentFile)

          const { data: docData, error: docError } = await supabase
            .from('documents')
            .insert({
              owner_type: 'supply',
              owner_id: newSupplyId,
              name: supplierSignOff.documentFile.name,
              storage_path: storagePath,
              doc_type: 'SIGNATURE',
              document_type_code: 'SIGNATURE',
              uploaded_by: profileId ?? null,
            })
            .select('id')
            .single()

          if (docError) {
            throw docError
          }

          if (docData) {
            signOffDocumentId = docData.id
          }
        }

        const signOffPayload: {
          supply_id: number
          signature_type: string
          signature_data: string | null
          document_id: number | null
          signed_by_name: string
          signed_by_user_id: string | null
          remarks: string | null
        } = {
          supply_id: newSupplyId,
          signature_type: supplierSignOff.signatureType,
          signature_data: supplierSignOff.signatureType === 'E_SIGNATURE' ? supplierSignOff.signatureData : null,
          document_id: signOffDocumentId,
          signed_by_name: supplierSignOff.signedByName,
          signed_by_user_id: profileId ? String(profileId) : null,
          remarks: supplierSignOff.remarks?.trim() || null,
        }

        const { error: signOffError, data: signOffData } = await supabase
          .from('supply_supplier_sign_offs')
          .insert(signOffPayload)
          .select()
        
        if (signOffError) {
          console.error('Error saving supplier sign-off:', signOffError)
          console.error('Payload:', signOffPayload)
          throw signOffError
        }
        
        console.log('Supplier sign-off saved successfully:', signOffData)
      }

      for (const [index, batch] of formData.supply_batches.entries()) {
        const amountPaidRaw = batch.amount_paid?.trim()
        const amountPaid = amountPaidRaw && Number.isFinite(Number(amountPaidRaw)) ? Number(amountPaidRaw) : 0
        if (amountPaid > 0) {
          const { error: paymentError } = await supabase.from('supply_payments').insert({
            supply_id: newSupplyId,
            amount: amountPaid,
            paid_at: receivedAtISO,
            reference: `Batch ${index + 1}`,
          })
          if (paymentError) {
            console.warn('Could not save amount paid for supply batch:', index + 1, paymentError)
            toast.warning('Supply saved but some batch payments could not be recorded. You can add them from the Payments page.')
          }
        }
      }

      await supabase.from('supply_activities').insert({
        supply_id: newSupplyId,
        type: 'SUPPLY_CREATED',
        description: `Supply captured (${validLines.length} batches, ${formData.supply_batches.length} lots)`,
        actor: profileId ?? null,
      })

      toast.success('Supply captured successfully.')
      const createdSupplyId = newSupplyId
      setFormData(getInitialFormData())
      setQualityEntriesByBatchKey({})
      setSupplyDocuments({
        invoiceNumber: '',
        driverLicenseName: '',
        batchNumber: '',
        invoiceFile: null,
      })
      setVehicleInspection({
        vehicleClean: '',
        noForeignObjects: '',
        noPestInfestation: '',
        remarks: '',
      })
      setPackagingQuality({
        inaccurateLabelling: '',
        visibleDamage: '',
        specifiedQuantity: '',
        odor: '',
        strengthIntegrity: '',
      })
      setSupplierSignOff({
        signatureType: '',
        signatureData: null,
        documentFile: null,
        signedByName: '',
        remarks: '',
      })
      setCurrentStep(0)
      setIsModalOpen(false)
      loadSuppliesData()
      navigate(`/supplies/${createdSupplyId}`, { replace: true })
    } catch (error) {
      console.error('Error capturing supply', error)
      const errorMessage = error instanceof Error ? error.message : 'Unable to capture supply.'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const loadSupplyForEdit = useCallback(
    async (supplyId: number) => {
      try {
        const [
          { data: supplyData, error: supplyError },
          { data: batchesData, error: batchesError },
          { data: docsData },
          { data: vehicleData },
          { data: packagingChecksData },
          { data: packagingItemsData },
          { data: qualityChecksData },
          { data: qualityItemsData },
          { data: signOffData },
          { data: operationalEntryData },
        ] = await Promise.all([
          supabase.from('supplies').select('*').eq('id', supplyId).single(),
          supabase.from('supply_batches').select('*').eq('supply_id', supplyId),
          supabase.from('supply_documents').select('*').eq('supply_id', supplyId),
          supabase.from('supply_vehicle_inspections').select('*').eq('supply_id', supplyId).maybeSingle(),
          supabase.from('supply_packaging_quality_checks').select('*').eq('supply_id', supplyId),
          supabase.from('supply_packaging_quality_check_items').select('*'),
          supabase.from('supply_quality_checks').select('*').eq('supply_id', supplyId).order('id', { ascending: false }),
          supabase.from('supply_quality_check_items').select('*'),
          supabase.from('supply_supplier_sign_offs').select('*').eq('supply_id', supplyId).maybeSingle(),
          supabase
            .from('operational_supply_entries')
            .select('id, delivery_reference, received_condition, remarks')
            .eq('supply_id', supplyId)
            .maybeSingle(),
        ])
        if (supplyError || !supplyData) throw supplyError ?? new Error('Supply not found')
        if (batchesError) throw batchesError
        const supply = supplyData as Record<string, unknown>
        const batches = (batchesData ?? []) as Array<{
          id: number
          lot_no?: string | null
          product_id: number
          unit_id: number | null
          outer_unit_id?: number | null
          outer_unit_qty?: number | null
          inner_units_per_outer?: number | null
          received_qty?: number
          accepted_qty?: number
          rejected_qty?: number
          unit_price?: number | null
          production_date?: string | null
          expiry_date?: string | null
        }>
        const batchIds = batches.map((batch) => Number(batch.id)).filter((id) => Number.isFinite(id))
        let batchCertificateDocs: Array<{
          id: number
          owner_id: number
          name: string
          storage_path: string
          expiry_date: string | null
        }> = []
        const lockedBatchIds = new Set<number>()
        if (batchIds.length > 0) {
          const { data: linkedRuns, error: linkedRunsError } = await supabase
            .from('process_lot_runs')
            .select('supply_batch_id')
            .in('supply_batch_id', batchIds)
          if (linkedRunsError) throw linkedRunsError
          ;(linkedRuns ?? []).forEach((row) => {
            const batchId = Number((row as { supply_batch_id: number | null }).supply_batch_id)
            if (Number.isFinite(batchId)) {
              lockedBatchIds.add(batchId)
            }
          })

          const { data: batchDocsData, error: batchDocsError } = await supabase
            .from('documents')
            .select('id, owner_id, name, storage_path, expiry_date, uploaded_at')
            .eq('owner_type', 'supply_batch')
            .eq('document_type_code', 'COA')
            .in('owner_id', batchIds)
            .order('uploaded_at', { ascending: false })
          if (batchDocsError) throw batchDocsError
          batchCertificateDocs = (batchDocsData ?? []) as Array<{
            id: number
            owner_id: number
            name: string
            storage_path: string
            expiry_date: string | null
          }>
        }
        const batchCertificateByOwnerId = new Map<number, (typeof batchCertificateDocs)[number]>()
        batchCertificateDocs.forEach((doc) => {
          const ownerId = Number(doc.owner_id)
          if (Number.isFinite(ownerId) && !batchCertificateByOwnerId.has(ownerId)) {
            batchCertificateByOwnerId.set(ownerId, doc)
          }
        })
        const docs = (docsData ?? []) as { document_type_code: string; value: string | null; date_value: string | null; boolean_value: boolean | null }[]
        const vehicle = vehicleData as Record<string, unknown> | null
        const packagingChecks = (packagingChecksData ?? []) as Array<{ id: number; lot_id?: number | null }>
        const packagingCheckIds = packagingChecks.map((check) => Number(check.id)).filter((id) => Number.isFinite(id))
        const packagingItems = (packagingItemsData ?? []).filter(
          (i: { packaging_check_id?: number }) => packagingCheckIds.includes(Number(i.packaging_check_id)),
        ) as Array<{ packaging_check_id: number; parameter_id: number; value: string | null; numeric_value: number | null }>
        const { data: packagingParamsData } = await supabase
          .from('packaging_quality_parameters')
          .select('id, code, name')
        const packagingParamMap = new Map<number, string>()
        ;(packagingParamsData ?? []).forEach((p: { id: number; code: string | null; name?: string | null }) => {
          packagingParamMap.set(p.id, normalizePackagingParameterCode(p.code || p.name))
        })
        const qualityChecks = (qualityChecksData ?? []) as Array<{ id: number; lot_id?: number | null }>
        const qualityCheckIds = qualityChecks.map((check) => Number(check.id)).filter((id) => Number.isFinite(id))
        const qualityItems = (qualityItemsData ?? []).filter((item: { quality_check_id?: number }) =>
          qualityCheckIds.includes(Number(item.quality_check_id)),
        ) as Array<{ quality_check_id: number; parameter_id: number; score: number | null; remarks: string | null; results: string | null }>
        const signOff = signOffData as Record<string, unknown> | null
        const supplyCategoryCode = String(supply.category_code ?? 'PRODUCT').toUpperCase()

        if (supplyCategoryCode === 'SERVICE') {
          const operationalEntry = operationalEntryData as
            | {
                delivery_reference?: string | null
                received_condition?: 'PASS' | 'HOLD' | 'REJECT' | ''
                remarks?: string | null
              }
            | null

          setFormData({
            category_code: 'SERVICE',
            doc_no: String(supply.doc_no ?? ''),
            warehouse_id: String(supply.warehouse_id ?? ''),
            supplier_id: String(supply.supplier_id ?? ''),
            received_at: supply.received_at ? toLocalDateTimeInput(new Date(supply.received_at as string)) : toLocalDateTimeInput(),
            received_by: currentUserName,
            doc_status: String(supply.doc_status ?? STATUS_OPTIONS[0]),
            supply_batches: [createEmptySupplyBatch()],
          })

          setOperationalDeliveryReference(String(operationalEntry?.delivery_reference ?? ''))
          setOperationalCondition((operationalEntry?.received_condition as 'PASS' | 'HOLD' | 'REJECT' | '') ?? '')
          setOperationalRemarks(String(operationalEntry?.remarks ?? ''))
          const paramByCode: Record<string, keyof PackagingQuality> = {
            INACCURATE_LABELLING: 'inaccurateLabelling',
            VISIBLE_DAMAGE: 'visibleDamage',
            SPECIFIED_QUANTITY: 'specifiedQuantity',
            SPECIFIED_QUANTITY_UNITS: 'specifiedQuantity',
            ODOR: 'odor',
            ODOUR: 'odor',
            STRENGTH_INTEGRITY: 'strengthIntegrity',
          }
          const packagingEntriesByCheckId = new Map<number, PackagingQuality>()
          packagingChecks.forEach((check) => {
            packagingEntriesByCheckId.set(Number(check.id), createEmptyPackagingQuality())
          })
          packagingItems.forEach((item) => {
            const packaging = packagingEntriesByCheckId.get(Number(item.packaging_check_id)) ?? createEmptyPackagingQuality()
            const code = normalizePackagingParameterCode(packagingParamMap.get(item.parameter_id))
            const field = paramByCode[code]
            if (field) {
              ;(packaging[field] as string) = item.value ?? (item.numeric_value != null ? String(item.numeric_value) : '')
              packagingEntriesByCheckId.set(Number(item.packaging_check_id), packaging)
            }
          })
          const packagingByLotId = new Map<number, PackagingQuality>()
          packagingChecks.forEach((check) => {
            const lotId = Number(check.lot_id)
            if (Number.isFinite(lotId)) {
              packagingByLotId.set(
                lotId,
                normalizePackagingQualityState(
                  packagingEntriesByCheckId.get(Number(check.id)) ?? createEmptyPackagingQuality(),
                ),
              )
            }
          })

          const operationalLines =
            batches.length > 0
              ? batches.map((batch) => ({
                  batch_id: Number(batch.id),
                  temp_key: `operational_${String(batch.id)}`,
                  product_id: String(batch.product_id ?? ''),
                  unit_id: batch.unit_id != null ? String(batch.unit_id) : '',
                  received_as_unit_id:
                    batch.outer_unit_id != null
                      ? String(batch.outer_unit_id)
                      : batch.unit_id != null
                        ? String(batch.unit_id)
                        : '',
                  outer_unit_qty:
                    batch.outer_unit_qty != null ? String(batch.outer_unit_qty) : '',
                  inner_units_per_outer:
                    batch.inner_units_per_outer != null ? String(batch.inner_units_per_outer) : '',
                  qty: String(batch.received_qty ?? 0),
                  unit_price: batch.unit_price != null ? String(batch.unit_price) : '',
                  amount_paid: '',
                  notes: '',
                }))
              : [createEmptyOperationalSupplyLine()]
          setOperationalSupplyLines(operationalLines)
          const operationalPackagingByKey: Record<string, PackagingQuality> = {}
          operationalLines.forEach((line, index) => {
            const lineKey = getOperationalLineKey(line, index)
            const batchId = Number(line.batch_id)
            operationalPackagingByKey[lineKey] =
              (Number.isFinite(batchId) ? packagingByLotId.get(batchId) : undefined) ?? createEmptyPackagingQuality()
          })
          setOperationalPackagingQualityByLineKey(operationalPackagingByKey)
          setEditLoadDone(true)
          return
        }

        const getDoc = (code: string) => docs.find((d) => d.document_type_code === code)
        const prodDoc = getDoc('PRODUCTION_DATE')
        const expDoc = getDoc('EXPIRY_DATE')
        const legacyProductionDate = (prodDoc?.date_value as string) ?? ''
        const legacyExpiryDate = (expDoc?.date_value as string) ?? ''
        setFormData({
          category_code: (supply.category_code as 'PRODUCT' | 'SERVICE') ?? 'PRODUCT',
          doc_no: String(supply.doc_no ?? ''),
          warehouse_id: String(supply.warehouse_id ?? ''),
          supplier_id: String(supply.supplier_id ?? ''),
          received_at: supply.received_at ? toLocalDateTimeInput(new Date(supply.received_at as string)) : toLocalDateTimeInput(),
          received_by: currentUserName,
          doc_status: String(supply.doc_status ?? STATUS_OPTIONS[0]),
          supply_batches:
            batches.length > 0
              ? batches.map((batch) => {
                  const received = Number(batch.received_qty ?? 0)
                  const accepted = Number(batch.accepted_qty ?? 0)
                  const rejected = Number(batch.rejected_qty ?? received - accepted)
                  const productionDate = String(batch.production_date ?? legacyProductionDate ?? '').trim()
                  const expiryDate = String(batch.expiry_date ?? legacyExpiryDate ?? '').trim()
                  const certificate = batchCertificateByOwnerId.get(Number(batch.id))
                  return {
                    batch_id: Number(batch.id),
                    temp_key: `edit_${String(batch.id)}`,
                    lot_no: String(batch.lot_no ?? ''),
                    is_locked: lockedBatchIds.has(Number(batch.id)),
                    product_id: String(batch.product_id),
                    unit_id: batch.unit_id != null ? String(batch.unit_id) : '',
                    qty: String(received),
                    accepted_qty: String(accepted),
                    rejected_qty: String(rejected >= 0 ? rejected : 0),
                    unit_price: batch.unit_price != null ? String(batch.unit_price) : '',
                    amount_paid: '',
                    production_date: productionDate || '',
                    expiry_date: expiryDate || '',
                    coa_document_id: certificate?.id ?? null,
                    coa_document_name: certificate?.name ?? '',
                    coa_storage_path: certificate?.storage_path ?? '',
                    coa_expiry_date: certificate?.expiry_date ?? '',
                    coa_file: null,
                  }
                })
              : [
                  {
                    ...createEmptySupplyBatch(),
                  },
                ],
        })
        const invDoc = getDoc('INVOICE')
        const driverDoc = getDoc('DRIVER_LICENSE')
        const batchDoc = getDoc('BATCH_NUMBER')
        setSupplyDocuments({
          invoiceNumber: (invDoc?.value as string) ?? '',
          driverLicenseName: (driverDoc?.value as string) ?? '',
          batchNumber: (batchDoc?.value as string) ?? '',
          invoiceFile: null,
        })
        setVehicleInspection({
          vehicleClean: toYesNoNa(vehicle?.vehicle_clean),
          noForeignObjects: toYesNoNa(vehicle?.no_foreign_objects),
          noPestInfestation: toYesNoNa(vehicle?.no_pest_infestation),
          remarks: (vehicle?.remarks as string) ?? '',
        })
        const paramByCode: Record<string, string> = {
          INACCURATE_LABELLING: 'inaccurateLabelling',
          VISIBLE_DAMAGE: 'visibleDamage',
          SPECIFIED_QUANTITY: 'specifiedQuantity',
          SPECIFIED_QUANTITY_UNITS: 'specifiedQuantity',
          ODOR: 'odor',
          ODOUR: 'odor',
          STRENGTH_INTEGRITY: 'strengthIntegrity',
        }
        const packagingMap: Record<string, string> = {}
        packagingItems.forEach((item) => {
          const code = normalizePackagingParameterCode(packagingParamMap.get(item.parameter_id))
          const key = paramByCode[code]
          if (key) {
            packagingMap[key] = item.value ?? (item.numeric_value != null ? String(item.numeric_value) : '')
          }
        })
        setPackagingQuality({
          inaccurateLabelling: toYesNoNa(packagingMap.inaccurateLabelling),
          visibleDamage: toYesNoNa(packagingMap.visibleDamage),
          specifiedQuantity: packagingMap.specifiedQuantity ?? '',
          odor: toYesNoNa(packagingMap.odor),
          strengthIntegrity: toStrengthIntegrity(packagingMap.strengthIntegrity),
        })
        setOperationalPackagingQualityByLineKey({})
        const entriesByQualityCheckId = new Map<number, QualityEntries>()
        qualityChecks.forEach((check) => {
          entriesByQualityCheckId.set(Number(check.id), createInitialQualityEntries(qualityParameters))
        })
        qualityItems.forEach((item) => {
          const checkEntries =
            entriesByQualityCheckId.get(Number(item.quality_check_id)) ??
            createInitialQualityEntries(qualityParameters)
          const param = qualityParameters.find((p) => p.id === item.parameter_id)
          if (param?.code) {
            checkEntries[param.code] = {
              score: item.score ?? 3,
              remarks: item.remarks ?? '',
              results: item.results ?? '',
            }
            entriesByQualityCheckId.set(Number(item.quality_check_id), checkEntries)
          }
        })

        const lotQualityEntries = new Map<number, QualityEntries>()
        let legacyEntries: QualityEntries | null = null
        qualityChecks.forEach((check) => {
          const resolvedEntries = entriesByQualityCheckId.get(Number(check.id)) ?? createInitialQualityEntries(qualityParameters)
          const lotId = Number(check.lot_id)
          if (Number.isFinite(lotId)) {
            lotQualityEntries.set(lotId, resolvedEntries)
          } else if (!legacyEntries) {
            legacyEntries = resolvedEntries
          }
        })

        const batchEntriesByKey: Record<string, QualityEntries> = {}
        const loadedBatches =
          batches.length > 0
            ? batches
            : [{ id: -1, lot_no: '', product_id: 0, unit_id: null, received_qty: 0, accepted_qty: 0, rejected_qty: 0 }]
        loadedBatches.forEach((batch, index) => {
          const batchId = Number(batch.id)
          const batchKey = Number.isFinite(batchId) ? `batch:${batchId}` : `temp:load_${index}`
          batchEntriesByKey[batchKey] =
            lotQualityEntries.get(batchId) ??
            legacyEntries ??
            createInitialQualityEntries(qualityParameters)
        })
        setQualityEntriesByBatchKey(batchEntriesByKey)
        setSupplierSignOff({
          signatureType: signOff?.signature_type === 'E_SIGNATURE' ? 'E_SIGNATURE' : signOff?.signature_type === 'UPLOADED_DOCUMENT' ? 'UPLOADED_DOCUMENT' : '',
          signatureData: (signOff?.signature_data as string) ?? null,
          documentFile: null,
          signedByName: (signOff?.signed_by_name as string) ?? '',
          remarks: (signOff?.remarks as string) ?? '',
        })
        setEditLoadDone(true)
      } catch (err) {
        console.error('Error loading supply for edit', err)
        toast.error('Failed to load supply for editing.')
        setEditingSupplyId(null)
        setIsModalOpen(false)
      }
    },
    [qualityParameters, currentUserName],
  )

  useEffect(() => {
    if (isModalOpen && editingSupplyId != null && !loadingData && !editLoadDone) {
      loadSupplyForEdit(editingSupplyId)
    }
  }, [isModalOpen, editingSupplyId, loadingData, editLoadDone, loadSupplyForEdit])

  const closeModal = () => {
    const shouldReturnToDetail = Boolean(routeSupplyId && location.pathname.endsWith('/edit'))
    const returnSupplyId = routeSupplyId
    const backgroundPath = (
      location.state as { backgroundLocation?: { pathname?: string } } | null
    )?.backgroundLocation?.pathname
    setIsModalOpen(false)
    setEditingSupplyId(null)
    setEditLoadDone(false)
    setFormData(getInitialFormData())
    setQualityEntriesByBatchKey({})
    setSupplyDocuments({
      invoiceNumber: '',
      driverLicenseName: '',
      batchNumber: '',
      invoiceFile: null,
    })
    setVehicleInspection({
      vehicleClean: '',
      noForeignObjects: '',
      noPestInfestation: '',
      remarks: '',
    })
    setPackagingQuality({
      inaccurateLabelling: '',
      visibleDamage: '',
      specifiedQuantity: '',
      odor: '',
      strengthIntegrity: '',
    })
    setOperationalPackagingQualityByLineKey({})
    setSupplierSignOff({
      signatureType: '',
      signatureData: null,
      documentFile: null,
      signedByName: '',
      remarks: '',
    })
    setOperationalDeliveryReference('')
    setOperationalCondition('')
    setOperationalRemarks('')
    setOperationalSupplyLines([createEmptyOperationalSupplyLine()])
    setCurrentStep(0)
    if (shouldReturnToDetail && returnSupplyId) {
      const returnPath =
        backgroundPath && backgroundPath.startsWith('/supplies/operational/')
          ? `/supplies/operational/${returnSupplyId}`
          : `/supplies/${returnSupplyId}`
      navigate(returnPath, { replace: true })
    }
  }

  const handleRowClick = (supply: Supply) => {
    const batches = supplyBatches.filter((batch) => batch.supply_id === supply.id)
    const qualityChecksForSupply = supplyQualityChecks.filter((check) => check.supply_id === supply.id)
    const qualityItemsForSupply = supplyQualityItems
      .filter((item) => qualityChecksForSupply.some((check) => check.id === item.quality_check_id))
      .map((item) => {
        const parameterId = item.parameter_id as number | undefined
        const parameter = qualityParameters.find(
          (entry) => entry.id && parameterId && String(entry.id) === String(parameterId),
        )
        return {
          ...item,
          parameter_code: parameter?.code ?? null,
          parameter_name: parameter?.name ?? null,
          parameter_specification: parameter?.specification ?? null,
        }
      })
    const supplyDocumentsForSupply = fetchedSupplyDocuments.filter((doc) => doc.supply_id === supply.id)
    const vehicleInspectionForSupply = vehicleInspections.find((insp) => insp.supply_id === supply.id)
    const packagingChecksForSupply = packagingChecks.filter((check) => check.supply_id === supply.id)
    const packagingCheckIdsForSupply = packagingChecksForSupply.map((check) => Number(check.id)).filter((id) => Number.isFinite(id))
    const packagingItemsForSupply = packagingItems.filter((item) =>
      packagingCheckIdsForSupply.includes(Number(item.packaging_check_id)),
    )
    const supplierSignOffForSupply = supplierSignOffs.find((signOff) => signOff.supply_id === supply.id)
    const supplierLookup = Object.fromEntries(supplierLabelMap.entries())
    const warehouseLookup = Object.fromEntries(warehouseLabelMap.entries())
    const productLookup = Object.fromEntries(
      (products ?? [])
        .filter((product): product is Product => product?.id !== undefined && product?.id !== null)
        .map((product) => [
          String(product.id),
          { name: String(product.name ?? ''), sku: String(product.sku ?? '') },
        ]),
    )
    const unitLookup = Object.fromEntries(
      (units ?? [])
        .filter((unit): unit is Unit => unit?.id !== undefined && unit?.id !== null)
        .map((unit) => [
          String(unit.id),
          { name: String(unit.name ?? ''), symbol: String(unit.symbol ?? '') },
        ]),
    )
    const profileLookup = Object.fromEntries(
      (userProfiles ?? [])
        .filter((profile): profile is UserProfile => profile?.id !== undefined && profile?.id !== null)
        .map((profile) => [
          String(profile.id),
          { full_name: String(profile.full_name ?? ''), email: String(profile.email ?? '') },
        ]),
    )
    const detailPath =
      String(supply.category_code ?? '').toUpperCase() === 'SERVICE'
        ? `/supplies/operational/${supply.id}`
        : `/supplies/${supply.id}`

    navigate(detailPath, {
      state: {
        supply,
        supplyBatches: batches,
        supplyQualityChecks: qualityChecksForSupply,
        supplyQualityItems: qualityItemsForSupply,
        qualityParameters,
        supplyDocuments: supplyDocumentsForSupply,
        vehicleInspection: vehicleInspectionForSupply,
        packagingChecks: packagingChecksForSupply,
        packagingItems: packagingItemsForSupply,
        supplierSignOff: supplierSignOffForSupply,
        supplierLookup,
        warehouseLookup,
        productLookup,
        unitLookup,
        profileLookup,
      },
    })
  }

  const handleOpenModal = useCallback(() => {
    const initialData = getInitialFormData()
    // Set first warehouse as default if available
    if (warehouses.length > 0 && !initialData.warehouse_id) {
      initialData.warehouse_id = String(warehouses[0]!.id)
    }
    setFormData(initialData)
    setQualityEntriesByBatchKey({})
    setSupplyDocuments({
      invoiceNumber: '',
      driverLicenseName: '',
      batchNumber: '',
      invoiceFile: null,
    })
    setVehicleInspection({
      vehicleClean: '',
      noForeignObjects: '',
      noPestInfestation: '',
      remarks: '',
    })
    setPackagingQuality({
      inaccurateLabelling: '',
      visibleDamage: '',
      specifiedQuantity: '',
      odor: '',
      strengthIntegrity: '',
    })
    setOperationalPackagingQualityByLineKey({})
    setSupplierSignOff({
      signatureType: '',
      signatureData: null,
      documentFile: null,
      signedByName: '',
      remarks: '',
    })
    setOperationalDeliveryReference('')
    setOperationalCondition('')
    setOperationalRemarks('')
    setOperationalSupplyLines([createEmptyOperationalSupplyLine()])
    setCurrentStep(0)
    setIsModalOpen(true)
  }, [getInitialFormData, warehouses, qualityParameters])

  const openSupplyTourModal = useCallback(
    (stepIndex: number, flow?: 'PRODUCT' | 'OPERATIONAL') => {
      handleOpenModal()
      if (flow) {
        setFormData((previous) => ({
          ...previous,
          category_code: flow === 'OPERATIONAL' ? 'SERVICE' : 'PRODUCT',
          supplier_id: '',
        }))
        setOperationalDeliveryReference('')
        setOperationalCondition('')
        setOperationalRemarks('')
        setOperationalSupplyLines([createEmptyOperationalSupplyLine()])
        setOperationalPackagingQualityByLineKey({})
      }
      setCurrentStep(stepIndex)
    },
    [handleOpenModal],
  )

  const modalSteps = useMemo(() => {
    if (isOperationalFlow) {
      return OPERATIONAL_STEPS.map((label, index) => ({ label, stepIndex: index }))
    }
    if (!isEditingSupply) {
      return STEPS.map((label, index) => ({ label, stepIndex: index }))
    }
    return STEPS.slice(1).map((label, index) => ({ label, stepIndex: index + 1 }))
  }, [isEditingSupply, isOperationalFlow])
  const minimumModalStepIndex = isEditingSupply ? 1 : 0
  const lastModalStepIndex =
    modalSteps.length > 0 ? modalSteps[modalSteps.length - 1]!.stepIndex : minimumModalStepIndex
  const isLastStep = currentStep === lastModalStepIndex
  const isOperationalLineStepBlocked = useMemo(() => {
    if (!isOperationalFlow || currentStep !== 2) return false
    if (operationalMappedProducts.length === 0) return true
    return !operationalSupplyLines.some((line) => {
      const qty = Number.parseFloat(line.qty)
      const unitPrice = Number.parseFloat(line.unit_price)
      return (
        Boolean(line.product_id) &&
        Boolean(line.unit_id) &&
        operationalMappedProductIdSet.has(line.product_id) &&
        Number.isFinite(qty) &&
        qty > 0 &&
        Number.isFinite(unitPrice) &&
        unitPrice > 0
      )
    })
  }, [
    currentStep,
    isOperationalFlow,
    operationalMappedProductIdSet,
    operationalMappedProducts.length,
    operationalSupplyLines,
  ])

  const tourSteps = useMemo<TourStep[]>(() => {
    const steps: TourStep[] = [
      {
        id: 'overview',
        target: '[data-tour="supplies-overview"]',
        title: 'Supplies overview',
        description: 'Review totals for received supplies before diving into the detailed records.',
        placement: 'bottom',
      },
      {
        id: 'tabs',
        target: '[data-tour="supplies-tabs"]',
        title: 'Switch between supply types',
        description: 'Product supplies track raw or material receipts. Operational supplies cover packaging, fuel, and services.',
        placement: 'bottom',
        beforeEnter: () => {
          setActiveSupplyTab('product')
        },
      },
      {
        id: 'filters',
        target: '[data-tour="supplies-filters"]',
        title: 'Filter the list',
        description: 'Search by document or supplier, and narrow down by received date to find the right record quickly.',
        placement: 'top',
      },
      {
        id: 'table',
        target: '[data-tour="supplies-table"]',
        title: 'Review the supply list',
        description: 'Each row opens a detailed supply record with batches, quality results, and documents.',
        placement: 'top',
      },
      {
        id: 'add',
        target: '[data-tour="supplies-add-button"]',
        title: 'Start a new supply',
        description: 'Use this action anytime a new receipt arrives.',
        placement: 'left',
      },
      {
        id: 'category',
        target: '[data-tour="supplies-category-section"]',
        title: 'Choose the supply category',
        description: 'Pick the supply flow that matches the delivery you are recording.',
        placement: 'top',
        beforeEnter: () => {
          openSupplyTourModal(0)
        },
      },
      {
        id: 'tour-choice',
        target: '[data-tour="supplies-category-section"]',
        title: 'Which tour do you want to continue with?',
        description: 'Select a product or operational supply flow, then continue to the next steps.',
        placement: 'top',
        nextDisabled: tourFlow === null,
        actions: [
          {
            label: tourFlow === 'PRODUCT' ? 'Product supply selected' : 'Product supply',
            variant: tourFlow === 'PRODUCT' ? 'default' : 'outline',
            onSelect: () => {
              setTourFlow('PRODUCT')
              setFormData((previous) => ({
                ...previous,
                category_code: 'PRODUCT',
              }))
            },
          },
          {
            label: tourFlow === 'OPERATIONAL' ? 'Operational supply selected' : 'Operational supply',
            variant: tourFlow === 'OPERATIONAL' ? 'default' : 'outline',
            onSelect: () => {
              setTourFlow('OPERATIONAL')
              setFormData((previous) => ({
                ...previous,
                category_code: 'SERVICE',
              }))
            },
          },
        ],
        beforeEnter: () => {
          openSupplyTourModal(0)
        },
      },
    ]

    if (tourFlow === 'PRODUCT') {
      steps.push(
        {
          id: 'basic-info',
          target: '[data-tour="supplies-basic-info"]',
          title: 'Capture basic information',
          description: 'Record the warehouse, supplier, and received time for the incoming product supply.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(1, 'PRODUCT')
          },
        },
        {
          id: 'documents',
          target: '[data-tour="supplies-documents"]',
          title: 'Attach supply documents',
          description: 'Upload invoices and delivery documents so the record is complete.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(2, 'PRODUCT')
          },
        },
        {
          id: 'vehicle',
          target: '[data-tour="supplies-vehicle-inspections"]',
          title: 'Complete vehicle inspections',
          description: 'Confirm transport conditions before you accept the supply.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(3, 'PRODUCT')
          },
        },
        {
          id: 'packaging',
          target: '[data-tour="supplies-packaging-quality"]',
          title: 'Review packaging quality',
          description: 'Record packaging condition checks prior to batch entry.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(4, 'PRODUCT')
          },
        },
        {
          id: 'batches',
          target: '[data-tour="supplies-batches"]',
          title: 'Enter supply batches',
          description: 'Split the receipt into batches and record quantities, pricing, dates, and each batch COA.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(5, 'PRODUCT')
          },
        },
        {
          id: 'quality',
          target: '[data-tour="supplies-quality-evaluation"]',
          title: 'Evaluate quality per batch',
          description: 'Capture quality scores and results for each lot.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(6, 'PRODUCT')
          },
        },
        {
          id: 'signoff',
          target: '[data-tour="supplies-signoff"]',
          title: 'Collect supplier sign-off',
          description: 'Finalize the record with supplier acknowledgment or signature.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(7, 'PRODUCT')
          },
        },
        {
          id: 'submit',
          target: '[data-tour="supplies-submit-button"]',
          title: 'Save the supply',
          description: 'Submit the product supply when the information is ready.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(7, 'PRODUCT')
          },
        },
      )
    }

    if (tourFlow === 'OPERATIONAL') {
      steps.push(
        {
          id: 'receiving',
          target: '[data-tour="supplies-operational-receiving"]',
          title: 'Complete the receiving checklist',
          description: 'Capture warehouse, supplier, delivery reference, and condition.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(1, 'OPERATIONAL')
          },
        },
        {
          id: 'operational-batches',
          target: '[data-tour="supplies-operational-batches"]',
          title: 'Add operational supply lines',
          description: 'List the operational products, quantities, and pricing for this delivery.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(2, 'OPERATIONAL')
          },
        },
        {
          id: 'operational-packaging',
          target: '[data-tour="supplies-operational-packaging"]',
          title: 'Record packaging quality',
          description: 'Check packaging condition for each operational line before review.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(3, 'OPERATIONAL')
          },
        },
        {
          id: 'operational-review',
          target: '[data-tour="supplies-operational-review"]',
          title: 'Review the operational supply',
          description: 'Confirm the summary details before saving.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(4, 'OPERATIONAL')
          },
        },
        {
          id: 'operational-submit',
          target: '[data-tour="supplies-submit-button"]',
          title: 'Finish the flow',
          description: 'Save the operational supply once everything looks right.',
          placement: 'top',
          beforeEnter: () => {
            openSupplyTourModal(4, 'OPERATIONAL')
          },
        },
      )
    }

    return steps
  }, [openSupplyTourModal, setActiveSupplyTab, setFormData, tourFlow])

  const {
    closeTour,
    currentStep: currentTourStep,
    currentStepIndex: currentTourStepIndex,
    isLastStep: isTourLastStep,
    isOpen: isTourOpen,
    nextStep,
    openTour,
    previousStep,
  } = useSettingsTour(tourSteps)

  const handleOpenTour = useCallback(async () => {
    setTourFlow(null)
    await openTour()
  }, [openTour])

  const handleCloseTour = useCallback(() => {
    setTourFlow(null)
    closeTour()
  }, [closeTour])

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive dark:focus:ring-olive/40'

  const sectionCardClass =
    'rounded-xl border border-olive-light/40 bg-olive-light/10 p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900/40'

  useEffect(() => {
    if (!isOperationalFlow) {
      setOperationalMappedProducts([])
      return
    }
    const opProducts = products
      .filter((product) => String(product.product_type ?? '').toUpperCase() === 'OP')
      .map((product) => ({
        id: Number(product.id),
        name: String(product.name ?? ''),
        sku: String(product.sku ?? ''),
        product_type: 'OP' as const,
        base_unit_id: product.base_unit_id != null ? Number(product.base_unit_id) : null,
      }))
    setOperationalMappedProducts(opProducts)
  }, [isOperationalFlow, products])

  useEffect(() => {
    if (suppliersError) {
      toast.error(suppliersError.message ?? 'Unable to load suppliers from Supabase.')
    }
  }, [suppliersError])

  useEffect(() => {
    setQualityEntriesByBatchKey((previous) => {
      const activeKeys = new Set(
        formData.supply_batches.map((batch, index) => getSupplyBatchQualityKey(batch, index)),
      )
      const next: Record<string, QualityEntries> = {}
      let changed = false

      activeKeys.forEach((batchKey) => {
        const synced = syncQualityEntriesWithParameters(qualityParameters, previous[batchKey])
        next[batchKey] = synced
        if (!previous[batchKey] || previous[batchKey] !== synced) {
          changed = true
        }
      })

      Object.keys(previous).forEach((batchKey) => {
        if (!activeKeys.has(batchKey)) {
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [formData.supply_batches, qualityParameters])

  const loadReferenceData = useCallback(async () => {
    try {
      const [
        warehousesResponse,
        productsResponse,
        unitsResponse,
        qualityParametersResponse,
        supplierTypesResponse,
      ] = await Promise.all([
        supabase.from('warehouses').select('id, name').order('name', { ascending: true }),
        supabase.from('products').select('id, name, sku, product_type, base_unit_id').order('name', { ascending: true }),
        supabase.from('units').select('id, name, symbol').order('name', { ascending: true }),
        supabase.from('quality_parameters').select('id, code, name').order('id', {
          ascending: true,
        }),
        supabase.from('supplier_types').select('code, category_code'),
      ])

      if (warehousesResponse.error) throw warehousesResponse.error
      if (productsResponse.error) throw productsResponse.error
      if (unitsResponse.error) throw unitsResponse.error
      if (qualityParametersResponse.error) throw qualityParametersResponse.error
      if (supplierTypesResponse.error) throw supplierTypesResponse.error

      setWarehouses((warehousesResponse.data ?? []) as Warehouse[])
      setProducts((productsResponse.data ?? []) as Product[])
      setUnits((unitsResponse.data ?? []) as Unit[])
      setSupplierTypeCategories(
        ((supplierTypesResponse.data ?? []) as Array<{ code: string; category_code: 'PRODUCT' | 'SERVICE' | null }>)
          .filter((entry) => !!entry.code && !!entry.category_code)
          .map((entry) => ({ code: entry.code, category_code: entry.category_code as 'PRODUCT' | 'SERVICE' })),
      )

      const qualityData = qualityParametersResponse.data ?? []
      if (qualityData.length > 0) {
        const mappedParameters: QualityParameterWithId[] = qualityData.map((entry) => ({
          id: entry.id ?? null,
          code: entry.code,
          name: entry.name,
          specification: '',
          defaultRemarks: '',
        }))
        setQualityParameters(mappedParameters)
      } else {
        setQualityParameters([])
        setQualityEntriesByBatchKey({})
        toast.warning('No quality parameters found in database. Please configure quality parameters in settings.')
      }
    } catch (error) {
      console.error('Error loading reference data', error)
      toast.error('Unable to load reference data for supplies.')
    }
  }, [])

  const loadSuppliesData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [
        suppliesResponse,
        batchesResponse,
        qualityChecksResponse,
        qualityItemsResponse,
        profilesResponse,
        supplyDocumentsResponse,
        vehicleInspectionsResponse,
        packagingChecksResponse,
        packagingItemsResponse,
        supplierSignOffsResponse,
      ] = await Promise.all([
        supabase
          .from('supplies')
          .select('id, category_code, doc_no, supplier_id, warehouse_id, received_at, created_at, doc_status, reference')
          .order('received_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from('supply_batches').select('id, supply_id, lot_no, product_id, unit_id, current_qty, received_qty, accepted_qty, rejected_qty, quality_status, unit_price, production_date, expiry_date'),
        supabase.from('supply_quality_checks').select('id, supply_id'),
        supabase.from('supply_quality_check_items').select('id, quality_check_id, parameter_id, results'),
        supabase.from('user_profiles').select('id, full_name, email'),
        supabase.from('supply_documents').select('*'),
        supabase.from('supply_vehicle_inspections').select('*'),
        supabase.from('supply_packaging_quality_checks').select('*'),
        supabase.from('supply_packaging_quality_check_items').select('*'),
        supabase.from('supply_supplier_sign_offs').select('*'),
      ])

      if (suppliesResponse.error) throw suppliesResponse.error
      if (batchesResponse.error) throw batchesResponse.error
      if (qualityChecksResponse.error) throw qualityChecksResponse.error
      if (qualityItemsResponse.error) throw qualityItemsResponse.error
      if (profilesResponse.error) throw profilesResponse.error
      if (supplyDocumentsResponse.error) throw supplyDocumentsResponse.error
      if (vehicleInspectionsResponse.error) throw vehicleInspectionsResponse.error
      if (packagingChecksResponse.error) throw packagingChecksResponse.error
      if (packagingItemsResponse.error) throw packagingItemsResponse.error
      if (supplierSignOffsResponse.error) throw supplierSignOffsResponse.error

      setSupplies((suppliesResponse.data ?? []) as Supply[])
      setSupplyBatches((batchesResponse.data ?? []) as SupplyBatchData[])
      setSupplyQualityChecks((qualityChecksResponse.data ?? []) as { [key: string]: unknown }[])
      setSupplyQualityItems((qualityItemsResponse.data ?? []) as { [key: string]: unknown }[])
      setFetchedSupplyDocuments((supplyDocumentsResponse.data ?? []) as { [key: string]: unknown }[])
      setVehicleInspections((vehicleInspectionsResponse.data ?? []) as { [key: string]: unknown }[])
      setPackagingChecks((packagingChecksResponse.data ?? []) as { [key: string]: unknown }[])
      setPackagingItems((packagingItemsResponse.data ?? []) as { [key: string]: unknown }[])
      setSupplierSignOffs((supplierSignOffsResponse.data ?? []) as { [key: string]: unknown }[])
      setUserProfiles((profilesResponse.data ?? []) as UserProfile[])
    } catch (error) {
      console.error('Error loading supplies data', error)
      toast.error('Unable to load supplies from Supabase.')
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    loadSuppliesData()
  }, [loadSuppliesData])

  useEffect(() => {
    const loadProfileId = async () => {
      if (!user?.id) {
        setProfileId(null)
        setUserProfileName('')
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('Unable to load user profile id', error)
        setProfileId(null)
        setUserProfileName('')
        return
      }

      setProfileId(data?.id ?? null)
      setUserProfileName(data?.full_name ?? '')
    }

    loadProfileId()
  }, [user?.id])

  const formScrollRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    if (formScrollRef.current) {
      formScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentStep])

  // Set first warehouse as default when modal opens and warehouses are available
  useEffect(() => {
    if (isModalOpen && warehouses.length > 0 && !formData.warehouse_id) {
      setFormData((prev) => ({
        ...prev,
        warehouse_id: String(warehouses[0]!.id),
      }))
    }
  }, [isModalOpen, warehouses, formData.warehouse_id])

  // Open modal in edit mode when navigating from detail with editSupplyId
  useEffect(() => {
    const editId = (location.state as { editSupplyId?: number })?.editSupplyId
    if (editId != null && Number.isFinite(editId)) {
      setEditingSupplyId(editId)
      setIsModalOpen(true)
      setEditLoadDone(false)
      setCurrentStep(1)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  // Direct edit route: /supplies/:supplyId/edit
  useEffect(() => {
    if (loadingData || !routeSupplyId || !location.pathname.endsWith('/edit')) {
      return
    }
    const routeEditId = Number.parseInt(routeSupplyId, 10)
    if (!Number.isFinite(routeEditId)) {
      return
    }
    if (isModalOpen && editingSupplyId === routeEditId) {
      return
    }
    setEditingSupplyId(routeEditId)
    setIsModalOpen(true)
    setEditLoadDone(false)
    setCurrentStep(1)
  }, [routeSupplyId, location.pathname, loadingData, isModalOpen, editingSupplyId])

  if (loadingData && !isDirectEditRoute) {
    return (
      <PageLayout
        title="Supplies"
        activeItem="supplies"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading supplies data..." />
      </PageLayout>
    )
  }

  if (isDirectEditRoute && !isModalOpen) {
    if (modalOnly) {
      return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="rounded-xl border border-olive-light/40 bg-white px-6 py-4 shadow-lg">
            <Spinner text="Opening supply editor..." />
          </div>
        </div>
      )
    }
    return (
      <PageLayout
        title="Edit Supply"
        activeItem="supplies"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Opening supply editor..." />
      </PageLayout>
    )
  }

  return (
    <>
      {!isDirectEditRoute && (
        <PageLayout
          title="Supplies"
          activeItem="supplies"
          actions={
            <>
              <Button variant="outline" onClick={() => void handleOpenTour()}>
                <Sparkles className="mr-2 h-4 w-4" />
                Take tour
              </Button>
              <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal} data-tour="supplies-add-button">
                <Plus className="mr-2 h-4 w-4" />
                New Supply
              </Button>
            </>
          }
          contentClassName="px-4 sm:px-6 lg:px-8 py-8"
        >
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3" data-tour="supplies-overview">
              <Card className="border-olive-light/30">
                <CardHeader className="pb-2">
                  <CardDescription>Total records</CardDescription>
                  <CardTitle className="text-2xl font-semibold text-text-dark">
                    {filteredSupplies.length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-olive-light/30">
                <CardHeader className="pb-2">
                  <CardDescription>Accepted quantity</CardDescription>
                  <CardTitle className="text-2xl font-semibold text-text-dark">
                    {totalAcceptedKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="border-olive-light/30">
                <CardHeader className="pb-2">
                  <CardDescription>Pending quality</CardDescription>
                  <CardTitle className="text-2xl font-semibold text-text-dark">
                    {pendingQualityKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card className="bg-white border-olive-light/30">
              <CardHeader>
                <CardTitle className="text-text-dark">Supplies</CardTitle>
                <CardDescription>
                  Track inbound receipts. Click a record to open the detailed supply page.
                </CardDescription>
              </CardHeader>
              <div className="border-b border-olive-light/40" data-tour="supplies-tabs">
                <nav className="flex gap-0 px-6" aria-label="Supply category tabs">
                  <button
                    type="button"
                    onClick={() => setActiveSupplyTab('product')}
                    className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                      activeSupplyTab === 'product'
                        ? 'border-olive text-olive-dark text-text-dark'
                        : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
                    }`}
                  >
                    <Package className="h-4 w-4" />
                    Product Supplies
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSupplyTab('operational')}
                    className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                      activeSupplyTab === 'operational'
                        ? 'border-olive text-olive-dark text-text-dark'
                        : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
                    }`}
                  >
                    <Briefcase className="h-4 w-4" />
                    Operational Supplies
                  </button>
                </nav>
              </div>
              <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-tour="supplies-filters">
                <div className="lg:col-span-2">
                  <Label htmlFor="supply-search">Search supplies</Label>
                  <Input
                    id="supply-search"
                    placeholder="Search by document, warehouse, or supplier"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="relative lg:col-span-1" ref={datePickerRef}>
                  <Label htmlFor="date-range-picker">Received date range</Label>
                  <Button
                    id="date-range-picker"
                    type="button"
                    variant="outline"
                    className="mt-1 flex w-full items-center justify-between border border-olive-light/60 text-left text-sm text-text-dark"
                    onClick={handleToggleDatePicker}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-olive-dark" />
                      <span>{dateRangeLabel}</span>
                    </span>
                  </Button>
                  {isDatePickerOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-olive-light/60 bg-white shadow-lg">
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={handlePrevMonth}
                            className="rounded-md border border-olive-light/60 p-1 text-olive hover:bg-olive-light/30"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <span className="text-sm font-medium text-text-dark">
                            {new Intl.DateTimeFormat('en-ZA', {
                              month: 'long',
                              year: 'numeric',
                            }).format(displayedMonth)}
                          </span>
                          <button
                            type="button"
                            onClick={handleNextMonth}
                            disabled={!canGoNextMonth}
                            className={`rounded-md border border-olive-light/60 p-1 ${
                              canGoNextMonth
                                ? 'text-olive hover:bg-olive-light/30'
                                : 'cursor-not-allowed text-text-dark/30'
                            }`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-text-dark/60">
                          {WEEK_DAYS.map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {monthGrid.map((day) => {
                            const isDisabled = day > today
                            const isOutside = day.getMonth() !== displayedMonth.getMonth()
                            const isStart = draftFromDate && isSameDay(day, draftFromDate)
                            const isEnd = draftToDate && isSameDay(day, draftToDate)
                            const inRange = draftFromDate && draftToDate && isBetween(day, draftFromDate, draftToDate)

                            let dayButtonClass =
                              'flex h-9 w-9 items-center justify-center rounded-md text-sm transition-colors'

                            if (isDisabled) {
                              dayButtonClass += ' cursor-not-allowed text-text-dark/30'
                            } else {
                              dayButtonClass += ' cursor-pointer hover:bg-olive-light/40'
                            }

                            if (isOutside) {
                              dayButtonClass += ' text-text-dark/40'
                            }

                            if (inRange) {
                              dayButtonClass += ' bg-olive-light/50 text-text-dark'
                            }

                            if (isStart || isEnd) {
                              dayButtonClass += ' bg-olive text-white hover:bg-olive-dark'
                            }

                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                className={dayButtonClass}
                                onClick={() => handleDaySelect(day)}
                                disabled={isDisabled}
                              >
                                {day.getDate()}
                              </button>
                            )
                          })}
                        </div>
                        <div className="rounded-md bg-olive-light/10 px-3 py-2 text-xs text-text-dark/70">
                          <div>From: {draftFromDate ? formatDisplayDate(draftFrom) : '—'}</div>
                          <div>To: {draftToDate ? formatDisplayDate(draftTo) : '—'}</div>
                        </div>
                        <div className="flex justify-between">
                          <Button type="button" variant="ghost" onClick={handleClearDateRange}>
                            Clear
                          </Button>
                          <Button
                            type="button"
                            className="bg-olive hover:bg-olive-dark disabled:cursor-not-allowed disabled:bg-olive-light/60"
                            onClick={handleApplyDateRange}
                            disabled={!draftFrom}
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div data-tour="supplies-table">
                <ResponsiveTable
                  columns={columns}
                  data={paginatedSupplies}
                  rowKey="id"
                  onRowClick={handleRowClick}
                  tableClassName=""
                  mobileCardClassName=""
                  getRowClassName={() => ''}
                />
              </div>
              {filteredSupplies.length > 0 && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-olive-light/20 pt-4 sm:flex-row">
                  <p className="text-xs text-text-dark/60">
                    Showing {(currentPage - 1) * pageSize + 1}-
                    {Math.min(currentPage * pageSize, filteredSupplies.length)} of {filteredSupplies.length} supplies
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-text-dark/70">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
              </CardContent>
            </Card>
          </div>
        </PageLayout>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6">
          <div className="flex w-full max-w-5xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-olive-light/40 bg-white shadow-2xl">
            <div className="flex flex-col gap-2 border-b border-olive-light/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>
                <h2 className="text-2xl font-semibold text-text-dark">
                  {editingSupplyId ? 'Edit Supply' : 'New Supply'}
                </h2>
                <p className="text-sm text-text-dark/70">
                  {editingSupplyId ? 'Update supply details and related records.' : 'Capture a new receipt or load from staging.'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeModal}
                className="self-end rounded-full text-text-dark hover:bg-olive-light/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="border-b border-olive-light/20 bg-olive-light/10 px-5 py-4 sm:px-6">
              <ol className="flex flex-wrap gap-3">
                {modalSteps.map(({ label, stepIndex }, index) => {
                  const isActive = stepIndex === currentStep
                  const isComplete = stepIndex < currentStep
                  return (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => handleStepClick(stepIndex)}
                        disabled={isSubmitting || !isEditingSupply}
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                          isActive
                            ? 'bg-olive text-white'
                            : isComplete
                            ? 'bg-olive-light text-olive-dark'
                            : 'border border-olive-light/60 bg-white text-text-dark/60'
                        }`}
                      >
                        {index + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepClick(stepIndex)}
                        disabled={isSubmitting || !isEditingSupply}
                        className={`font-medium transition ${
                          isActive ? 'text-text-dark' : 'text-text-dark/60'
                        }`}
                      >
                        {label}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>

            {!editLoadDone && isEditingSupply ? (
              <div className="flex min-h-[18rem] items-center justify-center p-6">
                <Spinner text="Loading supply details..." />
              </div>
            ) : (
            <form ref={formScrollRef} onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-5 sm:p-6 lg:p-8">
                {isEditingSupply && (
                  <section className={sectionCardClass}>
                    <h3 className="text-lg font-semibold text-text-dark">Supply category</h3>
                    <p className="mt-1 text-sm text-text-dark/70">
                      Category is locked during edit to keep data consistency.
                    </p>
                    <div className="mt-4 inline-flex items-center rounded-full bg-olive-light/30 px-3 py-1.5 text-sm font-medium text-text-dark">
                      {formData.category_code === 'SERVICE' ? 'Operational supply' : 'Product supply'}
                    </div>
                  </section>
                )}

                {currentStep === 0 && !isEditingSupply && (
                  <section className={sectionCardClass} data-tour="supplies-category-section">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-text-dark">Supply category</h3>
                      <p className="text-sm text-text-dark/70">
                        Select the supply category to start the correct supply workflow.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {CATEGORY_OPTIONS.map((option) => {
                        const active = formData.category_code === option.code
                        const Icon = option.icon
                        return (
                          <button
                            key={option.code}
                            type="button"
                            className={`rounded-xl border p-5 text-left transition ${
                              active
                                ? 'border-olive bg-olive-light/30 shadow-sm'
                                : 'border-olive-light/40 bg-white hover:border-olive-light/70'
                            }`}
                            onClick={() =>
                              {
                                setFormData((previous) => ({
                                  ...previous,
                                  category_code: option.code,
                                  supplier_id: '',
                                }))
                                setOperationalDeliveryReference('')
                                setOperationalCondition('')
                                setOperationalRemarks('')
                                setOperationalSupplyLines([createEmptyOperationalSupplyLine()])
                                setOperationalPackagingQualityByLineKey({})
                              }
                            }
                            disabled={isSubmitting}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-5 w-5 text-olive-dark" />
                              <p className="text-base font-semibold text-text-dark">{option.name}</p>
                            </div>
                            <p className="mt-2 text-sm text-text-dark/70">{option.description}</p>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )}

                {currentStep === 1 && !isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-basic-info">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Basic Information</h3>
                        <p className="text-sm text-text-dark/70">
                          Key details required before receiving the stock.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="doc_no">Document number</Label>
                        <Input
                          id="doc_no"
                          value={formData.doc_no}
                          readOnly
                          className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70`}
                        />
                        <p className="text-xs text-text-dark/60">Automatically generated after saving.</p>
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="warehouse_id">Warehouse *</Label>
                        <select
                          id="warehouse_id"
                          required
                          className={baseFieldClass}
                          value={formData.warehouse_id}
                          onChange={(event) => handleInputChange('warehouse_id', event.target.value)}
                          disabled={isSubmitting || warehouses.length === 0}
                        >
                          <option value="">Select warehouse</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {String(warehouse.name)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="supplier_id">Supplier *</Label>
                        <SearchableSelect
                          id="supplier_id"
                          options={supplierSelectOptions}
                          value={formData.supplier_id}
                          onChange={(value) => handleInputChange('supplier_id', value)}
                          placeholder={suppliersLoading || categorySuppliersLoading ? 'Loading suppliers...' : 'Select supplier'}
                          disabled={isSubmitting || categorySuppliersLoading}
                          required
                          emptyMessage={
                            suppliersLoading || categorySuppliersLoading
                              ? 'Loading suppliers...'
                              : allowedSupplierTypeCodes.length === 0
                              ? 'No supplier type codes configured for this category.'
                              : filteredSupplierList.length === 0
                              ? 'No suppliers match the selected category.'
                              : 'No match'
                          }
                        />
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="received_at">Received at *</Label>
                        <Input
                          id="received_at"
                          type="datetime-local"
                          required
                          value={formData.received_at}
                          onChange={(event) => handleInputChange('received_at', event.target.value)}
                          className={baseFieldClass}
                        />
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="received_by">Received by</Label>
                        <Input
                          id="received_by"
                          value={formData.received_by}
                          readOnly
                          className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70`}
                          placeholder="Receiving operator"
                        />
                        <p className="text-xs text-text-dark/60">
                          Automatically assigned from the logged-in user.
                        </p>
                      </div>

                    </div>
                  </section>
                )}

                {currentStep === 1 && isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-operational-receiving">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-text-dark">Receiving checklist</h3>
                      <p className="text-sm text-text-dark/70">
                        Capture receiving details for operational supplies before confirmation.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="warehouse_id_operational">Warehouse *</Label>
                        <select
                          id="warehouse_id_operational"
                          required
                          className={baseFieldClass}
                          value={formData.warehouse_id}
                          onChange={(event) => handleInputChange('warehouse_id', event.target.value)}
                          disabled={isSubmitting || warehouses.length === 0}
                        >
                          <option value="">Select warehouse</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {String(warehouse.name)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="supplier_id_operational">Supplier *</Label>
                        <SearchableSelect
                          id="supplier_id_operational"
                          options={supplierSelectOptions}
                          value={formData.supplier_id}
                          onChange={(value) => handleInputChange('supplier_id', value)}
                          placeholder={suppliersLoading || categorySuppliersLoading ? 'Loading suppliers...' : 'Select supplier'}
                          disabled={isSubmitting || categorySuppliersLoading}
                          required
                          emptyMessage={
                            suppliersLoading || categorySuppliersLoading
                              ? 'Loading suppliers...'
                              : allowedSupplierTypeCodes.length === 0
                              ? 'No supplier type codes configured for this category.'
                              : 'No suppliers match the selected category.'
                          }
                        />
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="received_at_operational">Received at *</Label>
                        <Input
                          id="received_at_operational"
                          type="datetime-local"
                          required
                          value={formData.received_at}
                          onChange={(event) => handleInputChange('received_at', event.target.value)}
                          className={baseFieldClass}
                        />
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="operational_delivery_reference">Delivery reference *</Label>
                        <Input
                          id="operational_delivery_reference"
                          value={operationalDeliveryReference}
                          onChange={(event) => setOperationalDeliveryReference(event.target.value)}
                          placeholder="Delivery note / invoice / GRN reference"
                          className={baseFieldClass}
                        />
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="operational_condition">Received condition *</Label>
                        <select
                          id="operational_condition"
                          value={operationalCondition}
                          onChange={(event) =>
                            setOperationalCondition(event.target.value as 'PASS' | 'HOLD' | 'REJECT' | '')
                          }
                          className={baseFieldClass}
                        >
                          <option value="">Select condition</option>
                          <option value="PASS">Pass</option>
                          <option value="HOLD">Hold</option>
                          <option value="REJECT">Reject</option>
                        </select>
                      </div>

                      <div className="space-y-2 lg:col-span-6">
                        <Label htmlFor="operational_remarks">Remarks</Label>
                        <Input
                          id="operational_remarks"
                          value={operationalRemarks}
                          onChange={(event) => setOperationalRemarks(event.target.value)}
                          placeholder="Optional receiving remarks"
                          className={baseFieldClass}
                        />
                      </div>
                    </div>
                  </section>
                )}

                {currentStep === 2 && !isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-documents">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Supply Documents</h3>
                        <p className="text-sm text-text-dark/70">
                          Enter document information and upload required files.
                        </p>
                      </div>
                    </div>

                    <SupplyDocumentsStep
                      documents={supplyDocuments}
                      onChange={setSupplyDocuments}
                      disabled={isSubmitting}
                    />
                  </section>
                )}

                {currentStep === 2 && isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-operational-batches">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-text-dark">Operational supply batches</h3>
                      <p className="text-sm text-text-dark/70">
                        Add the products and quantities for this operational delivery.
                      </p>
                    </div>
                    {operationalMappedProducts.length === 0 ? (
                      <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                        No operational products found. Create OP products first.
                      </div>
                    ) : null}
                    <div className="space-y-4">
                      {operationalSupplyLines.map((line, index) => (
                        <div key={`operational-line-${index}`} className="rounded-xl border border-olive-light/40 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-text-dark">Line {index + 1}</p>
                            {operationalSupplyLines.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeOperationalSupplyLine(index)}
                                disabled={isSubmitting}
                                className="text-red-600 hover:text-red-700"
                              >
                                Remove
                              </Button>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                            <div className="space-y-2 lg:col-span-5">
                              <Label htmlFor={`operational_line_product_${index}`}>Product *</Label>
                              <SearchableSelect
                                id={`operational_line_product_${index}`}
                                options={operationalMappedProductOptions}
                                value={line.product_id}
                                onChange={(value) => updateOperationalSupplyLine(index, 'product_id', value)}
                                placeholder="Select supplied product"
                                disabled={isSubmitting || operationalMappedProducts.length === 0}
                                emptyMessage="No operational products found."
                              />
                            </div>
                            <div className="space-y-2 lg:col-span-3">
                              <Label htmlFor={`operational_line_unit_${index}`}>Received as *</Label>
                              <select
                                id={`operational_line_unit_${index}`}
                                className={baseFieldClass}
                                value={line.received_as_unit_id}
                                onChange={(event) => updateOperationalSupplyLine(index, 'received_as_unit_id', event.target.value)}
                                disabled={isSubmitting}
                              >
                                <option value="">Select unit</option>
                                {units.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {String(unit.name)}
                                    {unit.symbol ? ` (${String(unit.symbol)})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2 lg:col-span-4">
                              {(() => {
                                const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
                                const isOuterUnit = isOuterPackagingUnit(receivedAsUnit)
                                if (isOuterUnit) {
                                  return (
                                    <>
                                      <Label htmlFor={`operational_line_outer_qty_${index}`}>Outer units received *</Label>
                                      <Input
                                        id={`operational_line_outer_qty_${index}`}
                                        type="number"
                                        min="0"
                                        step="1"
                                        className={baseFieldClass}
                                        value={line.outer_unit_qty}
                                        onChange={(event) => updateOperationalSupplyLine(index, 'outer_unit_qty', event.target.value)}
                                        placeholder="3"
                                        disabled={isSubmitting}
                                      />
                                    </>
                                  )
                                }

                                return (
                                  <>
                                    <Label htmlFor={`operational_line_qty_${index}`}>Quantity *</Label>
                                    <Input
                                      id={`operational_line_qty_${index}`}
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      className={baseFieldClass}
                                      value={line.qty}
                                      onChange={(event) => updateOperationalSupplyLine(index, 'qty', event.target.value)}
                                      placeholder="120"
                                      disabled={isSubmitting}
                                    />
                                  </>
                                )
                              })()}
                            </div>
                            {(() => {
                              const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
                              const isOuterUnit = isOuterPackagingUnit(receivedAsUnit)
                              if (!isOuterUnit) {
                                return null
                              }

                              const product = operationalProductMap.get(line.product_id)
                              const hasConfiguredBaseUnit = product?.base_unit_id != null
                              const stockUnit =
                                hasConfiguredBaseUnit
                                  ? units.find((entry) => entry.id === product.base_unit_id)
                                  : null
                              const computedQty = computeOperationalInnerQuantity(line, units)
                              const stockUnitDisplay = stockUnit
                                ? `${String(stockUnit.name)}${stockUnit.symbol ? ` (${String(stockUnit.symbol)})` : ''}`
                                : hasConfiguredBaseUnit
                                  ? `Configured base unit #${String(product?.base_unit_id)} not found in units`
                                  : 'No base unit configured on this product'

                              return (
                                <>
                                  <div className="space-y-2 lg:col-span-4">
                                    <Label htmlFor={`operational_line_inner_units_${index}`}>
                                      Items per {receivedAsUnit?.name?.toLowerCase() || 'outer unit'} *
                                    </Label>
                                    <Input
                                      id={`operational_line_inner_units_${index}`}
                                      type="number"
                                      min="0"
                                      step="1"
                                      className={baseFieldClass}
                                      value={line.inner_units_per_outer}
                                      onChange={(event) => updateOperationalSupplyLine(index, 'inner_units_per_outer', event.target.value)}
                                      placeholder="50"
                                      disabled={isSubmitting}
                                    />
                                  </div>
                                  <div className="space-y-2 lg:col-span-4">
                                    <Label>Stock unit</Label>
                                    <Input
                                      value={stockUnitDisplay}
                                      readOnly
                                      className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70`}
                                    />
                                  </div>
                                  <div className="space-y-2 lg:col-span-4">
                                    <Label>Total inner items</Label>
                                    <Input
                                      value={
                                        computedQty != null
                                          ? `${String(computedQty)} ${stockUnit?.symbol || stockUnit?.name || ''}`.trim()
                                          : '—'
                                      }
                                      readOnly
                                      className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70`}
                                    />
                                  </div>
                                </>
                              )
                            })()}
                            <div className="space-y-2 lg:col-span-4">
                              <Label htmlFor={`operational_line_unit_price_${index}`}>
                                Unit price {getUnitPriceSuffix(line.received_as_unit_id || line.unit_id) || '/unit'} *
                              </Label>
                              <Input
                                id={`operational_line_unit_price_${index}`}
                                type="number"
                                min="0"
                                step="0.01"
                                className={baseFieldClass}
                                value={line.unit_price}
                                onChange={(event) => updateOperationalSupplyLine(index, 'unit_price', event.target.value)}
                                placeholder="12.50"
                                disabled={isSubmitting}
                                required
                              />
                            </div>
                            <div className="space-y-2 lg:col-span-4">
                              <Label htmlFor={`operational_line_amount_paid_${index}`}>Amount paid (optional)</Label>
                              <Input
                                id={`operational_line_amount_paid_${index}`}
                                type="number"
                                min="0"
                                step="0.01"
                                className={baseFieldClass}
                                value={line.amount_paid}
                                onChange={(event) => updateOperationalSupplyLine(index, 'amount_paid', event.target.value)}
                                placeholder="0.00"
                                disabled={isSubmitting}
                              />
                            </div>
                            {(() => {
                              const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
                              const isOuterUnit = isOuterPackagingUnit(receivedAsUnit)
                              if (!isOuterUnit) {
                                return null
                              }

                              return (
                                <div className="lg:col-span-12">
                                  <p className="text-xs text-text-dark/60">
                                    Record the received outer pack and the number of items inside each {receivedAsUnit?.name?.toLowerCase() || 'outer unit'} so stock can be tracked in inner units.
                                  </p>
                                </div>
                              )
                            })()}
                            <div className="space-y-2 lg:col-span-12">
                              <Label htmlFor={`operational_line_notes_${index}`}>Line notes</Label>
                              <Input
                                id={`operational_line_notes_${index}`}
                                className={baseFieldClass}
                                value={line.notes}
                                onChange={(event) => updateOperationalSupplyLine(index, 'notes', event.target.value)}
                                placeholder="Optional notes for this line"
                                disabled={isSubmitting}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addOperationalSupplyLine}
                        disabled={isSubmitting || operationalMappedProducts.length === 0}
                      >
                        Add line
                      </Button>
                    </div>
                  </section>
                )}

                {currentStep === 3 && isOperationalFlow && (
                  <section className="space-y-6" data-tour="supplies-operational-packaging">
                    <div className={sectionCardClass}>
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-text-dark">Packaging quality parameters</h3>
                        <p className="text-sm text-text-dark/70">
                          Capture packaging quality for each operational supply line before review.
                        </p>
                      </div>

                      <div className="space-y-4">
                        {operationalSupplyLines.map((line, index) => {
                          const product = products.find((entry) => String(entry.id) === line.product_id)
                          const unit = units.find((entry) => String(entry.id) === line.unit_id)
                          const lineKey = getOperationalLineKey(line, index)
                          const packaging = normalizePackagingQualityState(
                            operationalPackagingQualityByLineKey[lineKey] ?? createEmptyPackagingQuality(),
                          )

                          return (
                            <div key={`operational-packaging-${lineKey}`} className="rounded-xl border border-olive-light/40 bg-white p-4">
                              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-text-dark">
                                    Line {index + 1} {product?.name ? `• ${product.name}` : ''}
                                  </p>
                                  <p className="text-xs text-text-dark/70">
                                    Qty: {line.qty || '0'} {unit?.symbol || unit?.name || ''}
                                  </p>
                                </div>
                                {isPackagingQualityComplete(packaging) ? (
                                  <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                                    Completed
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                    Pending
                                  </span>
                                )}
                              </div>

                              <PackagingQualityStep
                                packaging={packaging}
                                onChange={(nextPackaging) => handleOperationalPackagingQualityChange(lineKey, nextPackaging)}
                                disabled={isSubmitting}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {currentStep === 4 && isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-operational-review">
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-text-dark">Operational supply review</h3>
                      <p className="text-sm text-text-dark/70">
                        Confirm details before saving this operational supply.
                      </p>
                    </div>

                    <div className="rounded-xl border border-olive-light/40 bg-white p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Supplier</p>
                          <p className="text-sm font-medium text-text-dark">
                            {supplierLabelMap.get(parseInt(formData.supplier_id, 10)) || 'Not set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Warehouse</p>
                          <p className="text-sm font-medium text-text-dark">
                            {warehouseLabelMap.get(parseInt(formData.warehouse_id, 10)) || 'Not set'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Condition</p>
                          <p className="text-sm font-medium text-text-dark">{operationalCondition || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Delivery reference</p>
                          <p className="text-sm font-medium text-text-dark">{operationalDeliveryReference || 'Not set'}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Received at</p>
                          <p className="text-sm font-medium text-text-dark">{formatDateTime(formData.received_at)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-olive-light/40 bg-white p-4">
                      <p className="text-sm font-semibold text-text-dark">Operational supply batches</p>
                      <div className="mt-3 space-y-2">
                        {operationalSupplyLines.map((line, index) => {
                          const product = products.find((entry) => String(entry.id) === line.product_id)
                          const unit = units.find((entry) => String(entry.id) === line.unit_id)
                          const receivedAsUnit = units.find((entry) => String(entry.id) === line.received_as_unit_id)
                          const isOuterUnit = isOuterPackagingUnit(receivedAsUnit)
                          const computedQty = computeOperationalInnerQuantity(line, units)
                          const lineKey = getOperationalLineKey(line, index)
                          const packaging = normalizePackagingQualityState(
                            operationalPackagingQualityByLineKey[lineKey] ?? createEmptyPackagingQuality(),
                          )
                          return (
                            <div key={`review-line-${index}`} className="flex flex-col gap-1 rounded-lg border border-olive-light/30 bg-olive-light/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm text-text-dark">
                                {product?.name || 'Unknown product'} {product?.sku ? `(${product.sku})` : ''}
                              </div>
                              <div className="text-sm font-medium text-text-dark sm:text-right">
                                <div>
                                  {computedQty ?? 0} {unit?.symbol || unit?.name || ''}
                                </div>
                                <div className="text-xs font-normal text-text-dark/70">
                                  Received as:{' '}
                                  {isOuterUnit
                                    ? `${line.outer_unit_qty || '0'} ${receivedAsUnit?.name || 'outer'} x ${line.inner_units_per_outer || '0'}`
                                    : `${line.qty || '0'} ${receivedAsUnit?.symbol || receivedAsUnit?.name || ''}`}{' '}
                                  | Stock unit: {unit?.symbol || unit?.name || '—'}
                                </div>
                                <div className="text-xs font-normal text-text-dark/70">
                                  Unit price: {line.unit_price || '—'} | Amount paid: {line.amount_paid || '—'}
                                </div>
                                <div className="text-xs font-normal text-text-dark/70">
                                  Packaging: Labelling {packaging.inaccurateLabelling || '—'}, Damage {packaging.visibleDamage || '—'}, Odor {packaging.odor || '—'}, Qty {packaging.specifiedQuantity || '—'}, Strength {packaging.strengthIntegrity || '—'}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      {['Schedule', 'Receive', 'Inspect', 'Release'].map((stage, idx) => (
                        <div key={stage} className="rounded-xl border border-olive-light/40 bg-olive-light/10 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/60">Stage {idx + 1}</p>
                          <p className="mt-1 text-sm font-medium text-text-dark">{stage}</p>
                          <p className="mt-1 text-xs text-text-dark/70">
                            Operational supply handling checkpoint.
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {currentStep === 3 && !isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-vehicle-inspections">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Vehicle Inspections</h3>
                        <p className="text-sm text-text-dark/70">
                          Complete vehicle inspection checklist before receiving supply.
                        </p>
                      </div>
                    </div>

                    <VehicleInspectionsStep
                      inspection={vehicleInspection}
                      onChange={setVehicleInspection}
                      disabled={isSubmitting}
                    />
                  </section>
                )}

                {currentStep === 4 && !isOperationalFlow && (
                  <section className={sectionCardClass} data-tour="supplies-packaging-quality">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Packaging Quality Parameters</h3>
                        <p className="text-sm text-text-dark/70">
                          Evaluate packaging quality before proceeding to product quality evaluation.
                        </p>
                      </div>
                    </div>

                    <PackagingQualityStep
                      packaging={packagingQuality}
                      onChange={setPackagingQuality}
                      disabled={isSubmitting}
                    />
                  </section>
                )}

                {currentStep === 5 && (
                  <section className="space-y-6" data-tour="supplies-batches">
                    <div className={sectionCardClass}>
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold text-text-dark dark:text-slate-100">
                          Supply batches
                        </h3>
                        <p className="text-sm text-text-dark/70 dark:text-slate-300">
                          Enter each batch, its production and expiry dates, COA certificate, and allocation. Quality evaluation is done in the next step per batch.
                        </p>
                      </div>

                      <div className="space-y-6">
                        {formData.supply_batches.map((batch, index) => (
                        <div
                          key={batch.batch_id != null ? `batch-${batch.batch_id}` : `temp-${batch.temp_key ?? index}`}
                          className="rounded-xl border border-olive-light/40 bg-white/80 p-5 shadow-sm transition hover:border-olive-light/80 hover:shadow-md dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-slate-500"
                        >
                            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-text-dark/50 dark:text-slate-400">
                                  Batch {index + 1}
                                </p>
                                <p className="mt-1 text-sm text-text-dark/70 dark:text-slate-300">
                                  Suggested lot
                                  <span className="ml-1 inline-flex items-center rounded-full bg-olive-light/30 px-2 py-0.5 text-xs font-medium text-text-dark">
                                    {generateLotNumberPreview(index)}
                                  </span>
                                </p>
                                {batch.is_locked ? (
                                  <p className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                    Processing started: lot locked
                                  </p>
                                ) : null}
                              </div>
                              {formData.supply_batches.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  onClick={() => removeSupplyBatch(index)}
                                  disabled={isSubmitting || batch.is_locked}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-5">
                                <Label htmlFor={`product_${index}`}>Product (Raw Materials Only) *</Label>
                                <SearchableSelect
                                  id={`product_${index}`}
                                  options={getBatchProductOptions(batch.product_id, index)}
                                  value={batch.product_id}
                                  onChange={(value) => handleSupplyBatchChange(index, 'product_id', value)}
                                  placeholder="Select raw product"
                                  disabled={isSubmitting || rawProducts.length === 0 || batch.is_locked}
                                  required
                                  emptyMessage="No raw products available"
                                />
                              </div>
                              <div className="space-y-2 lg:col-span-3">
                                <Label htmlFor={`unit_${index}`}>Unit *</Label>
                                <select
                                  id={`unit_${index}`}
                                  required
                                  className={baseFieldClass}
                                  value={batch.unit_id}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'unit_id', event.target.value)
                                  }
                                  disabled={isSubmitting || units.length === 0 || batch.is_locked}
                                >
                                  <option value="">Select unit</option>
                                  {units.map((unit) => (
                                    <option key={unit.id} value={unit.id}>
                                      {String(unit.name)}
                                      {unit.symbol ? ` (${String(unit.symbol)})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-2 lg:col-span-4">
                                <Label htmlFor={`qty_${index}`}>Received quantity *</Label>
                                <Input
                                  id={`qty_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  required
                                  value={batch.qty}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'qty', event.target.value)
                                  }
                                  placeholder="120"
                                  className={baseFieldClass}
                                  disabled={isSubmitting || batch.is_locked}
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`rejected_${index}`}>Rejected quantity *</Label>
                                <Input
                                  id={`rejected_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={batch.rejected_qty}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'rejected_qty', event.target.value)
                                  }
                                  placeholder="10"
                                  className={baseFieldClass}
                                  disabled={isSubmitting || batch.is_locked}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Enter the rejected quantity for this batch.
                                </p>
                              </div>
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`accepted_${index}`}>Accepted quantity *</Label>
                                <Input
                                  id={`accepted_${index}`}
                                  type="number"
                                  value={batch.accepted_qty}
                                  readOnly
                                  className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70 dark:bg-slate-900/60 dark:text-slate-300`}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Calculated automatically from received minus rejected.
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`production_date_${index}`}>Production Date *</Label>
                                <DatePicker
                                  id={`production_date_${index}`}
                                  value={batch.production_date}
                                  onChange={(value) => handleSupplyBatchChange(index, 'production_date', value)}
                                  triggerClassName={baseFieldClass}
                                  popoverClassName="w-[18rem]"
                                  disabled={isSubmitting || batch.is_locked}
                                  required
                                  max={batch.expiry_date || undefined}
                                />
                              </div>
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`expiry_date_${index}`}>Expiry Date *</Label>
                                <DatePicker
                                  id={`expiry_date_${index}`}
                                  value={batch.expiry_date}
                                  onChange={(value) => handleSupplyBatchChange(index, 'expiry_date', value)}
                                  triggerClassName={baseFieldClass}
                                  popoverClassName="w-[18rem]"
                                  disabled={isSubmitting || batch.is_locked}
                                  required
                                  min={batch.production_date || undefined}
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-7">
                                <Label htmlFor={`coa_file_${index}`}>COA Certificate *</Label>
                                <Input
                                  id={`coa_file_${index}`}
                                  type="file"
                                  accept="image/*,.pdf"
                                  className={baseFieldClass}
                                  disabled={isSubmitting || batch.is_locked}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'coa_file', event.target.files?.[0] ?? null)
                                  }
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  {batch.coa_file
                                    ? `Selected: ${batch.coa_file.name}`
                                    : batch.coa_document_name
                                      ? `Current: ${batch.coa_document_name}`
                                      : 'Upload the COA document for this batch.'}
                                </p>
                              </div>
                              <div className="space-y-2 lg:col-span-5">
                                <Label htmlFor={`coa_expiry_${index}`}>COA Expiry Date</Label>
                                <DatePicker
                                  id={`coa_expiry_${index}`}
                                  value={batch.coa_expiry_date}
                                  onChange={(value) => handleSupplyBatchChange(index, 'coa_expiry_date', value)}
                                  triggerClassName={baseFieldClass}
                                  popoverClassName="w-[18rem]"
                                  disabled={isSubmitting || batch.is_locked}
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`unit_price_${index}`}>
                                  Unit price {getUnitPriceSuffix(batch.unit_id) || '/unit'} *
                                </Label>
                                <Input
                                  id={`unit_price_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={batch.unit_price}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'unit_price', event.target.value)
                                  }
                                  placeholder="12.50"
                                  className={baseFieldClass}
                                  disabled={isSubmitting || batch.is_locked}
                                  required
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Price per selected unit for this line; used for payment tracking.
                                </p>
                              </div>
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`amount_paid_${index}`}>Amount paid (optional)</Label>
                                <Input
                                  id={`amount_paid_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={batch.amount_paid}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'amount_paid', event.target.value)
                                  }
                                  placeholder="0.00"
                                  className={baseFieldClass}
                                  disabled={isSubmitting || batch.is_locked}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Payment amount for this batch. Visible on the Payments page.
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-6 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addSupplyBatch}
                          className="border-olive-light/60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-900/60"
                          disabled={isSubmitting}
                        >
                          Add batch
                        </Button>
                      </div>
                    </div>
                  </section>
                )}

                {currentStep === 6 && (
                  <section className="space-y-6" data-tour="supplies-quality-evaluation">
                    <div className={sectionCardClass}>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-text-dark dark:text-slate-100">
                          Quality evaluation per batch
                        </h3>
                        <p className="text-sm text-text-dark/70 dark:text-slate-300">
                          Capture quality results independently for each lot.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70 dark:bg-slate-900/50 dark:text-slate-200">
                          Average score: {qualityAverageScore ?? '—'}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70 dark:bg-slate-900/50 dark:text-slate-200">
                          Batches: {formData.supply_batches.length}
                        </span>
                      </div>
                      <div className="mt-4 space-y-4">
                        {formData.supply_batches.map((batch, index) => {
                          const batchKey = getSupplyBatchQualityKey(batch, index)
                          const entries = qualityEntriesByBatchKey[batchKey] ?? createInitialQualityEntries(qualityParameters)
                          const assessment = evaluateBatchQuality(entries)
                          const batchProduct = products.find((product) => String(product.id) === batch.product_id)
                          return (
                            <details
                              key={`quality-batch-${batchKey}`}
                              className="rounded-xl border border-olive-light/40 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
                              open
                            >
                              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-text-dark dark:text-slate-100">
                                    {batch.lot_no?.trim() || `Batch ${index + 1}`} {batchProduct?.name ? `• ${batchProduct.name}` : ''}
                                  </p>
                                  <p className="text-xs text-text-dark/70 dark:text-slate-300">
                                    Received {batch.qty || '0'} • Accepted {batch.accepted_qty || '0'} • Rejected {batch.rejected_qty || '0'}
                                  </p>
                                </div>
                                <span
                                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                                    assessment.checkStatus === 'PASS'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {assessment.checkStatus} • Score {assessment.overallScore ?? '—'}
                                </span>
                              </summary>
                              <div className="mt-4">
                                <QualityEvaluationTable
                                  parameters={qualityParameters}
                                  entries={entries}
                                  legend={SUPPLY_QUALITY_SCORE_LEGEND}
                                  onEntryChange={(code, entry) => handleQualityEntryChange(batchKey, code, entry)}
                                />
                              </div>
                            </details>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {currentStep === 7 && (
                  <section className={sectionCardClass} data-tour="supplies-signoff">
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Supplier Sign-Off</h3>
                        <p className="text-sm text-text-dark/70">
                          Complete supplier sign-off using e-signature or document upload.
                        </p>
                      </div>
                    </div>

                    <SupplierSignOffStep
                      signOff={supplierSignOff}
                      onChange={setSupplierSignOff}
                      disabled={isSubmitting}
                    />
                  </section>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-olive-light/30 bg-olive-light/20 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  className="border-olive-light/60 dark:border-slate-600 dark:text-slate-100"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <div className="flex items-center gap-2">
                  {currentStep > minimumModalStepIndex && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleStepBack}
                      className="border-olive-light/60 dark:border-slate-600 dark:text-slate-100"
                      disabled={isSubmitting}
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className="bg-olive hover:bg-olive-dark disabled:cursor-not-allowed disabled:bg-olive-light/60"
                    disabled={isSubmitting || isOperationalLineStepBlocked}
                    data-tour="supplies-submit-button"
                  >
                    {isSubmitting
                      ? 'Saving…'
                      : isOperationalFlow && isLastStep
                      ? 'Finish Flow'
                      : isLastStep
                      ? isEditingSupply
                        ? 'Save Changes'
                        : 'Submit Supply'
                      : 'Next'}
                  </Button>
                </div>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      <SettingsTour
        open={isTourOpen}
        step={currentTourStep}
        totalSteps={tourSteps.length}
        currentStepIndex={currentTourStepIndex}
        isLastStep={isTourLastStep}
        onBack={previousStep}
        onNext={nextStep}
        onClose={handleCloseTour}
      />
    </>
  )
}

export default Supplies
