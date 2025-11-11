import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Package2, Pencil, Plus, RefreshCcw, X } from 'lucide-react'
import ResponsiveTable from '@/components/ResponsiveTable'
import PageLayout from '@/components/layout/PageLayout'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'

const statusBadgeStyles = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  DEVELOPMENT: 'bg-blue-100 text-blue-800',
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

const sortableColumns = [
  { value: 'name', label: 'Name' },
  { value: 'sku', label: 'SKU' },
  { value: 'category', label: 'Category' },
  { value: 'reorder_point', label: 'Reorder Point' },
  { value: 'safety_stock', label: 'Safety Stock' },
  { value: 'target_stock', label: 'Target Stock' },
  { value: 'updated_at', label: 'Last Updated' },
]

function createEmptyProductForm() {
  return {
    sku: '',
    name: '',
    category: '',
    base_unit_id: '',
    reorder_point: '',
    safety_stock: '',
    target_stock: '',
    status: 'ACTIVE',
    notes: '',
  }
}

function parseDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function formatDate(value) {
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

function formatNumber(value) {
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

function Products() {
  const [products, setProducts] = useState([])
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [editingProduct, setEditingProduct] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState(() => createEmptyProductForm())
  const [formErrors, setFormErrors] = useState({})

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('products')
      .select(
        'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at'
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

  const unitMap = useMemo(() => {
    const map = new Map()
    units.forEach((unit) => {
      if (unit?.id !== undefined && unit?.id !== null) {
        map.set(unit.id, unit)
      }
    })
    return map
  }, [units])

  const preparedProducts = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        createdAtDate: parseDate(product.created_at),
        updatedAtDate: parseDate(product.updated_at),
      })),
    [products]
  )

  const categories = useMemo(() => {
    const categorySet = new Set()
    preparedProducts.forEach((product) => {
      if (product.category) {
        categorySet.add(product.category)
      }
    })
    return Array.from(categorySet).sort((a, b) => a.localeCompare(b))
  }, [preparedProducts])

  const statusOptions = useMemo(() => {
    const statusSet = new Set()
    preparedProducts.forEach((product) => {
      if (product.status) {
        statusSet.add(product.status.toUpperCase())
      }
    })
    return Array.from(statusSet)
      .sort((a, b) => a.localeCompare(b))
      .map((status) => status)
  }, [preparedProducts])

  const filteredProducts = useMemo(() => {
    const normalisedSearch = searchTerm.trim().toLowerCase()

    const matchesFilters = (product) => {
      const matchesSearch =
        normalisedSearch.length === 0 ||
        (product.name ?? '').toLowerCase().includes(normalisedSearch) ||
        (product.sku ?? '').toLowerCase().includes(normalisedSearch) ||
        (product.notes ?? '').toLowerCase().includes(normalisedSearch)

      const matchesStatus =
        statusFilter === 'ALL' ||
        (product.status ?? '').toUpperCase() === statusFilter.toUpperCase()

      const matchesCategory =
        categoryFilter === 'ALL' || (product.category ?? '').toLowerCase() === categoryFilter.toLowerCase()

      return matchesSearch && matchesStatus && matchesCategory
    }

    const comparator = (a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1

      if (['reorder_point', 'safety_stock', 'target_stock'].includes(sortBy)) {
        const aValue = Number(a[sortBy]) || 0
        const bValue = Number(b[sortBy]) || 0
        return (aValue - bValue) * direction
      }

      if (sortBy === 'updated_at') {
        const aDate = a.updatedAtDate?.getTime() ?? 0
        const bDate = b.updatedAtDate?.getTime() ?? 0
        return (aDate - bDate) * direction
      }

      const aValue = (a[sortBy] ?? '').toString().toLowerCase()
      const bValue = (b[sortBy] ?? '').toString().toLowerCase()

      if (aValue < bValue) return -1 * direction
      if (aValue > bValue) return 1 * direction
      return 0
    }

    return preparedProducts.filter(matchesFilters).sort(comparator)
  }, [categoryFilter, preparedProducts, searchTerm, sortBy, sortDirection, statusFilter])

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
    setFormData(createEmptyProductForm())
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
    setFormData(createEmptyProductForm())
  }

  const handleOpenEditModal = useCallback((product) => {
    if (!product) {
      return
    }

    setFormData({
      sku: product.sku ?? '',
      name: product.name ?? '',
      category: product.category ?? '',
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
    })
    setFormErrors({})
    setModalMode('edit')
    setEditingProduct(product)
    setIsModalOpen(true)
  }, [])

  const handleFormChange = (event) => {
    const { name, value } = event.target
    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const numbersToPayload = (value) => {
    if (value === '' || value === null || value === undefined) {
      return null
    }
    const numeric = Number(value)
    return Number.isNaN(numeric) ? null : numeric
  }

  const validateForm = () => {
    const errors = {}

    if (!formData.sku.trim()) {
      errors.sku = 'SKU is required.'
    }
    if (!formData.name.trim()) {
      errors.name = 'Name is required.'
    }
    if (formData.sku.trim().length > 64) {
      errors.sku = 'SKU must be 64 characters or fewer.'
    }
    if (formData.name.trim().length > 120) {
      errors.name = 'Name must be 120 characters or fewer.'
    }
    if (formData.category.trim().length > 80) {
      errors.category = 'Category must be 80 characters or fewer.'
    }
    if (formData.status && !['ACTIVE', 'INACTIVE', 'DEVELOPMENT'].includes(formData.status.toUpperCase())) {
      errors.status = 'Status must be Active, Inactive, or Development.'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    const isEditing = modalMode === 'edit' && editingProduct?.id !== undefined
    try {
      const payload = {
        sku: formData.sku.trim(),
        name: formData.name.trim(),
        category: formData.category.trim() || null,
        base_unit_id: formData.base_unit_id ? Number(formData.base_unit_id) : null,
        reorder_point: numbersToPayload(formData.reorder_point),
        safety_stock: numbersToPayload(formData.safety_stock),
        target_stock: numbersToPayload(formData.target_stock),
        status: (formData.status || 'ACTIVE').toUpperCase(),
        notes: formData.notes.trim() || null,
      }

      if (isEditing) {
        const { data, error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at'
          )
          .single()

        if (updateError) {
          throw updateError
        }

        toast.success('Product updated successfully.')
        setProducts((previous) =>
          data ? previous.map((product) => (product.id === data.id ? data : product)) : previous
        )
      } else {
        const { data, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select(
            'id, sku, name, category, base_unit_id, reorder_point, safety_stock, target_stock, status, notes, created_at, updated_at'
          )
          .single()

        if (insertError) {
          throw insertError
        }

        toast.success('Product added successfully.')
        setProducts((previous) => (data ? [data, ...previous] : previous))
      }

      setIsModalOpen(false)
      setModalMode('create')
      setEditingProduct(null)
      setFormData(createEmptyProductForm())
      setFormErrors({})
    } catch (submitError) {
      const errorMessage =
        submitError?.message ??
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
        key: 'sku',
        header: 'SKU',
        render: (product) => product.sku ?? '—',
        mobileRender: (product) => product.sku ?? '—',
        cellClassName: 'font-medium text-text-dark',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'name',
        header: 'Product',
        render: (product) => (
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
        mobileRender: (product) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{product.name ?? 'Unnamed product'}</div>
            {product.notes ? <div className="text-xs text-text-dark/60">{product.notes}</div> : null}
          </div>
        ),
      },
      {
        key: 'category',
        header: 'Category',
        render: (product) => product.category ?? '—',
        mobileRender: (product) => product.category ?? '—',
        cellClassName: 'text-text-dark/70',
        mobileValueClassName: 'text-text-dark',
      },
      {
        key: 'base_unit_id',
        header: 'Base Unit',
        render: (product) => {
          if (!product.base_unit_id) {
            return '—'
          }
          const unit = unitMap.get(product.base_unit_id)
          if (!unit) {
            return `ID ${product.base_unit_id}`
          }
          return unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name
        },
        mobileRender: (product) => {
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
        render: (product) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{formatNumber(product.reorder_point)}</div>
            <div className="text-xs text-text-dark/60">Safety: {formatNumber(product.safety_stock)}</div>
          </div>
        ),
        mobileRender: (product) => (
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
        render: (product) => formatNumber(product.target_stock),
        mobileRender: (product) => formatNumber(product.target_stock),
        headerClassName: 'text-right',
        cellClassName: 'text-right text-text-dark',
        mobileValueClassName: 'text-right text-text-dark',
      },
      {
        key: 'status',
        header: 'Status',
        render: (product) => {
          const status = (product.status ?? 'INACTIVE').toUpperCase()
          const badgeStyle = statusBadgeStyles[status] ?? statusBadgeStyles.INACTIVE
          const label = status.charAt(0) + status.slice(1).toLowerCase()
          return (
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeStyle}`}>
              {label}
            </span>
          )
        },
        mobileRender: (product) => {
          const status = (product.status ?? 'INACTIVE').toUpperCase()
          const badgeStyle = statusBadgeStyles[status] ?? statusBadgeStyles.INACTIVE
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
        render: (product) => formatDate(product.updatedAtDate),
        mobileRender: (product) => formatDate(product.updatedAtDate),
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
        render: (product) => (
          <div className="flex justify-end">
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
          </div>
        ),
        mobileRender: (product) => (
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
        ),
      },
    ],
    [handleOpenEditModal, unitMap]
  )

  const isEditMode = modalMode === 'edit'

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
            <CardDescription>Total SKUs</CardDescription>
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
                placeholder="Search by name, SKU, or notes"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="category-filter">Category</Label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-1 w-full rounded-md border border-olive-light/60 bg-white px-3 py-2 text-sm text-text-dark shadow-sm focus:border-olive focus:outline-none focus:ring-1 focus:ring-olive"
              >
                <option value="ALL">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
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
                {statusOptions.map((status) => (
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

          <div className="grid gap-4 sm:grid-cols-5">
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
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error.message ?? 'Unable to load products from Supabase.'}
            </div>
          ) : null}

          <ResponsiveTable
            columns={columns}
            data={loading ? [] : filteredProducts}
            rowKey="id"
            emptyMessage={emptyMessage}
          />
        </CardContent>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-olive-light/30 px-6 py-4">
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

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="product-sku">SKU *</Label>
                  <Input
                    id="product-sku"
                    name="sku"
                    placeholder="e.g. NUT-001"
                    value={formData.sku}
                    onChange={handleFormChange}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  {formErrors.sku ? (
                    <p className="mt-1 text-sm text-red-600">{formErrors.sku}</p>
                  ) : null}
                </div>
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="product-category">Category</Label>
                  <Input
                    id="product-category"
                    name="category"
                    placeholder="e.g. Raw Materials"
                    value={formData.category}
                    onChange={handleFormChange}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  {formErrors.category ? (
                    <p className="mt-1 text-sm text-red-600">{formErrors.category}</p>
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

              <div className="grid gap-4 sm:grid-cols-3">
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                <div>
                  <Label htmlFor="product-notes">Notes</Label>
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
              </div>

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
    </PageLayout>
  )
}

export default Products

