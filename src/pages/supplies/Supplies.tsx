import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { CalendarRange, Camera, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useSuppliers } from '@/hooks/useSuppliers'
import QualityEvaluationTable from '@/components/supplies/QualityEvaluationTable'
import { SUPPLY_QUALITY_SCORE_LEGEND } from '@/constants/supplyQuality'
import { Spinner } from '@/components/ui/spinner'
import { SupplyDocumentsStep, SupplyDocument } from '@/components/supplies/SupplyDocumentsStep'
import { VehicleInspectionsStep, VehicleInspection } from '@/components/supplies/VehicleInspectionsStep'
import { PackagingQualityStep, PackagingQuality } from '@/components/supplies/PackagingQualityStep'
import { SupplierSignOffStep, SupplierSignOff } from '@/components/supplies/SupplierSignOffStep'
import { CameraCapture } from '@/components/CameraCapture'

interface QualityEntry {
  score: number | string | null
  remarks: string
  results: string
}

interface QualityEntries {
  [code: string]: QualityEntry
}

interface SupplyBatch {
  product_id: string
  unit_id: string
  qty: string
  accepted_qty: string
  rejected_qty: string
  unit_price: string
  amount_paid: string
}

interface FormData {
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

interface SupplyLine {
  id: number
  supply_id: number
  product_id: number
  unit_id: number | null
  accepted_qty: number
  unit_price?: number | null
  [key: string]: unknown
}

interface SupplyBatchData {
  id: number
  supply_id: number
  current_qty?: number
  received_qty?: number
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
  product_type?: 'RAW' | 'WIP' | 'FINISHED' | null
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

interface QualityParameterWithId {
  id?: number | null
  code: string
  name: string
  specification: string
  defaultRemarks: string
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
  'Basic information',
  'Supply documents',
  'Vehicle inspections',
  'Packaging quality parameters',
  'Quality evaluation',
  'Supply batches & submit',
  'Supplier sign-off',
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

function sanitiseAcceptedQuantityInput(value: string | number | null | undefined): string {
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

function Supplies() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { suppliers: supplierOptions, loading: suppliersLoading, error: suppliersError } = useSuppliers()
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [supplyLines, setSupplyLines] = useState<SupplyLine[]>([])
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
  const [qualityEntries, setQualityEntries] = useState<QualityEntries>(() => createInitialQualityEntries())
  const [supplyDocuments, setSupplyDocuments] = useState<SupplyDocument>(() => ({
    invoiceNumber: '',
    driverLicenseName: '',
    batchNumber: '',
    productionDate: '',
    expiryDate: '',
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
  const [supplierSignOff, setSupplierSignOff] = useState<SupplierSignOff>(() => ({
    signatureType: '',
    signatureData: null,
    documentFile: null,
    signedByName: '',
    remarks: '',
  }))
  const [supplierCoaStatus, setSupplierCoaStatus] = useState<'available' | 'missing' | 'expired' | null>(null)
  const [supplierCoaLoading, setSupplierCoaLoading] = useState(false)
  const [addCoaModalOpen, setAddCoaModalOpen] = useState(false)
  const [addCoaFile, setAddCoaFile] = useState<File | null>(null)
  const [addCoaExpiry, setAddCoaExpiry] = useState('')
  const [addCoaCameraOpen, setAddCoaCameraOpen] = useState(false)
  const [addCoaUploading, setAddCoaUploading] = useState(false)
  const [editingSupplyId, setEditingSupplyId] = useState<number | null>(null)
  const [editLoadDone, setEditLoadDone] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [receivedTo, setReceivedTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const isLastStep = currentStep === STEPS.length - 1

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
      doc_no: computeNextDocNumber(),
      warehouse_id: '',
      supplier_id: '',
      received_at: toLocalDateTimeInput(),
      received_by: currentUserName,
      doc_status: STATUS_OPTIONS[0]!,
      supply_batches: [
        { product_id: '', unit_id: '', qty: '', accepted_qty: '0', rejected_qty: '0', unit_price: '', amount_paid: '' },
      ],
    }),
    [computeNextDocNumber, currentUserName],
  )

  const [formData, setFormData] = useState<FormData>(() => getInitialFormData())

  const supplierList = useMemo(() => (Array.isArray(supplierOptions) ? supplierOptions : []), [supplierOptions])

  const supplierSelectOptions = useMemo(() => {
    return supplierList.map((supplier) => ({
      value: String(supplier.id),
      label: String(supplier.name ?? ''),
    }))
  }, [supplierList])

  const supplierLabelMap = useMemo(() => {
    const map = new Map<number, string>()
    supplierList.forEach((supplier) => {
      const supplierId = typeof supplier?.id === 'number' ? supplier.id : Number(supplier?.id)
      if (supplierId !== undefined && !Number.isNaN(supplierId) && supplierId !== null) {
        map.set(supplierId, String(supplier.name ?? ''))
      }
    })
    return map
  }, [supplierList])

  const rawProducts = useMemo(() => products.filter((product) => product.product_type === 'RAW'), [products])

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

  const filteredSupplies = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    const fromDate = toDate(receivedFrom)
    const toDateValue = toDateEndOfDay(receivedTo)

    return displaySupplies.filter((supply) => {
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
  }, [searchTerm, receivedFrom, receivedTo, displaySupplies])

  const totalPages = Math.max(1, Math.ceil(filteredSupplies.length / pageSize))
  const paginatedSupplies = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredSupplies.slice(startIndex, startIndex + pageSize)
  }, [filteredSupplies, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, receivedFrom, receivedTo])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  const qualityAverageScore = useMemo(
    () => calculateAverageScore(qualityEntries),
    [qualityEntries],
  )

