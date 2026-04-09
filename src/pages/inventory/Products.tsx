import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type Dispatch, type SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Boxes, Briefcase, Link2, Package2, Pencil, Plus, RefreshCcw, Trash2, X, Sparkles } from 'lucide-react'
import ResponsiveTable from '@/components/ResponsiveTable'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import type { PostgrestError } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/spinner'
import SettingsTour from '@/components/tour/SettingsTour'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FEATURE_PROCESSING_PRODUCT_WIZARD } from '@/lib/features'
import { useSettingsTour, type TourStep } from '@/hooks/useSettingsTour'

interface ComponentProduct {
  id: number
  name: string | null
  sku: string | null
  product_type: 'RAW' | 'WIP' | 'FINISHED' | 'OP' | null
  is_mixed_product?: boolean | null
}

interface ProductComponentRow {
  component_product: ComponentProduct | null
}

interface Product {
  id: number
  sku: string | null
  name: string | null
  category: string | null
  base_unit_id: number | null
  reorder_point: number | null
  safety_stock: number | null
  target_stock: number | null
  status: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  product_type: 'RAW' | 'WIP' | 'FINISHED' | 'OP' | null
  is_mixed_product?: boolean | null
  product_components?: ProductComponentRow[] | null
}

interface ProductChainMeta {
  chainId: number
  chainName: string
}

interface PreparedProduct extends Product {
  createdAtDate: Date | null
  updatedAtDate: Date | null
}

interface Unit {
  id: number
  name: string | null
  symbol: string | null
}

interface ProductFormData {
  name: string
  base_unit_id: string
  reorder_point: string
  safety_stock: string
  target_stock: string
  status: string
  notes: string
  product_type: string
  is_mixed_product: boolean
  component_ids: number[]
}

interface FormErrors {
  name?: string
  status?: string
  product_type?: string
  components?: string
}

interface BulkEditFormData {
  base_unit_id: string
  reorder_point: string
  safety_stock: string
  target_stock: string
  status: string
  raw_component_ids: number[]
  wip_component_ids: number[]
}

type CreationMode = 'OPERATIONAL' | 'PROCESSING' | 'MIXED' | null
type ProductCatalogTab = 'RAW' | 'PROCESSED' | 'OPERATIONAL'

interface ProcessingDraftBase {
  id?: number
  temp_key: string
  name: string
  base_unit_id: string
  reorder_point: string
  safety_stock: string
  target_stock: string
  status: string
  notes: string
}

interface ProcessingRawDraft extends ProcessingDraftBase {}

interface ProcessingWipDraft extends ProcessingDraftBase {
  raw_component_temp_keys: string[]
}

interface ProcessingFinishedDraft extends ProcessingDraftBase {
  wip_component_temp_keys: string[]
}

interface LoadedChain {
  chainId: number
  chainName: string | null
  raws: ProcessingRawDraft[]
  wips: ProcessingWipDraft[]
  finished: ProcessingFinishedDraft[]
}

const statusBadgeStyles = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  DEVELOPMENT: 'bg-blue-100 text-blue-800',
}

