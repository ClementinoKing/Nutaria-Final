import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Package2, Pencil, Plus, RefreshCcw, Trash2, X } from 'lucide-react'
import ResponsiveTable from '@/components/ResponsiveTable'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import type { PostgrestError } from '@supabase/supabase-js'
import { Spinner } from '@/components/ui/spinner'
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
  product_type: 'RAW' | 'WIP' | 'FINISHED' | null
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
}

interface FormErrors {
  name?: string
  status?: string
  product_type?: string
}

interface BulkEditFormData {
  base_unit_id: string
  reorder_point: string
  safety_stock: string
  target_stock: string
  status: string
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
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const sortableColumns = [
  { value: 'name', label: 'Name' },
  { value: 'product_type', label: 'Type' },
  { value: 'reorder_point', label: 'Reorder Point' },
  { value: 'safety_stock', label: 'Safety Stock' },
  { value: 'target_stock', label: 'Target Stock' },
  { value: 'updated_at', label: 'Last Updated' },
]

function createEmptyProductForm(existingProducts: Product[] = []): ProductFormData {
  return {
    name: '',
    base_unit_id: '',
    reorder_point: '',
    safety_stock: '',
    target_stock: '',
    status: 'ACTIVE',
    notes: '',
    product_type: 'RAW',
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
  }
}

function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'RAW' | 'WIP' | 'FINISHED'>('ALL')
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
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [bulkDeleteAlertOpen, setBulkDeleteAlertOpen] = useState(false)
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditFormData>(createEmptyBulkEditForm())

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('products')
      .select(
        'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type'
      )
      .order('updated_at', { ascending: false, nullsFirst: false })

    if (fetchError) {
      console.error('Error fetching products', fetchError)
      setError(fetchError)
      toast.error(fetchError.message ?? 'Unable to load products from Supabase.')
      setProducts([])
      setLoading(false)
      return
    }