  const totalAcceptedKg = useMemo(
    () =>
      filteredSupplies.reduce((total, supply) => {
        const lines = supplyLines.filter((line) => line.supply_id === supply.id)
        const accepted = lines.reduce(
          (accumulator, line) => accumulator + (Number(line.accepted_qty) || 0),
          0,
        )
        return total + accepted
      }, 0),
    [filteredSupplies, supplyLines],
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
        const quantity = Number.parseFloat(batch.qty)
        const accepted = Number.parseFloat(batch.accepted_qty)
        const rejected = Number.parseFloat(batch.rejected_qty)

        if (!Number.isFinite(quantity) || quantity <= 0) {
          return batch
        }

        if (!Number.isFinite(accepted) && !Number.isFinite(rejected)) {
          changed = true
          return {
            ...batch,
            accepted_qty: '0',
            rejected_qty: quantity.toString(),
          }
        }

        if (!Number.isFinite(accepted) && Number.isFinite(rejected)) {
          changed = true
          return {
            ...batch,
            accepted_qty: Math.max(quantity - rejected, 0).toString(),
          }
        }

        if (Number.isFinite(accepted) && !Number.isFinite(rejected)) {
          changed = true
          return {
            ...batch,
            rejected_qty: Math.max(quantity - accepted, 0).toString(),
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

  const handleSupplyBatchChange = (index: number, field: keyof SupplyBatch, value: string) => {
    const next = [...formData.supply_batches]
    const incomingValue = field === 'accepted_qty' ? sanitiseAcceptedQuantityInput(value) : value
    if (next[index]) {
      next[index]![field] = incomingValue
    }

    const currentBatch = next[index]
    if (!currentBatch) return

    if (field === 'qty') {
      const quantityNumber = Number.parseFloat(incomingValue)
      const acceptedNumber = Number.parseFloat(currentBatch.accepted_qty)

      if (Number.isFinite(quantityNumber)) {
        if (Number.isFinite(acceptedNumber) && acceptedNumber > quantityNumber) {
          currentBatch.accepted_qty = quantityNumber.toString()
        }
      } else {
        currentBatch.accepted_qty = ''
      }
    }

    if (field === 'accepted_qty' || field === 'qty') {
      const quantityNumber = Number.parseFloat(currentBatch.qty)
      const acceptedNumber = Number.parseFloat(currentBatch.accepted_qty)
      const hasQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0
      const hasAccepted = Number.isFinite(acceptedNumber) && acceptedNumber >= 0

      if (hasQuantity && hasAccepted && acceptedNumber > quantityNumber) {
        toast.error('Accepted quantity cannot exceed received quantity.')
        currentBatch.accepted_qty = quantityNumber.toString()
        currentBatch.rejected_qty = '0'
      } else if (hasQuantity && hasAccepted) {
        const remainder = Math.max(quantityNumber - acceptedNumber, 0)
        currentBatch.rejected_qty = remainder === 0 ? '0' : remainder.toString()
      } else {
        currentBatch.rejected_qty = ''
        if (!hasAccepted && field === 'accepted_qty' && incomingValue === '') {
          currentBatch.accepted_qty = ''
        }
      }
    }

    if (field !== 'accepted_qty' && field !== 'qty') {
      const quantityNumber = Number.parseFloat(currentBatch.qty)
      const acceptedNumber = Number.parseFloat(currentBatch.accepted_qty)

      if (Number.isFinite(quantityNumber) && quantityNumber > 0 && Number.isFinite(acceptedNumber) && acceptedNumber >= 0) {
        const remainder = Math.max(quantityNumber - acceptedNumber, 0)
        currentBatch.rejected_qty = remainder === 0 ? '0' : remainder.toString()
      } else {
        currentBatch.rejected_qty = ''
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
      supply_batches: [
        ...prev.supply_batches,
        { product_id: '', unit_id: '', qty: '', accepted_qty: '0', rejected_qty: '0', unit_price: '', amount_paid: '' },
      ],
    }))
  }

  const removeSupplyBatch = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      supply_batches: prev.supply_batches.filter((_, i) => i !== index),
    }))
  }

  const generateLotNumberPreview = (index: number): string => {
    const currentYear = new Date().getFullYear()
    const nextBatchNumber = supplyBatches.length + 1
    return `LOT-${currentYear}-${String(nextBatchNumber + index).padStart(3, '0')}`
  }

  const handleQualityEntryChange = (code: string, entry: QualityEntry) => {
    setQualityEntries((previous) => ({
      ...previous,
      [code]: {
        score: entry.score,
        remarks: entry.remarks,
        results: entry.results,
      },
    }))
  }

