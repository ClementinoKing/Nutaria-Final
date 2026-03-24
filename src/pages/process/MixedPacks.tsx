import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { SearchableSelect } from '@/components/ui/searchable-select'
import PageLayout from '@/components/layout/PageLayout'
import ResponsiveTable from '@/components/ResponsiveTable'
import { supabase } from '@/lib/supabaseClient'
import { getUserFriendlyErrorMessage } from '@/lib/errorMessages'
import { toast } from 'sonner'
import { Package as PackageIcon, PackagePlus, Search, X } from 'lucide-react'
import type {
  CreateMixedPackPayload,
  MixedPackBatchItemDetail,
  MixedPackBatchRow,
  MixedPackCreateLine,
  MixedPackSourceOption,
} from '@/types/mixedPack'

interface PackagingUnitOption {
  id: number
  code: string
  name: string
  unit_type: 'PACKET' | 'BOX'
  packaging_type: 'DOY' | 'VACUUM' | 'POLY' | 'BOX' | null
  net_weight_kg: number | null
  is_active: boolean
}

interface BoxPackRuleOption {
  id: number
  box_unit_id: number
  packet_unit_id: number
  packets_per_box: number
  is_active: boolean
  box_unit_code?: string | null
  box_unit_name?: string | null
}

interface MixedFinishedProductOption {
  id: number
  name: string
  sku: string | null
}

interface FormState {
  packName: string
  mixedProductId: string
  definedPackSize: string
  requireExactTotal: boolean
  packetUnitCode: string
  storageType: '' | 'BOX' | 'SHOP_PACKING'
  boxUnitCode: string
  unitsCount: string
  packsPerUnit: string
  notes: string
}