    setProducts(Array.isArray(data) ? data : [])
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
  }, [searchTerm, statusFilter, productTypeFilter, sortBy, sortDirection])

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

      const matchesProductType =
        productTypeFilter === 'ALL' ||
        (product.product_type ?? 'RAW').toUpperCase() === productTypeFilter.toUpperCase()

      return matchesSearch && matchesStatus && matchesProductType
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

    return preparedProducts.filter(matchesFilters).sort(comparator)
  }, [preparedProducts, productTypeFilter, searchTerm, sortBy, sortDirection, statusFilter])

  const paginatedProducts = useMemo(
    () => filteredProducts.slice((page - 1) * pageSize, page * pageSize),
    [filteredProducts, page, pageSize]
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
    const total = preparedProducts.length
    let active = 0
    let inactive = 0
    let configuredReorder = 0
    let updatedRecent = 0
    const now = Date.now()

    preparedProducts.forEach((product) => {
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
  }, [preparedProducts])

  const emptyMessage = useMemo(() => {
    if (loading) {
      return 'Loading products…'
    }
    if (error) {
      return 'Unable to load products.'
    }
    return 'No products found.'
  }, [error, loading])

  const handleOpenCreateModal = () => {
    setFormData(createEmptyProductForm(products))
    setFormErrors({})
    setModalMode('create')
    setEditingProduct(null)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (isSubmitting) {
      return
    }
    setIsModalOpen(false)
    setFormErrors({})
    setModalMode('create')
    setEditingProduct(null)
    setFormData(createEmptyProductForm(products))
  }

  const handleOpenEditModal = useCallback((product: Product) => {
    if (!product) {
      return
    }

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
    })
    setFormErrors({})
    setModalMode('edit')
    setEditingProduct(product)
    setIsModalOpen(true)
  }, [])

  const performDeleteProduct = useCallback(
    async (product: Product) => {
      if (!product?.id) return
      setDeletingProductId(product.id)
      try {
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('id', product.id)
        if (deleteError) throw deleteError
        toast.success('Product deleted.')
        setProducts((prev) => prev.filter((p) => p.id !== product.id))
      } catch (err) {
        const msg = (err as PostgrestError)?.message ?? 'Unable to delete product.'
        toast.error(msg)
      } finally {
        setDeletingProductId(null)
      }
    },
    []
  )

  const requestDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteAlertOpen(true)
  }, [])

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
      const { error: deleteError } = await supabase.from('products').delete().in('id', selectedProductIds)
      if (deleteError) throw deleteError
      setProducts((previous) => previous.filter((product) => !selectedProductIds.includes(product.id)))
      toast.success(`Deleted ${selectedProductIds.length} product(s).`)
      setSelectedProductIds([])
      setBulkDeleteAlertOpen(false)
    } catch (err) {
      const message = (err as PostgrestError)?.message ?? 'Unable to delete selected products.'
      toast.error(message)
    } finally {
      setBulkActionLoading(false)
    }
  }, [selectedProductIds])

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
      toast.warning('Set at least one field to update.')
      return
    }

    setBulkActionLoading(true)
    try {
      const { error: updateError } = await supabase.from('products').update(payload).in('id', selectedProductIds)
      if (updateError) throw updateError

      setProducts((previous) =>
        previous.map((product) =>
          selectedProductIds.includes(product.id) ? { ...product, ...payload } : product
        )
      )
      toast.success(`Updated ${selectedProductIds.length} product(s).`)
      setSelectedProductIds([])
      setBulkEditModalOpen(false)
      setBulkEditForm(createEmptyBulkEditForm())
    } catch (err) {
      const message = (err as PostgrestError)?.message ?? 'Unable to apply bulk edit.'
      toast.error(message)
    } finally {
      setBulkActionLoading(false)
    }
  }, [bulkEditForm, selectedProductIds])

  const handleFormChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const numbersToPayload = (value: string | null | undefined): number | null => {
    if (value === '' || value === null || value === undefined) {
      return null
    }
    const numeric = Number(value)
    return Number.isNaN(numeric) ? null : numeric
  }

  const validateForm = (): boolean => {
    const errors: FormErrors = {}

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
      !['RAW', 'WIP', 'FINISHED'].includes(formData.product_type.toUpperCase())
    ) {
      errors.product_type = 'Product type must be Raw, WIP, or Finished.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    const isEditing = modalMode === 'edit' && editingProduct?.id !== undefined
    try {
      const productType = (formData.product_type || 'RAW').toUpperCase()
      const productTypeVal =
        productType === 'RAW' || productType === 'WIP' || productType === 'FINISHED' ? productType : 'RAW'
      const internalSku = isEditing
        ? (editingProduct?.sku ?? generateSku(products))
        : generateSku(products)
      const payload = {
        sku: internalSku,
        name: formData.name.trim(),
        category: isEditing ? (editingProduct?.category ?? null) : null,
        base_unit_id: formData.base_unit_id ? Number(formData.base_unit_id) : null,
        reorder_point: numbersToPayload(formData.reorder_point),
        safety_stock: numbersToPayload(formData.safety_stock),
        target_stock: numbersToPayload(formData.target_stock),
        status: (formData.status || 'ACTIVE').toUpperCase(),
        notes: formData.notes.trim() || null,
        product_type: productTypeVal,
      }

      if (isEditing) {
        const { data, error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type'
          )
          .single()

        if (updateError) {
          throw updateError
        }

        toast.success('Product updated successfully.')
        setProducts((previous) =>
          data ? previous.map((product: Product) => (product.id === (data as unknown as Product).id ? (data as unknown as Product) : product)) : previous
        )
      } else {
        const { data, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at, product_type'
          )
          .single()

        if (insertError) {
          throw insertError
        }

        toast.success('Product added successfully.')
        setProducts((previous) => (data ? [data as unknown as Product, ...previous] : previous))
      }

      setIsModalOpen(false)
      setModalMode('create')
      setEditingProduct(null)
      setFormData(createEmptyProductForm())
      setFormErrors({})
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
            <div className="font-medium text-text-dark">{product.name ?? 'Unnamed product'}</div>
            {product.notes ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-text-dark/60">
                <Package2 className="h-3.5 w-3.5" />
                <span className="line-clamp-1">{product.notes}</span>
              </div>
            ) : null}
          </div>
        ),
        mobileRender: (product: PreparedProduct) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{product.name ?? 'Unnamed product'}</div>
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
          const label = t === 'WIP' ? 'WIP' : t.charAt(0) + t.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${style}`}>
              {label}
            </span>
          )
        },
        mobileRender: (product: PreparedProduct) => {
          const t = (product.product_type ?? 'RAW').toUpperCase()
          const style = productTypeBadgeStyles[t] ?? productTypeBadgeStyles.RAW
          const label = t === 'WIP' ? 'WIP' : t.charAt(0) + t.slice(1).toLowerCase()
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
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation()
                handleOpenEditModal(product)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              onClick={(event) => {
                event.stopPropagation()
                requestDeleteProduct(product)
              }}
              disabled={deletingProductId === product.id}
            >
              {deletingProductId === product.id ? (
                'Deleting…'
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </div>
        ),
        mobileRender: (product: PreparedProduct) => (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full justify-center"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleOpenEditModal(product)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full justify-center text-red-600 hover:bg-red-50"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                requestDeleteProduct(product)
              }}
              disabled={deletingProductId === product.id}
            >
              {deletingProductId === product.id ? (
                'Deleting…'
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
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
    ]
  )

  const isEditMode = modalMode === 'edit'

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
        <Button className="bg-olive hover:bg-olive-dark" onClick={handleOpenCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
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
          <CardDescription>Manage your product catalog, stock parameters, and statuses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label htmlFor="product-search">Search products</Label>
              <Input
                id="product-search"
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
            <div>
              <Label htmlFor="product-type-filter">Product type</Label>
              <select
                id="product-type-filter"
                value={productTypeFilter}
                onChange={(event) =>
                  setProductTypeFilter(event.target.value as 'ALL' | 'RAW' | 'WIP' | 'FINISHED')
                }
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All types</option>
                <option value="RAW">Raw</option>
                <option value="WIP">WIP</option>
                <option value="FINISHED">Finished</option>
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
                {filteredProducts.length} of {preparedProducts.length}
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
              <div className="rounded-md border border-olive-light/40 bg-white px-3 py-2">
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
              {error.message ?? 'Unable to load products from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={loading ? [] : paginatedProducts}
            rowKey="id"
            emptyMessage={emptyMessage}
            tableClassName=""
            mobileCardClassName=""
            getRowClassName={() => ''}
            onRowClick={undefined}
          />

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
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
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

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
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
                      name="name"
                      placeholder="e.g. Raw Macadamia Kernel"
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
                <div className="mt-4 grid gap-4 sm:grid-cols-1">
                  <div>
                    <Label htmlFor="product-type">Product type</Label>
                    <select
                      id="product-type"
                      name="product_type"
                      value={formData.product_type}
                      onChange={handleFormChange}
                      className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
                      disabled={isSubmitting}
                    >
                      <option value="RAW">Raw</option>
                      <option value="WIP">WIP</option>
                      <option value="FINISHED">Finished</option>
                    </select>
                    {formErrors.product_type ? (
                      <p className="mt-1 text-sm text-red-600">{formErrors.product_type}</p>
                    ) : null}
                  </div>
                </div>
              </div>

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
                      placeholder="e.g. 250"
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
                      placeholder="e.g. 100"
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
                      placeholder="e.g. 500"
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

              <div className="flex items-center justify-end gap-3 border-t border-olive-light/30 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="text-text-dark hover:bg-olive-light/10"
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting
                    ? 'Saving…'
                    : isEditMode
                      ? 'Update Product'
                      : 'Save Product'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
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

            <div className="space-y-4 px-6 py-6">
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
                    placeholder="Leave blank = no change"
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
                    placeholder="Leave blank = no change"
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
                    placeholder="Leave blank = no change"
                    value={bulkEditForm.target_stock}
                    onChange={handleBulkEditFormChange}
                    disabled={bulkActionLoading}
                  />
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
    </PageLayout>
  )
}

export default Products
