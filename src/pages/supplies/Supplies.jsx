import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarRange, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useSuppliers } from '@/hooks/useSuppliers'

function formatDateTime(value) {
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

const STATUS_BADGES = {
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const STATUS_OPTIONS = ['RECEIVED', 'INSPECTING', 'ACCEPTED', 'REJECTED']

function toDate(value) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, amount) {
  const newDate = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  return newDate
}

function isSameDay(a, b) {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isBetween(date, start, end) {
  if (!start || !end) return false
  return date >= start && date <= end
}

function getMonthGrid(monthDate) {
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

function Supplies() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { suppliers: supplierOptions, loading: suppliersLoading, error: suppliersError } = useSuppliers()
  const [supplies, setSupplies] = useState([])
  const [supplyLines, setSupplyLines] = useState([])
  const [supplyBatches, setSupplyBatches] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [units, setUnits] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [receivedFrom, setReceivedFrom] = useState('')
  const [receivedTo, setReceivedTo] = useState('')
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [displayedMonth, setDisplayedMonth] = useState(() => startOfMonth(new Date()))
  const datePickerRef = useRef(null)
  const today = useMemo(() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    return date
  }, [])
  const todayISO = useMemo(() => today.toISOString().slice(0, 10), [today])
  const monthGrid = useMemo(() => getMonthGrid(displayedMonth), [displayedMonth])
  const currentUserName = useMemo(() => user?.name || user?.email || '', [user])
  const [profileId, setProfileId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    doc_no: '',
    warehouse_id: '',
    supplier_id: '',
    received_at: new Date().toISOString().slice(0, 16),
    received_by: '',
    doc_status: 'ACCEPTED',
    supply_batches: [{ product_id: '', unit_id: '', qty: '' }],
  })

  const supplierList = useMemo(() => (Array.isArray(supplierOptions) ? supplierOptions : []), [supplierOptions])

  const supplierLabelMap = useMemo(() => {
    const map = new Map()
    supplierList.forEach((supplier) => {
      if (supplier?.id !== undefined && supplier?.id !== null) {
        map.set(supplier.id, supplier.name ?? '')
      }
    })
    return map
  }, [supplierList])

  const warehouseLabelMap = useMemo(() => {
    const map = new Map()
    warehouses.forEach((warehouse) => {
      if (warehouse?.id !== undefined && warehouse?.id !== null) {
        map.set(warehouse.id, warehouse.name ?? '')
      }
    })
    return map
  }, [warehouses])

  const displaySupplies = useMemo(() =>
    supplies.map((supply) => ({
      ...supply,
      supplier_name: supply.supplier_name ?? supplierLabelMap.get(supply.supplier_id) ?? '',
      warehouse_name: supply.warehouse_name ?? warehouseLabelMap.get(supply.warehouse_id) ?? '',
    })),
  [supplies, supplierLabelMap, warehouseLabelMap])

  const filteredSupplies = useMemo(() => {
    const normalised = searchTerm.trim().toLowerCase()
    const fromDate = toDate(receivedFrom)
    const toDateValue = toDate(receivedTo)

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
      render: (supply) => (
        <div>
          <div className="font-medium text-text-dark">{supply.doc_no}</div>
          <div className="text-xs text-text-dark/60">Created {formatDateTime(supply.created_at)}</div>
        </div>
      ),
      mobileRender: (supply) => (
        <div className="text-right">
          <div className="font-medium text-text-dark">{supply.doc_no}</div>
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
      render: (supply) => formatDateTime(supply.received_at),
      mobileRender: (supply) => formatDateTime(supply.received_at),
      cellClassName: 'text-sm text-text-dark/70',
      mobileValueClassName: 'text-right text-sm text-text-dark',
    },
    {
      key: 'status',
      header: 'Status',
      render: (supply) => (
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
            STATUS_BADGES[supply.doc_status] ?? 'bg-gray-100 text-gray-700'
          }`}
        >
          {supply.doc_status}
        </span>
      ),
      mobileRender: (supply) => supply.doc_status,
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (supply) => (
        <div>
          <div className="font-medium text-text-dark">{supply.supplier_name || 'Not specified'}</div>
          <div className="text-xs text-text-dark/60">{supply.reference || 'No reference'}</div>
        </div>
      ),
      mobileRender: (supply) => (
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

    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
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

  const formatDisplayDate = (value) => {
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

  const handleDaySelect = (day) => {
    if (day > today) {
      return
    }

    const dayISO = day.toISOString().slice(0, 10)

    if (!draftFromDate || (draftFromDate && draftToDate)) {
      setDraftFrom(dayISO)
      setDraftTo('')
      return
    }

    if (day < draftFromDate) {
      setDraftFrom(dayISO)
      setDraftTo('')
      return
    }

    setDraftTo(dayISO)
  }

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSupplyBatchChange = (index, field, value) => {
    const next = [...formData.supply_batches]
    next[index][field] = value
    setFormData((prev) => ({
      ...prev,
      supply_batches: next,
    }))
  }

  const addSupplyBatch = () => {
    setFormData((prev) => ({
      ...prev,
      supply_batches: [...prev.supply_batches, { product_id: '', unit_id: '', qty: '' }],
    }))
  }

  const removeSupplyBatch = (index) => {
    setFormData((prev) => ({
      ...prev,
      supply_batches: prev.supply_batches.filter((_, i) => i !== index),
    }))
  }

  const generateLotNumberPreview = (index) => {
    const currentYear = new Date().getFullYear()
    const nextBatchNumber = supplyBatches.length + 1
    return `LOT-${currentYear}-${String(nextBatchNumber + index).padStart(3, '0')}`
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const warehouseId = parseInt(formData.warehouse_id, 10)
    if (!Number.isFinite(warehouseId)) {
      toast.error('Select a warehouse before saving.')
      return
    }

    const supplierId = formData.supplier_id ? parseInt(formData.supplier_id, 10) : null
    const receivedAtISO = new Date().toISOString()
    const qualityStatus = formData.doc_status === 'ACCEPTED' ? 'PASSED' : 'PENDING'

    const validLines = formData.supply_batches.filter((batch) => batch.product_id && batch.unit_id && batch.qty)

    setIsSubmitting(true)
    try {
      const { data: insertedSupply, error: insertSupplyError } = await supabase
        .from('supplies')
        .insert({
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
        })
        .select('*')
        .single()

      if (insertSupplyError) {
        throw insertSupplyError
      }

      const newSupplyId = insertedSupply.id

      let insertedLines = []
      if (validLines.length > 0) {
        const supplyLineRows = validLines.map((line) => {
          const quantity = Number(line.qty) || 0
          const acceptedQty = formData.doc_status === 'ACCEPTED' ? quantity : 0
          const rejectedQty = quantity - acceptedQty

          return {
            supply_id: newSupplyId,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            ordered_qty: quantity,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: rejectedQty > 0 ? rejectedQty : 0,
            variance_reason: rejectedQty > 0 ? 'Pending review' : null,
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
          const quantity = Number(line.qty) || 0
          const acceptedQty = formData.doc_status === 'ACCEPTED' ? quantity : 0
          const lotNumber = `LOT-${newSupplyId}-${String(index + 1).padStart(3, '0')}`

          return {
            supply_id: newSupplyId,
            supply_line_id: insertedLines[index]?.id ?? null,
            product_id: parseInt(line.product_id, 10),
            unit_id: line.unit_id ? parseInt(line.unit_id, 10) : null,
            lot_no: lotNumber,
            received_qty: quantity,
            accepted_qty: acceptedQty,
            rejected_qty: quantity - acceptedQty,
            current_qty: acceptedQty,
            quality_status: acceptedQty === quantity ? 'PASSED' : 'PENDING',
            expiry_date: null,
          }
        })

        const { error: batchesError } = await supabase.from('supply_batches').insert(supplyBatchRows)
        if (batchesError) {
          throw batchesError
        }
      }

      toast.success('Supply captured successfully.')
      await loadSuppliesData()
      setFormData({
        doc_no: '',
        warehouse_id: '',
        supplier_id: '',
        received_at: new Date().toISOString().slice(0, 16),
        received_by: currentUserName,
        doc_status: 'ACCEPTED',
        supply_batches: [{ product_id: '', unit_id: '', qty: '' }],
      })
      setIsModalOpen(false)
    } catch (error) {
      console.error('Error capturing supply', error)
      toast.error(error.message ?? 'Unable to capture supply.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setFormData({
      doc_no: '',
      warehouse_id: '',
      supplier_id: '',
      received_at: new Date().toISOString().slice(0, 16),
      received_by: currentUserName,
      doc_status: 'ACCEPTED',
      supply_batches: [{ product_id: '', unit_id: '', qty: '' }],
    })
  }

  const handleRowClick = (supply) => {
    const lines = supplyLines.filter((line) => line.supply_id === supply.id)
    const batches = supplyBatches.filter((batch) => batch.supply_id === supply.id)
    navigate(`/supplies/${supply.id}`, {
      state: {
        supply,
        supplyLines: lines,
        supplyBatches: batches,
      },
    })
  }

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40'

  const sectionCardClass =
    'rounded-xl border border-olive-light/40 bg-olive-light/10 p-5 sm:p-6'

  useEffect(() => {
    if (suppliersError) {
      toast.error(suppliersError.message ?? 'Unable to load suppliers from Supabase.')
    }
  }, [suppliersError])

  const loadReferenceData = useCallback(async () => {
    try {
      const [warehousesResponse, productsResponse, unitsResponse] = await Promise.all([
        supabase.from('warehouses').select('id, name').order('name', { ascending: true }),
        supabase.from('products').select('id, name, sku').order('name', { ascending: true }),
        supabase.from('units').select('id, name, symbol').order('name', { ascending: true }),
      ])

      if (warehousesResponse.error) throw warehousesResponse.error
      if (productsResponse.error) throw productsResponse.error
      if (unitsResponse.error) throw unitsResponse.error

      setWarehouses(warehousesResponse.data ?? [])
      setProducts(productsResponse.data ?? [])
      setUnits(unitsResponse.data ?? [])
    } catch (error) {
      console.error('Error loading reference data', error)
      toast.error('Unable to load reference data for supplies.')
    }
  }, [])

  const loadSuppliesData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [suppliesResponse, linesResponse, batchesResponse] = await Promise.all([
        supabase
          .from('supplies')
          .select('*')
          .order('received_at', { ascending: false, nullsFirst: false }),
        supabase.from('supply_lines').select('*'),
        supabase.from('supply_batches').select('*'),
      ])

      if (suppliesResponse.error) throw suppliesResponse.error
      if (linesResponse.error) throw linesResponse.error
      if (batchesResponse.error) throw batchesResponse.error

      setSupplies(suppliesResponse.data ?? [])
      setSupplyLines(linesResponse.data ?? [])
      setSupplyBatches(batchesResponse.data ?? [])
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
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error) {
        console.warn('Unable to load user profile id', error)
        setProfileId(null)
        return
      }

      setProfileId(data?.id ?? null)
    }

    loadProfileId()
  }, [user?.id])

  return (
    <>
      <PageLayout
        title="Supplies"
        activeItem="supplies"
        actions={
          <Button className="bg-olive hover:bg-olive-dark" onClick={() => setIsModalOpen(true)}>
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

              {loadingData ? (
                <div className="flex items-center justify-center py-16 text-sm text-text-dark/60">
                  Loading supplies…
                </div>
              ) : (
                <ResponsiveTable
                  columns={columns}
                  data={filteredSupplies}
                  rowKey="id"
                  onRowClick={handleRowClick}
                />
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
                <h2 className="text-2xl font-semibold text-text-dark">New Supply</h2>
                <p className="text-sm text-text-dark/70">Capture a new receipt or load from staging.</p>
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

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-5 sm:p-6 lg:p-8">
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
                        value={formData.doc_no || `SUP-2024-${String(supplies.length + 1).padStart(3, '0')}`}
                        readOnly
                        className={`${baseFieldClass} cursor-not-allowed bg-olive-light/20 text-text-dark/70`}
                      />
                      <p className="text-xs text-text-dark/60">
                        Automatically generated after saving.
                      </p>
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
                            {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2 lg:col-span-6">
                      <Label htmlFor="supplier_id">Supplier *</Label>
                      <select
                        id="supplier_id"
                        required
                        className={baseFieldClass}
                        value={formData.supplier_id}
                        onChange={(event) => handleInputChange('supplier_id', event.target.value)}
                        disabled={isSubmitting || suppliersLoading || supplierList.length === 0}
                      >
                        <option value="">Select supplier</option>
                        {supplierList.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
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

                    <div className="space-y-2 lg:col-span-6">
                      <Label htmlFor="doc_status">Status *</Label>
                      <select
                        id="doc_status"
                        required
                        className={baseFieldClass}
                        value={formData.doc_status}
                        onChange={(event) => handleInputChange('doc_status', event.target.value)}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                <section className={sectionCardClass}>
                  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-text-dark">Supply batches</h3>
                      <p className="text-sm text-text-dark/70">
                        Add each batch received in this supply. Quantities should reflect actual intake.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addSupplyBatch} className="border-olive-light/60" disabled={isSubmitting}>
                      Add batch
                    </Button>
                  </div>

                  <div className="space-y-6">
                    {formData.supply_batches.map((batch, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-olive-light/40 bg-white/80 p-5 shadow-sm transition hover:border-olive-light/80 hover:shadow-md"
                      >
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-text-dark/50">
                              Batch {index + 1}
                            </p>
                            <p className="mt-1 text-sm text-text-dark/70">
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
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeSupplyBatch(index)}
                              disabled={isSubmitting}
                            >
                              Remove
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                          <div className="space-y-2 lg:col-span-5">
                            <Label htmlFor={`product_${index}`}>Product *</Label>
                            <select
                              id={`product_${index}`}
                              required
                              className={baseFieldClass}
                              value={batch.product_id}
                              onChange={(event) => handleSupplyBatchChange(index, 'product_id', event.target.value)}
                              disabled={isSubmitting || products.length === 0}
                            >
                              <option value="">Select product</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name}
                                  {product.sku ? ` (${product.sku})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 lg:col-span-4">
                            <Label htmlFor={`unit_${index}`}>Unit *</Label>
                            <select
                              id={`unit_${index}`}
                              required
                              className={baseFieldClass}
                              value={batch.unit_id}
                              onChange={(event) => handleSupplyBatchChange(index, 'unit_id', event.target.value)}
                              disabled={isSubmitting || units.length === 0}
                            >
                              <option value="">Select unit</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.name}
                                  {unit.symbol ? ` (${unit.symbol})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 lg:col-span-3">
                            <Label htmlFor={`qty_${index}`}>Quantity *</Label>
                            <Input
                              id={`qty_${index}`}
                              type="number"
                              min="0"
                              step="0.01"
                              required
                              value={batch.qty}
                              onChange={(event) => handleSupplyBatchChange(index, 'qty', event.target.value)}
                              placeholder="e.g. 120"
                              className={baseFieldClass}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="flex flex-col gap-3 border-t border-olive-light/30 bg-olive-light/20 p-5 sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:p-6">
                <Button type="button" variant="outline" onClick={closeModal} className="border-olive-light/60" disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save Supply'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default Supplies