const defaultFormState: FormState = {
  packName: '',
  mixedProductId: '',
  definedPackSize: '',
  requireExactTotal: true,
  packetUnitCode: '',
  storageType: '',
  boxUnitCode: '',
  unitsCount: '',
  packsPerUnit: '',
  notes: '',
}

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function formatQuantity(value: number, suffix = 'kg'): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${suffix}`
}

function mapPackagingTypeToPackingType(
  packagingType: PackagingUnitOption['packaging_type'],
): 'Vacuum packing' | 'Bag packing' | 'Shop packing' | null {
  switch (packagingType) {
    case 'VACUUM':
      return 'Vacuum packing'
    case 'DOY':
      return 'Shop packing'
    case 'POLY':
      return 'Bag packing'
    default:
      return null
  }
}

function MixedPacks() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [sourceSearch, setSourceSearch] = useState('')
  const [form, setForm] = useState<FormState>(defaultFormState)
  const [sourceRows, setSourceRows] = useState<MixedPackSourceOption[]>([])
  const [batchRows, setBatchRows] = useState<MixedPackBatchRow[]>([])
  const [selectedLines, setSelectedLines] = useState<MixedPackCreateLine[]>([])
  const [selectedBatch, setSelectedBatch] = useState<MixedPackBatchRow | null>(null)
  const [detailRows, setDetailRows] = useState<MixedPackBatchItemDetail[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [packagingUnits, setPackagingUnits] = useState<PackagingUnitOption[]>([])
  const [boxPackRules, setBoxPackRules] = useState<BoxPackRuleOption[]>([])
  const [mixedFinishedProducts, setMixedFinishedProducts] = useState<MixedFinishedProductOption[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [sourcesRes, batchesRes, unitsRes, rulesRes, mixedProductsRes] = await Promise.all([
      supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          product_id,
          quantity_kg,
          pack_identifier,
          packet_unit_code,
          pack_count,
          remainder_kg,
          created_at,
          sorting_output:process_sorting_outputs(
            product:products(id, name, sku, product_type, base_unit_id, units(name, symbol))
          ),
          product:products(id, name, sku, product_type, base_unit_id, units(name, symbol)),
          usages:process_packaging_remainder_usages!process_packaging_remainder_usages_source_pack_entry_id_fkey(
            quantity_kg
          ),
          packaging_run:process_packaging_runs(
            process_step_run_id,
            process_step_runs(
              process_lot_run_id,
              status,
              process_lot_runs(
                id,
                status,
                supply_batch_id,
                supply_batches(
                  lot_no,
                  supply_id,
                  supplies(
                    warehouse_id,
                    warehouses(name)
                  )
                )
              )
            )
          )
        `)
        .gt('remainder_kg', 0)
        .order('created_at', { ascending: false }),
      supabase
        .from('mixed_pack_batches')
        .select('id, batch_no, pack_name, status, inventory_type, defined_pack_size, actual_total_qty, warehouse_id, unit_id, require_exact_total, notes, created_at, storage_allocation_id, pack_entry_id, created_by')
        .order('created_at', { ascending: false }),
      supabase.rpc('get_packaging_units'),
      supabase.rpc('get_box_pack_rules'),
      supabase
        .from('products')
        .select(`
          id,
          name,
          sku,
          product_type,
          is_mixed_product
        `)
        .eq('product_type', 'FINISHED')
        .eq('is_mixed_product', true)
        .order('name', { ascending: true }),
    ])

    if (sourcesRes.error || batchesRes.error || unitsRes.error || rulesRes.error || mixedProductsRes.error) {
      setError(
        getUserFriendlyErrorMessage(
          sourcesRes.error || batchesRes.error || unitsRes.error || rulesRes.error || mixedProductsRes.error,
          'We could not load the mixed-pack workspace right now. Please refresh and try again.',
        ),
      )
      setSourceRows([])
      setBatchRows([])
      setPackagingUnits([])
      setBoxPackRules([])
      setMixedFinishedProducts([])
      setLoading(false)
      return
    }

    const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
      Array.isArray(value) ? value[0] ?? null : value ?? null

    const nextSources = ((sourcesRes.data ?? []) as any[])
      .map((row) => {
        const usageRows = Array.isArray(row.usages) ? row.usages : []
        const usedRemainderKg = usageRows.reduce((sum: number, usage: { quantity_kg?: number | null }) => {
          return sum + (Number(usage.quantity_kg) || 0)
        }, 0)

        const stepRun = unwrap(row.packaging_run?.process_step_runs)
        const lotRun = unwrap(stepRun?.process_lot_runs)
        const batch = unwrap(lotRun?.supply_batches)
        const supply = unwrap(batch?.supplies)
        const warehouse = unwrap(supply?.warehouses)
        const product = unwrap(row.product) ?? unwrap(row.sorting_output?.product) ?? null
        const unit = unwrap(product?.units ?? null)
        const remainderKg = Number(row.remainder_kg) || 0
        const availableRemainderKg = Math.max(0, remainderKg - usedRemainderKg)

        return {
          pack_entry_id: Number(row.id),
          product_id: Number(product?.id ?? row.product_id ?? 0),
          product_name: String(product?.name ?? 'Unknown product'),
          product_sku: product?.sku ? String(product.sku) : null,
          pack_identifier: row.pack_identifier ? String(row.pack_identifier) : null,
          lot_no: batch?.lot_no ? String(batch.lot_no) : null,
          lot_run_id: lotRun?.id ? Number(lotRun.id) : null,
          remainder_kg: remainderKg,
          used_remainder_kg: usedRemainderKg,
          available_remainder_kg: availableRemainderKg,
          quantity_kg: Number(row.quantity_kg) || 0,
          pack_count: row.pack_count == null ? null : Number(row.pack_count),
          packed_at: row.created_at ? String(row.created_at) : null,
          warehouse_id: Number(supply?.warehouse_id ?? 0),
          warehouse_name: warehouse?.name ? String(warehouse.name) : null,
          unit_id: product?.base_unit_id ? Number(product.base_unit_id) : null,
          unit_name: unit?.name ? String(unit.name) : null,
          unit_symbol: unit?.symbol ? String(unit.symbol) : null,
        }
      })
      .filter((row) =>
        row.pack_entry_id > 0 &&
        row.available_remainder_kg > 0 &&
        row.product_id > 0,
      )

    const nextUnits = ((unitsRes.data ?? []) as PackagingUnitOption[]).filter((unit) => unit.is_active)
    const nextRules = ((rulesRes.data ?? []) as BoxPackRuleOption[]).filter((rule) => rule.is_active)
    const nextMixedProducts = ((mixedProductsRes.data ?? []) as Array<{
      id: number
      name: string | null
      sku: string | null
      product_type: string | null
      is_mixed_product?: boolean | null
    }>)
      .filter((row) => String(row.product_type ?? '').toUpperCase() === 'FINISHED' && Boolean(row.is_mixed_product))
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? 'Unnamed mixed product'),
        sku: row.sku ? String(row.sku) : null,
      }))

    const rawBatches = (batchesRes.data ?? []) as Array<{
      id: number
      batch_no: string | null
      pack_name: string | null
      status: string | null
      inventory_type: string | null
      defined_pack_size: number | null
      actual_total_qty: number | null
      warehouse_id: number | null
      unit_id: number | null
      require_exact_total: boolean | null
      notes: string | null
      created_at: string | null
      storage_allocation_id: number | null
      pack_entry_id: number | null
      created_by: string | null
    }>

    const warehouseIds = Array.from(new Set(rawBatches.map((row) => row.warehouse_id).filter((value): value is number => value != null)))
    const unitIds = Array.from(new Set(rawBatches.map((row) => row.unit_id).filter((value): value is number => value != null)))
    const createdByIds = Array.from(new Set(rawBatches.map((row) => row.created_by).filter((value): value is string => Boolean(value))))
    const batchIds = rawBatches.map((row) => row.id)
    const packEntryIds = Array.from(new Set(rawBatches.map((row) => row.pack_entry_id).filter((value): value is number => value != null)))
    const allocationIds = Array.from(new Set(rawBatches.map((row) => row.storage_allocation_id).filter((value): value is number => value != null)))

    const [warehousesRes, batchItemsRes, packEntriesRes, allocationsRes, createdByRes] = await Promise.all([
      warehouseIds.length > 0 ? supabase.from('warehouses').select('id, name').in('id', warehouseIds) : Promise.resolve({ data: [], error: null }),
      batchIds.length > 0 ? supabase.from('mixed_pack_batch_items').select('id, mixed_pack_batch_id').in('mixed_pack_batch_id', batchIds) : Promise.resolve({ data: [], error: null }),
      packEntryIds.length > 0 ? supabase.from('process_packaging_pack_entries').select('id, packet_unit_code, pack_size_kg, packing_type').in('id', packEntryIds) : Promise.resolve({ data: [], error: null }),
      allocationIds.length > 0 ? supabase.from('process_packaging_storage_allocations').select('id, storage_type, box_unit_code, units_count, packs_per_unit, total_packs').in('id', allocationIds) : Promise.resolve({ data: [], error: null }),
      createdByIds.length > 0 ? supabase.from('user_profiles').select('id, full_name, email').in('id', createdByIds) : Promise.resolve({ data: [], error: null }),
    ])

    if (warehousesRes.error || batchItemsRes.error || packEntriesRes.error || allocationsRes.error || createdByRes.error) {
      setError(
        getUserFriendlyErrorMessage(
          warehousesRes.error || batchItemsRes.error || packEntriesRes.error || allocationsRes.error || createdByRes.error,
          'We could not load the mixed-pack related records right now. Please refresh and try again.',
        ),
      )
      setSourceRows(nextSources)
      setBatchRows([])
      setPackagingUnits(nextUnits)
      setBoxPackRules(nextRules)
      setMixedFinishedProducts(nextMixedProducts)
      setLoading(false)
      return
    }

    const warehouseMap = new Map(((warehousesRes.data ?? []) as Array<{ id: number; name: string | null }>).map((row) => [row.id, row.name ?? null]))
    const itemCountMap = new Map<number, number>()
    ;((batchItemsRes.data ?? []) as Array<{ id: number; mixed_pack_batch_id: number }>).forEach((row) => {
      itemCountMap.set(row.mixed_pack_batch_id, (itemCountMap.get(row.mixed_pack_batch_id) ?? 0) + 1)
    })
    const packEntryMap = new Map(
      ((packEntriesRes.data ?? []) as Array<{ id: number; packet_unit_code: string | null; pack_size_kg: number | null; packing_type: string | null }>).map((row) => [row.id, row]),
    )
    const allocationMap = new Map(
      ((allocationsRes.data ?? []) as Array<{ id: number; storage_type: string | null; box_unit_code: string | null; units_count: number | null; packs_per_unit: number | null; total_packs: number | null }>).map((row) => [row.id, row]),
    )
    const createdByMap = new Map(
      ((createdByRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((row) => [row.id, row]),
    )
    const unitMap = new Map(nextUnits.map((unit) => [unit.id, unit]))

    const nextBatches = rawBatches.map((row) => {
      const packEntry = row.pack_entry_id ? packEntryMap.get(row.pack_entry_id) ?? null : null
      const allocation = row.storage_allocation_id ? allocationMap.get(row.storage_allocation_id) ?? null : null
      const createdBy = row.created_by ? createdByMap.get(row.created_by) ?? null : null
      const unit = row.unit_id ? unitMap.get(row.unit_id) ?? null : null

      return {
        id: Number(row.id),
        batch_no: String(row.batch_no ?? '—'),
        pack_name: String(row.pack_name ?? 'Untitled mixed pack'),
        status: 'PACKAGED' as const,
        inventory_type: 'mixed_pack' as const,
        defined_pack_size: row.defined_pack_size == null ? null : Number(row.defined_pack_size),
        actual_total_qty: Number(row.actual_total_qty) || 0,
        warehouse_id: Number(row.warehouse_id ?? 0),
        warehouse_name: row.warehouse_id ? warehouseMap.get(row.warehouse_id) ?? null : null,
        unit_id: row.unit_id == null ? null : Number(row.unit_id),
        unit_label: unit?.symbol || unit?.name || 'kg',
        notes: row.notes ? String(row.notes) : null,
        require_exact_total: Boolean(row.require_exact_total),
        created_by_name: createdBy?.full_name || createdBy?.email || 'Unknown user',
        created_at: row.created_at ? String(row.created_at) : null,
        source_item_count: itemCountMap.get(row.id) ?? 0,
        packet_unit_code: packEntry?.packet_unit_code ?? null,
        pack_size_kg: packEntry?.pack_size_kg == null ? null : Number(packEntry.pack_size_kg),
        packing_type: packEntry?.packing_type ?? null,
        storage_type: allocation?.storage_type ?? null,
        box_unit_code: allocation?.box_unit_code ?? null,
        units_count: allocation?.units_count == null ? null : Number(allocation.units_count),
        packs_per_unit: allocation?.packs_per_unit == null ? null : Number(allocation.packs_per_unit),
        total_packs: allocation?.total_packs == null ? null : Number(allocation.total_packs),
        storage_allocation_id: row.storage_allocation_id == null ? null : Number(row.storage_allocation_id),
        pack_entry_id: row.pack_entry_id == null ? null : Number(row.pack_entry_id),
      }
    })

    setSourceRows(nextSources)
    setBatchRows(nextBatches)
    setPackagingUnits(nextUnits)
    setBoxPackRules(nextRules)
    setMixedFinishedProducts(nextMixedProducts)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const packetUnits = useMemo(
    () => packagingUnits.filter((unit) => unit.unit_type === 'PACKET' && (unit.net_weight_kg ?? 0) > 0),
    [packagingUnits],
  )

  const boxUnits = useMemo(
    () => packagingUnits.filter((unit) => unit.unit_type === 'BOX'),
    [packagingUnits],
  )

  const selectedPacketUnit = useMemo(
    () => packetUnits.find((unit) => unit.code === form.packetUnitCode) ?? null,
    [form.packetUnitCode, packetUnits],
  )

  const selectedMixedProduct = useMemo(
    () => mixedFinishedProducts.find((product) => String(product.id) === form.mixedProductId) ?? null,
    [form.mixedProductId, mixedFinishedProducts],
  )

  const selectedWarehouseId = useMemo(
    () => selectedLines[0]?.source.warehouse_id ?? null,
    [selectedLines],
  )

  const selectedUnitId = useMemo(
    () => selectedLines[0]?.source.unit_id ?? null,
    [selectedLines],
  )

  const selectedWarehouseLabel = useMemo(
    () => (selectedLines.length > 0 ? selectedLines[0]?.source.warehouse_name ?? `Warehouse #${selectedWarehouseId}` : '—'),
    [selectedLines, selectedWarehouseId],
  )

  const selectedTotalQty = useMemo(
    () => selectedLines.reduce((sum, line) => sum + (Number(line.quantity_used) || 0), 0),
    [selectedLines],
  )

  const definedPackSizeValue = useMemo(
    () => (form.definedPackSize.trim() ? Number(form.definedPackSize) : null),
    [form.definedPackSize],
  )

  const totalMismatch = useMemo(() => {
    if (!form.requireExactTotal || definedPackSizeValue == null || !Number.isFinite(definedPackSizeValue)) {
      return false
    }
    return Math.abs(selectedTotalQty - definedPackSizeValue) > 0.000001
  }, [definedPackSizeValue, form.requireExactTotal, selectedTotalQty])

  const lineErrors = useMemo(() => {
    const next = new Map<number, string>()
    selectedLines.forEach((line) => {
      const quantityUsed = Number(line.quantity_used)
      if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
        next.set(line.source_pack_entry_id, 'Enter a quantity greater than zero.')
        return
      }
      if (quantityUsed > line.source.available_remainder_kg + 0.000001) {
        next.set(line.source_pack_entry_id, `Cannot exceed ${formatQuantity(line.source.available_remainder_kg)} available remainder.`)
      }
    })
    return next
  }, [selectedLines])

  const suggestedBoxRule = useMemo(() => {
    if (!selectedPacketUnit || form.storageType !== 'BOX') return null
    return boxPackRules.find((rule) => rule.packet_unit_id === selectedPacketUnit.id && rule.box_unit_code === form.boxUnitCode) ?? null
  }, [boxPackRules, form.boxUnitCode, form.storageType, selectedPacketUnit])

  useEffect(() => {
    if (form.storageType !== 'BOX') return
    if (!suggestedBoxRule) return
    setForm((previous) => {
      const nextValue = String(suggestedBoxRule.packets_per_box)
      if (previous.packsPerUnit === nextValue) return previous
      return { ...previous, packsPerUnit: nextValue }
    })
  }, [suggestedBoxRule, form.storageType])

  const producedPackCount = useMemo(() => {
    const packSize = Number(selectedPacketUnit?.net_weight_kg) || 0
    if (packSize <= 0) return 0
    return Math.floor(selectedTotalQty / packSize)
  }, [selectedPacketUnit?.net_weight_kg, selectedTotalQty])

  const requestedAllocationPacks = useMemo(() => {
    const unitsCount = Number(form.unitsCount) || 0
    const packsPerUnit = Number(form.packsPerUnit) || 0
    return unitsCount * packsPerUnit
  }, [form.packsPerUnit, form.unitsCount])

  const allocationError = useMemo(() => {
    if (!form.storageType) return 'Choose a storage type.'
    if (!selectedPacketUnit) return 'Select a packet unit with a configured net weight.'
    if (!form.unitsCount.trim() || (Number(form.unitsCount) || 0) <= 0) return 'Units count must be greater than zero.'
    if (!form.packsPerUnit.trim() || (Number(form.packsPerUnit) || 0) <= 0) return 'Packs per unit must be greater than zero.'
    if (form.storageType === 'BOX' && !form.boxUnitCode) return 'Select a box unit.'
    if (requestedAllocationPacks > producedPackCount) {
      return `Allocation requests ${requestedAllocationPacks} packs, but only ${producedPackCount} full packs will be produced.`
    }
    return null
  }, [form.boxUnitCode, form.packsPerUnit, form.storageType, form.unitsCount, producedPackCount, requestedAllocationPacks, selectedPacketUnit])

  const canSubmit = useMemo(() => {
    if (!form.packName.trim()) return false
    if (!form.mixedProductId.trim()) return false
    if (!selectedPacketUnit) return false
    if (selectedLines.length === 0) return false
    if (lineErrors.size > 0) return false
    if (allocationError) return false
    if (form.requireExactTotal && form.definedPackSize.trim()) {
      const parsed = parsePositiveNumber(form.definedPackSize)
      if (parsed == null || totalMismatch) return false
    }
    return producedPackCount > 0
  }, [allocationError, form, lineErrors.size, producedPackCount, selectedLines.length, selectedPacketUnit, totalMismatch])

  const filteredSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase()
    return sourceRows.filter((row) => {
      if (selectedWarehouseId != null && row.warehouse_id !== selectedWarehouseId) return false
      if (!term) return true
      return [row.product_name, row.product_sku ?? '', row.pack_identifier ?? '', row.lot_no ?? '', row.warehouse_name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [selectedWarehouseId, sourceRows, sourceSearch])

  const addSourceLine = useCallback((source: MixedPackSourceOption) => {
    setSelectedLines((previous) => {
      const existing = previous.find((line) => line.source_pack_entry_id === source.pack_entry_id)
      if (existing) {
        return previous.map((line) => (line.source_pack_entry_id === source.pack_entry_id ? { ...line, source } : line))
      }
      return [...previous, { source_pack_entry_id: source.pack_entry_id, quantity_used: '', source }]
    })
  }, [])

  const updateLineQuantity = useCallback((packEntryId: number, quantity: string) => {
    setSelectedLines((previous) =>
      previous.map((line) => (line.source_pack_entry_id === packEntryId ? { ...line, quantity_used: quantity } : line)),
    )
  }, [])

  const removeLine = useCallback((packEntryId: number) => {
    setSelectedLines((previous) => previous.filter((line) => line.source_pack_entry_id !== packEntryId))
  }, [])

  const resetCreateModal = useCallback(() => {
    setForm(defaultFormState)
    setSelectedLines([])
    setSourceSearch('')
    setCreateStep(1)
    setShowCreateModal(false)
  }, [])

  const openBatchDetails = useCallback(async (batch: MixedPackBatchRow) => {
    setSelectedBatch(batch)
    setDetailLoading(true)
    setDetailRows([])

    const { data: itemsData, error: itemsError } = await supabase
      .from('mixed_pack_batch_items')
      .select('id, source_allocation_id, source_pack_entry_id, source_product_id, source_lot_run_id, quantity_used')
      .eq('mixed_pack_batch_id', batch.id)
      .order('created_at', { ascending: true })

    if (itemsError) {
      toast.error(getUserFriendlyErrorMessage(itemsError, 'We could not load the mixed-pack composition right now.'))
      setDetailLoading(false)
      return
    }

    const items = (itemsData ?? []) as Array<{
      id: number
      source_allocation_id: number | null
      source_pack_entry_id: number | null
      source_product_id: number | null
      source_lot_run_id: number | null
      quantity_used: number
    }>

    const productIds = Array.from(new Set(items.map((item) => item.source_product_id).filter((value): value is number => value != null)))
    const packEntryIds = Array.from(new Set(items.map((item) => item.source_pack_entry_id).filter((value): value is number => value != null)))
    const lotRunIds = Array.from(new Set(items.map((item) => item.source_lot_run_id).filter((value): value is number => value != null)))

    const [productsRes, packEntriesRes, lotRunsRes] = await Promise.all([
      productIds.length > 0 ? supabase.from('products').select('id, name, sku').in('id', productIds) : Promise.resolve({ data: [], error: null }),
      packEntryIds.length > 0 ? supabase.from('process_packaging_pack_entries').select('id, pack_identifier').in('id', packEntryIds) : Promise.resolve({ data: [], error: null }),
      lotRunIds.length > 0
        ? supabase
            .from('process_lot_runs')
            .select(`
              id,
              supply_batches(
                lot_no,
                supplies(
                  warehouses(name)
                )
              )
            `)
            .in('id', lotRunIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (productsRes.error || packEntriesRes.error || lotRunsRes.error) {
      toast.error(
        getUserFriendlyErrorMessage(productsRes.error || packEntriesRes.error || lotRunsRes.error, 'We loaded the batch, but not all composition details could be resolved.'),
      )
    }

    const productMap = new Map(
      ((productsRes.data ?? []) as Array<{ id: number; name: string | null; sku: string | null }>).map((row) => [row.id, { name: row.name ?? 'Unknown product', sku: row.sku ?? null }]),
    )
    const packEntryMap = new Map(((packEntriesRes.data ?? []) as Array<{ id: number; pack_identifier: string | null }>).map((row) => [row.id, row.pack_identifier ?? null]))
    const unwrapSingle = <T,>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null)
    const lotRunMap = new Map<number, { lot_no: string | null; warehouse_name: string | null }>()

    ;((lotRunsRes.data ?? []) as Array<{
      id: number
      supply_batches:
        | { lot_no?: string | null; supplies?: { warehouses?: { name?: string | null } | { name?: string | null }[] | null } | { warehouses?: { name?: string | null } | { name?: string | null }[] | null }[] | null }
        | Array<{ lot_no?: string | null; supplies?: { warehouses?: { name?: string | null } | { name?: string | null }[] | null } | { warehouses?: { name?: string | null } | { name?: string | null }[] | null }[] | null }>
        | null
    }>).forEach((row) => {
      const batchRecord = unwrapSingle(row.supply_batches)
      const supply = unwrapSingle(batchRecord?.supplies ?? null)
      const warehouse = unwrapSingle(supply?.warehouses ?? null)
      lotRunMap.set(row.id, { lot_no: batchRecord?.lot_no ?? null, warehouse_name: warehouse?.name ?? null })
    })

    setDetailRows(
      items.map((item) => ({
        id: item.id,
        source_allocation_id: item.source_allocation_id,
        source_pack_entry_id: item.source_pack_entry_id,
        source_product_id: item.source_product_id,
        source_lot_run_id: item.source_lot_run_id,
        quantity_used: Number(item.quantity_used) || 0,
        product_name: item.source_product_id ? productMap.get(item.source_product_id)?.name ?? 'Unknown product' : 'Unknown product',
        product_sku: item.source_product_id ? productMap.get(item.source_product_id)?.sku ?? null : null,
        lot_no: item.source_lot_run_id ? lotRunMap.get(item.source_lot_run_id)?.lot_no ?? null : null,
        pack_identifier: item.source_pack_entry_id ? packEntryMap.get(item.source_pack_entry_id) ?? null : null,
        warehouse_name: item.source_lot_run_id ? lotRunMap.get(item.source_lot_run_id)?.warehouse_name ?? null : null,
      })),
    )
    setDetailLoading(false)
  }, [])

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || !selectedPacketUnit) {
      toast.error('Resolve the validation errors before creating the mixed pack.')
      return
    }

    const payload: CreateMixedPackPayload = {
      p_pack_name: form.packName.trim(),
      p_mixed_product_id: form.mixedProductId.trim() ? Number(form.mixedProductId) : null,
      p_defined_pack_size: form.definedPackSize.trim() ? Number(form.definedPackSize) : null,
      p_warehouse_id: selectedWarehouseId,
      p_unit_id: selectedUnitId,
      p_require_exact_total: form.requireExactTotal,
      p_packet_unit_code: selectedPacketUnit.code,
      p_pack_identifier: selectedPacketUnit.code,
      p_pack_size_kg: Number(selectedPacketUnit.net_weight_kg) || 0,
      p_packing_type: mapPackagingTypeToPackingType(selectedPacketUnit.packaging_type),
      p_storage_type: form.storageType,
      p_box_unit_code: form.storageType === 'BOX' ? form.boxUnitCode : null,
      p_units_count: Number(form.unitsCount),
      p_packs_per_unit: Number(form.packsPerUnit),
      p_notes: form.notes.trim() || null,
      p_lines: selectedLines.map((line) => ({
        source_pack_entry_id: line.source_pack_entry_id,
        quantity_used: Number(line.quantity_used),
      })),
    }

    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('create_mixed_pack', payload)
    if (rpcError) {
      toast.error(getUserFriendlyErrorMessage(rpcError, 'We could not create the mixed pack right now.'))
      setSubmitting(false)
      await load()
      return
    }

    const resultRow = Array.isArray(data) ? data[0] : data
    toast.success(`Mixed pack ${resultRow?.batch_no ?? ''} created with pack entry and allocation.`.trim())
    setForm(defaultFormState)
    setSelectedLines([])
    setShowCreateModal(false)
    setSubmitting(false)
    await load()
  }, [canSubmit, form, load, selectedLines, selectedPacketUnit, selectedUnitId, selectedWarehouseId])

  const packetUnitOptions = packetUnits.map((unit) => ({
    value: unit.code,
    label: `${unit.code} · ${unit.name}${unit.net_weight_kg ? ` · ${unit.net_weight_kg} kg` : ''}`,
  }))
  const boxUnitOptions = boxUnits.map((unit) => ({
    value: unit.code,
    label: `${unit.code} · ${unit.name}`,
  }))
  const mixedProductOptions = mixedFinishedProducts.map((product) => ({
    value: String(product.id),
    label: product.sku ? `${product.name} (${product.sku})` : product.name,
  }))

  const batchColumns = useMemo(
    () => [
      {
        key: 'batch',
        header: 'Batch',
        render: (row: MixedPackBatchRow) => (
          <div>
            <div className="font-medium text-text-dark">{row.batch_no}</div>
            <div className="text-xs text-text-dark/60">{row.pack_name}</div>
          </div>
        ),
        mobileRender: (row: MixedPackBatchRow) => (
          <div className="text-right">
            <div className="font-medium text-text-dark">{row.batch_no}</div>
            <div className="text-xs text-text-dark/60">{row.pack_name}</div>
          </div>
        ),
      },
      {
        key: 'packaging',
        header: 'Packaging',
        render: (row: MixedPackBatchRow) => (
          <div className="text-sm text-text-dark/80">
            {row.packet_unit_code ?? '—'}
            {row.pack_size_kg ? ` · ${row.pack_size_kg} kg` : ''}
            {row.storage_type ? ` · ${row.storage_type}` : ''}
          </div>
        ),
        mobileRender: (row: MixedPackBatchRow) => (
          <div className="text-right text-sm text-text-dark/80">
            {row.packet_unit_code ?? '—'}
            {row.pack_size_kg ? ` · ${row.pack_size_kg} kg` : ''}
          </div>
        ),
      },
      {
        key: 'quantity',
        header: 'Qty / Packs',
        render: (row: MixedPackBatchRow) => (
          <div className="text-sm text-text-dark/80">
            {formatQuantity(row.actual_total_qty, row.unit_label)}
            {row.total_packs ? ` · ${row.total_packs} packs` : ''}
          </div>
        ),
        mobileRender: (row: MixedPackBatchRow) => (
          <div className="text-right text-sm text-text-dark/80">
            {formatQuantity(row.actual_total_qty, row.unit_label)}
          </div>
        ),
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (row: MixedPackBatchRow) => row.warehouse_name ?? '—',
      },
      {
        key: 'created_at',
        header: 'Created',
        render: (row: MixedPackBatchRow) => (row.created_at ? new Date(row.created_at).toLocaleString() : '—'),
        mobileRender: (row: MixedPackBatchRow) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'),
      },
    ],
    [],
  )

  if (loading) {
    return (
      <PageLayout title="Mixed Pack Processing" activeItem="process" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
        <Spinner text="Loading mixed-pack workspace..." />
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Mixed Pack Processing" activeItem="process" contentClassName="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-text-dark/70">
            Create mixed packs from packaging remainders, then finish them through the same Step 5 outputs: a pack entry plus a storage allocation.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-olive-light/30"><CardHeader className="pb-2"><CardDescription>Eligible Sources</CardDescription><CardTitle className="text-2xl font-semibold text-text-dark">{sourceRows.length}</CardTitle></CardHeader></Card>
          <Card className="border-olive-light/30"><CardHeader className="pb-2"><CardDescription>Available Remainders</CardDescription><CardTitle className="text-2xl font-semibold text-text-dark">{sourceRows.reduce((sum, row) => sum + row.available_remainder_kg, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</CardTitle></CardHeader></Card>
          <Card className="border-olive-light/30"><CardHeader className="pb-2"><CardDescription>Created Mixed Packs</CardDescription><CardTitle className="text-2xl font-semibold text-text-dark">{batchRows.length}</CardTitle></CardHeader></Card>
        </div>
      </div>

      {error ? <div className="mb-6 rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">{error}</div> : null}

      <Card className="border-olive-light/30 bg-white">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-text-dark">Created Mixed Packs</CardTitle>
            <CardDescription>Each row already has a real pack entry and real storage allocation behind it.</CardDescription>
          </div>
          <Button className="bg-olive hover:bg-olive-dark" onClick={() => { setCreateStep(1); setShowCreateModal(true) }}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Create Mixed Pack
          </Button>
        </CardHeader>
        <CardContent>
          <ResponsiveTable columns={batchColumns} data={batchRows} rowKey="id" emptyMessage="No mixed packs have been created yet." onRowClick={(row) => { void openBatchDetails(row) }} />
        </CardContent>
      </Card>

      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-olive-light/20 bg-[#fcfaf5] shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-olive-light/20 bg-white/90 px-6 py-5">
              <div>
                <h2 className="flex items-center gap-2 text-2xl font-semibold text-text-dark">
                  <PackagePlus className="h-5 w-5 text-olive" />
                  Create Mixed Pack
                </h2>
                <p className="mt-1 text-sm text-text-dark/70">
                  Select packaging remainders, then define the packet unit and storage allocation the way Step 5 packaging does.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={resetCreateModal}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 rounded-2xl border border-olive-light/30 bg-white px-5 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${createStep === 1 ? 'bg-olive text-white' : 'bg-beige/40 text-text-dark/70'}`}>
                      1
                    </div>
                    <div className="min-w-[120px]">
                      <p className={`text-sm font-semibold ${createStep === 1 ? 'text-text-dark' : 'text-text-dark/60'}`}>Select Remainders</p>
                      <p className="text-xs text-text-dark/50">Choose the remainder sources</p>
                    </div>
                    <div className="hidden h-px min-w-16 flex-1 bg-olive-light/30 md:block" />
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${createStep === 2 ? 'bg-olive text-white' : 'bg-beige/40 text-text-dark/70'}`}>
                      2
                    </div>
                    <div className="min-w-[160px]">
                      <p className={`text-sm font-semibold ${createStep === 2 ? 'text-text-dark' : 'text-text-dark/60'}`}>Pack Entry & Allocation</p>
                      <p className="text-xs text-text-dark/50">Finish the mixed pack output</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-olive-light/20 bg-[#fcfaf5] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.08em] text-text-dark/45">Selected Qty</div>
                      <div className="text-sm font-semibold text-text-dark">{formatQuantity(selectedTotalQty)}</div>
                    </div>
                    <div className="rounded-xl border border-olive-light/20 bg-[#fcfaf5] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.08em] text-text-dark/45">Sources</div>
                      <div className="text-sm font-semibold text-text-dark">{selectedLines.length}</div>
                    </div>
                    <div className="rounded-xl border border-olive-light/20 bg-[#fcfaf5] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.08em] text-text-dark/45">Warehouse</div>
                      <div className="truncate text-sm font-semibold text-text-dark">{selectedWarehouseLabel}</div>
                    </div>
                  </div>
                </div>
              </div>

              {createStep === 1 ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                  <div className="rounded-2xl border border-olive-light/30 bg-white p-5">
                    <h4 className="mb-2 text-sm font-semibold text-text-dark">Available Remainders</h4>
                    <p className="mb-3 text-xs text-text-dark/60">
                      Select packaging remainders that will make up this mixed pack.
                    </p>

                    <div className="mb-4 flex flex-col gap-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/40" />
                        <Input
                          value={sourceSearch}
                          onChange={(event) => setSourceSearch(event.target.value)}
                          placeholder="Search by product, SKU, lot, pack, or warehouse"
                          className="pl-9"
                        />
                      </div>
                      {selectedWarehouseId != null ? (
                        <div className="rounded-full bg-olive-light/15 px-3 py-1 text-xs font-medium text-text-dark">
                          Locked to {selectedLines[0]?.source.warehouse_name ?? `Warehouse #${selectedWarehouseId}`}
                        </div>
                      ) : null}
                    </div>

                    <div className="max-h-[56vh] space-y-3 overflow-y-auto pr-1">
                      {filteredSources.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-olive-light/60 bg-beige/20 px-4 py-6 text-center text-sm text-text-dark/60">
                          No eligible remainders match the current search or warehouse selection.
                        </div>
                      ) : (
                        filteredSources.map((source) => {
                          const isSelected = selectedLines.some((line) => line.source_pack_entry_id === source.pack_entry_id)
                          return (
                            <button
                              key={source.pack_entry_id}
                              type="button"
                              onClick={() => addSourceLine(source)}
                              className={`w-full rounded-lg border p-4 text-left transition ${
                                isSelected
                                  ? 'border-olive bg-olive-light/10'
                                  : 'border-olive-light/40 bg-white hover:border-olive-light/70 hover:bg-beige/20'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-text-dark">
                                    {source.product_name}
                                    {source.product_sku ? ` (${source.product_sku})` : ''}
                                  </p>
                                  <p className="text-xs text-text-dark/60">
                                    Lot {source.lot_no ?? '—'} · Pack {source.pack_identifier ?? '—'} · Packed {source.packed_at ? new Date(source.packed_at).toLocaleDateString() : '—'}
                                  </p>
                                  <p className="mt-1 text-xs text-text-dark/60">
                                    {source.warehouse_name ?? 'Unknown warehouse'}
                                  </p>
                                  <p className="mt-2 text-xs text-text-dark/70">
                                    Available remainder: {formatQuantity(source.available_remainder_kg)}
                                  </p>
                                  <p className="text-xs text-text-dark/60">
                                    Used: {formatQuantity(source.used_remainder_kg)} · Source remainder: {formatQuantity(source.remainder_kg)}
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                    isSelected ? 'bg-olive text-white' : 'bg-beige/60 text-text-dark'
                                  }`}
                                >
                                  {isSelected ? 'Selected' : 'Select'}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-olive-light/30 bg-white">
                    <div className="border-b border-olive-light/20 px-5 py-3 text-xs font-medium uppercase tracking-[0.08em] text-text-dark/50">
                      Selected Remainders
                    </div>
                    <div className="divide-y divide-olive-light/20">
                      {selectedLines.length === 0 ? (
                        <div className="px-5 py-10 text-sm text-text-dark/60">No remainders selected yet.</div>
                      ) : (
                        selectedLines.map((line) => {
                          const quantityUsed = Number(line.quantity_used) || 0
                          const remainingAfterSelection = Math.max(0, line.source.available_remainder_kg - quantityUsed)
                          const lineError = lineErrors.get(line.source_pack_entry_id)
                          return (
                            <div key={line.source_pack_entry_id} className="px-5 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-text-dark">
                                    {line.source.product_name}
                                    {line.source.product_sku ? ` (${line.source.product_sku})` : ''}
                                  </p>
                                  <p className="text-xs text-text-dark/60">
                                    Lot {line.source.lot_no ?? '—'} · Pack {line.source.pack_identifier ?? '—'} · Produced {line.source.pack_count ?? '—'} packs
                                  </p>
                                  <p className="text-xs text-text-dark/60">
                                    Available remainder {formatQuantity(line.source.available_remainder_kg)} · Remaining after selection {formatQuantity(remainingAfterSelection)}
                                  </p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.source_pack_entry_id)}>
                                  <X className="mr-1 h-4 w-4" />
                                  Remove
                                </Button>
                              </div>
                              <div className="mt-3 grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                                <div className="space-y-2">
                                  <Label htmlFor={`line-${line.source_pack_entry_id}`}>Quantity to Use (kg)</Label>
                                  <Input
                                    id={`line-${line.source_pack_entry_id}`}
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={line.quantity_used}
                                    onChange={(event) => updateLineQuantity(line.source_pack_entry_id, event.target.value)}
                                    placeholder="Enter quantity"
                                  />
                                </div>
                                <div className="flex items-end">
                                  {lineError ? (
                                    <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{lineError}</div>
                                  ) : (
                                    <div className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                                      Quantity is within the current available remainder.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>

                    <div className="border-t border-olive-light/20 px-5 py-4">
                      <div className="rounded-xl border border-olive-light/30 bg-[#fcfaf5] px-4 py-3 text-sm text-text-dark/70">
                        Selected qty: <strong className="text-text-dark">{formatQuantity(selectedTotalQty)}</strong>
                        {' '}· Sources: <strong className="text-text-dark">{selectedLines.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-2">
                    <div className="flex flex-col gap-3 border-t border-olive-light/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-text-dark/60">
                        Select at least one valid remainder source to continue.
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={resetCreateModal} disabled={submitting}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          className="bg-olive hover:bg-olive-dark"
                          onClick={() => setCreateStep(2)}
                          disabled={selectedLines.length === 0 || lineErrors.size > 0}
                        >
                          Continue
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="rounded-2xl border border-olive-light/30 bg-white p-5">
                  <div className="mb-5 rounded-xl border border-olive-light/30 bg-[#fcfaf5] px-4 py-3 text-xs text-text-dark/70">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>
                        Selected qty: <strong className="text-text-dark">{formatQuantity(selectedTotalQty)}</strong>
                      </span>
                      <span>
                        Target total: <strong className="text-text-dark">{definedPackSizeValue != null ? formatQuantity(definedPackSizeValue) : '—'}</strong>
                      </span>
                      <span>
                        Produced packs: <strong className="text-text-dark">{selectedPacketUnit ? producedPackCount : '—'}</strong>
                      </span>
                      <span>
                        Warehouse: <strong className="text-text-dark">{selectedWarehouseLabel}</strong>
                      </span>
                      {selectedPacketUnit ? (
                        <span>
                          Packet unit: <strong className="text-text-dark">{selectedPacketUnit.code}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="border-b border-olive-light/20 py-4 first:pt-0">
                    <h4 className="mb-4 text-sm font-semibold text-text-dark">Pack Entry</h4>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2 lg:col-span-2">
                        <Label htmlFor="mixed-pack-name">Pack Name *</Label>
                        <Input
                          id="mixed-pack-name"
                          value={form.packName}
                          onChange={(event) => setForm((previous) => ({ ...previous, packName: event.target.value }))}
                          placeholder="e.g. Retail Assorted Mix"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mixed-pack-size">Target Total Weight / Size</Label>
                        <Input
                          id="mixed-pack-size"
                          type="number"
                          min="0"
                          step="0.001"
                          value={form.definedPackSize}
                          onChange={(event) => setForm((previous) => ({ ...previous, definedPackSize: event.target.value }))}
                          placeholder="Enter total kg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mixed-finished-product">Finished product being packed *</Label>
                        <SearchableSelect
                          id="mixed-finished-product"
                          options={mixedProductOptions}
                          value={form.mixedProductId}
                          onChange={(value) =>
                            setForm((previous) => {
                              const nextProduct = mixedFinishedProducts.find((product) => String(product.id) === value) ?? null
                              return {
                                ...previous,
                                mixedProductId: value,
                                packName: previous.packName.trim() ? previous.packName : nextProduct?.name ?? previous.packName,
                              }
                            })
                          }
                          placeholder={mixedProductOptions.length > 0 ? 'Select mixed finished product' : 'No mixed finished products found'}
                        />
                        {selectedMixedProduct ? (
                          <p className="text-xs text-text-dark/60">
                            {selectedMixedProduct.sku ? `SKU ${selectedMixedProduct.sku}` : 'Finished mixed product selected'}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mixed-packet-unit">Packet unit *</Label>
                        <SearchableSelect
                          id="mixed-packet-unit"
                          options={packetUnitOptions}
                          value={form.packetUnitCode}
                          onChange={(value) => setForm((previous) => ({ ...previous, packetUnitCode: value, boxUnitCode: '', packsPerUnit: '' }))}
                          placeholder="Select packet unit"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Quantity (kg)</Label>
                        <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark/70">
                          {selectedTotalQty > 0 ? selectedTotalQty.toFixed(3) : ''}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Good packs (auto)</Label>
                        <Input type="text" readOnly value={producedPackCount > 0 ? String(producedPackCount) : ''} />
                      </div>
                      <div className="space-y-2">
                        <Label>Remainder (kg, auto)</Label>
                        <Input
                          type="text"
                          readOnly
                          value={(() => {
                            const packSize = Number(selectedPacketUnit?.net_weight_kg) || 0
                            if (packSize <= 0 || selectedTotalQty <= 0) return ''
                            return Math.max(0, selectedTotalQty - producedPackCount * packSize).toFixed(2)
                          })()}
                        />
                      </div>
                    </div>
                    <label className="mt-4 flex items-start gap-3 rounded-md border border-olive-light/30 bg-olive-light/5 px-3 py-2 text-sm text-text-dark">
                      <input
                        type="checkbox"
                        checked={form.requireExactTotal}
                        onChange={(event) => setForm((previous) => ({ ...previous, requireExactTotal: event.target.checked }))}
                        className="mt-1"
                      />
                      <span>Require the selected quantities to exactly match the defined total when a target size is entered.</span>
                    </label>
                  </div>

                  <div className="border-b border-olive-light/20 py-4">
                    <h4 className="mb-4 text-sm font-semibold text-text-dark">Storage Allocation</h4>
                    <p className="mb-3 text-xs text-text-dark/60">
                      Allocate the mixed-pack entry into storage units using the same Step 5 packaging pattern.
                    </p>

                    <div className="flex flex-col gap-4">
                      <div className="order-1 rounded-xl border border-olive-light/30 bg-[#fcfaf5]">
                        <div className="border-b border-olive-light/20 px-4 py-2 text-xs font-medium uppercase tracking-[0.08em] text-text-dark/50">
                          Pack Entry Summary
                        </div>
                        <div className="divide-y divide-olive-light/20">
                          <div className="px-4 py-2 text-sm text-text-dark/80">
                            {(selectedPacketUnit?.code || 'Select packet unit')}:
                            {' '}produced {producedPackCount} good packs · allocated {requestedAllocationPacks} · remaining {Math.max(producedPackCount - requestedAllocationPacks, 0)}
                          </div>
                        </div>
                      </div>

                      <div className="order-2 rounded-xl border border-olive-light/30 bg-white p-4">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                          <div className="space-y-2 lg:col-span-2">
                            <Label>Pack Entry *</Label>
                            <div className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm text-text-dark/70">
                              {selectedPacketUnit ? `${selectedPacketUnit.code} · ${producedPackCount} good packs` : 'Select packet unit first'}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mixed-storage-type">Storage Type *</Label>
                            <select
                              id="mixed-storage-type"
                              value={form.storageType}
                              onChange={(event) =>
                                setForm((previous) => ({
                                  ...previous,
                                  storageType: event.target.value as '' | 'BOX' | 'SHOP_PACKING',
                                  boxUnitCode: event.target.value === 'BOX' ? previous.boxUnitCode || '' : '',
                                  packsPerUnit: previous.storageType === event.target.value ? previous.packsPerUnit : '',
                                }))
                              }
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              <option value="">Select type</option>
                              <option value="BOX">Box</option>
                              <option value="SHOP_PACKING">Shop packing</option>
                            </select>
                          </div>
                          {form.storageType === 'BOX' && (
                            <div className="space-y-2">
                              <Label htmlFor="mixed-box-unit">Box unit *</Label>
                              <SearchableSelect
                                id="mixed-box-unit"
                                options={boxUnitOptions}
                                value={form.boxUnitCode}
                                onChange={(value) => setForm((previous) => ({ ...previous, boxUnitCode: value }))}
                                placeholder="Select box unit"
                              />
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label htmlFor="mixed-units-count">Units Count *</Label>
                            <Input
                              id="mixed-units-count"
                              type="number"
                              min="1"
                              step="1"
                              value={form.unitsCount}
                              onChange={(event) => setForm((previous) => ({ ...previous, unitsCount: event.target.value }))}
                              placeholder="Enter units count"
                            />
                            <p className="text-xs text-text-dark/60">Edit the storage unit count for this mixed-pack allocation.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="mixed-packs-per-unit">Packs per Unit *</Label>
                            <Input
                              id="mixed-packs-per-unit"
                              type="number"
                              min="1"
                              step="1"
                              value={form.packsPerUnit}
                              onChange={(event) => setForm((previous) => ({ ...previous, packsPerUnit: event.target.value }))}
                              placeholder="Enter packs per unit"
                            />
                          </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-olive-light/30 bg-[#fcfaf5] px-3 py-2 text-sm text-text-dark/70">
                          Requested allocation: {requestedAllocationPacks} packs
                          {selectedPacketUnit?.net_weight_kg ? ` · ${formatQuantity(requestedAllocationPacks * selectedPacketUnit.net_weight_kg)}` : ''}
                        </div>
                        {allocationError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{allocationError}</div> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label htmlFor="mixed-notes">Notes (Optional)</Label>
                    <Input
                      id="mixed-notes"
                      value={form.notes}
                      onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
                      placeholder="Add notes for the synthetic packaging bridge or allocation"
                    />
                  </div>

                  {totalMismatch ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The selected total does not match the defined pack size.</div> : null}
                  {producedPackCount <= 0 && selectedPacketUnit ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">The selected quantity is not enough to produce one full pack at the chosen packet size.</div> : null}

                  <div className="mt-6 flex flex-col gap-3 border-t border-olive-light/20 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-text-dark/60">
                      Review the packaging output before creating the mixed pack.
                    </div>
                    <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateStep(1)}
                      disabled={submitting}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetCreateModal}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={submitting || !canSubmit}>
                      {submitting ? 'Creating mixed pack...' : 'Create Mixed Pack'}
                    </Button>
                    </div>
                  </div>
                </div>
              </form>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedBatch ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-olive-light/20 p-5">
              <div>
                <h2 className="text-2xl font-semibold text-text-dark">{selectedBatch.batch_no}</h2>
                <p className="text-sm text-text-dark/70">{selectedBatch.pack_name}</p>
                <p className="mt-1 text-xs text-text-dark/50">{formatQuantity(selectedBatch.actual_total_qty, selectedBatch.unit_label)} · {selectedBatch.warehouse_name ?? 'Unknown warehouse'} · {selectedBatch.packet_unit_code ?? '—'} · {selectedBatch.storage_type ?? '—'}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedBatch(null)}><X className="h-5 w-5" /></Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {detailLoading ? <Spinner text="Loading composition..." /> : detailRows.length === 0 ? <div className="rounded-lg border border-dashed border-olive-light/60 bg-beige/20 px-4 py-8 text-center text-sm text-text-dark/60">No composition records were found for this mixed pack.</div> : (
                <div className="space-y-3">
                  {detailRows.map((item) => (
                    <div key={item.id} className="rounded-lg border border-olive-light/30 bg-beige/20 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium text-text-dark">{item.product_name}{item.product_sku ? ` (${item.product_sku})` : ''}</p>
                          <p className="text-xs text-text-dark/60">Lot {item.lot_no ?? '—'} · Pack {item.pack_identifier ?? '—'} · {item.warehouse_name ?? 'Unknown warehouse'}</p>
                        </div>
                        <div className="text-right text-sm font-semibold text-text-dark">{formatQuantity(item.quantity_used)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-olive-light/20 p-5">
              <Button className="bg-olive hover:bg-olive-dark" onClick={() => setSelectedBatch(null)}>Close</Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  )
}

export default MixedPacks