const productTypeBadgeStyles: Record<string, string> = {
  RAW: 'bg-amber-100 text-amber-800',
  WIP: 'bg-blue-100 text-blue-800',
  FINISHED: 'bg-green-100 text-green-800',
  OP: 'bg-slate-100 text-slate-800',
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_REORDER_POINT = 250
const DEFAULT_SAFETY_STOCK = 100
const DEFAULT_TARGET_STOCK = 500

const sortableColumns = [
  { value: 'name', label: 'Name' },
  { value: 'product_type', label: 'Type' },
  { value: 'reorder_point', label: 'Reorder Point' },
  { value: 'safety_stock', label: 'Safety Stock' },
  { value: 'target_stock', label: 'Target Stock' },
  { value: 'updated_at', label: 'Last Updated' },
]

function resolveDefaultKgUnitId(units: Unit[]): string {
  const kilogramUnit = units.find((unit) => {
    const symbol = (unit.symbol ?? '').trim().toLowerCase()
    const name = (unit.name ?? '').trim().toLowerCase()
    return symbol === 'kg' || name === 'kilogram' || name === 'kg'
  })
  return kilogramUnit ? String(kilogramUnit.id) : ''
}

function createEmptyProductForm(existingProducts: Product[] = [], units: Unit[] = []): ProductFormData {
  return {
    name: '',
    base_unit_id: resolveDefaultKgUnitId(units),
    reorder_point: String(DEFAULT_REORDER_POINT),
    safety_stock: String(DEFAULT_SAFETY_STOCK),
    target_stock: String(DEFAULT_TARGET_STOCK),
    status: 'ACTIVE',
    notes: '',
    product_type: 'RAW',
    is_mixed_product: false,
    component_ids: [],
  }
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function formatDate(value: string | Date | null | undefined): string {
  const date = parseDate(value)
  if (!date) {
    return '—'
  }
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const numeric = Number(value)
  if (Number.isNaN(numeric)) {
    return '—'
  }
  return new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(numeric)
}

function normalizeProductName(value: string): string {
  return value.trim().toLowerCase()
}

function formatComponentsLine(product: Product): string | null {
  const components = product.product_components
    ?.map((row) => row?.component_product)
    .filter((p): p is ComponentProduct => !!p && !!p.id)
  if (!components || components.length === 0) return null
  const names = components.map((c) => c.name || `#${c.id}`)
  const type = (product.product_type || '').toUpperCase()
  if (type === 'OP') return null
  if (type === 'WIP') return `Raw materials: ${names.join(', ')}`
  if (type === 'FINISHED') return `From WIPs: ${names.join(', ')}`
  return `Components: ${names.join(', ')}`
}

function generateSku(existingProducts: Product[]): string {
  const nextId =
    existingProducts.length === 0 ? 1 : Math.max(...existingProducts.map((p) => p.id), 0) + 1
  return `PRD-${String(nextId).padStart(5, '0')}`
}

function createEmptyBulkEditForm(): BulkEditFormData {
  return {
    base_unit_id: 'NO_CHANGE',
    reorder_point: '',
    safety_stock: '',
    target_stock: '',
    status: 'NO_CHANGE',
    raw_component_ids: [],
    wip_component_ids: [],
  }
}

function createProcessingDraftBase(units: Unit[]): ProcessingDraftBase {
  return {
    temp_key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    base_unit_id: resolveDefaultKgUnitId(units),
    reorder_point: String(DEFAULT_REORDER_POINT),
    safety_stock: String(DEFAULT_SAFETY_STOCK),
    target_stock: String(DEFAULT_TARGET_STOCK),
    status: 'ACTIVE',
    notes: '',
  }
}

function Products() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [productChainMetaByProductId, setProductChainMetaByProductId] = useState<Map<number, ProductChainMeta>>(new Map())
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [catalogTab, setCatalogTab] = useState<ProductCatalogTab>('RAW')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>(() => createEmptyProductForm())
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [creationMode, setCreationMode] = useState<CreationMode>(null)
  const [processingStep, setProcessingStep] = useState<1 | 2 | 3>(1)
  const [processingChainId, setProcessingChainId] = useState<number | null>(null)
  const [processingChainName, setProcessingChainName] = useState('')
  const [processingRaws, setProcessingRaws] = useState<ProcessingRawDraft[]>([])
  const [processingWips, setProcessingWips] = useState<ProcessingWipDraft[]>([])
  const [processingFinished, setProcessingFinished] = useState<ProcessingFinishedDraft[]>([])
  const [processingEditMode, setProcessingEditMode] = useState(false)
  const [processingFallbackNotice, setProcessingFallbackNotice] = useState<string | null>(null)
  const [linkingLegacyProduct, setLinkingLegacyProduct] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkDeleteAlertOpen, setBulkDeleteAlertOpen] = useState(false)
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditFormData>(createEmptyBulkEditForm())
  const [tourFlow, setTourFlow] = useState<CreationMode>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    // First attempt: include component join; fallback to basic select if relation/table missing
    const complexSelect = `
      id,
      sku,
      name,
      category,
      base_unit_id,
      reorder_point,
      safety_stock,
      target_stock,
      status,
      notes,
      created_at,
      updated_at,
      product_type,
      is_mixed_product,
      product_components:product_components!product_components_parent_product_id_fkey (
        component_product:products!product_components_component_product_id_fkey (id, name, sku, product_type)
      )
    `

    let data: any[] | null = null
    let fetchError: PostgrestError | null = null

    const attempt = await supabase.from('products').select(complexSelect).order('updated_at', { ascending: false, nullsFirst: false })
    if (attempt.error) {
      console.warn('Products fetch with components failed, retrying without components:', attempt.error)
      fetchError = attempt.error
      const fallback = await supabase
        .from('products')
        .select(
          'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type, is_mixed_product'
        )
        .order('updated_at', { ascending: false, nullsFirst: false })
      data = fallback.data ?? []
      if (fallback.error) {
        fetchError = fallback.error
      } else {
        fetchError = null
      }
    } else {
      data = attempt.data ?? []
    }

    if (fetchError) {
      console.error('Error fetching products', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load products from Supabase.')
      setProducts([])
      setProductChainMetaByProductId(new Map())
      setLoading(false)
      return
    }

    const loadedProducts = Array.isArray(data) ? data : []
    setProducts(loadedProducts)

    try {
      const productIds = loadedProducts
        .map((product: Product) => product.id)
        .filter((id): id is number => typeof id === 'number')

      if (productIds.length === 0) {
        setProductChainMetaByProductId(new Map())
      } else {
        const { data: chainMembersData, error: chainMembersError } = await supabase
          .from('product_processing_chain_members')
          .select('product_id, chain_id, chain:product_processing_chains(name)')
          .in('product_id', productIds)

        if (chainMembersError) {
          console.warn('Unable to fetch processing chain names for products:', chainMembersError)
          setProductChainMetaByProductId(new Map())
        } else {
          const nextMap = new Map<number, ProductChainMeta>()
          ;(
            (chainMembersData ?? []) as Array<{
              product_id: number
              chain_id: number
              chain: { name: string | null } | null
            }>
          ).forEach((row) => {
            const chainLabel =
              row.chain?.name && row.chain.name.trim().length > 0
                ? row.chain.name.trim()
                : `Chain ${row.chain_id}`
            nextMap.set(row.product_id, {
              chainId: row.chain_id,
              chainName: chainLabel,
            })
          })
          setProductChainMetaByProductId(nextMap)
        }
      }
    } catch (chainLookupError) {
      console.warn('Failed while loading product chain labels:', chainLookupError)
      setProductChainMetaByProductId(new Map())
    }

    setLoading(false)
  }, [])

  const fetchUnits = useCallback(async () => {
    setLoadingUnits(true)
    const { data, error: fetchError } = await supabase
      .from('units')
      .select('id, name, symbol')
      .order('name', { ascending: true })

    if (fetchError) {
      console.error('Error fetching units', fetchError)
      toast.error(fetchError.message ?? 'Unable to load units for products.')
      setUnits([])
      setLoadingUnits(false)
      return
    }

    setUnits(Array.isArray(data) ? data : [])
    setLoadingUnits(false)
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    fetchUnits()
  }, [fetchUnits])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, statusFilter, catalogTab, sortBy, sortDirection])

  const unitMap = useMemo(() => {
    const map = new Map<number, Unit>()
    units.forEach((unit: Unit) => {
      if (unit?.id !== undefined && unit?.id !== null) {
        map.set(unit.id, unit)
      }
    })
    return map
  }, [units])

  const preparedProducts = useMemo(
    () =>
      products.map((product: Product): PreparedProduct => ({
        ...product,
        createdAtDate: parseDate(product.created_at),
        updatedAtDate: parseDate(product.updated_at),
      })),
    [products]
  )

  const rawProductOptions = useMemo(
    () => products.filter((p) => (p.product_type || '').toUpperCase() === 'RAW'),
    [products]
  )
  const wipProductOptions = useMemo(
    () => products.filter((p) => (p.product_type || '').toUpperCase() === 'WIP'),
    [products]
  )
  const finishedProductOptions = useMemo(
    () => products.filter((p) => (p.product_type || '').toUpperCase() === 'FINISHED'),
    [products]
  )
  const [componentSearch, setComponentSearch] = useState('')
  const [bulkComponentSearch, setBulkComponentSearch] = useState('')
  const filteredRawOptions = useMemo(() => {
    const q = componentSearch.trim().toLowerCase()
    const filtered = rawProductOptions.filter((p) => {
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
    const selected = new Set(formData.component_ids)
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0
      const bSel = selected.has(b.id) ? 1 : 0
      if (aSel !== bSel) return bSel - aSel
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [componentSearch, rawProductOptions, formData.component_ids])
  const filteredWipOptions = useMemo(() => {
    const q = componentSearch.trim().toLowerCase()
    const filtered = wipProductOptions.filter((p) => {
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
    const selected = new Set(formData.component_ids)
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0
      const bSel = selected.has(b.id) ? 1 : 0
      if (aSel !== bSel) return bSel - aSel
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [componentSearch, wipProductOptions, formData.component_ids])
  const filteredFinishedOptions = useMemo(() => {
    const q = componentSearch.trim().toLowerCase()
    const filtered = finishedProductOptions.filter((p) => {
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
    const selected = new Set(formData.component_ids)
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0
      const bSel = selected.has(b.id) ? 1 : 0
      if (aSel !== bSel) return bSel - aSel
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [componentSearch, finishedProductOptions, formData.component_ids])
  const filteredRawOptionsBulk = useMemo(() => {
    const q = bulkComponentSearch.trim().toLowerCase()
    const filtered = rawProductOptions.filter((p) => {
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
    const selected = new Set(bulkEditForm.raw_component_ids)
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0
      const bSel = selected.has(b.id) ? 1 : 0
      if (aSel !== bSel) return bSel - aSel
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [bulkComponentSearch, rawProductOptions, bulkEditForm.raw_component_ids])
  const filteredWipOptionsBulk = useMemo(() => {
    const q = bulkComponentSearch.trim().toLowerCase()
    const filtered = wipProductOptions.filter((p) => {
      if (!q) return true
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    })
    const selected = new Set(bulkEditForm.wip_component_ids)
    return filtered.sort((a, b) => {
      const aSel = selected.has(a.id) ? 1 : 0
      const bSel = selected.has(b.id) ? 1 : 0
      if (aSel !== bSel) return bSel - aSel
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [bulkComponentSearch, wipProductOptions, bulkEditForm.wip_component_ids])
  const editingProductId = useMemo(() => (editingProduct?.id ? editingProduct.id : null), [editingProduct])

  const statusOptions = useMemo(() => {
    const statusSet = new Set<string>()
    preparedProducts.forEach((product: PreparedProduct) => {
      if (product.status) {
        statusSet.add(product.status.toUpperCase())
      }
    })
    return Array.from(statusSet)
      .sort((a: string, b: string) => a.localeCompare(b))
      .map((status: string) => status)
  }, [preparedProducts])

  const tabScopedProducts = useMemo(() => {
    if (catalogTab === 'RAW') {
      return preparedProducts.filter((product: PreparedProduct) => (product.product_type ?? 'RAW').toUpperCase() === 'RAW')
    }
    if (catalogTab === 'OPERATIONAL') {
      return preparedProducts.filter((product: PreparedProduct) => (product.product_type ?? '').toUpperCase() === 'OP')
    }
    return preparedProducts.filter((product: PreparedProduct) => {
      const type = (product.product_type ?? '').toUpperCase()
      return type === 'WIP' || type === 'FINISHED'
    })
  }, [catalogTab, preparedProducts])

  const filteredProducts = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    const matchesFilters = (product: PreparedProduct): boolean => {
      const matchesSearch =
        normalisedSearch.length === 0 ||
        (product.name ?? '').toLowerCase().includes(normalisedSearch) ||
        (product.notes ?? '').toLowerCase().includes(normalisedSearch)

      const matchesStatus =
        statusFilter === 'ALL' ||
        (product.status ?? '').toUpperCase() === statusFilter.toUpperCase()
      return matchesSearch && matchesStatus
    }

    const comparator = (a: PreparedProduct, b: PreparedProduct): number => {
      const direction = sortDirection === 'asc' ? 1 : -1

      if (['reorder_point', 'safety_stock', 'target_stock'].includes(sortBy)) {
        const aValue = Number(a[sortBy as keyof PreparedProduct]) || 0
        const bValue = Number(b[sortBy as keyof PreparedProduct]) || 0
        return (aValue - bValue) * direction
      }

      if (sortBy === 'updated_at') {
        const aDate = a.updatedAtDate?.getTime() ?? 0
        const bDate = b.updatedAtDate?.getTime() ?? 0
        return (aDate - bDate) * direction
      }

      if (sortBy === 'product_type') {
        const aVal = (a.product_type ?? 'RAW').toLowerCase()
        const bVal = (b.product_type ?? 'RAW').toLowerCase()
        if (aVal < bVal) return -1 * direction
        if (aVal > bVal) return 1 * direction
        return 0
      }

      const aValue = (a[sortBy as keyof PreparedProduct] ?? '').toString().toLowerCase()
      const bValue = (b[sortBy as keyof PreparedProduct] ?? '').toString().toLowerCase()

      if (aValue < bValue) return -1 * direction
      if (aValue > bValue) return 1 * direction
      return 0
    }

    const sorted = tabScopedProducts.filter(matchesFilters).sort(comparator)
    const seenChains = new Set<number>()
    return sorted.filter((product) => {
      const chainMeta = productChainMetaByProductId.get(product.id)
      if (!chainMeta) return true
      if (seenChains.has(chainMeta.chainId)) return false
      seenChains.add(chainMeta.chainId)
      return true
    })
  }, [tabScopedProducts, searchTerm, sortBy, sortDirection, statusFilter, productChainMetaByProductId])

  const paginatedProducts = useMemo(
    () => filteredProducts.slice((page - 1) * pageSize, page * pageSize),
    [filteredProducts, page, pageSize]
  )

  const selectedProductsForBulk = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]))
    return selectedProductIds
      .map((id) => map.get(id))
      .filter((p): p is Product => Boolean(p))
  }, [products, selectedProductIds])

  const hasWipSelection = useMemo(
    () => selectedProductsForBulk.some((p) => (p.product_type || '').toUpperCase() === 'WIP'),
    [selectedProductsForBulk]
  )
  const hasFinishedSelection = useMemo(
    () => selectedProductsForBulk.some((p) => (p.product_type || '').toUpperCase() === 'FINISHED'),
    [selectedProductsForBulk]
  )

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize))
    if (page > totalPages) setPage(totalPages)
  }, [filteredProducts.length, page, pageSize])

  useEffect(() => {
    const existingIds = new Set(products.map((product) => product.id))
    setSelectedProductIds((previous) => previous.filter((id) => existingIds.has(id)))
  }, [products])

  const stats = useMemo(() => {
    const total = tabScopedProducts.length
    let active = 0
    let inactive = 0
    let configuredReorder = 0
    let updatedRecent = 0
    const now = Date.now()

    tabScopedProducts.forEach((product) => {
      const status = (product.status ?? '').toUpperCase()
      if (status === 'ACTIVE') {
        active += 1
      }
      if (status === 'INACTIVE') {
        inactive += 1
      }
      if (product.reorder_point !== null && product.reorder_point !== undefined) {
        configuredReorder += 1
      }
      if (product.updatedAtDate && now - product.updatedAtDate.getTime() <= THIRTY_DAYS_MS) {
        updatedRecent += 1
      }
    })

    return {
      total,
      active,
      inactive,
      configuredReorder,
      updatedRecent,
    }
  }, [tabScopedProducts])

  const emptyMessage = useMemo(() => {
    if (loading) {
      return 'Loading products…'
    }
    if (error) {
      return 'Unable to load products.'
    }
    return 'No products found.'
  }, [error, loading])

  const resetProcessingWizard = useCallback(() => {
    setProcessingStep(1)
    setProcessingChainId(null)
    setProcessingChainName('')
    setProcessingRaws([createProcessingDraftBase(units)])
    setProcessingWips([
      {
        ...createProcessingDraftBase(units),
        raw_component_temp_keys: [],
      },
    ])
    setProcessingFinished([
      {
        ...createProcessingDraftBase(units),
        wip_component_temp_keys: [],
      },
    ])
    setProcessingEditMode(false)
    setProcessingFallbackNotice(null)
  }, [units])

  const toDraftBase = useCallback((product: Product): ProcessingDraftBase => ({
    id: product.id,
    temp_key: `p-${product.id}`,
    name: product.name ?? '',
    base_unit_id: product.base_unit_id != null ? String(product.base_unit_id) : resolveDefaultKgUnitId(units),
    reorder_point: product.reorder_point != null ? String(product.reorder_point) : String(DEFAULT_REORDER_POINT),
    safety_stock: product.safety_stock != null ? String(product.safety_stock) : String(DEFAULT_SAFETY_STOCK),
    target_stock: product.target_stock != null ? String(product.target_stock) : String(DEFAULT_TARGET_STOCK),
    status: (product.status ?? 'ACTIVE').toUpperCase(),
    notes: product.notes ?? '',
  }), [units])

  const loadProcessingChain = useCallback(async (chainId: number): Promise<LoadedChain> => {
    const [{ data: chainData, error: chainError }, { data: membersData, error: membersError }] = await Promise.all([
      supabase
        .from('product_processing_chains')
        .select('id, name')
        .eq('id', chainId)
        .single(),
      supabase
        .from('product_processing_chain_members')
        .select('product_id, stage, display_order, product:products(id, name, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, product_type, sku)')
        .eq('chain_id', chainId)
        .order('stage', { ascending: true })
        .order('display_order', { ascending: true }),
    ])

    if (chainError) throw chainError
    if (membersError) throw membersError

    const memberRows = (membersData ?? []) as Array<{
      product_id: number
      stage: 'RAW' | 'WIP' | 'FINISHED'
      display_order: number
      product: Product | null
    }>

    const raws = memberRows
      .filter((row) => row.stage === 'RAW' && row.product)
      .sort((a, b) => a.display_order - b.display_order)
      .map((row) => ({ ...toDraftBase(row.product as Product) }))

    const wipsBase = memberRows
      .filter((row) => row.stage === 'WIP' && row.product)
      .sort((a, b) => a.display_order - b.display_order)
      .map((row) => ({ ...toDraftBase(row.product as Product), raw_component_temp_keys: [] as string[] }))

    const finishedBase = memberRows
      .filter((row) => row.stage === 'FINISHED' && row.product)
      .sort((a, b) => a.display_order - b.display_order)
      .map((row) => ({ ...toDraftBase(row.product as Product), wip_component_temp_keys: [] as string[] }))

    const allParentIds = [...wipsBase.map((w) => w.id), ...finishedBase.map((f) => f.id)].filter((id): id is number => typeof id === 'number')
    if (allParentIds.length > 0) {
      const { data: linksData, error: linksError } = await supabase
        .from('product_components')
        .select('parent_product_id, component_product_id')
        .in('parent_product_id', allParentIds)
      if (linksError) throw linksError
      const rawById = new Map(raws.map((r) => [r.id, r.temp_key] as const))
      const wipById = new Map(wipsBase.map((w) => [w.id, w.temp_key] as const))

      ;(linksData ?? []).forEach((link: { parent_product_id: number; component_product_id: number }) => {
        const wipRow = wipsBase.find((w) => w.id === link.parent_product_id)
        if (wipRow) {
          const rawKey = rawById.get(link.component_product_id)
          if (rawKey && !wipRow.raw_component_temp_keys.includes(rawKey)) {
            wipRow.raw_component_temp_keys.push(rawKey)
          }
          return
        }
        const finishedRow = finishedBase.find((f) => f.id === link.parent_product_id)
        if (finishedRow) {
          const wipKey = wipById.get(link.component_product_id)
          if (wipKey && !finishedRow.wip_component_temp_keys.includes(wipKey)) {
            finishedRow.wip_component_temp_keys.push(wipKey)
          }
        }
      })
    }

    return {
      chainId,
      chainName: (chainData as { id: number; name: string | null })?.name ?? null,
      raws,
      wips: wipsBase,
      finished: finishedBase,
    }
  }, [toDraftBase])

  const openProcessingChainEditor = useCallback((product: Product, loaded: LoadedChain) => {
    setCreationMode('PROCESSING')
    setProcessingEditMode(true)
    setProcessingChainId(loaded.chainId)
    setProcessingChainName(loaded.chainName ?? '')
    setProcessingRaws(loaded.raws.length > 0 ? loaded.raws : [createProcessingDraftBase(units)])
    setProcessingWips(
      loaded.wips.length > 0
        ? loaded.wips
        : [{ ...createProcessingDraftBase(units), raw_component_temp_keys: [] }],
    )
    setProcessingFinished(
      loaded.finished.length > 0
        ? loaded.finished
        : [{ ...createProcessingDraftBase(units), wip_component_temp_keys: [] }],
    )
    setProcessingStep(1)
    setFormErrors({})
    setComponentSearch('')
    setModalMode('edit')
    setEditingProduct(product)
    setProcessingFallbackNotice(null)
    setIsModalOpen(true)
  }, [units])

  const handleLinkLegacyProductToChain = useCallback(async () => {
    if (!editingProduct?.id) return
    const productType = (editingProduct.product_type ?? '').toUpperCase()
    if (productType === 'OP') {
      toast.error('Operational products do not use processing chains.')
      return
    }

    setLinkingLegacyProduct(true)
    try {
      const { data: existingMember, error: existingMemberError } = await supabase
        .from('product_processing_chain_members')
        .select('chain_id')
        .eq('product_id', editingProduct.id)
        .limit(1)
        .maybeSingle()

      if (existingMemberError) throw existingMemberError

      if (existingMember?.chain_id) {
        const loadedExisting = await loadProcessingChain(Number(existingMember.chain_id))
        openProcessingChainEditor(editingProduct, loadedExisting)
        toast.success('Legacy product is now linked to its processing chain.')
        return
      }

      const rawIds = new Set<number>()
      const wipIds = new Set<number>()
      const finishedIds = new Set<number>()

      const directComponentIds =
        editingProduct.product_components
          ?.map((row) => row?.component_product)
          .filter((component): component is ComponentProduct => Boolean(component?.id))
          .map((component) => ({ id: component.id, type: (component.product_type ?? '').toUpperCase() })) ?? []

      if (productType === 'RAW') rawIds.add(editingProduct.id)
      if (productType === 'WIP') wipIds.add(editingProduct.id)
      if (productType === 'FINISHED') finishedIds.add(editingProduct.id)

      if (productType === 'WIP') {
        directComponentIds
          .filter((component) => component.type === 'RAW')
          .forEach((component) => rawIds.add(component.id))
      }

      if (productType === 'FINISHED') {
        directComponentIds
          .filter((component) => component.type === 'WIP')
          .forEach((component) => wipIds.add(component.id))
      }

      if (productType === 'RAW') {
        const { data: wipParents, error: wipParentsError } = await supabase
          .from('product_components')
          .select('parent:products!product_components_parent_product_id_fkey(id, product_type)')
          .eq('component_product_id', editingProduct.id)

        if (wipParentsError) throw wipParentsError
        ;(wipParents ?? []).forEach((row: any) => {
          const parent = row?.parent as { id?: number; product_type?: string | null } | null
          if (parent?.id && (parent.product_type ?? '').toUpperCase() === 'WIP') {
            wipIds.add(parent.id)
          }
        })
      }

      if (productType === 'WIP' || productType === 'RAW') {
        const sourceWipIds = productType === 'WIP' ? [editingProduct.id] : Array.from(wipIds)
        if (sourceWipIds.length > 0) {
          const { data: finishedParents, error: finishedParentsError } = await supabase
            .from('product_components')
            .select('parent:products!product_components_parent_product_id_fkey(id, product_type)')
            .in('component_product_id', sourceWipIds)

          if (finishedParentsError) throw finishedParentsError
          ;(finishedParents ?? []).forEach((row: any) => {
            const parent = row?.parent as { id?: number; product_type?: string | null } | null
            if (parent?.id && (parent.product_type ?? '').toUpperCase() === 'FINISHED') {
              finishedIds.add(parent.id)
            }
          })
        }
      }

      if (productType === 'FINISHED' && wipIds.size > 0) {
        const { data: rawComponents, error: rawComponentsError } = await supabase
          .from('product_components')
          .select('component:products!product_components_component_product_id_fkey(id, product_type)')
          .in('parent_product_id', Array.from(wipIds))

        if (rawComponentsError) throw rawComponentsError
        ;(rawComponents ?? []).forEach((row: any) => {
          const component = row?.component as { id?: number; product_type?: string | null } | null
          if (component?.id && (component.product_type ?? '').toUpperCase() === 'RAW') {
            rawIds.add(component.id)
          }
        })
      }

      const { data: chainRecord, error: chainError } = await supabase
        .from('product_processing_chains')
        .insert({
          name: `${editingProduct.name ?? `Product ${editingProduct.id}`} (Legacy Chain)`,
          status: 'ACTIVE',
        })
        .select('id')
        .single()

      if (chainError) throw chainError

      const chainId = Number((chainRecord as { id: number }).id)
      const membersPayload = [
        ...Array.from(rawIds).map((productId, index) => ({ chain_id: chainId, product_id: productId, stage: 'RAW', display_order: index + 1 })),
        ...Array.from(wipIds).map((productId, index) => ({ chain_id: chainId, product_id: productId, stage: 'WIP', display_order: index + 1 })),
        ...Array.from(finishedIds).map((productId, index) => ({ chain_id: chainId, product_id: productId, stage: 'FINISHED', display_order: index + 1 })),
      ]

      if (membersPayload.length > 0) {
        const { error: membersError } = await supabase
          .from('product_processing_chain_members')
          .insert(membersPayload)
        if (membersError) throw membersError
      }

      const loaded = await loadProcessingChain(chainId)
      openProcessingChainEditor(editingProduct, loaded)
      toast.success('Legacy product linked to processing chain.')
    } catch (error) {
      const message = (error as PostgrestError)?.message ?? 'Unable to link legacy product to a processing chain.'
      toast.error(message)
    } finally {
      setLinkingLegacyProduct(false)
    }
  }, [editingProduct, loadProcessingChain, openProcessingChainEditor])

  const handleOpenCreateModal = useCallback(() => {
    setFormData({ ...createEmptyProductForm(products, units), product_type: 'OP' })
    setFormErrors({})
    setComponentSearch('')
    setModalMode('create')
    setEditingProduct(null)
    setCreationMode(FEATURE_PROCESSING_PRODUCT_WIZARD ? null : 'OPERATIONAL')
    resetProcessingWizard()
    setIsModalOpen(true)
  }, [products, resetProcessingWizard, units])

  const handleCloseModal = useCallback(() => {
    if (isSubmitting) {
      return
    }
    setIsModalOpen(false)
    setFormErrors({})
    setModalMode('create')
    setEditingProduct(null)
    setFormData(createEmptyProductForm(products, units))
    setComponentSearch('')
    setCreationMode(FEATURE_PROCESSING_PRODUCT_WIZARD ? null : 'OPERATIONAL')
    resetProcessingWizard()
  }, [isSubmitting, products, resetProcessingWizard, units])

  const openCreationModeTourModal = useCallback(() => {
    handleOpenCreateModal()
    if (FEATURE_PROCESSING_PRODUCT_WIZARD) {
      setCreationMode(null)
    }
  }, [handleOpenCreateModal])

  const ensureCreateModalOpen = useCallback(() => {
    if (!isModalOpen) {
      handleOpenCreateModal()
    }
  }, [handleOpenCreateModal, isModalOpen])

  const openSelectedTourFlow = useCallback(() => {
    ensureCreateModalOpen()
    if (tourFlow === 'PROCESSING') {
      setCreationMode('PROCESSING')
      resetProcessingWizard()
      return
    }
    if (tourFlow === 'MIXED') {
      setCreationMode('MIXED')
      setFormData((prev) => ({ ...prev, product_type: 'FINISHED', is_mixed_product: true, component_ids: [] }))
      return
    }
    setCreationMode('OPERATIONAL')
    setFormData((prev) => ({ ...prev, product_type: 'OP', is_mixed_product: false }))
  }, [ensureCreateModalOpen, resetProcessingWizard, tourFlow])

  const openProcessingTourStep = useCallback(
    (step: 1 | 2 | 3) => {
      ensureCreateModalOpen()
      setCreationMode('PROCESSING')
      setProcessingStep(step)
    },
    [ensureCreateModalOpen]
  )

  const handleOpenEditModal = useCallback((product: Product) => {
    if (!product) {
      return
    }

    const openSimpleForm = (notice: string | null = null) => {
      setFormData({
        name: product.name ?? '',
        base_unit_id:
          product.base_unit_id !== null && product.base_unit_id !== undefined
            ? String(product.base_unit_id)
            : '',
        reorder_point:
          product.reorder_point !== null && product.reorder_point !== undefined
            ? String(product.reorder_point)
            : '',
        safety_stock:
          product.safety_stock !== null && product.safety_stock !== undefined
            ? String(product.safety_stock)
            : '',
        target_stock:
          product.target_stock !== null && product.target_stock !== undefined
            ? String(product.target_stock)
            : '',
        status: (product.status ?? 'ACTIVE').toUpperCase(),
        notes: product.notes ?? '',
        product_type: (product.product_type ?? 'RAW').toUpperCase(),
        is_mixed_product: Boolean(product.is_mixed_product),
        component_ids:
          product.product_components
            ?.map((row) => row?.component_product?.id)
            .filter((id): id is number => typeof id === 'number') ?? [],
      })
      setCreationMode('OPERATIONAL')
      setProcessingFallbackNotice(notice)
      setProcessingEditMode(false)
      setProcessingChainId(null)
      setProcessingChainName('')
      setFormErrors({})
      setComponentSearch('')
      setModalMode('edit')
      setEditingProduct(product)
      setIsModalOpen(true)
    }

    if (!FEATURE_PROCESSING_PRODUCT_WIZARD || (product.product_type ?? '').toUpperCase() === 'OP') {
      openSimpleForm(null)
      return
    }

    const productId = product.id
    supabase
      .from('product_processing_chain_members')
      .select('chain_id')
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle()
      .then(async ({ data, error: chainMemberError }) => {
        if (chainMemberError || !data?.chain_id) {
          openSimpleForm('Legacy product not linked to a processing chain. Editing in simple mode.')
          return
        }
        const loaded = await loadProcessingChain(Number(data.chain_id))
        openProcessingChainEditor(product, loaded)
      })
      .catch(() => {
        openSimpleForm('Could not load processing chain. Editing in simple mode.')
      })
  }, [loadProcessingChain, openProcessingChainEditor, resetProcessingWizard, units])

  const performDeleteProduct = useCallback(
    async (product: Product) => {
      if (!product?.id) return
      setDeletingProductId(product.id)
      try {
        const productType = (product.product_type ?? '').toUpperCase()
        const deleteIds =
          productType === 'RAW'
            ? await resolveRawCascadeDeleteIds([product.id])
            : [product.id]

        try {
          await supabase
            .from('product_components')
            .delete()
            .or(`parent_product_id.in.(${deleteIds.join(',')}),component_product_id.in.(${deleteIds.join(',')})`)
        } catch (pcErr) {
          console.warn('Failed to delete product_components links; table may be missing', pcErr)
        }
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .in('id', deleteIds)
        if (deleteError) throw deleteError
        toast.success(`Deleted ${deleteIds.length} product(s).`)
        await fetchProducts()
      } catch (err) {
        const msg = (err as PostgrestError)?.message ?? 'Unable to delete product.'
        toast.error(msg)
      } finally {
        setDeletingProductId(null)
      }
    },
    [fetchProducts, resolveRawCascadeDeleteIds]
  )

  const requestDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteAlertOpen(true)
  }, [])

  async function resolveRawCascadeDeleteIds(rootRawIds: number[]): Promise<number[]> {
    if (rootRawIds.length === 0) return []

    const idsToDelete = new Set<number>(rootRawIds)
    let frontier = [...rootRawIds]

    while (frontier.length > 0) {
      const { data, error: relationError } = await supabase
        .from('product_components')
        .select('parent:products!product_components_parent_product_id_fkey(id, product_type)')
        .in('component_product_id', frontier)

      if (relationError) throw relationError

      const nextFrontier: number[] = []
      ;((data ?? []) as Array<{ parent: { id?: number; product_type?: string | null } | null }>).forEach((row) => {
        const parent = row.parent
        const parentId = parent?.id
        const parentType = (parent?.product_type ?? '').toUpperCase()
        if (!parentId) return
        if (parentType !== 'WIP' && parentType !== 'FINISHED') return
        if (idsToDelete.has(parentId)) return
        idsToDelete.add(parentId)
        nextFrontier.push(parentId)
      })

      frontier = nextFrontier
    }

    return Array.from(idsToDelete)
  }

  const toggleProductSelection = useCallback((productId: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    )
  }, [])

  const toggleSelectAllCurrentPage = useCallback(() => {
    const pageIds = paginatedProducts.map((product) => product.id)
    const allSelected = pageIds.every((id) => selectedProductIds.includes(id))
    if (allSelected) {
      setSelectedProductIds((prev) => prev.filter((id) => !pageIds.includes(id)))
      return
    }
    setSelectedProductIds((prev) => Array.from(new Set([...prev, ...pageIds])))
  }, [paginatedProducts, selectedProductIds])

  const bulkDeleteProducts = useCallback(async () => {
    if (selectedProductIds.length === 0) return
    setBulkActionLoading(true)
    try {
      const selectedProductsMap = new Map(products.map((p) => [p.id, p]))
      const rawIds = selectedProductIds.filter((id) => (selectedProductsMap.get(id)?.product_type ?? '').toUpperCase() === 'RAW')
      const cascadedRawIds = await resolveRawCascadeDeleteIds(rawIds)
      const deleteIds = Array.from(new Set([...selectedProductIds, ...cascadedRawIds]))

      await supabase
        .from('product_components')
        .delete()
        .or(`parent_product_id.in.(${deleteIds.join(',')}),component_product_id.in.(${deleteIds.join(',')})`)

      const { error: deleteError } = await supabase.from('products').delete().in('id', deleteIds)
      if (deleteError) throw deleteError
      setProducts((previous) => previous.filter((product) => !deleteIds.includes(product.id)))
      toast.success(`Deleted ${deleteIds.length} product(s).`)
      setSelectedProductIds([])
      setBulkDeleteAlertOpen(false)
    } catch (err) {
      const message = (err as PostgrestError)?.message ?? 'Unable to delete selected products.'
      toast.error(message)
    } finally {
      setBulkActionLoading(false)
    }
  }, [products, resolveRawCascadeDeleteIds, selectedProductIds])

  const handleBulkEditFormChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = event.target
    setBulkEditForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  },
    []
  )

  const applyBulkEdit = useCallback(async () => {
    if (selectedProductIds.length === 0) return

    const payload: Record<string, string | number | null> = {}

    if (bulkEditForm.base_unit_id !== 'NO_CHANGE') {
      if (bulkEditForm.base_unit_id === 'NONE') {
        payload.base_unit_id = null
      } else {
        const parsedUnitId = Number.parseInt(bulkEditForm.base_unit_id, 10)
        if (!Number.isNaN(parsedUnitId)) {
          payload.base_unit_id = parsedUnitId
        }
      }
    }
    if (bulkEditForm.reorder_point.trim() !== '') {
      const value = numbersToPayload(bulkEditForm.reorder_point)
      if (value !== null) payload.reorder_point = value
    }
    if (bulkEditForm.safety_stock.trim() !== '') {
      const value = numbersToPayload(bulkEditForm.safety_stock)
      if (value !== null) payload.safety_stock = value
    }
    if (bulkEditForm.target_stock.trim() !== '') {
      const value = numbersToPayload(bulkEditForm.target_stock)
      if (value !== null) payload.target_stock = value
    }
    if (bulkEditForm.status !== 'NO_CHANGE') {
      payload.status = bulkEditForm.status
    }

    if (Object.keys(payload).length === 0) {
      if (bulkEditForm.raw_component_ids.length === 0 && bulkEditForm.wip_component_ids.length === 0) {
        toast.warning('Set at least one field to update or choose components to map.')
        return
      }
    }

    setBulkActionLoading(true)
    try {
      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await supabase.from('products').update(payload).in('id', selectedProductIds)
        if (updateError) throw updateError
      }

      // Apply composition mappings where provided
      const selectedProductsMap = new Map(products.map((p) => [p.id, p]))
      const rawAllowed = new Set(rawProductOptions.map((p) => p.id))
      const wipAllowed = new Set(wipProductOptions.map((p) => p.id))

      for (const pid of selectedProductIds) {
        const product = selectedProductsMap.get(pid)
        if (!product) continue
        const type = (product.product_type || 'RAW').toUpperCase()
        if (type === 'WIP' && bulkEditForm.raw_component_ids.length > 0) {
          const safeIds = bulkEditForm.raw_component_ids.filter((id) => rawAllowed.has(id))
          await saveProductComponents(pid, safeIds, 'WIP')
        }
        if (type === 'FINISHED' && bulkEditForm.wip_component_ids.length > 0) {
          const safeIds = bulkEditForm.wip_component_ids.filter((id) => wipAllowed.has(id))
          await saveProductComponents(pid, safeIds, 'FINISHED')
        }
      }

      toast.success(`Updated ${selectedProductIds.length} product(s).`)
      await fetchProducts()
      setSelectedProductIds([])
      setBulkEditModalOpen(false)
      setBulkEditForm(createEmptyBulkEditForm())
      setBulkComponentSearch('')
    } catch (err) {
      const message = (err as PostgrestError)?.message ?? 'Unable to apply bulk edit.'
      toast.error(message)
    } finally {
      setBulkActionLoading(false)
    }
  }, [bulkEditForm, selectedProductIds])

  const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    const nextValue =
      event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
        ? event.target.checked
        : value
    setFormData((previous) => ({
      ...previous,
      [name]: nextValue,
      ...(name === 'product_type'
        ? {
            is_mixed_product: String(value).toUpperCase() === 'FINISHED'
              ? previous.is_mixed_product
              : false,
          }
        : {}),
    }))
  }

  const isProcessingWizardActive = FEATURE_PROCESSING_PRODUCT_WIZARD &&
    ((modalMode === 'create' && creationMode === 'PROCESSING') || (modalMode === 'edit' && processingEditMode))

  const updateDraftField = <T extends ProcessingDraftBase>(
    setter: Dispatch<SetStateAction<T[]>>,
    tempKey: string,
    field: keyof ProcessingDraftBase,
    value: string
  ) => {
    setter((prev) =>
      prev.map((row) => (row.temp_key === tempKey ? { ...row, [field]: value } : row))
    )
  }

  const toggleDraftLink = (
    kind: 'WIP' | 'FINISHED',
    parentKey: string,
    componentKey: string
  ) => {
    if (kind === 'WIP') {
      setProcessingWips((prev) =>
        prev.map((row) => {
          if (row.temp_key !== parentKey) return row
          const next = new Set(row.raw_component_temp_keys)
          if (next.has(componentKey)) next.delete(componentKey)
          else next.add(componentKey)
          return { ...row, raw_component_temp_keys: Array.from(next) }
        })
      )
      return
    }
    setProcessingFinished((prev) =>
      prev.map((row) => {
        if (row.temp_key !== parentKey) return row
        const next = new Set(row.wip_component_temp_keys)
        if (next.has(componentKey)) next.delete(componentKey)
        else next.add(componentKey)
        return { ...row, wip_component_temp_keys: Array.from(next) }
      })
    )
  }

  const numbersToPayload = (value: string | null | undefined): number | null => {
    if (value === '' || value === null || value === undefined) {
      return null
    }
    const numeric = Number(value)
    return Number.isNaN(numeric) ? null : numeric
  }

  const validateProcessingDrafts = (): boolean => {
    const hasInvalidRaw = processingRaws.some((row) => !row.name.trim())
    const hasInvalidWip = processingWips.some((row) => !row.name.trim() || row.raw_component_temp_keys.length === 0)
    const hasInvalidFinished = processingFinished.some((row) => !row.name.trim() || row.wip_component_temp_keys.length === 0)

    if (processingRaws.length === 0 || processingWips.length === 0 || processingFinished.length === 0) {
      toast.error('RAW, WIP, and FINISHED steps each require at least one row.')
      return false
    }
    if (hasInvalidRaw || hasInvalidWip || hasInvalidFinished) {
      toast.error('Fill all names and required links before saving the processing chain.')
      return false
    }
    return true
  }

  const buildProcessingPayload = () => {
    const rawIndexByKey = new Map(processingRaws.map((row, index) => [row.temp_key, index] as const))
    const wipIndexByKey = new Map(processingWips.map((row, index) => [row.temp_key, index] as const))
    return {
      raws: processingRaws.map((row) => ({
        id: row.id ?? null,
        name: row.name.trim(),
        base_unit_id: row.base_unit_id || null,
        reorder_point: row.reorder_point || null,
        safety_stock: row.safety_stock || null,
        target_stock: row.target_stock || null,
        status: (row.status || 'ACTIVE').toUpperCase(),
        notes: row.notes.trim() || null,
      })),
      wips: processingWips.map((row) => ({
        id: row.id ?? null,
        name: row.name.trim(),
        base_unit_id: row.base_unit_id || null,
        reorder_point: row.reorder_point || null,
        safety_stock: row.safety_stock || null,
        target_stock: row.target_stock || null,
        status: (row.status || 'ACTIVE').toUpperCase(),
        notes: row.notes.trim() || null,
        raw_component_indexes: row.raw_component_temp_keys
          .map((key) => rawIndexByKey.get(key))
          .filter((idx): idx is number => typeof idx === 'number'),
      })),
      finished: processingFinished.map((row) => ({
        id: row.id ?? null,
        name: row.name.trim(),
        base_unit_id: row.base_unit_id || null,
        reorder_point: row.reorder_point || null,
        safety_stock: row.safety_stock || null,
        target_stock: row.target_stock || null,
        status: (row.status || 'ACTIVE').toUpperCase(),
        notes: row.notes.trim() || null,
        wip_component_indexes: row.wip_component_temp_keys
          .map((key) => wipIndexByKey.get(key))
          .filter((idx): idx is number => typeof idx === 'number'),
      })),
    }
  }

  const saveProductComponents = async (
    parentProductId: number,
    componentIds: number[],
    parentType: 'RAW' | 'WIP' | 'FINISHED' | 'OP'
  ) => {
    try {
      // Clear existing links
      await supabase.from('product_components').delete().eq('parent_product_id', parentProductId)

      if (componentIds.length === 0) return

      // Insert new links
      const rows = componentIds.map((componentId) => ({
        parent_product_id: parentProductId,
        component_product_id: componentId,
      }))

      const { error } = await supabase.from('product_components').insert(rows)
      if (error) throw error
    } catch (err) {
      console.warn('Failed to save product components; ensure product_components table exists', err)
      toast.error('Could not save product composition. Please ensure product_components table exists.')
    }
  }

  const validateForm = (): boolean => {
    const errors: FormErrors = {}
    const normalizedName = normalizeProductName(formData.name)
    const normalizedType = (formData.product_type || 'RAW').toUpperCase()
    const editingId = editingProduct?.id ?? null

    if (!formData.name.trim()) {
      errors.name = 'Name is required.'
    }
    if (formData.name.trim().length > 120) {
      errors.name = 'Name must be 120 characters or fewer.'
    }
    if (formData.status && !['ACTIVE', 'INACTIVE', 'DEVELOPMENT'].includes(formData.status.toUpperCase())) {
      errors.status = 'Status must be Active, Inactive, or Development.'
    }
    if (
      formData.product_type &&
      !['RAW', 'WIP', 'FINISHED', 'OP'].includes(formData.product_type.toUpperCase())
    ) {
      errors.product_type = 'Product type must be Raw, WIP, Finished, or OP.'
    }

    const type = (formData.product_type || 'RAW').toUpperCase()
    const isMixedMode = modalMode === 'create' && creationMode === 'MIXED'
    if (type === 'WIP' && formData.component_ids.length === 0) {
      errors.components = 'Select at least one raw material for WIP products.'
    }
    if (type === 'FINISHED' && formData.component_ids.length === 0) {
      errors.components = isMixedMode
        ? 'Select at least one finished product for a mixed finished product.'
        : 'Select at least one WIP for finished products.'
    }
    if (formData.is_mixed_product && type !== 'FINISHED') {
      errors.product_type = 'Only finished products can be marked as mixed products.'
    }
    if (normalizedName.length > 0) {
      const duplicate = products.find((product) => {
        if (editingId !== null && product.id === editingId) return false
        const existingName = normalizeProductName(product.name ?? '')
        const existingType = (product.product_type ?? 'RAW').toUpperCase()
        return existingName === normalizedName && existingType === normalizedType
      })
      if (duplicate) {
        errors.name = `A ${normalizedType} product with this name already exists.`
      }
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmitOperational = async () => {
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    const isEditing = modalMode === 'edit' && editingProduct?.id !== undefined
    try {
      const productType = (formData.product_type || 'RAW').toUpperCase()
      const isMixedMode = modalMode === 'create' && creationMode === 'MIXED'
      const productTypeVal =
        productType === 'RAW' || productType === 'WIP' || productType === 'FINISHED' || productType === 'OP'
          ? productType
          : 'RAW'
      const allowedComponentIds = new Set(
        productTypeVal === 'WIP'
          ? rawProductOptions.map((p) => p.id)
          : productTypeVal === 'FINISHED'
          ? (isMixedMode ? finishedProductOptions : wipProductOptions).map((p) => p.id)
          : []
      )
      const sanitizedComponentIds =
        productTypeVal === 'RAW' || productTypeVal === 'OP'
          ? []
          : formData.component_ids.filter((id) => allowedComponentIds.has(id))
      const internalSku = isEditing
        ? (editingProduct?.sku ?? generateSku(products))
        : generateSku(products)
      const parsedBaseUnitId = formData.base_unit_id ? Number(formData.base_unit_id) : null
      const fallbackBaseUnitId = resolveDefaultKgUnitId(units)
      const effectiveBaseUnitId =
        parsedBaseUnitId !== null && !Number.isNaN(parsedBaseUnitId)
          ? parsedBaseUnitId
          : fallbackBaseUnitId
            ? Number(fallbackBaseUnitId)
            : null
      const parsedReorderPoint = numbersToPayload(formData.reorder_point)
      const parsedSafetyStock = numbersToPayload(formData.safety_stock)
      const parsedTargetStock = numbersToPayload(formData.target_stock)
      const payload = {
        sku: internalSku,
        name: formData.name.trim(),
        category: isEditing ? (editingProduct?.category ?? null) : null,
        base_unit_id: isEditing ? parsedBaseUnitId : effectiveBaseUnitId,
        reorder_point: isEditing ? parsedReorderPoint : (parsedReorderPoint ?? DEFAULT_REORDER_POINT),
        safety_stock: isEditing ? parsedSafetyStock : (parsedSafetyStock ?? DEFAULT_SAFETY_STOCK),
        target_stock: isEditing ? parsedTargetStock : (parsedTargetStock ?? DEFAULT_TARGET_STOCK),
        status: (formData.status || 'ACTIVE').toUpperCase(),
        notes: formData.notes.trim() || null,
        product_type: productTypeVal,
        is_mixed_product: productTypeVal === 'FINISHED' ? (isMixedMode || formData.is_mixed_product) : false,
      }

      if (isEditing) {
        const { data, error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type, is_mixed_product'
          )
          .single()

        if (updateError) {
          throw updateError
        }

        await saveProductComponents((data as Product).id, sanitizedComponentIds, productTypeVal)

        toast.success('Product updated successfully.')
        await fetchProducts()
      } else {
        const { data, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type, is_mixed_product'
          )
          .single()

        if (insertError) {
          throw insertError
        }

        if (data) {
          await saveProductComponents((data as Product).id, sanitizedComponentIds, productTypeVal)
        }

        toast.success('Product added successfully.')
        await fetchProducts()
      }

      setIsModalOpen(false)
      setModalMode('create')
      setEditingProduct(null)
      setFormData(createEmptyProductForm([], units))
      setFormErrors({})
      setComponentSearch('')
      setCreationMode(FEATURE_PROCESSING_PRODUCT_WIZARD ? null : 'OPERATIONAL')
      resetProcessingWizard()
    } catch (submitError) {
      const errorMessage =
        (submitError as PostgrestError)?.message ??
        (isEditing ? 'Unable to update product.' : 'Unable to add product.')

      console.error(isEditing ? 'Error updating product' : 'Error creating product', submitError)
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitProcessingChainCreate = async () => {
    if (!validateProcessingDrafts()) return
    setIsSubmitting(true)
    try {
      const payload = buildProcessingPayload()
      const { data, error: rpcError } = await supabase.rpc('create_processing_product_chain', {
        p_chain_name: processingChainName.trim() || null,
        p_payload: payload,
      })
      if (rpcError) throw rpcError
      toast.success(`Processing chain created (ID ${data}).`)
      await fetchProducts()
      setIsModalOpen(false)
      setCreationMode(FEATURE_PROCESSING_PRODUCT_WIZARD ? null : 'OPERATIONAL')
      resetProcessingWizard()
    } catch (error) {
      const message = (error as PostgrestError)?.message ?? 'Unable to create processing chain.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitProcessingChainEdit = async () => {
    if (!processingChainId) {
      toast.error('Processing chain id is missing.')
      return
    }
    if (!validateProcessingDrafts()) return
    setIsSubmitting(true)
    try {
      const payload = buildProcessingPayload()
      const { error: rpcError } = await supabase.rpc('update_processing_product_chain', {
        p_chain_id: processingChainId,
        p_payload: payload,
        p_chain_name: processingChainName.trim() || null,
      })
      if (rpcError) throw rpcError
      toast.success('Processing chain updated successfully.')
      await fetchProducts()
      setIsModalOpen(false)
      setCreationMode(FEATURE_PROCESSING_PRODUCT_WIZARD ? null : 'OPERATIONAL')
      resetProcessingWizard()
    } catch (error) {
      const message = (error as PostgrestError)?.message ?? 'Unable to update processing chain.'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isProcessingWizardActive) {
      if (modalMode === 'edit') {
        await handleSubmitProcessingChainEdit()
      } else {
        await handleSubmitProcessingChainCreate()
      }
      return
    }
    await handleSubmitOperational()
  }

  const columns = useMemo(
    () => [
      {
        key: 'select',
        header: (
          <input
            type="checkbox"
            checked={
              paginatedProducts.length > 0 &&
              paginatedProducts.every((product) => selectedProductIds.includes(product.id))
            }
            onChange={toggleSelectAllCurrentPage}
            className="h-4 w-4 rounded border-olive-light/60"
            aria-label="Select all products on this page"
          />
        ),
        render: (product: PreparedProduct) => (
          <input
            type="checkbox"
            checked={selectedProductIds.includes(product.id)}
            onChange={() => toggleProductSelection(product.id)}
            className="h-4 w-4 rounded border-olive-light/60"
            aria-label={`Select ${product.name ?? 'product'}`}
          />
        ),
        mobileRender: (product: PreparedProduct) => (
          <input
            type="checkbox"
            checked={selectedProductIds.includes(product.id)}
            onChange={() => toggleProductSelection(product.id)}
            className="h-4 w-4 rounded border-olive-light/60"
            aria-label={`Select ${product.name ?? 'product'}`}
          />
        ),
        cellClassName: 'w-12',
      },
      {
        key: 'name',
        header: 'Product',
        render: (product: PreparedProduct) => (
          <div>
            {(() => {
              const isRawProduct = (product.product_type ?? '').toUpperCase() === 'RAW'
              const chainName = productChainMetaByProductId.get(product.id)?.chainName
              const baseName = product.name || 'Unnamed product'
              return (
                <div className="flex items-center gap-2 font-medium text-text-dark">
                  {isRawProduct ? (
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                        chainName
                          ? 'border-olive/20 bg-olive-light/20 text-olive-dark'
                          : 'border-slate-200 bg-slate-100 text-slate-500'
                      }`}
                      title={chainName ? `Linked to ${chainName}` : 'Not linked to a processing chain'}
                      aria-label={chainName ? `Linked to ${chainName}` : 'Not linked to a processing chain'}
                    >
                      {chainName ? <Link2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </span>
                  ) : null}
                  {isRawProduct ? (
                    <button
                      type="button"
                      className="text-left text-olive hover:underline"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        navigate(`/inventory/products/${product.id}`)
                      }}
                    >
                      {baseName}
                    </button>
                  ) : (
                    baseName
                  )}
                </div>
              )
            })()}
            {product.notes ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-text-dark/60">
                <Package2 className="h-3.5 w-3.5" />
                <span className="line-clamp-1">{product.notes}</span>
              </div>
            ) : null}
            {formatComponentsLine(product) ? (
              <div className="mt-1 text-xs text-text-dark/60">{formatComponentsLine(product)}</div>
            ) : null}
          </div>
        ),
        mobileRender: (product: PreparedProduct) => (
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 font-medium text-text-dark">
              {(product.product_type ?? '').toUpperCase() === 'RAW' ? (
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                    productChainMetaByProductId.get(product.id)?.chainName
                      ? 'border-olive/20 bg-olive-light/20 text-olive-dark'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                  title={
                    productChainMetaByProductId.get(product.id)?.chainName
                      ? `Linked to ${productChainMetaByProductId.get(product.id)?.chainName}`
                      : 'Not linked to a processing chain'
                  }
                  aria-label={
                    productChainMetaByProductId.get(product.id)?.chainName
                      ? `Linked to ${productChainMetaByProductId.get(product.id)?.chainName}`
                      : 'Not linked to a processing chain'
                  }
                >
                  {productChainMetaByProductId.get(product.id)?.chainName ? (
                    <Link2 className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </span>
              ) : null}
              <span>{product.name || 'Unnamed product'}</span>
            </div>
            {product.notes ? <div className="text-xs text-text-dark/60">{product.notes}</div> : null}
          </div>
        ),
      },
      {
        key: 'product_type',
        header: 'Type',
        render: (product: PreparedProduct) => {
          const t = (product.product_type ?? 'RAW').toUpperCase()
          const style = productTypeBadgeStyles[t] ?? productTypeBadgeStyles.RAW
          const label = t === 'WIP' || t === 'OP' ? t : t.charAt(0) + t.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${style}`}>
              {label}
            </span>
          )
        },
        mobileRender: (product: PreparedProduct) => {
          const t = (product.product_type ?? 'RAW').toUpperCase()
          const style = productTypeBadgeStyles[t] ?? productTypeBadgeStyles.RAW
          const label = t === 'WIP' || t === 'OP' ? t : t.charAt(0) + t.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${style}`}>
              {label}
            </span>
          )
        },
        cellClassName: 'text-text-dark/70',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'base_unit_id',
        header: 'Base Unit',
        render: (product: PreparedProduct) => {
          if (!product.base_unit_id) {
            return '—'
          }
          const unit = unitMap.get(product.base_unit_id)
          if (!unit) {
            return `ID ${product.base_unit_id}`
          }
          return unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name
        },
        mobileRender: (product: PreparedProduct) => {
          if (!product.base_unit_id) {
            return '—'
          }
          const unit = unitMap.get(product.base_unit_id)
          if (!unit) {
            return `ID ${product.base_unit_id}`
          }
          return unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name
        },
        cellClassName: 'text-text-dark/70',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'reorder_point',
        header: 'Min / Safety',
        render: (product: PreparedProduct) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{formatNumber(product.reorder_point)}</div>
            <div className="text-xs text-text-dark/60">Safety: {formatNumber(product.safety_stock)}</div>
          </div>
        ),
        mobileRender: (product: PreparedProduct) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{formatNumber(product.reorder_point)}</div>
            <div className="text-xs text-text-dark/60">Safety: {formatNumber(product.safety_stock)}</div>
          </div>
        ),
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        mobileValueClassName: 'text-right',
      },
      {
        key: 'target_stock',
        header: 'Target Stock',
        render: (product: PreparedProduct) => formatNumber(product.target_stock),
        mobileRender: (product: PreparedProduct) => formatNumber(product.target_stock),
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark',
        mobileValueClassName: 'text-right text-text-dark',
      },
      {
        key: 'status',
        header: 'Status',
        render: (product: PreparedProduct) => {
          const status = (product.status ?? 'INACTIVE').toUpperCase()
          const badgeStyle = (statusBadgeStyles as Record<string, string>)[status] ?? statusBadgeStyles.INACTIVE
          const label = status.charAt(0) + status.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeStyle}`}>
              {label}
            </span>
          )
        },
        mobileRender: (product: PreparedProduct) => {
          const status = (product.status ?? 'INACTIVE').toUpperCase()
          const badgeStyle = (statusBadgeStyles as Record<string, string>)[status] ?? statusBadgeStyles.INACTIVE
          const label = status.charAt(0) + status.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeStyle}`}>
              {label}
            </span>
          )
        },
      },
      {
        key: 'updated_at',
        header: 'Updated',
        render: (product: PreparedProduct) => formatDate(product.updatedAtDate),
        mobileRender: (product: PreparedProduct) => formatDate(product.updatedAtDate),
        headerClassName: 'text-right',
        cellClassName: 'text-right text-sm text-text-dark/70',
        mobileValueClassName: 'text-right text-sm text-text-dark',
      },
      {
        key: 'actions',
        header: 'Actions',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        mobileHeader: 'Actions',
        mobileValueClassName: 'text-right',
        render: (product: PreparedProduct) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              title={`Edit ${product.name ?? 'product'}`}
              aria-label={`Edit ${product.name ?? 'product'}`}
              onClick={(event) => {
                event.stopPropagation()
                handleOpenEditModal(product)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              title={deletingProductId === product.id ? 'Deleting product' : `Delete ${product.name ?? 'product'}`}
              aria-label={deletingProductId === product.id ? 'Deleting product' : `Delete ${product.name ?? 'product'}`}
              onClick={(event) => {
                event.stopPropagation()
                requestDeleteProduct(product)
              }}
              disabled={deletingProductId === product.id}
            >
              <Trash2 className={`h-4 w-4 ${deletingProductId === product.id ? 'animate-pulse' : ''}`} />
            </Button>
          </div>
        ),
        mobileRender: (product: PreparedProduct) => (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              title={`Edit ${product.name ?? 'product'}`}
              aria-label={`Edit ${product.name ?? 'product'}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleOpenEditModal(product)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              title={deletingProductId === product.id ? 'Deleting product' : `Delete ${product.name ?? 'product'}`}
              aria-label={deletingProductId === product.id ? 'Deleting product' : `Delete ${product.name ?? 'product'}`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                requestDeleteProduct(product)
              }}
              disabled={deletingProductId === product.id}
            >
              <Trash2 className={`h-4 w-4 ${deletingProductId === product.id ? 'animate-pulse' : ''}`} />
            </Button>
          </div>
        ),
      },
    ],
    [
      handleOpenEditModal,
      requestDeleteProduct,
      deletingProductId,
      unitMap,
      paginatedProducts,
      selectedProductIds,
      toggleProductSelection,
      toggleSelectAllCurrentPage,
      productChainMetaByProductId,
      navigate,
    ]
  )

  const isEditMode = modalMode === 'edit'

  const tourSteps = useMemo<TourStep[]>(
    () => {
      const steps: TourStep[] = [
        {
          id: 'intro',
          title: 'Products settings overview',
          description:
            'Use this page to manage raw, processed, and operational products, along with the stock rules attached to each one.',
          placement: 'center',
        },
        {
          id: 'tabs',
          target: '[data-tour="products-tabs"]',
          title: 'Switch product catalogs',
          description:
            'These tabs separate raw products, processed products, and operational products so each catalog stays easier to manage.',
          placement: 'bottom',
          beforeEnter: () => {
            setCatalogTab('RAW')
          },
        },
        {
          id: 'search',
          target: '[data-tour="products-search"]',
          title: 'Search and filter quickly',
          description:
            'Use search, status, and sorting together to narrow the list before editing or reviewing stock planning details.',
          placement: 'bottom',
          beforeEnter: () => {
            setCatalogTab('RAW')
          },
        },
        {
          id: 'results',
          target: '[data-tour="products-results"]',
          title: 'Review the current catalog',
          description:
            'This table shows the visible products for the selected tab, including quick actions for editing, deleting, and opening raw product details.',
          placement: 'top',
          beforeEnter: () => {
            setCatalogTab('RAW')
          },
        },
        {
          id: 'bulk-actions',
          target: '[data-tour="products-bulk-actions"]',
          title: 'Apply bulk actions',
          description:
            'Select products from the table to bulk edit shared inventory settings or remove several records in one pass.',
          placement: 'top',
          beforeEnter: () => {
            setCatalogTab('RAW')
          },
        },
        {
          id: 'add-button',
          target: '[data-tour="products-add-button"]',
          title: 'Start a new product',
          description:
            'Use this action whenever you need to register a new product SKU in the catalog.',
          placement: 'left',
        },
      ]

      if (FEATURE_PROCESSING_PRODUCT_WIZARD) {
        steps.push({
          id: 'creation-mode',
          target: '[data-tour="products-creation-mode"]',
          title: 'Choose how to create it',
          description:
            'Choose the path that fits the product you want to set up. You can continue with a simple operational product or switch into the RAW to WIP to FINISHED processing wizard.',
          placement: 'bottom',
          beforeEnter: () => {
            openCreationModeTourModal()
          },
        })

        steps.push({
          id: 'tour-choice',
          target: '[data-tour="products-creation-mode"]',
          title: 'Which tour do you want to continue with?',
          description:
            'Choose the branch you want to follow next, then click Next to continue with that flow.',
          placement: 'bottom',
          nextDisabled: tourFlow === null,
          actions: [
            {
              label: tourFlow === 'OPERATIONAL' ? 'Operational product selected' : 'Operational product',
              variant: tourFlow === 'OPERATIONAL' ? 'default' : 'outline',
              onSelect: () => {
                setTourFlow('OPERATIONAL')
              },
            },
            {
              label: tourFlow === 'PROCESSING' ? 'Processing product selected' : 'Processing product',
              variant: tourFlow === 'PROCESSING' ? 'default' : 'outline',
              onSelect: () => {
                setTourFlow('PROCESSING')
              },
            },
            {
              label: tourFlow === 'MIXED' ? 'Mixed product selected' : 'Mixed product',
              variant: tourFlow === 'MIXED' ? 'default' : 'outline',
              onSelect: () => {
                setTourFlow('MIXED')
              },
            },
          ],
          beforeEnter: () => {
            openCreationModeTourModal()
          },
        })

        if (tourFlow === 'PROCESSING') {
          steps.push(
            {
              id: 'processing-editor',
              target: '[data-tour="products-processing-editor"]',
              title: 'Build the processing chain',
              description:
                'This wizard lets you define the RAW, WIP, and FINISHED products that belong together in one processing flow.',
              placement: 'top',
              beforeEnter: () => {
                openSelectedTourFlow()
              },
            },
            {
              id: 'processing-stages',
              target: '[data-tour="products-processing-stages"]',
              title: 'Move through RAW, WIP, and FINISHED',
              description:
                'Use these stage tabs to define the full chain in order, from raw inputs to work-in-progress items and finally the finished products.',
              placement: 'bottom',
              beforeEnter: () => {
                openProcessingTourStep(1)
              },
            },
            {
              id: 'processing-raw',
              target: '[data-tour="products-processing-raw-section"]',
              title: 'Create the RAW products first',
              description:
                'Start by naming the raw products and setting their stock defaults. These become the inputs that WIP products can consume.',
              placement: 'top',
              beforeEnter: () => {
                openProcessingTourStep(1)
              },
            },
            {
              id: 'processing-wip',
              target: '[data-tour="products-processing-wip-section"]',
              title: 'Build the WIP products next',
              description:
                'Add the WIP products here, then link each one to the raw products it depends on so the chain reflects the real process.',
              placement: 'top',
              beforeEnter: () => {
                openProcessingTourStep(2)
              },
            },
            {
              id: 'processing-finished',
              target: '[data-tour="products-processing-finished-section"]',
              title: 'Finish with the final products',
              description:
                'Create the finished products last and connect them to the WIP items that feed into the final output.',
              placement: 'top',
              beforeEnter: () => {
                openProcessingTourStep(3)
              },
            },
            {
              id: 'save',
              target: '[data-tour="products-save-button"]',
              title: 'Save the processing chain',
              description:
                'When the chain looks right, save it to add the linked products to the catalog.',
              placement: 'top',
              beforeEnter: () => {
                openProcessingTourStep(3)
              },
            }
          )
        }

        if (tourFlow === 'OPERATIONAL' || tourFlow === 'MIXED') {
          steps.push(
            {
              id: 'name',
              target: '[data-tour="products-name-field"]',
              title: 'Capture the product identity',
              description:
                'Start with the product name and status so the new SKU is easy to recognize and filter later.',
              placement: 'bottom',
              beforeEnter: () => {
                openSelectedTourFlow()
              },
            },
            {
              id: 'type',
              target: '[data-tour="products-type-field"]',
              title: 'Confirm the product type',
              description:
                tourFlow === 'MIXED'
                  ? 'Mixed product mode creates a finished product and lets you link it to existing finished-product components.'
                  : 'Operational products stay on the simple form, while raw, WIP, and finished products support process relationships.',
              placement: 'bottom',
              beforeEnter: () => {
                openSelectedTourFlow()
              },
            },
            {
              id: 'inventory',
              target: '[data-tour="products-inventory-section"]',
              title: 'Set stock planning defaults',
              description:
                'Base unit, reorder point, safety stock, and target stock help the team plan replenishment consistently.',
              placement: 'top',
              beforeEnter: () => {
                openSelectedTourFlow()
              },
            },
            {
              id: 'save',
              target: '[data-tour="products-save-button"]',
              title: 'Save the product',
              description:
                'When the setup looks right, save to add the product to the catalog and make it available across inventory flows.',
              placement: 'top',
              beforeEnter: () => {
                openSelectedTourFlow()
              },
            }
          )
        }
      } else {
        steps.push(
          {
            id: 'name',
            target: '[data-tour="products-name-field"]',
            title: 'Capture the product identity',
            description:
              'Start with the product name and status so the new SKU is easy to recognize and filter later.',
            placement: 'bottom',
            beforeEnter: () => {
              ensureCreateModalOpen()
            },
          },
          {
            id: 'type',
            target: '[data-tour="products-type-field"]',
            title: 'Confirm the product type',
            description:
              'Product type controls whether composition is required. Raw, WIP, finished, and operational products each support a different setup path.',
            placement: 'bottom',
            beforeEnter: () => {
              ensureCreateModalOpen()
            },
          },
          {
            id: 'inventory',
            target: '[data-tour="products-inventory-section"]',
            title: 'Set stock planning defaults',
            description:
              'Base unit, reorder point, safety stock, and target stock help the team plan replenishment consistently.',
            placement: 'top',
            beforeEnter: () => {
              ensureCreateModalOpen()
            },
          },
          {
            id: 'save',
            target: '[data-tour="products-save-button"]',
            title: 'Save the product',
            description:
              'When the setup looks right, save to add the product to the catalog and make it available across inventory flows.',
            placement: 'top',
            beforeEnter: () => {
              ensureCreateModalOpen()
            },
          }
        )
      }

      return steps
    },
    [ensureCreateModalOpen, openCreationModeTourModal, openProcessingTourStep, openSelectedTourFlow, tourFlow]
  )

  const {
    closeTour,
    currentStep,
    currentStepIndex,
    isLastStep,
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

  if (loading) {
    return (
      <PageLayout
        title="Products"
        activeItem="inventory"
        contentClassName="px-4 sm:px-6 lg:px-8 py-8"
      >
        <Spinner text="Loading products..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout
      title="Products"
      activeItem="inventory"
      actions={
        <>
          <Button variant="outline" onClick={() => void handleOpenTour()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Take tour
          </Button>
          <Button
            className="bg-olive hover:bg-olive-dark"
            onClick={handleOpenCreateModal}
            data-tour="products-add-button"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </>
      }
      contentClassName="px-4 sm:px-6 lg:px-8 py-8"
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Total Products</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.active}/{stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>With reorder set</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.configuredReorder}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-olive-light/30">
          <CardHeader className="pb-2">
            <CardDescription>Updated last 30 days</CardDescription>
            <CardTitle className="text-2xl font-semibold text-text-dark">
              {stats.updatedRecent}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="border-olive-light/30 bg-white">
        <CardHeader>
          <CardTitle className="text-text-dark">Products</CardTitle>
          <CardDescription>Default view shows raw products. Switch tabs to see processed and operational products.</CardDescription>
        </CardHeader>
        <div className="border-b border-olive-light/40" data-tour="products-tabs">
          <nav className="flex flex-wrap gap-0 px-6" aria-label="Product category tabs">
            <button
              type="button"
              onClick={() => setCatalogTab('RAW')}
              className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                catalogTab === 'RAW'
                  ? 'border-olive text-olive-dark text-text-dark'
                  : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
              }`}
            >
              <Package2 className="h-4 w-4" />
              Raw Products
            </button>
            <button
              type="button"
              onClick={() => setCatalogTab('PROCESSED')}
              className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                catalogTab === 'PROCESSED'
                  ? 'border-olive text-olive-dark text-text-dark'
                  : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
              }`}
            >
              <Boxes className="h-4 w-4" />
              Processed Products
            </button>
            <button
              type="button"
              onClick={() => setCatalogTab('OPERATIONAL')}
              className={`inline-flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                catalogTab === 'OPERATIONAL'
                  ? 'border-olive text-olive-dark text-text-dark'
                  : 'border-transparent text-text-dark/70 hover:text-text-dark hover:border-olive-light/40'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Operational Products
            </button>
          </nav>
        </div>
        <CardContent className="space-y-6">

          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label htmlFor="product-search">Search products</Label>
              <Input
                id="product-search"
                data-tour="products-search"
                placeholder="Search by name or notes"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All statuses</option>
                {statusOptions.map((status: string) => (
                  <option key={status} value={status}>
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="sort-field">Sort by</Label>
              <div className="mt-1 flex gap-2">
                <select
                  id="sort-field"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                >
                  {sortableColumns.map((column) => (
                    <option key={column.value} value={column.value}>
                      {column.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-olive-light/60 px-4"
                  onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                >
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-6">
            <div className="rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark/70 sm:col-span-2">
              <div className="font-medium text-text-dark">Results</div>
              <div>
                {filteredProducts.length} of {tabScopedProducts.length}
              </div>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchProducts}
                disabled={loading}
              >
                <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <div className="sm:col-span-3">
              <div className="rounded-md border border-olive-light/40 bg-white px-3 py-2" data-tour="products-bulk-actions">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-dark/70">
                    {selectedProductIds.length} selected
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedProductIds.length === 0 || bulkActionLoading}
                    onClick={() => {
                      setBulkEditForm(createEmptyBulkEditForm())
                      setBulkEditModalOpen(true)
                    }}
                  >
                    Bulk Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    disabled={selectedProductIds.length === 0 || bulkActionLoading}
                    onClick={() => setBulkDeleteAlertOpen(true)}
                  >
                    Delete Selected
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {getUserFriendlyErrorMessage(error, 'We could not load the products right now. Please refresh and try again.')}
            </div>
          ) : null}

          <div data-tour="products-results">
            <ResponsiveTable
              columns={columns}
              data={loading ? [] : paginatedProducts}
              rowKey="id"
              emptyMessage={emptyMessage}
              tableClassName=""
              mobileCardClassName=""
              getRowClassName={() => ''}
              onRowClick={(row) => {
                const type = (row.product_type ?? '').toUpperCase()
                if (type === 'RAW') {
                  navigate(`/inventory/products/${row.id}`)
                }
              }}
            />
          </div>

          {filteredProducts.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2">
              <div className="text-sm text-text-dark/70">
                Showing {(page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, filteredProducts.length)} of {filteredProducts.length}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="text-sm text-text-dark/70">
                  Per page
                </label>
                <select
                  id="page-size"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                  className="rounded-md border border-olive-light/60 bg-white px-2 py-1 text-sm text-text-dark focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * pageSize >= filteredProducts.length}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl h-[85vh] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-olive-light/30 bg-gradient-to-r from-olive-light/30 via-olive-light/20 to-beige px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-olive shadow-sm">
                  <Package2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-dark">
                    {isEditMode ? 'Edit Product' : 'Add Product'}
                  </h2>
                  <p className="text-sm text-text-dark/70">
                    {isEditMode
                      ? 'Update the key details for this product SKU.'
                      : 'Capture the key details for a new product SKU.'}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-text-dark hover:bg-olive-light/10"
                disabled={isSubmitting}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {FEATURE_PROCESSING_PRODUCT_WIZARD && modalMode === 'create' && creationMode === null ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-olive-light/30 bg-olive-light/10 p-4" data-tour="products-creation-mode">
                    <h3 className="text-sm font-semibold text-text-dark">Choose Creation Mode</h3>
                    <p className="text-xs text-text-dark/60 mt-1">Step 1 of 4</p>
                    <p className="text-xs text-text-dark/60 mt-1">Operational products use a simple form. Processing products use RAW → WIP → FINISHED wizard. Mixed products create finished products from existing finished-product components.</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start border-olive-light/60"
                        data-tour="products-processing-option"
                        onClick={() => {
                          setCreationMode('PROCESSING')
                          resetProcessingWizard()
                        }}
                      >
                        Processing product
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start border-olive-light/60"
                        onClick={() => {
                          setCreationMode('MIXED')
                          setFormData((prev) => ({ ...prev, product_type: 'FINISHED', is_mixed_product: true, component_ids: [] }))
                        }}
                      >
                        Mixed product
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-start border-olive-light/60"
                        data-tour="products-operational-option"
                        onClick={() => {
                          setCreationMode('OPERATIONAL')
                          setFormData((prev) => ({ ...prev, product_type: 'OP', is_mixed_product: false }))
                        }}
                      >
                        Operational product
                      </Button>
                    </div>
                  </div>
                </div>
              ) : isProcessingWizardActive ? (
                <div className="space-y-6">
                  <div className="rounded-xl border border-olive-light/30 bg-olive-light/10 p-4" data-tour="products-processing-editor">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-text-dark">{processingEditMode ? 'Edit Processing Chain' : 'Create Processing Chain'}</h3>
                        <p className="text-xs text-text-dark/60">
                          Step {modalMode === 'create' ? processingStep + 1 : processingStep} of {modalMode === 'create' ? 4 : 3}
                        </p>
                      </div>
                      <Input
                        value={processingChainName}
                        onChange={(e) => setProcessingChainName(e.target.value)}
                        placeholder="Enter chain name"
                        className="max-w-xs"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2" data-tour="products-processing-stages">
                    {[1, 2, 3].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setProcessingStep(step as 1 | 2 | 3)}
                        className={`rounded-md border px-3 py-2 text-sm ${processingStep === step ? 'border-olive bg-olive-light/20 text-text-dark' : 'border-olive-light/50 text-text-dark/70'}`}
                        disabled={isSubmitting}
                      >
                        {step === 1 ? 'RAW' : step === 2 ? 'WIP' : 'FINISHED'}
                      </button>
                    ))}
                  </div>

                  {processingStep === 1 && (
                    <div className="space-y-3 rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm" data-tour="products-processing-raw-section">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-dark">RAW Products</h4>
                      </div>
                      {processingRaws.map((row) => (
                        <div key={row.temp_key} className="rounded-md border border-olive-light/30 p-3 space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input placeholder="Enter product name" value={row.name} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'name', e.target.value)} />
                            <select value={row.status} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'status', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                              <option value="DEVELOPMENT">Development</option>
                            </select>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <select value={row.base_unit_id} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'base_unit_id', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="">No unit</option>
                              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} {unit.symbol ? `(${unit.symbol})` : ''}</option>)}
                            </select>
                            <Input type="number" step="any" placeholder="Reorder point" value={row.reorder_point} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'reorder_point', e.target.value)} />
                            <Input type="number" step="any" placeholder="Safety stock" value={row.safety_stock} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'safety_stock', e.target.value)} />
                            <Input type="number" step="any" placeholder="Target stock" value={row.target_stock} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'target_stock', e.target.value)} />
                          </div>
                          <div className="flex items-center gap-2">
                            <Input placeholder="Notes (optional)" value={row.notes} onChange={(e) => updateDraftField(setProcessingRaws, row.temp_key, 'notes', e.target.value)} />
                            <Button type="button" variant="ghost" size="sm" disabled={processingRaws.length <= 1} onClick={() => setProcessingRaws((prev) => prev.filter((r) => r.temp_key !== row.temp_key))}>Remove</Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-end pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setProcessingRaws((prev) => [...prev, createProcessingDraftBase(units)])}>
                          + Add Raw
                        </Button>
                      </div>
                    </div>
                  )}

                  {processingStep === 2 && (
                    <div className="space-y-3 rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm" data-tour="products-processing-wip-section">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-dark">WIP Products</h4>
                      </div>
                      {processingWips.map((row) => (
                        <div key={row.temp_key} className="rounded-md border border-olive-light/30 p-3 space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input placeholder="Enter product name" value={row.name} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'name', e.target.value)} />
                            <select value={row.status} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'status', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                              <option value="DEVELOPMENT">Development</option>
                            </select>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <select value={row.base_unit_id} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'base_unit_id', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="">No unit</option>
                              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} {unit.symbol ? `(${unit.symbol})` : ''}</option>)}
                            </select>
                            <Input type="number" step="any" placeholder="Reorder point" value={row.reorder_point} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'reorder_point', e.target.value)} />
                            <Input type="number" step="any" placeholder="Safety stock" value={row.safety_stock} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'safety_stock', e.target.value)} />
                            <Input type="number" step="any" placeholder="Target stock" value={row.target_stock} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'target_stock', e.target.value)} />
                          </div>
                          <Input placeholder="Notes (optional)" value={row.notes} onChange={(e) => updateDraftField(setProcessingWips, row.temp_key, 'notes', e.target.value)} />
                          <div className="grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2">
                            {processingRaws.map((raw) => (
                              <label key={raw.temp_key} className="flex items-center gap-2 rounded-md border border-olive-light/30 px-2 py-1 text-xs">
                                <input type="checkbox" checked={row.raw_component_temp_keys.includes(raw.temp_key)} onChange={() => toggleDraftLink('WIP', row.temp_key, raw.temp_key)} />
                                <span>{raw.name || 'Unnamed raw'}</span>
                              </label>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="sm" disabled={processingWips.length <= 1} onClick={() => setProcessingWips((prev) => prev.filter((w) => w.temp_key !== row.temp_key))}>Remove</Button>
                        </div>
                      ))}
                      <div className="flex justify-end pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setProcessingWips((prev) => [...prev, { ...createProcessingDraftBase(units), raw_component_temp_keys: [] }])}>
                          + Add WIP
                        </Button>
                      </div>
                    </div>
                  )}

                  {processingStep === 3 && (
                    <div className="space-y-3 rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm" data-tour="products-processing-finished-section">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-text-dark">FINISHED Products</h4>
                      </div>
                      {processingFinished.map((row) => (
                        <div key={row.temp_key} className="rounded-md border border-olive-light/30 p-3 space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input placeholder="Enter product name" value={row.name} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'name', e.target.value)} />
                            <select value={row.status} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'status', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                              <option value="DEVELOPMENT">Development</option>
                            </select>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <select value={row.base_unit_id} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'base_unit_id', e.target.value)} className="rounded-md border border-olive-light/60 px-3 py-2 text-sm">
                              <option value="">No unit</option>
                              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} {unit.symbol ? `(${unit.symbol})` : ''}</option>)}
                            </select>
                            <Input type="number" step="any" placeholder="Reorder point" value={row.reorder_point} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'reorder_point', e.target.value)} />
                            <Input type="number" step="any" placeholder="Safety stock" value={row.safety_stock} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'safety_stock', e.target.value)} />
                            <Input type="number" step="any" placeholder="Target stock" value={row.target_stock} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'target_stock', e.target.value)} />
                          </div>
                          <Input placeholder="Notes (optional)" value={row.notes} onChange={(e) => updateDraftField(setProcessingFinished, row.temp_key, 'notes', e.target.value)} />
                          <div className="grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2">
                            {processingWips.map((wip) => (
                              <label key={wip.temp_key} className="flex items-center gap-2 rounded-md border border-olive-light/30 px-2 py-1 text-xs">
                                <input type="checkbox" checked={row.wip_component_temp_keys.includes(wip.temp_key)} onChange={() => toggleDraftLink('FINISHED', row.temp_key, wip.temp_key)} />
                                <span>{wip.name || 'Unnamed WIP'}</span>
                              </label>
                            ))}
                          </div>
                          <Button type="button" variant="ghost" size="sm" disabled={processingFinished.length <= 1} onClick={() => setProcessingFinished((prev) => prev.filter((f) => f.temp_key !== row.temp_key))}>Remove</Button>
                        </div>
                      ))}
                      <div className="flex justify-end pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setProcessingFinished((prev) => [...prev, { ...createProcessingDraftBase(units), wip_component_temp_keys: [] }])}>
                          + Add Finished
                        </Button>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
              <>
              <div className="rounded-xl border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-dark">Core Details</h3>
                  <p className="text-xs text-text-dark/60">Capture the core product identity and lifecycle state.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="product-name">Name *</Label>
                    <Input
                      id="product-name"
                      data-tour="products-name-field"
                      name="name"
                      placeholder="Enter product name"
                      value={formData.name}
                      onChange={handleFormChange}
                      className="mt-1"
                      disabled={isSubmitting}
                    />
                    {formErrors.name ? (
                      <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                    ) : null}
                  </div>
                  <div>
                    <Label htmlFor="product-status">Status</Label>
                    <select
                      id="product-status"
                      name="status"
                      value={formData.status}
                      onChange={handleFormChange}
                      className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                      disabled={isSubmitting}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="DEVELOPMENT">Development</option>
                    </select>
                    {formErrors.status ? (
                      <p className="mt-1 text-sm text-red-600">{formErrors.status}</p>
                    ) : null}
                  </div>
                </div>
                {processingFallbackNotice ? (
                  <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <div>{processingFallbackNotice}</div>
                    {FEATURE_PROCESSING_PRODUCT_WIZARD && (formData.product_type || '').toUpperCase() !== 'OP' ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
                          onClick={handleLinkLegacyProductToChain}
                          disabled={isSubmitting || linkingLegacyProduct}
                        >
                          {linkingLegacyProduct ? 'Linking…' : 'Link to Processing Chain'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-4 sm:grid-cols-1">
                  {FEATURE_PROCESSING_PRODUCT_WIZARD && modalMode === 'create' && (creationMode === 'OPERATIONAL' || creationMode === 'MIXED') ? (
                    <div data-tour="products-type-field">
                      <Label>Product type</Label>
                      <p className="mt-1 rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark">
                        {creationMode === 'MIXED' ? 'Finished (Mixed)' : 'Operational (OP)'}
                      </p>
                    </div>
                  ) : (
                    <div data-tour="products-type-field">
                      <Label htmlFor="product-type">Product type</Label>
                      <select
                        id="product-type"
                        name="product_type"
                        value={formData.product_type}
                        onChange={(event) => {
                          handleFormChange(event)
                          const nextType = event.target.value.toUpperCase()
                          if (nextType === 'RAW' || nextType === 'OP') {
                            setFormData((prev) => ({ ...prev, component_ids: [] }))
                          }
                        }}
                        className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                        disabled={isSubmitting}
                      >
                        <option value="RAW">Raw</option>
                        <option value="WIP">WIP</option>
                        <option value="FINISHED">Finished</option>
                        <option value="OP">Operational (OP)</option>
                      </select>
                      {formErrors.product_type ? (
                        <p className="mt-1 text-sm text-red-600">{formErrors.product_type}</p>
                      ) : null}
                    </div>
                  )}
                  {formData.product_type.toUpperCase() === 'FINISHED' ? (
                    <label className="flex items-start gap-3 rounded-md border border-olive-light/30 bg-white px-3 py-3 text-sm text-text-dark">
                      <input
                        type="checkbox"
                        name="is_mixed_product"
                        checked={formData.is_mixed_product}
                        onChange={handleFormChange}
                        disabled={isSubmitting}
                        className="mt-1"
                      />
                      <span>
                        Mark as mixed finished product.
                        <span className="block text-xs text-text-dark/60">
                          Mixed finished products can be selected in Mixed Pack Processing.
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              </div>

              {formData.product_type.toUpperCase() !== 'OP' ? (
              <div className="rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm" data-tour="products-inventory-section">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-dark">Composition</h3>
                  <p className="text-xs text-text-dark/60">
                    {modalMode === 'create' && creationMode === 'MIXED'
                      ? 'Link this mixed finished product to the finished products that make it up.'
                      : 'Link products to their inputs. WIP → raw materials. Finished → WIPs.'}
                  </p>
                </div>
                {(formData.product_type.toUpperCase() === 'WIP' || formData.product_type.toUpperCase() === 'FINISHED') && (
                  <div className="mb-3">
                    <Input
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      placeholder="Search components by name or SKU"
                      disabled={isSubmitting}
                      className="bg-white"
                    />
                  </div>
                )}
                {formData.product_type.toUpperCase() === 'RAW' || formData.product_type.toUpperCase() === 'OP' ? (
                  <p className="text-sm text-text-dark/60">
                    {formData.product_type.toUpperCase() === 'OP'
                      ? 'Operational products do not require components.'
                      : 'Raw products do not require components.'}
                  </p>
                ) : null}

                {formData.product_type.toUpperCase() === 'WIP' && (
                  <div className="space-y-3">
                    <p className="text-xs text-text-dark/60">Select raw materials (one or more).</p>
                    <div className="grid max-h-64 overflow-y-auto gap-2 sm:grid-cols-2">
                      {filteredRawOptions
                        .filter((p) => p.id !== editingProductId)
                        .map((raw) => (
                          <label
                            key={raw.id}
                            className="flex items-center gap-2 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-olive-light/60"
                              checked={formData.component_ids.includes(raw.id)}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setFormData((prev) => {
                                  const next = new Set(prev.component_ids)
                                  if (checked) next.add(raw.id)
                                  else next.delete(raw.id)
                                  return { ...prev, component_ids: Array.from(next) }
                                })
                              }}
                              disabled={isSubmitting}
                            />
                            <span className="flex-1">
                              {raw.name ?? 'Unnamed raw'}
                              {raw.sku ? <span className="text-text-dark/50"> ({raw.sku})</span> : null}
                            </span>
                          </label>
                        ))}
                    </div>
                    {formErrors.components ? (
                      <p className="text-sm text-red-600">{formErrors.components}</p>
                    ) : null}
                  </div>
                )}

                {formData.product_type.toUpperCase() === 'FINISHED' && (
                  <div className="space-y-3">
                    <p className="text-xs text-text-dark/60">
                      {modalMode === 'create' && creationMode === 'MIXED'
                        ? 'Select finished-product inputs (one or more).'
                        : 'Select WIP inputs (one or more).'}
                    </p>
                    <div className="grid max-h-64 overflow-y-auto gap-2 sm:grid-cols-2">
                      {(modalMode === 'create' && creationMode === 'MIXED' ? filteredFinishedOptions : filteredWipOptions)
                        .filter((p) => p.id !== editingProductId)
                        .map((component) => (
                          <label
                            key={component.id}
                            className="flex items-center gap-2 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-sm text-text-dark"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-olive-light/60"
                              checked={formData.component_ids.includes(component.id)}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setFormData((prev) => {
                                  const next = new Set(prev.component_ids)
                                  if (checked) next.add(component.id)
                                  else next.delete(component.id)
                                  return { ...prev, component_ids: Array.from(next) }
                                })
                              }}
                              disabled={isSubmitting}
                            />
                            <span className="flex-1">
                              {component.name ?? (modalMode === 'create' && creationMode === 'MIXED' ? 'Unnamed finished product' : 'Unnamed WIP')}
                              {component.sku ? <span className="text-text-dark/50"> ({component.sku})</span> : null}
                            </span>
                          </label>
                        ))}
                    </div>
                    {formErrors.components ? (
                      <p className="text-sm text-red-600">{formErrors.components}</p>
                    ) : null}
                  </div>
                )}
              </div>
              ) : null}

              <div className="rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-dark">Inventory Planning</h3>
                  <p className="text-xs text-text-dark/60">Set minimums and preferred stock levels.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <Label htmlFor="product-base-unit">Base Unit</Label>
                    <select
                      id="product-base-unit"
                      name="base_unit_id"
                      value={formData.base_unit_id}
                      onChange={handleFormChange}
                      className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                      disabled={isSubmitting || loadingUnits}
                    >
                      <option value="">No unit</option>
                      {units.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name} {unit.symbol ? `(${unit.symbol})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="product-reorder">Reorder point</Label>
                    <Input
                      id="product-reorder"
                      name="reorder_point"
                      type="number"
                      step="any"
                      placeholder="Enter reorder point"
                      value={formData.reorder_point}
                      onChange={handleFormChange}
                      className="mt-1"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <Label htmlFor="product-safety">Safety stock</Label>
                    <Input
                      id="product-safety"
                      name="safety_stock"
                      type="number"
                      step="any"
                      placeholder="Enter safety stock"
                      value={formData.safety_stock}
                      onChange={handleFormChange}
                      className="mt-1"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <Label htmlFor="product-target">Target stock</Label>
                    <Input
                      id="product-target"
                      name="target_stock"
                      type="number"
                      step="any"
                      placeholder="Enter target stock"
                      value={formData.target_stock}
                      onChange={handleFormChange}
                      className="mt-1"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-olive-light/30 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-text-dark">Notes</h3>
                  <p className="text-xs text-text-dark/60">Add context for procurement or processing.</p>
                </div>
                <textarea
                  id="product-notes"
                  name="notes"
                  placeholder="Optional internal notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  className="mt-1 min-h-[96px] w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                  disabled={isSubmitting}
                />
              </div>

              </>
              )}
              </div>

              <div className="border-t border-olive-light/30 bg-white px-6 py-4">
                {FEATURE_PROCESSING_PRODUCT_WIZARD && modalMode === 'create' && creationMode === null ? (
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCloseModal}
                      className="text-text-dark hover:bg-olive-light/10"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : isProcessingWizardActive ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={processingStep <= 1 || isSubmitting}
                        onClick={() => setProcessingStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={processingStep >= 3 || isSubmitting}
                        onClick={() => setProcessingStep((prev) => Math.min(3, prev + 1) as 1 | 2 | 3)}
                      >
                        Next
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={handleCloseModal} disabled={isSubmitting}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-olive hover:bg-olive-dark"
                        disabled={isSubmitting}
                        data-tour="products-save-button"
                      >
                        {isSubmitting ? 'Saving…' : processingEditMode ? 'Update Chain' : 'Save Chain'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleCloseModal}
                      disabled={isSubmitting}
                      className="text-text-dark hover:bg-olive-light/10"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-olive hover:bg-olive-dark"
                      disabled={isSubmitting}
                      data-tour="products-save-button"
                    >
                      {isSubmitting ? 'Saving…' : isEditMode ? 'Update Product' : 'Save Product'}
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl h-[80vh] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-olive-light/30 bg-olive-light/20 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-text-dark">Bulk Edit Products</h2>
                <p className="text-sm text-text-dark/70">
                  Updating {selectedProductIds.length} selected product(s).
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setBulkEditModalOpen(false)}
                disabled={bulkActionLoading}
                className="text-text-dark hover:bg-olive-light/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 space-y-4 px-6 py-6 overflow-y-auto">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bulk-base-unit">Base Unit</Label>
                  <select
                    id="bulk-base-unit"
                    name="base_unit_id"
                    value={bulkEditForm.base_unit_id}
                    onChange={handleBulkEditFormChange}
                    className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                    disabled={bulkActionLoading || loadingUnits}
                  >
                    <option value="NO_CHANGE">No change</option>
                    <option value="NONE">Clear base unit</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} {unit.symbol ? `(${unit.symbol})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="bulk-status">Status</Label>
                  <select
                    id="bulk-status"
                    name="status"
                    value={bulkEditForm.status}
                    onChange={handleBulkEditFormChange}
                    className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                    disabled={bulkActionLoading}
                  >
                    <option value="NO_CHANGE">No change</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="DEVELOPMENT">Development</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="bulk-reorder">Min / Reorder</Label>
                  <Input
                    id="bulk-reorder"
                    name="reorder_point"
                    type="number"
                    step="any"
                    placeholder="Leave blank to keep current value"
                    value={bulkEditForm.reorder_point}
                    onChange={handleBulkEditFormChange}
                    disabled={bulkActionLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="bulk-safety">Safety</Label>
                  <Input
                    id="bulk-safety"
                    name="safety_stock"
                    type="number"
                    step="any"
                    placeholder="Leave blank to keep current value"
                    value={bulkEditForm.safety_stock}
                    onChange={handleBulkEditFormChange}
                    disabled={bulkActionLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="bulk-target">Target</Label>
                  <Input
                    id="bulk-target"
                    name="target_stock"
                    type="number"
                    step="any"
                    placeholder="Leave blank to keep current value"
                    value={bulkEditForm.target_stock}
                    onChange={handleBulkEditFormChange}
                    disabled={bulkActionLoading}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-olive-light/30 bg-olive-light/10 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-text-dark">Bulk Composition Mapping</h4>
                    <p className="text-xs text-text-dark/60">
                      For WIP products: add raw materials. For Finished products: add WIPs. Only applies to selected products of the matching type.
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    <Input
                      placeholder="Search components"
                      value={bulkComponentSearch}
                      onChange={(e) => setBulkComponentSearch(e.target.value)}
                      disabled={bulkActionLoading}
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 text-sm font-medium text-text-dark">Raw materials (for WIP)</div>
                    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-olive-light/40 bg-white p-2">
                      {filteredRawOptionsBulk
                        .filter(() => hasWipSelection) // only show when WIP products are selected
                        .map((raw) => (
                        <label
                          key={raw.id}
                          className="flex items-center gap-2 rounded-md border border-olive-light/30 bg-olive-light/5 px-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-olive-light/60"
                            checked={bulkEditForm.raw_component_ids.includes(raw.id)}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setBulkEditForm((prev) => {
                                const next = new Set(prev.raw_component_ids)
                                if (checked) next.add(raw.id)
                                else next.delete(raw.id)
                                return { ...prev, raw_component_ids: Array.from(next) }
                              })
                            }}
                            disabled={bulkActionLoading}
                          />
                          <span className="flex-1 truncate">
                            {raw.name ?? 'Unnamed raw'}
                            {raw.sku ? <span className="text-text-dark/50"> ({raw.sku})</span> : null}
                          </span>
                        </label>
                      ))}
                      {!hasWipSelection ? (
                        <div className="text-xs text-text-dark/60">Select at least one WIP product to map raw materials.</div>
                      ) : filteredRawOptionsBulk.length === 0 ? (
                        <div className="text-xs text-text-dark/60">No raw materials match the search.</div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-sm font-medium text-text-dark">WIPs (for Finished)</div>
                    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-olive-light/40 bg-white p-2">
                      {filteredWipOptionsBulk
                        .filter(() => hasFinishedSelection) // only show when Finished products are selected
                        .map((wip) => (
                        <label
                          key={wip.id}
                          className="flex items-center gap-2 rounded-md border border-olive-light/30 bg-olive-light/5 px-2 py-1 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-olive-light/60"
                            checked={bulkEditForm.wip_component_ids.includes(wip.id)}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setBulkEditForm((prev) => {
                                const next = new Set(prev.wip_component_ids)
                                if (checked) next.add(wip.id)
                                else next.delete(wip.id)
                                return { ...prev, wip_component_ids: Array.from(next) }
                              })
                            }}
                            disabled={bulkActionLoading}
                          />
                          <span className="flex-1 truncate">
                            {wip.name ?? 'Unnamed WIP'}
                            {wip.sku ? <span className="text-text-dark/50"> ({wip.sku})</span> : null}
                          </span>
                        </label>
                      ))}
                      {!hasFinishedSelection ? (
                        <div className="text-xs text-text-dark/60">Select at least one Finished product to map WIPs.</div>
                      ) : filteredWipOptionsBulk.length === 0 ? (
                        <div className="text-xs text-text-dark/60">No WIPs match the search.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-olive-light/30 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setBulkEditModalOpen(false)}
                  disabled={bulkActionLoading}
                  className="text-text-dark hover:bg-olive-light/10"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-olive hover:bg-olive-dark"
                  onClick={applyBulkEdit}
                  disabled={bulkActionLoading || selectedProductIds.length === 0}
                >
                  {bulkActionLoading ? 'Applying…' : 'Apply Bulk Edit'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setProductToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              {productToDelete
                ? `Delete product "${productToDelete.name ?? 'Unknown'}"? This cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => productToDelete && performDeleteProduct(productToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteAlertOpen} onOpenChange={setBulkDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected products?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedProductIds.length > 0
                ? `Delete ${selectedProductIds.length} selected product(s)? This cannot be undone.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={bulkDeleteProducts}
            >
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsTour
        open={isTourOpen}
        step={currentStep}
        currentStepIndex={currentStepIndex}
        totalSteps={tourSteps.length}
        isLastStep={isLastStep}
        onClose={handleCloseTour}
        onBack={() => void previousStep()}
        onNext={() => void nextStep()}
      />
    </PageLayout>
  )
}

export default Products