  const validateStep = useCallback(
    (step: number): boolean => {
      if (step === 0) {
        if (
          !formData.warehouse_id ||
          !formData.supplier_id ||
          !formData.received_at
        ) {
          toast.error('Complete all required fields before continuing.')
          return false
        }
      }

      if (step === 1) {
        // Supply documents validation
        if (!supplyDocuments.invoiceNumber || !supplyDocuments.driverLicenseName || !supplyDocuments.batchNumber) {
          toast.error('Complete all required document fields before continuing.')
          return false
        }
      }

      if (step === 2) {
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

      if (step === 3) {
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

      if (step === 4) {
        // Quality evaluation validation
        const missingScore = qualityParameters.find((parameter) => {
          const entry = qualityEntries[parameter.code]
          const score = entry?.score
          // Allow null/N/A (value 4), or valid scores 1-3
          if (score === null || score === '' || score === 4 || score === '4') {
            return false // N/A is valid
          }
          const scoreNum = Number(score)
          return !Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 3
        })

        if (missingScore) {
          toast.error(`Provide a valid score for ${missingScore.name} before continuing.`)
          return false
        }
      }

      if (step === 5) {
        // Supply batches validation
        if (formData.supply_batches.length === 0) {
          toast.error('Add at least one batch to continue.')
          return false
        }

        let errorMessage = ''
        const invalidBatch = formData.supply_batches.find((batch) => {
          const quantity = Number.parseFloat(batch.qty)
          const accepted = Number.parseFloat(batch.accepted_qty)

          if (!batch.product_id || !batch.unit_id || !batch.qty) {
            errorMessage = 'Complete all batch details before submitting.'
            return true
          }

          if (!Number.isFinite(quantity) || quantity <= 0) {
            errorMessage = 'Received quantity must be greater than zero.'
            return true
          }

          if (!Number.isFinite(accepted) || accepted < 0) {
            errorMessage = 'Accepted quantity cannot be negative.'
            return true
          }

          if (accepted > quantity) {
            errorMessage = 'Accepted quantity cannot exceed received quantity.'
            return true
          }

          return false
        })

        if (invalidBatch) {
          toast.error(errorMessage || 'Resolve issues with batch quantities before submitting.')
          return false
        }

        if (!formData.doc_status) {
          toast.error('Select a supply status before submitting.')
          return false
        }
      }

      if (step === 6) {
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
    [formData, qualityEntries, qualityParameters, supplyDocuments, vehicleInspection, packagingQuality, supplierSignOff],
  )

  const handleStepBack = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 0))
  }

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (currentStep < STEPS.length - 1) {
      if (validateStep(currentStep)) {
        setCurrentStep((previous) => Math.min(previous + 1, STEPS.length - 1))
      }
      return
    }

    for (let step = 0; step < STEPS.length - 1; step += 1) {
      if (!validateStep(step)) {
        setCurrentStep(step)
        return
      }
    }

    if (!validateStep(currentStep)) {
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
    const hasQualityIssues = Object.values(qualityEntries).some((entry) => Number(entry?.score ?? 0) < 3)
    const overallScore = calculateAverageScore(qualityEntries)
    const hasRejectedBatches = formData.supply_batches.some(
      (batch) => Number.parseFloat(batch.rejected_qty) > 0,
    )
    const qualityStatus = hasQualityIssues || hasRejectedBatches ? 'FAILED' : 'PASSED'
    const qualityCheckStatus = hasQualityIssues || hasRejectedBatches ? 'FAIL' : 'PASS'

    const validLines = formData.supply_batches
      .map((batch) => {
        const trimmedQty = batch.qty?.trim() ?? ''
        const trimmedAccepted = batch.accepted_qty?.trim() ?? ''
        const quantityNumber = Number.parseFloat(trimmedQty)
        const acceptedNumber = Number.parseFloat(trimmedAccepted)
        const computedRejected =
          Number.isFinite(quantityNumber) && Number.isFinite(acceptedNumber)
            ? Math.max(quantityNumber - acceptedNumber, 0)
            : ''

        return {
          ...batch,
          qty: trimmedQty,
          accepted_qty: trimmedAccepted,
          rejected_qty: computedRejected === '' ? '' : computedRejected.toString(),
        }
      })
      .filter((batch) => batch.product_id && batch.unit_id && batch.qty)

    if (validLines.length === 0) {
      toast.error('Add at least one supply batch before saving.')
      return
    }

    setIsSubmitting(true)
    try {
      if (editingSupplyId) {
        const { error: updateSupplyError } = await supabase
          .from('supplies')
          .update({
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

        await supabase.from('supply_lines').delete().eq('supply_id', editingSupplyId)
        const supplyLineRows = validLines.map((line) => {
          const quantity = Number.parseFloat(line.qty) || 0
          const acceptedRaw = Number.parseFloat(line.accepted_qty)
          const acceptedQty = Number.isFinite(acceptedRaw) ? Math.min(acceptedRaw, quantity) : 0
          const rejectedQty = Math.max(quantity - acceptedQty, 0)
          const unitPriceRaw = line.unit_price?.trim()
          const unitPrice = unitPriceRaw && Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : null
          return {
            supply_id: editingSupplyId,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            ordered_qty: quantity,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            variance_reason: rejectedQty > 0 ? 'Rejected during quality evaluation' : null,
            unit_price: unitPrice,
          }
        })
        const { data: linesData, error: linesError } = await supabase
          .from('supply_lines')
          .insert(supplyLineRows)
          .select('id')
        if (linesError) throw linesError
        const insertedLines = linesData ?? []

        await supabase.from('supply_batches').delete().eq('supply_id', editingSupplyId)
        const supplyBatchRows = validLines.map((line, index) => {
          const quantity = Number.parseFloat(line.qty) || 0
          const acceptedRaw = Number.parseFloat(line.accepted_qty)
          const acceptedQty = Number.isFinite(acceptedRaw) ? Math.min(acceptedRaw, quantity) : 0
          const rejectedQty = Math.max(quantity - acceptedQty, 0)
          const lotNumber = `LOT-${editingSupplyId}-${String(index + 1).padStart(3, '0')}`
          const batchQualityStatus = rejectedQty === 0 ? 'PASSED' : acceptedQty === 0 ? 'FAILED' : 'HOLD'
          return {
            supply_id: editingSupplyId,
            supply_line_id: insertedLines[index]?.id ?? null,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            lot_no: lotNumber,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            current_qty: acceptedQty,
            quality_status: batchQualityStatus,
            expiry_date: null,
            created_at: nowISO,
          }
        })
        const { error: batchesError } = await supabase.from('supply_batches').insert(supplyBatchRows)
        if (batchesError) throw batchesError

        await supabase.from('supply_documents').delete().eq('supply_id', editingSupplyId)
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
        if (supplyDocuments.productionDate) {
          supplyDocumentsPayload.push({
            supply_id: editingSupplyId,
            document_type_code: 'PRODUCTION_DATE',
            value: null,
            date_value: supplyDocuments.productionDate,
            boolean_value: null,
            document_id: null,
          })
        }
        if (supplyDocuments.expiryDate) {
          supplyDocumentsPayload.push({
            supply_id: editingSupplyId,
            document_type_code: 'EXPIRY_DATE',
            value: null,
            date_value: supplyDocuments.expiryDate,
            boolean_value: null,
            document_id: null,
          })
        }
        if (supplyDocumentsPayload.length > 0) {
          const { error: documentsError } = await supabase.from('supply_documents').insert(supplyDocumentsPayload)
          if (documentsError) throw documentsError
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
            await supabase.from('supply_packaging_quality_check_items').delete().eq('packaging_check_id', existingPackaging.id)
          }
          const { data: packagingParams } = await supabase.from('packaging_quality_parameters').select('id, code')
          const map = new Map((packagingParams ?? []).map((p: { id: number; code: string }) => [p.code, p.id]))
          const packagingItemsPayload = [
            { packaging_check_id: packagingCheckId, parameter_id: map.get('INACCURATE_LABELLING'), value: packagingQuality.inaccurateLabelling, numeric_value: null },
            { packaging_check_id: packagingCheckId, parameter_id: map.get('VISIBLE_DAMAGE'), value: packagingQuality.visibleDamage, numeric_value: null },
            { packaging_check_id: packagingCheckId, parameter_id: map.get('SPECIFIED_QUANTITY'), value: null, numeric_value: Number.parseFloat(packagingQuality.specifiedQuantity) || null },
            { packaging_check_id: packagingCheckId, parameter_id: map.get('ODOR'), value: packagingQuality.odor, numeric_value: null },
            { packaging_check_id: packagingCheckId, parameter_id: map.get('STRENGTH_INTEGRITY'), value: packagingQuality.strengthIntegrity, numeric_value: null },
          ].filter((i) => i.parameter_id != null)
          if (packagingItemsPayload.length > 0) {
            await supabase.from('supply_packaging_quality_check_items').insert(packagingItemsPayload)
          }
        }

        const { data: existingQualityCheck } = await supabase
          .from('supply_quality_checks')
          .select('id')
          .eq('supply_id', editingSupplyId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        let qualityCheckId = existingQualityCheck?.id
        if (!qualityCheckId) {
          const { data: newQc } = await supabase.from('supply_quality_checks').insert({
            supply_id: editingSupplyId,
            check_name: formData.doc_no ? `Receiving inspection - ${formData.doc_no}` : 'Receiving inspection',
            status: qualityCheckStatus,
            result: qualityCheckStatus,
            performed_by: profileId ?? null,
            performed_at: nowISO,
            evaluated_at: nowISO,
            evaluated_by: profileId ?? null,
            overall_score: overallScore,
          }).select('id').single()
          qualityCheckId = newQc?.id
        } else {
          await supabase.from('supply_quality_checks').update({
            status: qualityCheckStatus,
            result: qualityCheckStatus,
            evaluated_at: nowISO,
            overall_score: overallScore,
          }).eq('id', qualityCheckId)
        }
        if (qualityCheckId) {
          await supabase.from('supply_quality_check_items').delete().eq('quality_check_id', qualityCheckId)
          const parameterIdLookup = new Map(qualityParameterIdMap)
          const qualityItemsPayload = qualityParameters
            .map((p) => {
              const entry = qualityEntries[p.code]
              if (!entry) return null
              const parameterId = parameterIdLookup.get(p.code)
              if (!parameterId) return null
              const scoreValue = entry.score === null || entry.score === '' || entry.score === 4 || entry.score === '4' ? 4 : Number(entry.score)
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
            await supabase.from('supply_quality_check_items').insert(qualityItemsPayload)
          }
        }

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

        toast.success('Supply updated successfully.')
        setEditingSupplyId(null)
        setEditLoadDone(false)
        closeModal()
        loadSuppliesData()
        return
      }

      const { data: insertedSupply, error: insertSupplyError } = await supabase
        .from('supplies')
        .insert({
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

      let insertedLines: { id: number }[] = []
      if (validLines.length > 0) {
        const supplyLineRows = validLines.map((line) => {
          const quantity = Number.parseFloat(line.qty) || 0
          const acceptedRaw = Number.parseFloat(line.accepted_qty)
          const acceptedQty = Number.isFinite(acceptedRaw) ? Math.min(acceptedRaw, quantity) : 0
          const rejectedQty = Math.max(quantity - acceptedQty, 0)

          const unitPriceRaw = line.unit_price?.trim()
          const unitPrice = unitPriceRaw && Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : null
          return {
            supply_id: newSupplyId,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            ordered_qty: quantity,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            variance_reason: rejectedQty > 0 ? 'Rejected during quality evaluation' : null,
            unit_price: unitPrice,
          }
        })

        const { data: linesData, error: linesError } = await supabase
          .from('supply_lines')
          .insert(supplyLineRows)
          .select('id')

        if (linesError) {
          throw linesError
        }

        insertedLines = linesData ?? []
      }

      if (validLines.length > 0) {
        const supplyBatchRows = validLines.map((line, index) => {
          const quantity = Number.parseFloat(line.qty) || 0
          const acceptedRaw = Number.parseFloat(line.accepted_qty)
          const acceptedQty = Number.isFinite(acceptedRaw) ? Math.min(acceptedRaw, quantity) : 0
          const rejectedQty = Math.max(quantity - acceptedQty, 0)
          const lotNumber = `LOT-${newSupplyId}-${String(index + 1).padStart(3, '0')}`
          const batchQualityStatus =
            rejectedQty === 0
              ? 'PASSED'
              : acceptedQty === 0
              ? 'FAILED'
              : 'HOLD'

          return {
            supply_id: newSupplyId,
            supply_line_id: insertedLines[index]?.id ?? null,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            lot_no: lotNumber,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            current_qty: acceptedQty,
            quality_status: batchQualityStatus,
            expiry_date: null,
            created_at: nowISO,
          }
        })

        const { error: batchesError, data: insertedBatches } = await supabase
          .from('supply_batches')
          .insert(supplyBatchRows)
          .select('id, product_id, quality_status, process_status')
        if (batchesError) {
          throw batchesError
        }

        // Auto-create process lot runs for batches that are ready for production
        if (insertedBatches && Array.isArray(insertedBatches)) {
          const { createProcessLotRun } = await import('@/lib/processExecution')
          for (const batch of insertedBatches) {
            // Check if batch is ready: quality_status is 'PASSED' and process_status is 'UNPROCESSED'
            if (
              batch.quality_status === 'PASSED' &&
              (batch.process_status === 'UNPROCESSED' || !batch.process_status)
            ) {
              try {
                await createProcessLotRun(batch.id)
              } catch (error) {
                // Log error but don't fail the supply creation
                console.warn(`Failed to auto-create process lot run for batch ${batch.id}:`, error)
              }
            }
          }
        }
      }

      const parameterIdLookup = new Map(qualityParameterIdMap)

      const { data: qualityCheckRow, error: qualityCheckError } = await supabase
        .from('supply_quality_checks')
        .insert({
          supply_id: newSupplyId,
          check_name: formData.doc_no ? `Receiving inspection - ${formData.doc_no}` : 'Receiving inspection',
          status: qualityCheckStatus,
          result: qualityCheckStatus,
          performed_by: profileId ?? null,
          performed_at: new Date().toISOString(),
          evaluated_at: new Date().toISOString(),
          evaluated_by: profileId ?? null,
          overall_score: overallScore,
        })
        .select('id')
        .single()

      if (qualityCheckError) {
        throw qualityCheckError
      }

      const qualityItemsPayload = qualityParameters
        .map((parameter) => {
          const entry = qualityEntries[parameter.code]
          if (!entry) {
            return null
          }

          const parameterId = parameterIdLookup.get(parameter.code)
          if (!parameterId) {
            throw new Error(`Quality parameter ${parameter.code} is missing an id.`)
          }

          // Store 4 for N/A, or the numeric score
          const scoreValue = entry.score === null || entry.score === '' || entry.score === 4 || entry.score === '4' 
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
        if (qualityItemsError) {
          throw qualityItemsError
        }
      }

      // Save supply documents
      const supplyDocumentsPayload = []
      
      // Invoice number
      if (supplyDocuments.invoiceNumber) {
        let invoiceDocumentId = null
        if (supplyDocuments.invoiceFile) {
          const storagePath = `supplies/${newSupplyId}/documents/invoice_${Date.now()}_${supplyDocuments.invoiceFile.name}`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, supplyDocuments.invoiceFile)
          
          if (!uploadError) {
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
            
            if (!docError && docData) {
              invoiceDocumentId = docData.id
            }
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

      // Production date
      if (supplyDocuments.productionDate) {
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'PRODUCTION_DATE',
          value: null,
          date_value: supplyDocuments.productionDate,
          boolean_value: null,
          document_id: null,
        })
      }

      // Expiry date
      if (supplyDocuments.expiryDate) {
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'EXPIRY_DATE',
          value: null,
          date_value: supplyDocuments.expiryDate,
          boolean_value: null,
          document_id: null,
        })
      }

      // COA available
      if (supplyDocuments.coaAvailable) {
        supplyDocumentsPayload.push({
          supply_id: newSupplyId,
          document_type_code: 'COA',
          value: null,
          date_value: null,
          boolean_value: supplyDocuments.coaAvailable === 'YES',
          document_id: null,
        })
      }

      if (supplyDocumentsPayload.length > 0) {
        const { error: documentsError } = await supabase
          .from('supply_documents')
          .insert(supplyDocumentsPayload)
        if (documentsError) {
          throw documentsError
        }
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
          .select('id, code')
        
        if (paramsError) {
          throw paramsError
        }

        const packagingParamsMap = new Map(
          (packagingParams || []).map((p) => [p.code, p.id])
        )

        const packagingItemsPayload = [
          {
            packaging_check_id: packagingCheckId,
            parameter_id: packagingParamsMap.get('INACCURATE_LABELLING'),
            value: packagingQuality.inaccurateLabelling,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: packagingParamsMap.get('VISIBLE_DAMAGE'),
            value: packagingQuality.visibleDamage,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: packagingParamsMap.get('SPECIFIED_QUANTITY'),
            value: null,
            numeric_value: Number.parseFloat(packagingQuality.specifiedQuantity) || null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: packagingParamsMap.get('ODOR'),
            value: packagingQuality.odor,
            numeric_value: null,
          },
          {
            packaging_check_id: packagingCheckId,
            parameter_id: packagingParamsMap.get('STRENGTH_INTEGRITY'),
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
          const storagePath = `supplies/${newSupplyId}/signatures/signature_${Date.now()}_${supplierSignOff.documentFile.name}`
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, supplierSignOff.documentFile)
          
          if (!uploadError) {
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
            
            if (!docError && docData) {
              signOffDocumentId = docData.id
            }
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

      for (let i = 0; i < formData.supply_batches.length; i++) {
        const batch = formData.supply_batches[i]
        const amountPaidRaw = batch.amount_paid?.trim()
        const amountPaid = amountPaidRaw && Number.isFinite(Number(amountPaidRaw)) ? Number(amountPaidRaw) : 0
        if (amountPaid > 0) {
          const { error: paymentError } = await supabase.from('supply_payments').insert({
            supply_id: newSupplyId,
            amount: amountPaid,
            paid_at: receivedAtISO,
            reference: `Batch ${i + 1}`,
          })
          if (paymentError) {
            console.warn('Could not save amount paid for supply batch:', i + 1, paymentError)
            toast.warning('Supply saved but some batch payments could not be recorded. You can add them from the Payments page.')
          }
        }
      }

      toast.success('Supply captured successfully.')
      const createdSupplyId = newSupplyId
      setFormData(getInitialFormData())
      setQualityEntries(createInitialQualityEntries(qualityParameters))
      setSupplyDocuments({
        invoiceNumber: '',
        driverLicenseName: '',
        batchNumber: '',
        productionDate: '',
        expiryDate: '',
        coaAvailable: '',
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

  const handleSaveSupplierCoa = async () => {
    const supplierId = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null
    if (!supplierId || !Number.isFinite(supplierId)) {
      toast.error('Select a supplier first.')
      return
    }
    if (!addCoaFile) {
      toast.error('Upload a file or take a photo first.')
      return
    }
    setAddCoaUploading(true)
    try {
      const storagePath = `suppliers/${supplierId}/certificates/coa_${Date.now()}_${addCoaFile.name}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, addCoaFile)
      if (uploadError) {
        throw uploadError
      }
      const expiryToUse = addCoaExpiry.trim() ? addCoaExpiry.trim() : null
      const { error: insertError } = await supabase.from('documents').insert({
        owner_type: 'supplier',
        owner_id: supplierId,
        name: addCoaFile.name,
        document_type_code: 'COA',
        doc_type: 'COA',
        storage_path: storagePath,
        expiry_date: expiryToUse,
        uploaded_by: profileId ?? null,
      })
      if (insertError) {
        throw insertError
      }
      setSupplierCoaStatus('available')
      setSupplyDocuments((prev) => ({ ...prev, coaAvailable: 'YES' }))
      setAddCoaModalOpen(false)
      setAddCoaFile(null)
      setAddCoaExpiry('')
      toast.success('COA added to supplier.')
    } catch (err) {
      console.error('Error adding COA', err)
      toast.error(err instanceof Error ? err.message : 'Failed to add COA.')
    } finally {
      setAddCoaUploading(false)
    }
  }

  const loadSupplyForEdit = useCallback(
    async (supplyId: number) => {
      try {
        const [
          { data: supplyData, error: supplyError },
          { data: linesData, error: linesError },
          { data: docsData },
          { data: vehicleData },
          { data: packagingChecksData },
          { data: packagingItemsData },
          { data: qualityChecksData },
          { data: qualityItemsData },
          { data: signOffData },
        ] = await Promise.all([
          supabase.from('supplies').select('*').eq('id', supplyId).single(),
          supabase.from('supply_lines').select('*').eq('supply_id', supplyId),
          supabase.from('supply_documents').select('*').eq('supply_id', supplyId),
          supabase.from('supply_vehicle_inspections').select('*').eq('supply_id', supplyId).maybeSingle(),
          supabase.from('supply_packaging_quality_checks').select('*').eq('supply_id', supplyId).maybeSingle(),
          supabase.from('supply_packaging_quality_check_items').select('*'),
          supabase.from('supply_quality_checks').select('*').eq('supply_id', supplyId).order('id', { ascending: false }).limit(1),
          supabase.from('supply_quality_check_items').select('*'),
          supabase.from('supply_supplier_sign_offs').select('*').eq('supply_id', supplyId).maybeSingle(),
        ])
        if (supplyError || !supplyData) throw supplyError ?? new Error('Supply not found')
        if (linesError) throw linesError
        const supply = supplyData as Record<string, unknown>
        const lines = (linesData ?? []) as { product_id: number; unit_id: number | null; ordered_qty?: number; received_qty?: number; accepted_qty?: number; rejected_qty?: number; unit_price?: number | null }[]
        const docs = (docsData ?? []) as { document_type_code: string; value: string | null; date_value: string | null; boolean_value: boolean | null }[]
        const vehicle = vehicleData as Record<string, unknown> | null
        const packagingCheck = packagingChecksData?.[0] ?? null
        const packagingItems = (packagingItemsData ?? []).filter(
          (i: { packaging_check_id?: number }) => packagingCheck && i.packaging_check_id === (packagingCheck as { id: number }).id,
        ) as { parameter_id: number; value: string | null; numeric_value: number | null }[]
        const { data: packagingParamsData } = await supabase.from('packaging_quality_parameters').select('id, code')
        const packagingParamMap = new Map((packagingParamsData ?? []).map((p: { id: number; code: string }) => [p.id, p.code]))
        const qualityCheck = qualityChecksData?.[0] ?? null
        const qualityItems = (qualityItemsData ?? []).filter(
          (i: { quality_check_id?: number }) => qualityCheck && i.quality_check_id === (qualityCheck as { id: number }).id,
        ) as { parameter_id: number; score: number | null; remarks: string | null; results: string | null }[]
        const signOff = signOffData as Record<string, unknown> | null

        const getDoc = (code: string) => docs.find((d) => d.document_type_code === code)
        setFormData({
          doc_no: String(supply.doc_no ?? ''),
          warehouse_id: String(supply.warehouse_id ?? ''),
          supplier_id: String(supply.supplier_id ?? ''),
          received_at: supply.received_at ? toLocalDateTimeInput(new Date(supply.received_at as string)) : toLocalDateTimeInput(),
          received_by: currentUserName,
          doc_status: String(supply.doc_status ?? STATUS_OPTIONS[0]),
          supply_batches:
            lines.length > 0
              ? lines.map((l) => {
                  const received = Number(l.received_qty ?? l.ordered_qty ?? 0)
                  const accepted = Number(l.accepted_qty ?? 0)
                  const rejected = Number(l.rejected_qty ?? received - accepted)
                  return {
                    product_id: String(l.product_id),
                    unit_id: l.unit_id != null ? String(l.unit_id) : '',
                    qty: String(received),
                    accepted_qty: String(accepted),
                    rejected_qty: String(rejected >= 0 ? rejected : 0),
                    unit_price: l.unit_price != null ? String(l.unit_price) : '',
                    amount_paid: '',
                  }
                })
              : [{ product_id: '', unit_id: '', qty: '', accepted_qty: '0', rejected_qty: '0', unit_price: '', amount_paid: '' }],
        })
        const invDoc = getDoc('INVOICE')
        const driverDoc = getDoc('DRIVER_LICENSE')
        const batchDoc = getDoc('BATCH_NUMBER')
        const prodDoc = getDoc('PRODUCTION_DATE')
        const expDoc = getDoc('EXPIRY_DATE')
        const coaDoc = getDoc('COA')
        setSupplyDocuments({
          invoiceNumber: (invDoc?.value as string) ?? '',
          driverLicenseName: (driverDoc?.value as string) ?? '',
          batchNumber: (batchDoc?.value as string) ?? '',
          productionDate: (prodDoc?.date_value as string) ?? '',
          expiryDate: (expDoc?.date_value as string) ?? '',
          coaAvailable: coaDoc?.boolean_value === true ? 'YES' : coaDoc?.boolean_value === false ? 'NO' : '',
          invoiceFile: null,
        })
        setVehicleInspection({
          vehicleClean: (vehicle?.vehicle_clean as string) ?? '',
          noForeignObjects: (vehicle?.no_foreign_objects as string) ?? '',
          noPestInfestation: (vehicle?.no_pest_infestation as string) ?? '',
          remarks: (vehicle?.remarks as string) ?? '',
        })
        const paramByCode: Record<string, string> = {
          INACCURATE_LABELLING: 'inaccurateLabelling',
          VISIBLE_DAMAGE: 'visibleDamage',
          SPECIFIED_QUANTITY: 'specifiedQuantity',
          ODOR: 'odor',
          STRENGTH_INTEGRITY: 'strengthIntegrity',
        }
        const packagingMap: Record<string, string> = {}
        packagingItems.forEach((item) => {
          const code = packagingParamMap.get(item.parameter_id) ?? ''
          const key = paramByCode[code]
          if (key) {
            packagingMap[key] = item.value ?? (item.numeric_value != null ? String(item.numeric_value) : '')
          }
        })
        setPackagingQuality({
          inaccurateLabelling: packagingMap.inaccurateLabelling ?? '',
          visibleDamage: packagingMap.visibleDamage ?? '',
          specifiedQuantity: packagingMap.specifiedQuantity ?? '',
          odor: packagingMap.odor ?? '',
          strengthIntegrity: packagingMap.strengthIntegrity ?? '',
        })
        const entries: QualityEntries = {}
        qualityItems.forEach((item) => {
          const param = qualityParameters.find((p) => p.id === item.parameter_id)
          if (param?.code) {
            entries[param.code] = {
              score: item.score ?? 3,
              remarks: item.remarks ?? '',
              results: item.results ?? '',
            }
          }
        })
        setQualityEntries((prev) => ({ ...createInitialQualityEntries(qualityParameters), ...entries }))
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
    setIsModalOpen(false)
    setEditingSupplyId(null)
    setEditLoadDone(false)
    setFormData(getInitialFormData())
    setQualityEntries(createInitialQualityEntries(qualityParameters))
    setSupplyDocuments({
      invoiceNumber: '',
      driverLicenseName: '',
      batchNumber: '',
      productionDate: '',
      expiryDate: '',
      coaAvailable: '',
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
  }

  const handleRowClick = (supply: Supply) => {
    const lines = supplyLines.filter((line) => line.supply_id === supply.id)
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
    const packagingCheckForSupply = packagingChecks.find((check) => check.supply_id === supply.id)
    const packagingItemsForSupply = packagingItems.filter((item) => 
      packagingCheckForSupply && item.packaging_check_id === packagingCheckForSupply.id
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
    navigate(`/supplies/${supply.id}`, {
      state: {
        supply,
        supplyLines: lines,
        supplyBatches: batches,
        supplyQualityChecks: qualityChecksForSupply,
        supplyQualityItems: qualityItemsForSupply,
        qualityParameters,
        supplyDocuments: supplyDocumentsForSupply,
        vehicleInspection: vehicleInspectionForSupply,
        packagingCheck: packagingCheckForSupply,
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
    setQualityEntries(createInitialQualityEntries(qualityParameters))
    setSupplyDocuments({
      invoiceNumber: '',
      driverLicenseName: '',
      batchNumber: '',
      productionDate: '',
      expiryDate: '',
      coaAvailable: '',
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
    setIsModalOpen(true)
  }, [getInitialFormData, warehouses, qualityParameters])

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive dark:focus:ring-olive/40'

  const sectionCardClass =
    'rounded-xl border border-olive-light/40 bg-olive-light/10 p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900/40'

  useEffect(() => {
    if (suppliersError) {
      toast.error(suppliersError.message ?? 'Unable to load suppliers from Supabase.')
    }
  }, [suppliersError])

  useEffect(() => {
    setQualityEntries((previous) => {
      const next = { ...previous }
      let changed = false

      qualityParameters.forEach((parameter) => {
        if (!next[parameter.code]) {
          next[parameter.code] = {
            score: 3,
            remarks: '',
            results: '',
          }
          changed = true
        }
      })

      Object.keys(next).forEach((code) => {
        if (!qualityParameters.some((parameter) => parameter.code === code)) {
          delete next[code as keyof QualityEntries]
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [qualityParameters])

  const loadReferenceData = useCallback(async () => {
    try {
      const [
        warehousesResponse,
        productsResponse,
        unitsResponse,
        qualityParametersResponse,
      ] = await Promise.all([
        supabase.from('warehouses').select('id, name').order('name', { ascending: true }),
        supabase.from('products').select('id, name, sku, product_type').order('name', { ascending: true }),
        supabase.from('units').select('id, name, symbol').order('name', { ascending: true }),
        supabase.from('quality_parameters').select('id, code, name, specification').order('id', {
          ascending: true,
        }),
      ])

      if (warehousesResponse.error) throw warehousesResponse.error
      if (productsResponse.error) throw productsResponse.error
      if (unitsResponse.error) throw unitsResponse.error
      if (qualityParametersResponse.error) throw qualityParametersResponse.error

      setWarehouses((warehousesResponse.data ?? []) as Warehouse[])
      setProducts((productsResponse.data ?? []) as Product[])
      setUnits((unitsResponse.data ?? []) as Unit[])

      const qualityData = qualityParametersResponse.data ?? []
      if (qualityData.length > 0) {
        const mappedParameters: QualityParameterWithId[] = qualityData.map((entry) => ({
          id: entry.id ?? null,
          code: entry.code,
          name: entry.name,
          specification: entry.specification ?? '',
          defaultRemarks: '',
        }))
        setQualityParameters(mappedParameters)
        // Initialize quality entries with fetched parameters
        setQualityEntries(createInitialQualityEntries(mappedParameters))
      } else {
        setQualityParameters([])
        setQualityEntries({})
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
        linesResponse,
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
          .select('id, doc_no, supplier_id, warehouse_id, received_at, created_at, doc_status, reference')
          .order('received_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase.from('supply_lines').select('id, supply_id, product_id, unit_id, accepted_qty, unit_price'),
        supabase.from('supply_batches').select('id, supply_id, current_qty, received_qty, quality_status'),
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
      if (linesResponse.error) throw linesResponse.error
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
      setSupplyLines((linesResponse.data ?? []) as SupplyLine[])
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
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, location.pathname, navigate])

  // Fetch supplier COA status only when on the documents step (step 1) to avoid re-renders/jitter when selecting supplier on step 0
  useEffect(() => {
    if (currentStep !== 1) {
      return
    }
    const supplierId = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null
    if (!supplierId || !Number.isFinite(supplierId)) {
      setSupplierCoaStatus(null)
      setSupplierCoaLoading(false)
      return
    }
    let cancelled = false
    setSupplierCoaLoading(true)
    supabase
      .from('documents')
      .select('id, expiry_date')
      .eq('owner_type', 'supplier')
      .eq('owner_id', supplierId)
      .eq('document_type_code', 'COA')
      .then(({ data, error }) => {
        if (cancelled) return
        setSupplierCoaLoading(false)
        if (error) {
          setSupplierCoaStatus('missing')
          return
        }
        const docs = (data ?? []) as { id: number; expiry_date: string | null }[]
        if (docs.length === 0) {
          setSupplierCoaStatus('missing')
          return
        }
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const hasValid = docs.some((d) => {
          if (!d.expiry_date) return true
          const exp = new Date(d.expiry_date)
          exp.setHours(0, 0, 0, 0)
          return exp >= now
        })
        const allExpired = docs.every((d) => {
          if (!d.expiry_date) return false
          const exp = new Date(d.expiry_date)
          exp.setHours(0, 0, 0, 0)
          return exp < now
        })
        setSupplierCoaStatus(hasValid ? 'available' : allExpired ? 'expired' : 'missing')
      })
    return () => {
      cancelled = true
    }
  }, [currentStep, formData.supplier_id])

  if (loadingData) {
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

  return (
    <>
      <PageLayout
        title="Supplies"
        activeItem="supplies"
        actions={
          <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenModal}>
            <Plus className="mr-2 h-4 w-4" />
            New Supply
          </Button>
        }
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
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
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

              <ResponsiveTable
                columns={columns}
                data={paginatedSupplies}
                rowKey="id"
                onRowClick={handleRowClick}
                tableClassName=""
                mobileCardClassName=""
                getRowClassName={() => ''}
              />
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
                {STEPS.map((label, index) => {
                  const isActive = index === currentStep
                  const isComplete = index < currentStep
                  return (
                    <li key={label} className="flex items-center gap-2 text-sm">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                          isActive
                            ? 'bg-olive text-white'
                            : isComplete
                            ? 'bg-olive-light text-olive-dark'
                            : 'border border-olive-light/60 bg-white text-text-dark/60'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`font-medium ${
                          isActive ? 'text-text-dark' : 'text-text-dark/60'
                        }`}
                      >
                        {label}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>

            <form ref={formScrollRef} onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-5 sm:p-6 lg:p-8">
                {currentStep === 0 && (
                  <section className={sectionCardClass}>
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
                          placeholder={suppliersLoading ? 'Loading suppliers...' : 'Select supplier'}
                          disabled={isSubmitting}
                          required
                          emptyMessage={supplierList.length === 0 ? 'No suppliers found. Add suppliers under Partner → Suppliers.' : 'No match'}
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

                {currentStep === 1 && (
                  <section className={sectionCardClass}>
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
                    {formData.supplier_id && (
                      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-olive-light/40 bg-white px-4 py-3">
                        <span className="text-sm font-medium text-text-dark/80">Supplier COA:</span>
                        {supplierCoaLoading ? (
                          <span className="text-sm text-text-dark/60">Checking…</span>
                        ) : supplierCoaStatus === 'available' ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                            COA available
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAddCoaFile(null)
                              setAddCoaExpiry('')
                              setAddCoaModalOpen(true)
                            }}
                            disabled={isSubmitting}
                          >
                            Add a new COA
                          </Button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {currentStep === 2 && (
                  <section className={sectionCardClass}>
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

                {currentStep === 3 && (
                  <section className={sectionCardClass}>
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

                {currentStep === 4 && (
                  <section className={sectionCardClass}>
                    <div className="mb-6 flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-text-dark">Quality evaluation</h3>
                        <p className="text-sm text-text-dark/70">
                          Score each parameter and capture remarks for transparency.
                        </p>
                      </div>
                    </div>

                    <QualityEvaluationTable
                      parameters={qualityParameters}
                      entries={qualityEntries}
                      legend={SUPPLY_QUALITY_SCORE_LEGEND}
                      onEntryChange={handleQualityEntryChange}
                    />
                  </section>
                )}

                {currentStep === 5 && (
                  <section className="space-y-6">
                    <div className={sectionCardClass}>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-text-dark dark:text-slate-100">Finalize supply</h3>
                        <p className="text-sm text-text-dark/70 dark:text-slate-300">
                          Confirm the outcome and key details before submission.
                        </p>
                      </div>
                      <div className="grid gap-6 lg:grid-cols-12">
                        <div className="space-y-2 lg:col-span-4">
                          <Label htmlFor="doc_status_review">Supply status *</Label>
                          <select
                            id="doc_status_review"
                            required
                            className={baseFieldClass}
                            value={formData.doc_status}
                            onChange={(event) => handleInputChange('doc_status', event.target.value)}
                          >
                            <option value="">Select status</option>
                            {STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-text-dark/60 dark:text-slate-400">
                            Set the final state after completing quality evaluation.
                          </p>
                        </div>
                        <div className="space-y-2 lg:col-span-4">
                          <Label htmlFor="review_received_at">Received at</Label>
                          <Input
                            id="review_received_at"
                            readOnly
                            value={formatDateTime(formData.received_at)}
                            className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70 dark:bg-slate-900/60 dark:text-slate-300`}
                          />
                        </div>
                        <div className="space-y-2 lg:col-span-4">
                          <Label htmlFor="review_received_by">Received by</Label>
                          <Input
                            id="review_received_by"
                            readOnly
                            value={formData.received_by}
                            className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70 dark:bg-slate-900/60 dark:text-slate-300`}
                          />
                        </div>
                      </div>
                      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-400">
                            Document number
                          </dt>
                          <dd className="text-sm font-medium text-text-dark dark:text-slate-100">
                            {formData.doc_no}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-400">
                            Warehouse
                          </dt>
                          <dd className="text-sm font-medium text-text-dark dark:text-slate-100">
                            {warehouseLabelMap.get(parseInt(formData.warehouse_id, 10)) || 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-400">
                            Supplier
                          </dt>
                          <dd className="text-sm font-medium text-text-dark dark:text-slate-100">
                            {supplierLabelMap.get(parseInt(formData.supplier_id, 10)) || 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dark/60 dark:text-slate-400">
                            Quality score
                          </dt>
                          <dd className="text-sm font-medium text-text-dark dark:text-slate-100">
                            {qualityAverageScore ?? 'Pending'}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className={sectionCardClass}>
                      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-text-dark dark:text-slate-100">
                            Supply batches
                          </h3>
                          <p className="text-sm text-text-dark/70 dark:text-slate-300">
                            Enter each batch after completing quality evaluation, then allocate accepted and rejected
                            quantities.
                          </p>
                        </div>
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

                      <div className="space-y-6">
                        {formData.supply_batches.map((batch, index) => (
                          <div
                            key={index}
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
                              </div>
                              {formData.supply_batches.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  onClick={() => removeSupplyBatch(index)}
                                  disabled={isSubmitting}
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
                                  options={rawProducts.map((product) => ({
                                    value: String(product.id),
                                    label: `${String(product.name)}${product.sku ? ` (${String(product.sku)})` : ''}`,
                                  }))}
                                  value={batch.product_id}
                                  onChange={(value) => handleSupplyBatchChange(index, 'product_id', value)}
                                  placeholder="Select raw product"
                                  disabled={isSubmitting || rawProducts.length === 0}
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
                                  disabled={isSubmitting || units.length === 0}
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
                                  placeholder="e.g. 120"
                                  className={baseFieldClass}
                                />
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`accepted_${index}`}>Accepted quantity *</Label>
                                <Input
                                  id={`accepted_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={batch.accepted_qty}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'accepted_qty', event.target.value)
                                  }
                                  placeholder="e.g. 110"
                                  className={baseFieldClass}
                                />
                              </div>
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`rejected_${index}`}>Rejected quantity</Label>
                                <Input
                                  id={`rejected_${index}`}
                                  type="number"
                                  readOnly
                                  value={batch.rejected_qty}
                                  className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70 dark:bg-slate-900/60 dark:text-slate-300`}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Calculated automatically from received minus accepted.
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
                              <div className="space-y-2 lg:col-span-6">
                                <Label htmlFor={`unit_price_${index}`}>Unit price (optional)</Label>
                                <Input
                                  id={`unit_price_${index}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={batch.unit_price}
                                  onChange={(event) =>
                                    handleSupplyBatchChange(index, 'unit_price', event.target.value)
                                  }
                                  placeholder="e.g. 12.50"
                                  className={baseFieldClass}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Price per unit for this line; used for payment tracking.
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
                                  placeholder="e.g. 0.00"
                                  className={baseFieldClass}
                                />
                                <p className="text-xs text-text-dark/60 dark:text-slate-400">
                                  Payment amount for this batch. Visible on the Payments page.
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={sectionCardClass}>
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-text-dark dark:text-slate-100">
                          Review quality evaluation
                        </h3>
                        <p className="text-sm text-text-dark/70 dark:text-slate-300">
                          Confirm recorded scores before submitting the supply.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70 dark:bg-slate-900/50 dark:text-slate-200">
                          Average score: {qualityAverageScore ?? '—'}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-olive-light/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-dark/70 dark:bg-slate-900/50 dark:text-slate-200">
                          Entries: {qualityParameters.length}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {qualityParameters.map((parameter) => {
                          const entry = qualityEntries[parameter.code]
                          const remarks = entry?.remarks?.trim() ? String(entry.remarks.trim()) : 'No remarks'
                          return (
                            <div
                              key={`review-quality-${parameter.code}`}
                              className="flex min-h-[5.5rem] flex-col justify-between rounded-xl border border-olive-light/40 bg-white px-3 py-2.5 shadow-sm transition hover:border-olive-light/70 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-slate-500"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-sm font-semibold text-text-dark dark:text-slate-100">
                                  {parameter.name}
                                </p>
                                <span className="inline-flex items-center rounded-full bg-olive-light/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-dark/80 dark:bg-slate-900/50 dark:text-slate-100">
                                  {entry?.score ?? '—'}
                                </span>
                              </div>
                              <p className="mt-3 text-sm text-text-dark/70 dark:text-slate-200">{remarks}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {currentStep === 6 && (
                  <section className={sectionCardClass}>
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
                  {currentStep > 0 && (
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
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Saving…' : isLastStep ? 'Submit Supply' : 'Next'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {addCoaModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-olive-light/40 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-text-dark">Add COA to supplier</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAddCoaModalOpen(false)
                  setAddCoaFile(null)
                  setAddCoaExpiry('')
                }}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>COA document</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setAddCoaFile(e.target.files?.[0] ?? null)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddCoaCameraOpen(true)}
                    title="Take photo"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
                {addCoaFile && (
                  <p className="mt-1 text-sm text-text-dark/70">{addCoaFile.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="add_coa_expiry">Expiry date (optional)</Label>
                <Input
                  id="add_coa_expiry"
                  type="date"
                  value={addCoaExpiry}
                  onChange={(e) => setAddCoaExpiry(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAddCoaModalOpen(false)
                  setAddCoaFile(null)
                  setAddCoaExpiry('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSupplierCoa}
                disabled={addCoaUploading || !addCoaFile}
              >
                {addCoaUploading ? 'Saving…' : 'Save COA'}
              </Button>
            </div>
          </div>
        </div>
      )}
      <CameraCapture
        isOpen={addCoaCameraOpen}
        onClose={() => setAddCoaCameraOpen(false)}
        onCapture={(file) => {
          setAddCoaFile(file)
          setAddCoaCameraOpen(false)
        }}
        disabled={addCoaUploading}
      />
    </>
  )
}

export default Supplies
