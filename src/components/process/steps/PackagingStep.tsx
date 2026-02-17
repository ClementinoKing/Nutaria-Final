import { useState, FormEvent, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { AlertTriangle, CheckCircle2, Plus, Trash2, Upload, XCircle, Package as PackageIcon, History, Search } from 'lucide-react'
import { toast } from 'sonner'
import { usePackagingRun } from '@/hooks/usePackagingRun'
import { supabase } from '@/lib/supabaseClient'
import type {
  ProcessStepRun,
  ProcessPackagingRun,
  PackagingFormData,
  PackagingWeightCheckFormData,
  PackagingWasteFormData,
  PackagingMetalCheckAttemptFormData,
  PackagingMetalCheckRejectionFormData,
  PackagingStorageAllocationFormData,
  ProcessPackagingMetalCheck,
} from '@/types/processExecution'
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

interface SortedWipRow {
  id: number
  process_step_run_id: number
  product_id: number
  quantity_kg: number
  product_name: string
  product_sku: string | null
}

interface FinishedProductOption {
  id: number
  name: string
  sku: string | null
}

interface PackagingUnitOption {
  id: number
  code: string
  name: string
  unit_type: 'PACKET' | 'BOX'
  packaging_type: 'DOY' | 'VACUUM' | 'POLY' | 'BOX' | null
  net_weight_kg: number | null
  operational_product_id?: number | null
  is_active: boolean
}

interface SupplyLineStockRow {
  product_id: number | null
  accepted_qty: number | null
}

interface BoxPackRuleOption {
  id: number
  box_unit_id: number
  packet_unit_id: number
  packets_per_box: number
  is_active: boolean
  box_unit_code?: string | null
  box_unit_name?: string | null
  packet_unit_code?: string | null
  packet_unit_name?: string | null
}

interface RemainderCandidate {
  id: number
  packaging_run_id: number
  source_product_id: number | null
  source_product_name: string
  source_product_sku: string | null
  process_name: string
  process_code: string
  lot_no: string | null
  finished_product_id: number | null
  finished_product_name: string
  finished_product_sku: string | null
  packet_unit_code: string | null
  remainder_kg: number
  packed_at: string | null
}

interface RemainderPrefillSource {
  id: number
  process_name: string
  process_code: string
  lot_no: string | null
  remainder_kg: number
  packed_at: string | null
}

interface PackagingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
}

function normalizeUnitCode(code: string | null | undefined): string {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeUnitType(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

const YES_NO_NA_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'NA', label: 'N/A' },
]

const REWORK_DESTINATIONS = ['Washing', 'Drying', 'Sorting']
const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']
const PHOTO_TYPES: Array<{ value: 'product' | 'label' | 'pallet'; label: string }> = [
  { value: 'product', label: 'Product' },
  { value: 'label', label: 'Label' },
  { value: 'pallet', label: 'Pallet' },
]

const METAL_CHECK_STATUS_OPTIONS: Array<{ value: '' | 'PASS' | 'FAIL'; label: string }> = [
  { value: '', label: 'Select status' },
  { value: 'PASS', label: 'PASS' },
  { value: 'FAIL', label: 'FAIL' },
]
const PRIMARY_PACKAGING_OPTIONS = [
  'Bag',
  'Box',
  'Vacuum bag',
  'Poly bag',
  'Doypack',
  'Pouch',
  'Sachet',
  'Tin',
  'Drum',
].map((label) => ({ value: label, label }))
const SECONDARY_PACKAGING_OPTIONS = ['Carton', 'Pallet', 'Crate', 'Shrink wrap', 'Sleeve', 'Display box'].map((label) => ({
  value: label,
  label,
}))
const SECONDARY_TYPE_OPTIONS = ['Inner liner', 'Outer', 'Stretch wrap', 'Strapping', 'Labelled', 'Unlabelled'].map((label) => ({
  value: label,
  label,
}))
const VISUAL_STATUS_OPTIONS = ['', 'Pass', 'Rework', 'Hold']
const PEST_STATUS_OPTIONS = ['', 'None', 'Minor', 'Major']
const FOREIGN_OBJECT_STATUS_OPTIONS = ['', 'None', 'Detected']
const MOULD_STATUS_OPTIONS = ['', 'None', 'Present']
const KERNEL_DAMAGE_OPTIONS = ['', '0', '0.5', '1', '2', '5', '10']
const NITROGEN_USED_OPTIONS = ['', '0', '0.25', '0.5', '1', '2', '3']
const STORAGE_TYPE_OPTIONS: Array<{ value: '' | 'BOX' | 'SHOP_PACKING'; label: string }> = [
  { value: '', label: 'Select type' },
  { value: 'BOX', label: 'Box' },
  { value: 'SHOP_PACKING', label: 'Shop packing' },
]

function mapPackagingTypeToPackingType(
  packagingType: PackagingUnitOption['packaging_type']
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

const mapPackagingRunToFormData = (run: ProcessPackagingRun): PackagingFormData => ({
  visual_status: run.visual_status || '',
  rework_destination: run.rework_destination || '',
  pest_status: run.pest_status || '',
  foreign_object_status: run.foreign_object_status || '',
  mould_status: run.mould_status || '',
  damaged_kernels_pct: run.damaged_kernels_pct?.toString() || '',
  insect_damaged_kernels_pct: run.insect_damaged_kernels_pct?.toString() || '',
  nitrogen_used: run.nitrogen_used?.toString() || '',
  nitrogen_batch_number: run.nitrogen_batch_number || '',
  primary_packaging_type: run.primary_packaging_type || '',
  primary_packaging_batch: run.primary_packaging_batch || '',
  secondary_packaging: run.secondary_packaging || '',
  secondary_packaging_type: run.secondary_packaging_type || '',
  secondary_packaging_batch: run.secondary_packaging_batch || '',
  label_correct: run.label_correct || '',
  label_legible: run.label_legible || '',
  pallet_integrity: run.pallet_integrity || '',
  allergen_swab_result: run.allergen_swab_result || '',
  remarks: run.remarks || '',
})

const isSamePackagingFormData = (a: PackagingFormData, b: PackagingFormData) =>
  a.visual_status === b.visual_status &&
  a.rework_destination === b.rework_destination &&
  a.pest_status === b.pest_status &&
  a.foreign_object_status === b.foreign_object_status &&
  a.mould_status === b.mould_status &&
  a.damaged_kernels_pct === b.damaged_kernels_pct &&
  a.insect_damaged_kernels_pct === b.insect_damaged_kernels_pct &&
  a.nitrogen_used === b.nitrogen_used &&
  a.nitrogen_batch_number === b.nitrogen_batch_number &&
  a.primary_packaging_type === b.primary_packaging_type &&
  a.primary_packaging_batch === b.primary_packaging_batch &&
  a.secondary_packaging === b.secondary_packaging &&
  a.secondary_packaging_type === b.secondary_packaging_type &&
  a.secondary_packaging_batch === b.secondary_packaging_batch &&
  a.label_correct === b.label_correct &&
  a.label_legible === b.label_legible &&
  a.pallet_integrity === b.pallet_integrity &&
  a.allergen_swab_result === b.allergen_swab_result &&
  a.remarks === b.remarks

export function PackagingStep({ stepRun, loading: externalLoading = false }: PackagingStepProps) {
  const {
    packagingRun,
    packEntries,
    weightChecks,
    photos,
    waste,
    loading,
    savePackagingRun,
    addWeightCheck,
    deleteWeightCheck,
    addPhoto,
    deletePhoto,
    addWaste,
    deleteWaste,
    addPackEntry,
    deletePackEntry,
    storageAllocations,
    addStorageAllocation,
    updateStorageAllocation,
    deleteStorageAllocation,
    getAllocatedPacksByEntry,
    getRemainingPackCountByEntry,
    metalChecksBySortingOutput,
    getLatestMetalCheck,
    addMetalCheckAttempt,
    getFailedRejectedWeightBySortingOutput,
  } = usePackagingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  const [sortedWips, setSortedWips] = useState<SortedWipRow[]>([])
  const [finishedProducts, setFinishedProducts] = useState<FinishedProductOption[]>([])
  const [packagingUnits, setPackagingUnits] = useState<PackagingUnitOption[]>([])
  const [boxPackRules, setBoxPackRules] = useState<BoxPackRuleOption[]>([])
  const [loadingWips, setLoadingWips] = useState(false)
  const [showPackEntryForm, setShowPackEntryForm] = useState(false)
  const [showRemaindersModal, setShowRemaindersModal] = useState(false)
  const [loadingRemainders, setLoadingRemainders] = useState(false)
  const [remaindersError, setRemaindersError] = useState<string | null>(null)
  const [remainderRows, setRemainderRows] = useState<RemainderCandidate[]>([])
  const [selectedRemainderId, setSelectedRemainderId] = useState('')
  const [usedRemainderIds, setUsedRemainderIds] = useState<Set<number>>(new Set())
  const [remainderSearchTerm, setRemainderSearchTerm] = useState('')
  const [remainderDateFilter, setRemainderDateFilter] = useState<'ALL' | '7D' | '30D'>('ALL')
  const [remainderPrefillSource, setRemainderPrefillSource] = useState<RemainderPrefillSource | null>(null)
  const [addedRemainderSources, setAddedRemainderSources] = useState<RemainderPrefillSource[]>([])
  const [packEntryForm, setPackEntryForm] = useState({
    sorting_output_id: '',
    product_id: '',
    packet_unit_code: '',
    quantity_kg: '',
  })
  const selectedWipProductIdForFilter = useMemo(() => {
    const selectedSortingOutputId = Number(packEntryForm.sorting_output_id) || 0
    if (!selectedSortingOutputId) return null
    const selectedWip = sortedWips.find((row) => row.id === selectedSortingOutputId)
    return selectedWip?.product_id ?? null
  }, [packEntryForm.sorting_output_id, sortedWips])
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'weightCheck'; id: number } |
    { type: 'waste'; id: number } |
    { type: 'photo'; id: number } |
    { type: 'packEntry'; id: number } |
    { type: 'storageAllocation'; id: number } |
    null
  >(null)
  const [showMetalCheckModal, setShowMetalCheckModal] = useState(false)
  const [selectedMetalCheckWip, setSelectedMetalCheckWip] = useState<SortedWipRow | null>(null)
  const [metalCheckForm, setMetalCheckForm] = useState<PackagingMetalCheckAttemptFormData>({
    status: '',
    remarks: '',
  })
  const [metalRejectionsForm, setMetalRejectionsForm] = useState<PackagingMetalCheckRejectionFormData[]>([
    { object_type: '', weight_kg: '', corrective_action: '' },
  ])
  const [storageAllocationForm, setStorageAllocationForm] = useState<PackagingStorageAllocationFormData>({
    pack_entry_id: '',
    storage_type: '',
    box_unit_code: '',
    units_count: '',
    packs_per_unit: '',
    notes: '',
  })
  const [storageUnitsAutoPrefillEnabled, setStorageUnitsAutoPrefillEnabled] = useState(true)
  const [editingStorageAllocationId, setEditingStorageAllocationId] = useState<number | null>(null)
  const [userProfilesByAuthId, setUserProfilesByAuthId] = useState<Record<string, string>>({})
  const [runWarehouseId, setRunWarehouseId] = useState<number | null>(null)
  const [opAcceptedByProductId, setOpAcceptedByProductId] = useState<Record<number, number>>({})
  const [opConsumedByProductId, setOpConsumedByProductId] = useState<Record<number, number>>({})
  const [opStockLoading, setOpStockLoading] = useState(false)

  const loadSortedWips = useCallback(async () => {
    const lotRunId = stepRun.process_lot_run_id
    if (!lotRunId) {
      setSortedWips([])
      return
    }
    setLoadingWips(true)
    try {
      const { data: stepRunsData, error: stepRunsError } = await supabase
        .from('process_step_runs')
        .select('id, process_step_id')
        .eq('process_lot_run_id', lotRunId)

      if (stepRunsError || !stepRunsData?.length) {
        setSortedWips([])
        setLoadingWips(false)
        return
      }

      const stepIds = stepRunsData.map((sr: { process_step_id: number }) => sr.process_step_id).filter(Boolean)
      const { data: stepsData } = await supabase
        .from('process_steps')
        .select('id, step_name_id')
        .in('id', stepIds)

      const stepNameIds = (stepsData ?? []).map((s: { step_name_id?: number }) => s.step_name_id).filter((id): id is number => id != null)
      let stepCodeByStepId = new Map<number, string>()
      if (stepNameIds.length > 0) {
        const { data: namesData } = await supabase
          .from('process_step_names')
          .select('id, code')
          .in('id', [...new Set(stepNameIds)])
        stepCodeByStepId = new Map((namesData ?? []).map((n: { id: number; code: string }) => [n.id, (n.code ?? '').toUpperCase()]))
      }

      const stepsById = new Map((stepsData ?? []).map((s: { id: number; step_name_id?: number }) => [s.id, s.step_name_id]))
      const sortStepRunIds = stepRunsData
        .filter((sr: { id: number; process_step_id: number }) => stepCodeByStepId.get(stepsById.get(sr.process_step_id)!) === 'SORT')
        .map((sr: { id: number }) => sr.id)

      if (sortStepRunIds.length === 0) {
        setSortedWips([])
        setLoadingWips(false)
        return
      }

      const { data: outputsData, error: outputsError } = await supabase
        .from('process_sorting_outputs')
        .select('id, process_step_run_id, product_id, quantity_kg, product:products(id, name, sku)')
        .in('process_step_run_id', sortStepRunIds)
        .order('quantity_kg', { ascending: false })

      if (outputsError) {
        setSortedWips([])
        setLoadingWips(false)
        return
      }

      const rows: SortedWipRow[] = (outputsData ?? []).map((o: { id: number; process_step_run_id: number; product_id: number; quantity_kg: number; product?: { name?: string; sku?: string } }) => ({
        id: o.id,
        process_step_run_id: o.process_step_run_id,
        product_id: o.product_id,
        quantity_kg: Number(o.quantity_kg) || 0,
        product_name: o.product?.name ?? 'Unknown',
        product_sku: o.product?.sku ?? null,
      }))
      setSortedWips(rows)
    } catch {
      setSortedWips([])
    } finally {
      setLoadingWips(false)
    }
  }, [stepRun.process_lot_run_id])

  const loadFinishedProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(
          `id, name, sku, product_components:product_components!product_components_parent_product_id_fkey (component_product_id)`
        )
        .eq('product_type', 'FINISHED')
        .order('name', { ascending: true })
      if (error) {
        setFinishedProducts([])
        return
      }

      const lotProductId = selectedWipProductIdForFilter

      const mapped = (data as Array<{
        id: number
        name: string
        sku: string | null
        product_components?: { component_product_id?: number | null }[] | null
      }>)
        .filter((row) => {
          if (!lotProductId) return true
          return (row.product_components ?? []).some((pc) => pc?.component_product_id === lotProductId)
        })
        .map((row) => ({ id: row.id, name: row.name, sku: row.sku }))

      setFinishedProducts(mapped)
    } catch {
      setFinishedProducts([])
    }
  }, [selectedWipProductIdForFilter])

  const loadPackagingSettings = useCallback(async () => {
    try {
      const [{ data: unitsData, error: unitsError }, { data: rulesData, error: rulesError }] = await Promise.all([
        supabase.rpc('get_packaging_units'),
        supabase.rpc('get_box_pack_rules'),
      ])

      if (unitsError || rulesError) {
        setPackagingUnits([])
        setBoxPackRules([])
        return
      }

      const units = ((unitsData ?? []) as PackagingUnitOption[]).filter((u) => u.is_active)
      const unitsById = new Map(units.map((u) => [u.id, u]))

      const rules: BoxPackRuleOption[] = ((rulesData ?? []) as Array<{
        id: number
        box_unit_id: number
        packet_unit_id: number
        packets_per_box: number
        is_active: boolean
        box_unit_code?: string | null
        packet_unit_code?: string | null
      }>)
        .filter((r) => r.is_active)
        .filter((r) => {
          const boxUnit = unitsById.get(r.box_unit_id)
          const packetUnit = unitsById.get(r.packet_unit_id)
          return Boolean(boxUnit && packetUnit && boxUnit.unit_type === 'BOX' && packetUnit.unit_type === 'PACKET')
        })
        .map((r) => ({
          id: r.id,
          box_unit_id: r.box_unit_id,
          packet_unit_id: r.packet_unit_id,
          packets_per_box: r.packets_per_box,
          is_active: r.is_active,
          box_unit_code: r.box_unit_code ?? null,
          box_unit_name: r.box_unit_name ?? null,
          packet_unit_code: r.packet_unit_code ?? null,
          packet_unit_name: r.packet_unit_name ?? null,
        }))

      setPackagingUnits(units)
      setBoxPackRules(rules)
    } catch {
      setPackagingUnits([])
      setBoxPackRules([])
    }
  }, [])

  const loadRunWarehouseId = useCallback(async () => {
    const lotRunId = stepRun.process_lot_run_id
    if (!lotRunId) {
      setRunWarehouseId(null)
      return null
    }

    try {
      const supplyBatchIds = new Set<number>()
      const { data: runBatchesData } = await supabase
        .from('process_lot_run_batches')
        .select('supply_batch_id')
        .eq('process_lot_run_id', lotRunId)

      ;((runBatchesData ?? []) as Array<{ supply_batch_id: number | null }>).forEach((row) => {
        if (row.supply_batch_id) supplyBatchIds.add(row.supply_batch_id)
      })

      if (supplyBatchIds.size === 0) {
        const { data: lotRunData } = await supabase
          .from('process_lot_runs')
          .select('supply_batch_id')
          .eq('id', lotRunId)
          .maybeSingle()
        const fallbackSupplyBatchId = (lotRunData as { supply_batch_id?: number | null } | null)?.supply_batch_id
        if (fallbackSupplyBatchId) supplyBatchIds.add(fallbackSupplyBatchId)
      }

      if (supplyBatchIds.size === 0) {
        setRunWarehouseId(null)
        return null
      }

      const { data: supplyBatchData } = await supabase
        .from('supply_batches')
        .select('id, supply_id')
        .in('id', Array.from(supplyBatchIds))
      const supplyIds = Array.from(
        new Set(
          ((supplyBatchData ?? []) as Array<{ supply_id?: number | null }>)
            .map((row) => row.supply_id)
            .filter((value): value is number => typeof value === 'number')
        )
      )

      if (supplyIds.length === 0) {
        setRunWarehouseId(null)
        return null
      }

      const { data: supplyData } = await supabase
        .from('supplies')
        .select('id, warehouse_id')
        .in('id', supplyIds)
      const warehouseId =
        ((supplyData ?? []) as Array<{ warehouse_id?: number | null }>)
          .map((row) => row.warehouse_id)
          .find((value): value is number => typeof value === 'number') ?? null

      setRunWarehouseId(warehouseId)
      return warehouseId
    } catch (error) {
      console.error('Failed to resolve packaging run warehouse:', error)
      setRunWarehouseId(null)
      return null
    }
  }, [stepRun.process_lot_run_id])

  const loadOperationalPackagingStockSnapshot = useCallback(
    async (warehouseIdInput?: number | null): Promise<{ accepted: Record<number, number>; consumed: Record<number, number> }> => {
      const warehouseId = warehouseIdInput ?? runWarehouseId
      if (!warehouseId) {
        setOpAcceptedByProductId({})
        setOpConsumedByProductId({})
        return { accepted: {}, consumed: {} }
      }

      setOpStockLoading(true)
      try {
        const packetOperationalProductByCode = new Map<string, number>()
        packagingUnits
          .filter((unit) => normalizeUnitType(unit.unit_type) === 'PACKET')
          .forEach((unit) => {
            const productId = Number(unit.operational_product_id) || 0
            if (!productId) return
            const codeKey = normalizeUnitCode(unit.code)
            if (codeKey) packetOperationalProductByCode.set(codeKey, productId)
            const nameKey = normalizeUnitCode(unit.name)
            if (nameKey) packetOperationalProductByCode.set(nameKey, productId)
          })

        const acceptedByProductId: Record<number, number> = {}
        const consumedByProductId: Record<number, number> = {}

        const { data: serviceSuppliesData } = await supabase
          .from('supplies')
          .select('id')
          .eq('category_code', 'SERVICE')
          .eq('warehouse_id', warehouseId)

        const serviceSupplyIds = ((serviceSuppliesData ?? []) as Array<{ id: number }>).map((row) => row.id)
        if (serviceSupplyIds.length > 0) {
          const { data: supplyLineData } = await supabase
            .from('supply_lines')
            .select('product_id, accepted_qty')
            .in('supply_id', serviceSupplyIds)

          ;((supplyLineData ?? []) as SupplyLineStockRow[]).forEach((line) => {
            const productId = Number(line.product_id) || 0
            if (!productId) return
            const accepted = Number(line.accepted_qty) || 0
            if (accepted <= 0) return
            acceptedByProductId[productId] = (acceptedByProductId[productId] || 0) + accepted
          })
        }

        const { data: packEntriesData } = await supabase
          .from('process_packaging_pack_entries')
          .select('packaging_run_id, packet_unit_code, pack_identifier, pack_count, quantity_kg, pack_size_kg')

        const packagingRunIds = Array.from(
          new Set(
            ((packEntriesData ?? []) as Array<{ packaging_run_id?: number | null }>)
              .map((row) => Number(row.packaging_run_id) || 0)
              .filter((value) => value > 0)
          )
        )

        if (packagingRunIds.length > 0) {
          const packagingRunsResult = await supabase
            .from('process_packaging_runs')
            .select('id, process_step_run_id')
            .in('id', packagingRunIds)

          const packagingRuns = (packagingRunsResult.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>
          const stepRunIds = Array.from(
            new Set(packagingRuns.map((row) => Number(row.process_step_run_id) || 0).filter((value) => value > 0))
          )
          const stepRunsResult =
            stepRunIds.length > 0
              ? await supabase
                  .from('process_step_runs')
                  .select('id, process_lot_run_id')
                  .in('id', stepRunIds)
              : { data: [] }
          const stepRuns = (stepRunsResult.data ?? []) as Array<{ id: number; process_lot_run_id: number | null }>
          const stepRunToLotRunId = new Map(stepRuns.map((row) => [row.id, row.process_lot_run_id]))
          const lotRunIds = Array.from(
            new Set(
              packagingRuns
                .map((row) => {
                  const stepRunId = Number(row.process_step_run_id) || 0
                  return Number(stepRunToLotRunId.get(stepRunId)) || 0
                })
                .filter((value) => value > 0)
            )
          )

          const lotRunWarehouseIdMap = new Map<number, number>()
          if (lotRunIds.length > 0) {
            const [lotRunsResult, runBatchesResult] = await Promise.all([
              supabase
                .from('process_lot_runs')
                .select('id, supply_batch_id')
                .in('id', lotRunIds),
              supabase
                .from('process_lot_run_batches')
                .select('process_lot_run_id, supply_batch_id')
                .in('process_lot_run_id', lotRunIds),
            ])

            const lotRunSupplyBatchIdsMap = new Map<number, Set<number>>()
            ;((lotRunsResult.data ?? []) as Array<{ id: number; supply_batch_id: number | null }>).forEach((row) => {
              if (!lotRunSupplyBatchIdsMap.has(row.id)) lotRunSupplyBatchIdsMap.set(row.id, new Set<number>())
              if (row.supply_batch_id) lotRunSupplyBatchIdsMap.get(row.id)!.add(row.supply_batch_id)
            })
            ;((runBatchesResult.data ?? []) as Array<{ process_lot_run_id: number; supply_batch_id: number | null }>).forEach((row) => {
              if (!lotRunSupplyBatchIdsMap.has(row.process_lot_run_id)) lotRunSupplyBatchIdsMap.set(row.process_lot_run_id, new Set<number>())
              if (row.supply_batch_id) lotRunSupplyBatchIdsMap.get(row.process_lot_run_id)!.add(row.supply_batch_id)
            })

            const allSupplyBatchIds = Array.from(
              new Set(Array.from(lotRunSupplyBatchIdsMap.values()).flatMap((set) => Array.from(set)))
            )
            if (allSupplyBatchIds.length > 0) {
              const { data: supplyBatchesData } = await supabase
                .from('supply_batches')
                .select('id, supply_id')
                .in('id', allSupplyBatchIds)
              const supplyIds = Array.from(
                new Set(
                  ((supplyBatchesData ?? []) as Array<{ supply_id: number | null }>)
                    .map((row) => row.supply_id)
                    .filter((value): value is number => typeof value === 'number')
                )
              )
              const supplyBatchToSupplyId = new Map(
                ((supplyBatchesData ?? []) as Array<{ id: number; supply_id: number | null }>).map((row) => [row.id, row.supply_id])
              )

              const supplyToWarehouseId = new Map<number, number>()
              if (supplyIds.length > 0) {
                const { data: suppliesData } = await supabase
                  .from('supplies')
                  .select('id, warehouse_id')
                  .in('id', supplyIds)
                ;((suppliesData ?? []) as Array<{ id: number; warehouse_id: number | null }>).forEach((row) => {
                  if (row.warehouse_id) supplyToWarehouseId.set(row.id, row.warehouse_id)
                })
              }

              lotRunSupplyBatchIdsMap.forEach((batchIds, lotRunId) => {
                const lotWarehouseId =
                  Array.from(batchIds)
                    .map((batchId) => supplyBatchToSupplyId.get(batchId) ?? null)
                    .map((supplyId) => (supplyId ? supplyToWarehouseId.get(supplyId) ?? null : null))
                    .find((value): value is number => typeof value === 'number') ?? null
                if (lotWarehouseId) lotRunWarehouseIdMap.set(lotRunId, lotWarehouseId)
              })
            }
          }

          const packagingRunToStepRunId = new Map(packagingRuns.map((row) => [row.id, Number(row.process_step_run_id) || 0]))
          ;((packEntriesData ?? []) as Array<{
            packaging_run_id: number | null
            packet_unit_code: string | null
            pack_identifier: string | null
            pack_count: number | null
            quantity_kg: number | null
            pack_size_kg: number | null
          }>).forEach((entry) => {
            const packagingRunId = Number(entry.packaging_run_id) || 0
            if (!packagingRunId) return

            const stepRunId = packagingRunToStepRunId.get(packagingRunId) || 0
            const lotRunId = Number(stepRunToLotRunId.get(stepRunId)) || 0
            if (!lotRunId) return
            if (lotRunWarehouseIdMap.get(lotRunId) !== warehouseId) return

            const packetKey = normalizeUnitCode(entry.packet_unit_code ?? entry.pack_identifier)
            if (!packetKey) return
            const operationalProductId = packetOperationalProductByCode.get(packetKey)
            if (!operationalProductId) return

            const storedPackCount = Number(entry.pack_count) || 0
            const quantityKg = Number(entry.quantity_kg) || 0
            const packSizeKg = Number(entry.pack_size_kg) || 0
            const derivedPackCount = storedPackCount > 0 ? storedPackCount : packSizeKg > 0 ? Math.floor(quantityKg / packSizeKg) : 0
            if (derivedPackCount <= 0) return

            consumedByProductId[operationalProductId] = (consumedByProductId[operationalProductId] || 0) + derivedPackCount
          })
        }

        setOpAcceptedByProductId(acceptedByProductId)
        setOpConsumedByProductId(consumedByProductId)
        return { accepted: acceptedByProductId, consumed: consumedByProductId }
      } catch (error) {
        console.error('Failed to load OP packaging stock snapshot:', error)
        setOpAcceptedByProductId({})
        setOpConsumedByProductId({})
        return { accepted: {}, consumed: {} }
      } finally {
        setOpStockLoading(false)
      }
    },
    [runWarehouseId, packagingUnits]
  )

  useEffect(() => {
    loadSortedWips()
  }, [loadSortedWips])

  useEffect(() => {
    loadFinishedProducts()
  }, [loadFinishedProducts])

  useEffect(() => {
    loadPackagingSettings()
  }, [loadPackagingSettings])

  useEffect(() => {
    loadRunWarehouseId().catch(() => {
      setRunWarehouseId(null)
    })
  }, [loadRunWarehouseId])

  useEffect(() => {
    const loadCheckerProfiles = async () => {
      const ids = Array.from(
        new Set(
          Object.values(metalChecksBySortingOutput)
            .flat()
            .map((check) => check.checked_by)
            .filter((value): value is string => !!value)
        )
      )

      if (ids.length === 0) {
        lastCheckerIdsRef.current = ''
        setUserProfilesByAuthId((prev) => (Object.keys(prev).length === 0 ? prev : {}))
        return
      }

      const idsSignature = [...ids].sort().join(',')
      if (idsSignature === lastCheckerIdsRef.current) {
        return
      }
      lastCheckerIdsRef.current = idsSignature

      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('auth_user_id, full_name, email')
        .in('auth_user_id', ids)

      if (profileError) {
        console.error('Failed to load checker profiles:', profileError)
        const fallback: Record<string, string> = {}
        ids.forEach((id) => {
          fallback[id] = id
        })
        setUserProfilesByAuthId((prev) => {
          const prevKeys = Object.keys(prev)
          const nextKeys = Object.keys(fallback)
          if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === fallback[key])) {
            return prev
          }
          return fallback
        })
        return
      }

      const map: Record<string, string> = {}
      ;(data || []).forEach((profile: any) => {
        const authUserId = String(profile.auth_user_id || '')
        if (!authUserId) return
        map[authUserId] = String(profile.full_name || profile.email || authUserId)
      })

      ids.forEach((id) => {
        if (!map[id]) map[id] = id
      })
      setUserProfilesByAuthId((prev) => {
        const prevKeys = Object.keys(prev)
        const nextKeys = Object.keys(map)
        if (prevKeys.length === nextKeys.length && nextKeys.every((key) => prev[key] === map[key])) {
          return prev
        }
        return map
      })
    }

    loadCheckerProfiles().catch((err) => {
      console.error('Unexpected checker profile error:', err)
    })
  }, [metalChecksBySortingOutput])

  const [formData, setFormData] = useState<PackagingFormData>({
    visual_status: '',
    rework_destination: '',
    pest_status: '',
    foreign_object_status: '',
    mould_status: '',
    damaged_kernels_pct: '',
    insect_damaged_kernels_pct: '',
    nitrogen_used: '',
    nitrogen_batch_number: '',
    primary_packaging_type: '',
    primary_packaging_batch: '',
    secondary_packaging: '',
    secondary_packaging_type: '',
    secondary_packaging_batch: '',
    label_correct: '',
    label_legible: '',
    pallet_integrity: '',
    allergen_swab_result: '',
    remarks: '',
  })

  const [weightCheckFormData, setWeightCheckFormData] = useState<PackagingWeightCheckFormData>({
    check_no: 1,
    weight_kg: '',
  })

  const [wasteFormData, setWasteFormData] = useState<PackagingWasteFormData>({
    waste_type: '',
    quantity_kg: '',
  })

  const [showWeightForm, setShowWeightForm] = useState(false)
  const [showWasteForm, setShowWasteForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoCreatingRun, setAutoCreatingRun] = useState(false)
  const autoCreateAttemptedRef = useRef(false)
  const lastCheckerIdsRef = useRef('')
  const remaindersModalRef = useRef<HTMLDivElement | null>(null)
  const packAvailabilityOverflowToastShownRef = useRef(false)
  const usedWeightCheckNumbers = useMemo(
    () => new Set(weightChecks.map((check) => check.check_no)),
    [weightChecks]
  )
  const availableWeightCheckNumbers = useMemo(
    () => [1, 2, 3, 4].filter((checkNo) => !usedWeightCheckNumbers.has(checkNo)),
    [usedWeightCheckNumbers]
  )
  const firstAvailableWeightCheckNo = availableWeightCheckNumbers[0] ?? 1

  useEffect(() => {
    if (packagingRun) {
      const mapped = mapPackagingRunToFormData(packagingRun)
      if (!isSamePackagingFormData(formDataRef.current, mapped)) {
        setFormData(mapped)
        skipNextSaveRef.current = true
      }
    }
  }, [packagingRun])

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextSaveRef = useRef(true)
  const formDataRef = useRef(formData)
  formDataRef.current = formData

  const flushSavePackaging = useCallback(() => {
    const fd = formDataRef.current
    savePackagingRun({
      visual_status: fd.visual_status.trim() || null,
      rework_destination: fd.rework_destination.trim() || null,
      pest_status: fd.pest_status.trim() || null,
      foreign_object_status: fd.foreign_object_status.trim() || null,
      mould_status: fd.mould_status.trim() || null,
      damaged_kernels_pct: fd.damaged_kernels_pct ? parseFloat(fd.damaged_kernels_pct) : null,
      insect_damaged_kernels_pct: fd.insect_damaged_kernels_pct
        ? parseFloat(fd.insect_damaged_kernels_pct)
        : null,
      nitrogen_used: fd.nitrogen_used ? parseFloat(fd.nitrogen_used) : null,
      nitrogen_batch_number: fd.nitrogen_batch_number.trim() || null,
      primary_packaging_type: fd.primary_packaging_type.trim() || null,
      primary_packaging_batch: fd.primary_packaging_batch.trim() || null,
      secondary_packaging: fd.secondary_packaging.trim() || null,
      secondary_packaging_type: fd.secondary_packaging_type.trim() || null,
      secondary_packaging_batch: fd.secondary_packaging_batch.trim() || null,
      label_correct: fd.label_correct ? (fd.label_correct as 'Yes' | 'No' | 'NA') : null,
      label_legible: fd.label_legible ? (fd.label_legible as 'Yes' | 'No' | 'NA') : null,
      pallet_integrity: fd.pallet_integrity ? (fd.pallet_integrity as 'Yes' | 'No' | 'NA') : null,
      allergen_swab_result: fd.allergen_swab_result.trim() || null,
      remarks: fd.remarks.trim() || null,
    }).catch((err) => {
      console.error('Error saving packaging data:', err)
      toast.error('Failed to save packaging data')
    })
  }, [savePackagingRun])

  const performSavePackaging = async () => {
    setSaving(true)
    try {
      await savePackagingRun({
        visual_status: formData.visual_status.trim() || null,
        rework_destination: formData.rework_destination.trim() || null,
        pest_status: formData.pest_status.trim() || null,
        foreign_object_status: formData.foreign_object_status.trim() || null,
        mould_status: formData.mould_status.trim() || null,
        damaged_kernels_pct: formData.damaged_kernels_pct ? parseFloat(formData.damaged_kernels_pct) : null,
        insect_damaged_kernels_pct: formData.insect_damaged_kernels_pct
          ? parseFloat(formData.insect_damaged_kernels_pct)
          : null,
        nitrogen_used: formData.nitrogen_used ? parseFloat(formData.nitrogen_used) : null,
        nitrogen_batch_number: formData.nitrogen_batch_number.trim() || null,
        primary_packaging_type: formData.primary_packaging_type.trim() || null,
        primary_packaging_batch: formData.primary_packaging_batch.trim() || null,
        secondary_packaging: formData.secondary_packaging.trim() || null,
        secondary_packaging_type: formData.secondary_packaging_type.trim() || null,
        secondary_packaging_batch: formData.secondary_packaging_batch.trim() || null,
        label_correct: formData.label_correct ? (formData.label_correct as 'Yes' | 'No' | 'NA') : null,
        label_legible: formData.label_legible ? (formData.label_legible as 'Yes' | 'No' | 'NA') : null,
        pallet_integrity: formData.pallet_integrity ? (formData.pallet_integrity as 'Yes' | 'No' | 'NA') : null,
        allergen_swab_result: formData.allergen_swab_result.trim() || null,
        remarks: formData.remarks.trim() || null,
      })
    } catch (error) {
      console.error('Error saving packaging data:', error)
      toast.error('Failed to save packaging data')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      flushSavePackaging()
    }, 10000)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [formData, flushSavePackaging])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        flushSavePackaging()
      }
    }
  }, [flushSavePackaging])

  useEffect(() => {
    if (packagingRun || loading || externalLoading || saving || autoCreateAttemptedRef.current) {
      return
    }

    autoCreateAttemptedRef.current = true
    setAutoCreatingRun(true)
    setSaving(true)

    savePackagingRun({
      visual_status: null,
      rework_destination: null,
      pest_status: null,
      foreign_object_status: null,
      mould_status: null,
      damaged_kernels_pct: null,
      insect_damaged_kernels_pct: null,
      nitrogen_used: null,
      nitrogen_batch_number: null,
      primary_packaging_type: null,
      primary_packaging_batch: null,
      secondary_packaging: null,
      secondary_packaging_type: null,
      secondary_packaging_batch: null,
      label_correct: null,
      label_legible: null,
      pallet_integrity: null,
      allergen_swab_result: null,
      remarks: null,
    })
      .catch((error) => {
        console.error('Error auto-creating packaging run:', error)
        toast.error('Failed to initialize packaging run. Please try saving packaging data.')
      })
      .finally(() => {
        setSaving(false)
        setAutoCreatingRun(false)
      })
  }, [packagingRun, loading, externalLoading, saving, savePackagingRun])

  useEffect(() => {
    if (!showWeightForm) return
    setWeightCheckFormData((prev) => {
      if (usedWeightCheckNumbers.has(prev.check_no)) {
        return { ...prev, check_no: firstAvailableWeightCheckNo }
      }
      return prev
    })
  }, [showWeightForm, usedWeightCheckNumbers, firstAvailableWeightCheckNo])

  const handleWeightCheckSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const weight = parseFloat(weightCheckFormData.weight_kg)
    if (isNaN(weight) || weight <= 0) {
      toast.error('Please enter a valid weight')
      return
    }

    if (weightCheckFormData.check_no < 1 || weightCheckFormData.check_no > 4) {
      toast.error('Check number must be between 1 and 4')
      return
    }

    if (usedWeightCheckNumbers.has(weightCheckFormData.check_no)) {
      toast.error('This verification number is already recorded')
      return
    }

    setSaving(true)
    try {
      await addWeightCheck({
        check_no: weightCheckFormData.check_no,
        weight_kg: weight,
      })
      toast.success('Weight check added')
    } catch (error) {
      console.error('Error adding weight check:', error)
      toast.error('Failed to add weight check')
    } finally {
      setSaving(false)
    }

    setWeightCheckFormData({ check_no: firstAvailableWeightCheckNo, weight_kg: '' })
    setShowWeightForm(false)
  }

  const handleWasteSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!wasteFormData.waste_type.trim()) {
      toast.error('Please select a waste type')
      return
    }

    const quantity = parseFloat(wasteFormData.quantity_kg)
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    setSaving(true)
    try {
      await addWaste({
        waste_type: wasteFormData.waste_type.trim(),
        quantity_kg: quantity,
      })
      setWasteFormData({ waste_type: '', quantity_kg: '' })
      setShowWasteForm(false)
      toast.success('Waste record added')
    } catch (error) {
      console.error('Error adding waste:', error)
      toast.error('Failed to add waste record')
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // In a real implementation, you would upload to Supabase Storage
    // For now, we'll just show a placeholder
    toast.info('Photo upload functionality will be implemented with Supabase Storage')
    e.target.value = ''
  }

  const handleDeleteWeightCheck = (checkId: number) => {
    setDeleteTarget({ type: 'weightCheck', id: checkId })
    setDeleteAlertOpen(true)
  }

  const handleDeleteWaste = (wasteId: number) => {
    setDeleteTarget({ type: 'waste', id: wasteId })
    setDeleteAlertOpen(true)
  }

  const handleDeletePhoto = (photoId: number) => {
    setDeleteTarget({ type: 'photo', id: photoId })
    setDeleteAlertOpen(true)
  }

  const handleDeletePackEntry = (entryId: number) => {
    setDeleteTarget({ type: 'packEntry', id: entryId })
    setDeleteAlertOpen(true)
  }

  const handleDeleteStorageAllocation = (allocationId: number) => {
    setDeleteTarget({ type: 'storageAllocation', id: allocationId })
    setDeleteAlertOpen(true)
  }

  const performDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      switch (deleteTarget.type) {
        case 'weightCheck':
          await deleteWeightCheck(deleteTarget.id)
          toast.success('Weight check deleted')
          break
        case 'waste':
          await deleteWaste(deleteTarget.id)
          toast.success('Waste record deleted')
          break
        case 'photo':
          await deletePhoto(deleteTarget.id)
          toast.success('Photo deleted')
          break
        case 'packEntry':
          await deletePackEntry(deleteTarget.id)
          toast.success('Pack entry removed')
          break
        case 'storageAllocation':
          await deleteStorageAllocation(deleteTarget.id)
          toast.success('Storage allocation removed')
          break
      }
      setDeleteAlertOpen(false)
      setDeleteTarget(null)
    } catch (error) {
      console.error('Error deleting:', error)
      toast.error('Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  const showReworkDropdown = formData.visual_status?.toLowerCase().includes('rework')

  const activePacketUnits = useMemo(
    () =>
      packagingUnits.filter(
        (unit) => normalizeUnitType(unit.unit_type) === 'PACKET' && (Number(unit.net_weight_kg) || 0) > 0
      ),
    [packagingUnits]
  )
  const activeBoxUnits = useMemo(
    () => packagingUnits.filter((unit) => normalizeUnitType(unit.unit_type) === 'BOX'),
    [packagingUnits]
  )
  const packagingUnitById = useMemo(() => new Map(packagingUnits.map((unit) => [unit.id, unit])), [packagingUnits])
  const packetUnitByCode = useMemo(() => {
    const map = new Map<string, PackagingUnitOption>()
    activePacketUnits.forEach((unit) => {
      const codeKey = normalizeUnitCode(unit.code)
      if (codeKey) map.set(codeKey, unit)
      const nameKey = normalizeUnitCode(unit.name)
      if (nameKey) map.set(nameKey, unit)
    })
    return map
  }, [activePacketUnits])
  const boxUnitById = useMemo(
    () => new Map(activeBoxUnits.map((unit) => [unit.id, unit])),
    [activeBoxUnits]
  )
  const packetUnitById = useMemo(
    () => new Map(activePacketUnits.map((unit) => [unit.id, unit])),
    [activePacketUnits]
  )
  const boxRuleByPair = useMemo(() => {
    const map = new Map<string, BoxPackRuleOption>()
    boxPackRules.forEach((rule) => {
      map.set(`${rule.box_unit_id}:${rule.packet_unit_id}`, rule)
    })
    return map
  }, [boxPackRules])

  const selectedWipForPackEntry = useMemo(
    () => sortedWips.find((w) => String(w.id) === packEntryForm.sorting_output_id) ?? null,
    [sortedWips, packEntryForm.sorting_output_id]
  )
  const selectedPacketUnitForPackEntry = useMemo(
    () => activePacketUnits.find((unit) => unit.code === packEntryForm.packet_unit_code) ?? null,
    [activePacketUnits, packEntryForm.packet_unit_code]
  )
  const getAvailablePacksForPacketUnit = useCallback(
    (
      packetUnit: PackagingUnitOption | null,
      acceptedByProductId = opAcceptedByProductId,
      consumedByProductId = opConsumedByProductId
    ): number => {
      if (!packetUnit) return 0
      const operationalProductId = Number(packetUnit.operational_product_id) || 0
      if (!operationalProductId) return 0
      const accepted = Number(acceptedByProductId[operationalProductId]) || 0
      const consumed = Number(consumedByProductId[operationalProductId]) || 0
      return Math.max(0, Math.floor(accepted - consumed))
    },
    [opAcceptedByProductId, opConsumedByProductId]
  )
  const selectedPacketUnitAvailablePacks = useMemo(
    () => getAvailablePacksForPacketUnit(selectedPacketUnitForPackEntry),
    [getAvailablePacksForPacketUnit, selectedPacketUnitForPackEntry]
  )
  const autoSelectedFinishedProduct = useMemo(
    () => (finishedProducts.length > 0 ? finishedProducts[0] ?? null : null),
    [finishedProducts]
  )
  useEffect(() => {
    setPackEntryForm((prev) => {
      if (!selectedWipForPackEntry) {
        if (!prev.product_id) return prev
        return { ...prev, product_id: '' }
      }
      const nextProductId = autoSelectedFinishedProduct ? String(autoSelectedFinishedProduct.id) : ''
      if (prev.product_id === nextProductId) return prev
      return { ...prev, product_id: nextProductId }
    })
  }, [selectedWipForPackEntry, autoSelectedFinishedProduct])
  useEffect(() => {
    if (!showPackEntryForm || !packEntryForm.packet_unit_code || !runWarehouseId) return
    loadOperationalPackagingStockSnapshot().catch((error) => {
      console.error('Failed to refresh OP stock after packet unit selection:', error)
    })
  }, [showPackEntryForm, packEntryForm.packet_unit_code, packEntries.length, runWarehouseId, loadOperationalPackagingStockSnapshot])
  const selectedWipUsedKg = useMemo(() => {
    if (!selectedWipForPackEntry) return 0
    return packEntries
      .filter((entry) => entry.sorting_output_id === selectedWipForPackEntry.id)
      .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
  }, [packEntries, selectedWipForPackEntry])
  const selectedWipRejectedKg = useMemo(() => {
    if (!selectedWipForPackEntry) return 0
    return getFailedRejectedWeightBySortingOutput(selectedWipForPackEntry.id)
  }, [selectedWipForPackEntry, getFailedRejectedWeightBySortingOutput])
  const selectedWipRemainingKg = useMemo(() => {
    if (!selectedWipForPackEntry) return null
    return Math.max(0, selectedWipForPackEntry.quantity_kg - selectedWipRejectedKg - selectedWipUsedKg)
  }, [selectedWipForPackEntry, selectedWipUsedKg, selectedWipRejectedKg])
  const packEntryAdditionalRemainderKg = useMemo(
    () => addedRemainderSources.reduce((sum, source) => sum + (Number(source.remainder_kg) || 0), 0),
    [addedRemainderSources]
  )
  const packEntryEffectiveLimitKg = useMemo(() => {
    if (selectedWipRemainingKg == null) return null
    return Math.max(0, selectedWipRemainingKg + packEntryAdditionalRemainderKg)
  }, [selectedWipRemainingKg, packEntryAdditionalRemainderKg])
  const eligibleWipsForPacking = useMemo(() => {
    return sortedWips.filter((wip) => {
      const latestCheck = getLatestMetalCheck(wip.id)
      if (!latestCheck || latestCheck.status !== 'PASS') return false
      const failedRejectedKg = getFailedRejectedWeightBySortingOutput(wip.id)
      const usedKg = packEntries
        .filter((entry) => entry.sorting_output_id === wip.id)
        .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
      const remainingKg = wip.quantity_kg - failedRejectedKg - usedKg
      return remainingKg > 0
    })
  }, [sortedWips, getLatestMetalCheck, getFailedRejectedWeightBySortingOutput, packEntries])
  const hasEligibleWipsForPacking = eligibleWipsForPacking.length > 0
  const allSortedWipsPassedMetalCheck = useMemo(() => {
    if (sortedWips.length === 0) return false
    return sortedWips.every((wip) => {
      const latestCheck = getLatestMetalCheck(wip.id)
      return latestCheck?.status === 'PASS'
    })
  }, [sortedWips, getLatestMetalCheck])
  const selectedStoragePackEntryId = Number(storageAllocationForm.pack_entry_id || 0)
  const selectedStoragePackEntry = packEntries.find((entry) => entry.id === selectedStoragePackEntryId) ?? null
  const selectedStoragePacketCode = selectedStoragePackEntry?.packet_unit_code ?? selectedStoragePackEntry?.pack_identifier ?? null
  const selectedStoragePacketKey = normalizeUnitCode(selectedStoragePacketCode)
  const selectedStoragePacketUnit = selectedStoragePacketCode
    ? packetUnitByCode.get(normalizeUnitCode(selectedStoragePacketCode)) ?? null
    : null
  const selectedStorageBoxUnit = storageAllocationForm.box_unit_code
    ? packagingUnits.find((unit) => normalizeUnitCode(unit.code) === normalizeUnitCode(storageAllocationForm.box_unit_code)) ?? null
    : null
  const matchingRulesForSelectedPacket = useMemo(() => {
    if (!selectedStoragePacketUnit && !selectedStoragePacketKey) return []
    return boxPackRules.filter((rule) => {
      if (selectedStoragePacketUnit && rule.packet_unit_id === selectedStoragePacketUnit.id) return true
      if (!selectedStoragePacketKey) return false
      const rulePacketCodeKey = normalizeUnitCode(rule.packet_unit_code)
      const rulePacketNameKey = normalizeUnitCode(rule.packet_unit_name)
      return rulePacketCodeKey === selectedStoragePacketKey || rulePacketNameKey === selectedStoragePacketKey
    })
  }, [boxPackRules, selectedStoragePacketUnit, selectedStoragePacketKey])
  const matchingBoxUnitsForSelectedPacket = useMemo(() => {
    return matchingRulesForSelectedPacket
      .map((rule) => {
        const boxUnit = packagingUnitById.get(rule.box_unit_id)
        if (boxUnit) return boxUnit
        if (!rule.box_unit_code) return null
        return {
          id: rule.box_unit_id,
          code: rule.box_unit_code,
          name: rule.box_unit_name ?? rule.box_unit_code,
          unit_type: 'BOX' as const,
          packaging_type: 'BOX' as const,
          net_weight_kg: null,
          is_active: true,
        }
      })
      .filter((unit): unit is PackagingUnitOption => !!unit)
  }, [matchingRulesForSelectedPacket, packagingUnitById])
  const selectedStorageBoxRule = useMemo(() => {
    if (!selectedStorageBoxUnit) return null
    if (selectedStoragePacketUnit) {
      return boxRuleByPair.get(`${selectedStorageBoxUnit.id}:${selectedStoragePacketUnit.id}`) ?? null
    }
    const fallback = matchingRulesForSelectedPacket.find((rule) => rule.box_unit_id === selectedStorageBoxUnit.id)
    return fallback ?? null
  }, [selectedStorageBoxUnit, selectedStoragePacketUnit, boxRuleByPair, matchingRulesForSelectedPacket])
  const computedPacksPerUnit =
    storageAllocationForm.storage_type === 'SHOP_PACKING'
      ? 1
      : storageAllocationForm.storage_type === 'BOX'
      ? selectedStorageBoxRule?.packets_per_box ?? 0
      : 0
  const storageTotalPacksPreview =
    (Number(storageAllocationForm.units_count) || 0) * (computedPacksPerUnit || 0)
  const storageTotalKgPreview =
    storageTotalPacksPreview * (Number(selectedStoragePackEntry?.pack_size_kg) || 0)
  const selectedStorageAvailablePacks = useMemo(() => {
    if (!selectedStoragePackEntryId) return 0
    if (!editingStorageAllocationId) {
      return getRemainingPackCountByEntry(selectedStoragePackEntryId)
    }
    const existing = storageAllocations.find((row) => row.id === editingStorageAllocationId)
    if (!existing) return getRemainingPackCountByEntry(selectedStoragePackEntryId)
    if (existing.pack_entry_id !== selectedStoragePackEntryId) {
      return getRemainingPackCountByEntry(selectedStoragePackEntryId)
    }
    return getRemainingPackCountByEntry(selectedStoragePackEntryId) + (Number(existing.total_packs) || 0)
  }, [selectedStoragePackEntryId, editingStorageAllocationId, getRemainingPackCountByEntry, storageAllocations])
  const suggestedUnitsCount = useMemo(() => {
    if (!selectedStoragePackEntryId || !computedPacksPerUnit || computedPacksPerUnit <= 0) return ''
    const suggested = Math.floor(selectedStorageAvailablePacks / computedPacksPerUnit)
    return suggested > 0 ? String(suggested) : ''
  }, [selectedStoragePackEntryId, computedPacksPerUnit, selectedStorageAvailablePacks])

  useEffect(() => {
    if (!storageUnitsAutoPrefillEnabled) return
    setStorageAllocationForm((prev) => {
      if (prev.units_count === suggestedUnitsCount) return prev
      return { ...prev, units_count: suggestedUnitsCount }
    })
  }, [storageUnitsAutoPrefillEnabled, suggestedUnitsCount])

  useEffect(() => {
    if (!packEntryForm.sorting_output_id) return
    const selectedId = Number(packEntryForm.sorting_output_id)
    const stillEligible = eligibleWipsForPacking.some((w) => w.id === selectedId)
    if (!stillEligible) {
      setPackEntryForm((prev) => ({ ...prev, sorting_output_id: '', quantity_kg: '' }))
    }
  }, [eligibleWipsForPacking, packEntryForm.sorting_output_id])

  useEffect(() => {
    setRemainderPrefillSource(null)
    setAddedRemainderSources([])
  }, [packEntryForm.sorting_output_id])

  const loadRecentRemaindersForSelectedWip = useCallback(async () => {
    if (!selectedWipForPackEntry?.product_id) {
      setRemainderRows([])
      setRemaindersError(null)
      return
    }

    setLoadingRemainders(true)
    setRemaindersError(null)
    try {
      const { data: sortingOutputs, error: sortingOutputsError } = await supabase
        .from('process_sorting_outputs')
        .select('id')
        .eq('product_id', selectedWipForPackEntry.product_id)

      if (sortingOutputsError) {
        throw sortingOutputsError
      }

      const sortingOutputIds = (sortingOutputs ?? []).map((row: { id: number }) => row.id).filter(Boolean)
      if (sortingOutputIds.length === 0) {
        setRemainderRows([])
        setSelectedRemainderId('')
        return
      }

      const { data, error: fetchError } = await supabase
        .from('process_packaging_pack_entries')
        .select(`
          id,
          packaging_run_id,
          sorting_output_id,
          product_id,
          quantity_kg,
          packet_unit_code,
          pack_identifier,
          remainder_kg,
          created_at,
          usages:process_packaging_remainder_usages!process_packaging_remainder_usages_source_pack_entry_id_fkey(
            quantity_kg
          ),
          finished_product:products!process_packaging_pack_entries_product_id_fkey(id, name, sku),
          sorting_output:process_sorting_outputs(
            product:products(id, name, sku)
          ),
          packaging_run:process_packaging_runs(
            id,
            process_step_run_id,
            process_step_runs(
              process_lot_run_id,
              process_lot_runs(
                processes(code, name),
                supply_batches(lot_no)
              )
            )
          )
        `)
        .in('sorting_output_id', sortingOutputIds)
        .gt('remainder_kg', 0)
        .order('created_at', { ascending: false })

      if (fetchError) {
        throw fetchError
      }

      const unwrap = <T,>(value: T | T[] | null | undefined): T | null =>
        Array.isArray(value) ? value[0] ?? null : value ?? null

      const mapped = ((data ?? []) as any[])
        .map((row): RemainderCandidate | null => {
          const stepRun = unwrap(row.packaging_run?.process_step_runs)
          const lotRun = stepRun?.process_lot_runs ?? null
          const processInfo = lotRun?.processes ?? null
          const supplyBatch = lotRun?.supply_batches ?? null
          const sourceProduct = row.sorting_output?.product ?? null
          const finishedProduct = row.finished_product ?? null
          const usageRows = Array.isArray(row.usages) ? row.usages : []
          const usedKg = usageRows.reduce((sum: number, usage: { quantity_kg?: number | null }) => {
            return sum + (Number(usage.quantity_kg) || 0)
          }, 0)
          const availableRemainderKg = Math.max(0, (Number(row.remainder_kg) || 0) - usedKg)

          return {
            id: Number(row.id),
            packaging_run_id: Number(row.packaging_run_id),
            source_product_id: sourceProduct?.id ?? null,
            source_product_name: sourceProduct?.name ?? selectedWipForPackEntry.product_name ?? 'Unknown',
            source_product_sku: sourceProduct?.sku ?? null,
            process_name: processInfo?.name ?? 'Unknown',
            process_code: processInfo?.code ?? '—',
            lot_no: supplyBatch?.lot_no ?? null,
            finished_product_id: finishedProduct?.id ?? row.product_id ?? null,
            finished_product_name: finishedProduct?.name ?? (row.product_id ? `Product #${row.product_id}` : 'Unknown'),
            finished_product_sku: finishedProduct?.sku ?? null,
            packet_unit_code: row.packet_unit_code ?? row.pack_identifier ?? null,
            remainder_kg: availableRemainderKg,
            packed_at: row.created_at ?? null,
          }
        })
        .filter((row): row is RemainderCandidate => !!row && row.remainder_kg > 0)
        .filter((row) => row.packaging_run_id !== packagingRun?.id)

      const latestRunIds = Array.from(new Set(mapped.map((row) => row.packaging_run_id))).slice(0, 5)
      const latestRunIdSet = new Set(latestRunIds)
      const trimmed = mapped.filter((row) => latestRunIdSet.has(row.packaging_run_id))

      setRemainderRows(trimmed)
      setSelectedRemainderId(trimmed[0] ? String(trimmed[0].id) : '')
    } catch (error) {
      setRemainderRows([])
      setSelectedRemainderId('')
      const message = error instanceof Error ? error.message : 'Failed to load recent remainders'
      setRemaindersError(message)
    } finally {
      setLoadingRemainders(false)
    }
  }, [selectedWipForPackEntry, packagingRun?.id])

  const openRemaindersModal = async () => {
    if (!selectedWipForPackEntry) {
      toast.info('Select WIP first to load matching remainder history.')
      return
    }
    setRemainderSearchTerm('')
    setRemainderDateFilter('ALL')
    setShowRemaindersModal(true)
    await loadRecentRemaindersForSelectedWip()
  }

  const closeRemaindersModal = () => {
    setShowRemaindersModal(false)
  }

  const filteredRemainderRows = useMemo(() => {
    const now = Date.now()
    return remainderRows.filter((row) => {
      if (remainderDateFilter !== 'ALL') {
        const dateValue = row.packed_at ? new Date(row.packed_at).getTime() : NaN
        const threshold = remainderDateFilter === '7D' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
        if (!Number.isFinite(dateValue) || now - dateValue > threshold) {
          return false
        }
      }

      const search = remainderSearchTerm.trim().toLowerCase()
      if (!search) return true
      const haystack = [
        row.finished_product_name,
        row.finished_product_sku ?? '',
        row.packet_unit_code ?? '',
        row.lot_no ?? '',
        row.process_code,
        row.process_name,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }, [remainderRows, remainderDateFilter, remainderSearchTerm])

  const selectedRemainderRow = useMemo(
    () => filteredRemainderRows.find((row) => String(row.id) === selectedRemainderId) ?? null,
    [filteredRemainderRows, selectedRemainderId]
  )
  const selectableFilteredRemainderRows = useMemo(
    () => filteredRemainderRows.filter((row) => !usedRemainderIds.has(row.id)),
    [filteredRemainderRows, usedRemainderIds]
  )

  const remainderTotalKg = useMemo(
    () => filteredRemainderRows.reduce((sum, row) => sum + row.remainder_kg, 0),
    [filteredRemainderRows]
  )
  const remainderSourceRuns = useMemo(
    () => new Set(filteredRemainderRows.map((row) => row.packaging_run_id)).size,
    [filteredRemainderRows]
  )

  const applySelectedRemainder = () => {
    if (!selectedRemainderRow || !selectedWipForPackEntry) return
    if (usedRemainderIds.has(selectedRemainderRow.id)) {
      toast.error('This remainder has already been used in this packing session.')
      return
    }
    const remainingKg = selectedWipRemainingKg ?? 0
    const adjustedLimitKg = remainingKg + selectedRemainderRow.remainder_kg
    const boundedQuantity = Math.max(0, Math.min(selectedRemainderRow.remainder_kg, adjustedLimitKg))
    const quantityValue = boundedQuantity > 0 ? boundedQuantity.toFixed(2) : ''

    const packetMatch = selectedRemainderRow.packet_unit_code
      ? activePacketUnits.find(
          (unit) => normalizeUnitCode(unit.code) === normalizeUnitCode(selectedRemainderRow.packet_unit_code)
        ) ?? null
      : null
    const productMatch = selectedRemainderRow.finished_product_id
      ? finishedProducts.find((product) => product.id === selectedRemainderRow.finished_product_id) ?? null
      : null

    setPackEntryForm((prev) => ({
      ...prev,
      packet_unit_code: packetMatch?.code ?? '',
      product_id: productMatch ? String(productMatch.id) : '',
      quantity_kg: quantityValue,
    }))

    setRemainderPrefillSource({
      id: selectedRemainderRow.id,
      process_name: selectedRemainderRow.process_name,
      process_code: selectedRemainderRow.process_code,
      lot_no: selectedRemainderRow.lot_no,
      remainder_kg: selectedRemainderRow.remainder_kg,
      packed_at: selectedRemainderRow.packed_at,
    })
    setAddedRemainderSources((prev) => {
      if (prev.some((row) => row.id === selectedRemainderRow.id)) return prev
      return [
        ...prev,
        {
          id: selectedRemainderRow.id,
          process_name: selectedRemainderRow.process_name,
          process_code: selectedRemainderRow.process_code,
          lot_no: selectedRemainderRow.lot_no,
          remainder_kg: selectedRemainderRow.remainder_kg,
          packed_at: selectedRemainderRow.packed_at,
        },
      ]
    })
    setUsedRemainderIds((prev) => new Set(prev).add(selectedRemainderRow.id))

    closeRemaindersModal()
    toast.success('Pack form prefilled from remainder source.')
    toast.info(`Quantity limit adjusted to ${(adjustedLimitKg).toFixed(2)} kg including remainder.`)
    if (!packetMatch) {
      toast.warning('Historical packet unit is not active. Please select a packet unit.')
    }
    if (!productMatch) {
      toast.warning('Historical finished product is not valid for this WIP. Please select a finished product.')
    }
  }

  useEffect(() => {
    if (!showRemaindersModal) return

    const modalNode = remaindersModalRef.current
    const focusables = modalNode?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusables && focusables.length > 0) {
      focusables[0].focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRemaindersModal()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = remaindersModalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!nodes || nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showRemaindersModal])

  useEffect(() => {
    if (!showRemaindersModal) return
    if (selectedRemainderId && selectedRemainderRow && !usedRemainderIds.has(selectedRemainderRow.id)) return
    const firstAvailable = selectableFilteredRemainderRows[0]
    setSelectedRemainderId(firstAvailable ? String(firstAvailable.id) : '')
  }, [showRemaindersModal, selectedRemainderId, selectedRemainderRow, selectableFilteredRemainderRows, usedRemainderIds])

  const openMetalCheckModal = (wip: SortedWipRow) => {
    setSelectedMetalCheckWip(wip)
    setMetalCheckForm({ status: '', remarks: '' })
    setMetalRejectionsForm([{ object_type: '', weight_kg: '', corrective_action: '' }])
    setShowMetalCheckModal(true)
  }

  const closeMetalCheckModal = () => {
    setShowMetalCheckModal(false)
    setSelectedMetalCheckWip(null)
    setMetalCheckForm({ status: '', remarks: '' })
    setMetalRejectionsForm([{ object_type: '', weight_kg: '', corrective_action: '' }])
  }

  const addMetalRejectionRow = () => {
    setMetalRejectionsForm((prev) => [...prev, { object_type: '', weight_kg: '', corrective_action: '' }])
  }

  const removeMetalRejectionRow = (index: number) => {
    setMetalRejectionsForm((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleMetalCheckSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedMetalCheckWip) return
    if (!metalCheckForm.status) {
      toast.error('Select metal check status')
      return
    }

    if (metalCheckForm.status === 'FAIL') {
      const cleaned = metalRejectionsForm.filter((row) => row.object_type.trim() && row.weight_kg.trim())
      if (cleaned.length === 0) {
        toast.error('At least one foreign object rejection is required for FAIL')
        return
      }
      if (cleaned.some((row) => Number(row.weight_kg) <= 0 || Number.isNaN(Number(row.weight_kg)))) {
        toast.error('Rejection weight must be greater than 0')
        return
      }
    }

    setSaving(true)
    try {
      await addMetalCheckAttempt({
        sorting_output_id: selectedMetalCheckWip.id,
        status: metalCheckForm.status,
        remarks: metalCheckForm.remarks.trim() || null,
        rejections:
          metalCheckForm.status === 'FAIL'
            ? metalRejectionsForm
                .filter((row) => row.object_type.trim() && row.weight_kg.trim())
                .map((row) => ({
                  object_type: row.object_type.trim(),
                  weight_kg: Number(row.weight_kg),
                  corrective_action: row.corrective_action.trim() || null,
                }))
            : [],
      })
      toast.success(`Metal check ${metalCheckForm.status} recorded`)
      closeMetalCheckModal()
    } catch (error) {
      console.error('Failed to record metal check attempt:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to record metal check')
    } finally {
      setSaving(false)
    }
  }

  const handlePackEntrySubmit = async (e: FormEvent) => {
    e.preventDefault()
    const sortingOutputId = parseInt(packEntryForm.sorting_output_id, 10)
    const productId = packEntryForm.product_id ? parseInt(packEntryForm.product_id, 10) : null
    const selectedPacketUnit = selectedPacketUnitForPackEntry
    const selectedPackSizeKg = Number(selectedPacketUnit?.net_weight_kg) || 0
    const operationalProductId = Number(selectedPacketUnit?.operational_product_id) || 0
    const quantityKg = parseFloat(packEntryForm.quantity_kg)
    const selectedWip = sortedWips.find((w) => w.id === sortingOutputId)
    const failedRejectedKg = selectedWip ? getFailedRejectedWeightBySortingOutput(selectedWip.id) : 0
    const latestCheck = sortingOutputId ? getLatestMetalCheck(sortingOutputId) : null
    const remainingKgBase =
      selectedWipForPackEntry && selectedWipForPackEntry.id === sortingOutputId
        ? selectedWipRemainingKg ?? 0
        : selectedWip
        ? selectedWip.quantity_kg -
          failedRejectedKg -
          packEntries
            .filter((entry) => entry.sorting_output_id === selectedWip.id)
            .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
        : 0
    const remainingKg = Math.max(0, remainingKgBase + packEntryAdditionalRemainderKg)

    if (!sortingOutputId || !selectedPacketUnit || selectedPackSizeKg <= 0 || !Number.isFinite(quantityKg) || quantityKg <= 0) {
      toast.error('Select a WIP, packet unit, and valid quantity')
      return
    }
    if (!productId) {
      toast.error('Select the finished product being packed')
      return
    }
    if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
      toast.error('Total quantity must be greater than 0')
      return
    }
    if (!latestCheck || latestCheck.status !== 'PASS') {
      toast.error('Metal detection must pass before packing this sorted output.')
      return
    }
    if (quantityKg > remainingKg) {
      toast.error(`Quantity cannot exceed remaining ${remainingKg.toFixed(2)} kg for this WIP`)
      return
    }
    if (!runWarehouseId) {
      toast.error('Unable to determine run warehouse for OP stock validation.')
      return
    }
    if (!operationalProductId) {
      toast.error('Selected packet unit has no operational product mapping. Update Packaging Settings first.')
      return
    }

    const requiredPacks = Math.max(0, Math.floor(quantityKg / selectedPackSizeKg))
    const snapshot = await loadOperationalPackagingStockSnapshot(runWarehouseId)
    const availablePacks = getAvailablePacksForPacketUnit(selectedPacketUnit, snapshot.accepted, snapshot.consumed)
    if (requiredPacks > availablePacks) {
      const shortage = requiredPacks - availablePacks
      toast.error(
        `Not enough operational packs in stock for ${selectedPacketUnit.code}. Required: ${requiredPacks}, available: ${availablePacks}, shortage: ${shortage}.`
      )
      return
    }

    setSaving(true)
    try {
      const createdPackEntry = await addPackEntry({
        sorting_output_id: sortingOutputId,
        product_id: productId,
        packet_unit_code: selectedPacketUnit.code,
        pack_identifier: selectedPacketUnit.code,
        quantity_kg: quantityKg,
        packing_type: mapPackagingTypeToPackingType(selectedPacketUnit.packaging_type),
        pack_size_kg: selectedPackSizeKg,
      })
      const remainderUsageNeededKg = Math.max(0, quantityKg - Math.max(0, remainingKgBase))
      if (remainderUsageNeededKg > 0 && addedRemainderSources.length > 0) {
        let remainingToAllocate = remainderUsageNeededKg
        const usagePayload: Array<{
          source_pack_entry_id: number
          consumer_pack_entry_id: number
          quantity_kg: number
          created_by: string | null
        }> = []

        const { data: authData } = await supabase.auth.getUser()
        const userId = authData?.user?.id ?? null

        for (const source of addedRemainderSources) {
          if (remainingToAllocate <= 0) break
          const sourceAvailableKg = Number(source.remainder_kg) || 0
          if (sourceAvailableKg <= 0) continue
          const consumedKg = Math.min(sourceAvailableKg, remainingToAllocate)
          if (consumedKg <= 0) continue
          usagePayload.push({
            source_pack_entry_id: source.id,
            consumer_pack_entry_id: createdPackEntry.id,
            quantity_kg: consumedKg,
            created_by: userId,
          })
          remainingToAllocate -= consumedKg
        }

        if (usagePayload.length > 0) {
          const { error: usageInsertError } = await supabase
            .from('process_packaging_remainder_usages')
            .insert(usagePayload)

          if (usageInsertError) {
            await deletePackEntry(createdPackEntry.id).catch((rollbackError) => {
              console.error('Failed to rollback pack entry after remainder usage failure:', rollbackError)
            })
            throw usageInsertError
          }
        }
      }
      setPackEntryForm({
        sorting_output_id: '',
        product_id: '',
        packet_unit_code: '',
        quantity_kg: '',
      })
      setRemainderPrefillSource(null)
      setAddedRemainderSources([])
      setShowPackEntryForm(false)
      toast.success('Pack entry added')
    } catch (err) {
      console.error('Error adding pack entry:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to add pack entry')
    } finally {
      setSaving(false)
    }
  }

  const resetStorageAllocationForm = () => {
    setStorageAllocationForm({
      pack_entry_id: '',
      storage_type: '',
      box_unit_code: '',
      units_count: '',
      packs_per_unit: '',
      notes: '',
    })
    setStorageUnitsAutoPrefillEnabled(true)
    setEditingStorageAllocationId(null)
  }

  const startEditStorageAllocation = (allocationId: number) => {
    const row = storageAllocations.find((item) => item.id === allocationId)
    if (!row) return
    setStorageAllocationForm({
      pack_entry_id: String(row.pack_entry_id),
      storage_type: row.storage_type,
      box_unit_code: row.box_unit_code || '',
      units_count: String(row.units_count),
      packs_per_unit: String(row.packs_per_unit),
      notes: row.notes || '',
    })
    setStorageUnitsAutoPrefillEnabled(false)
    setEditingStorageAllocationId(row.id)
  }

  const handleStorageAllocationSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const packEntryId = Number(storageAllocationForm.pack_entry_id)
    const unitsCount = Number(storageAllocationForm.units_count)
    const storageType = storageAllocationForm.storage_type as '' | 'BOX' | 'SHOP_PACKING'
    const packsPerUnit = computedPacksPerUnit

    if (!packEntryId || !storageType) {
      toast.error('Select pack entry and storage type')
      return
    }
    if (!Number.isInteger(unitsCount) || unitsCount <= 0) {
      toast.error('Units count must be a whole number greater than 0')
      return
    }
    if (!Number.isInteger(packsPerUnit) || packsPerUnit <= 0) {
      toast.error('Unable to determine packs per unit for this allocation')
      return
    }

    if (storageType === 'BOX' && !storageAllocationForm.box_unit_code) {
      toast.error('Select a box unit')
      return
    }
    if (storageType === 'BOX' && !selectedStorageBoxRule) {
      toast.error('No active box pack rule found for selected packet and box')
      return
    }

    const totalPacks = unitsCount * packsPerUnit
    if (editingStorageAllocationId) {
      const existing = storageAllocations.find((row) => row.id === editingStorageAllocationId)
      const packEntry = packEntries.find((entry) => entry.id === packEntryId)
      if (!existing || !packEntry) return
      const allocatedWithoutThis = storageAllocations
        .filter((row) => row.pack_entry_id === packEntryId && row.id !== editingStorageAllocationId)
        .reduce((sum, row) => sum + (Number(row.total_packs) || 0), 0)
      const produced = Number(packEntry.pack_count) || 0
      if (totalPacks + allocatedWithoutThis > produced) {
        toast.error(`Allocation exceeds produced packs (${produced}) for selected pack entry`)
        return
      }
    } else {
      const remaining = getRemainingPackCountByEntry(packEntryId)
      if (totalPacks > remaining) {
        toast.error(`Allocation exceeds remaining packs (${remaining}) for selected pack entry`)
        return
      }
    }

    setSaving(true)
    try {
      if (editingStorageAllocationId) {
        await updateStorageAllocation(editingStorageAllocationId, {
          storage_type: storageType as 'BOX' | 'SHOP_PACKING',
          box_unit_code: storageType === 'BOX' ? storageAllocationForm.box_unit_code || null : null,
          units_count: unitsCount,
          packs_per_unit: packsPerUnit,
          notes: storageAllocationForm.notes || null,
        })
        toast.success('Storage allocation updated')
      } else {
        await addStorageAllocation({
          pack_entry_id: packEntryId,
          storage_type: storageType as 'BOX' | 'SHOP_PACKING',
          box_unit_code: storageType === 'BOX' ? storageAllocationForm.box_unit_code || null : null,
          units_count: unitsCount,
          packs_per_unit: packsPerUnit,
          notes: storageAllocationForm.notes || null,
        })
        toast.success('Storage allocation added')
      }
      resetStorageAllocationForm()
    } catch (error) {
      console.error('Failed to save storage allocation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save storage allocation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Sorted WIPs to be packed */}
      <div className="rounded-lg border border-olive-light/40 bg-olive-light/10 p-4">
        <h4 className="text-sm font-semibold text-text-dark mb-2">Packaging - Step Data Entry</h4>
        <p className="text-xs text-text-dark/60 mb-3">
          Sorting outputs from this run available for pack entries. Save packaging data first, then add pack entries below.
        </p>
        {loadingWips ? (
          <p className="text-sm text-text-dark/60">Loading sorted WIPs…</p>
        ) : sortedWips.length === 0 ? (
          <p className="text-sm text-text-dark/60">
            No sorted WIPs for this run. Complete the Sorting step and record sorting outputs first.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-olive-light/30 bg-white">
            <table className="min-w-full divide-y divide-olive-light/30 text-sm">
              <thead className="bg-olive-light/10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-dark/60">Product</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-text-dark/60">Quantity (kg)</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-dark/60">Metal Check</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase text-text-dark/60">Attempts</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-text-dark/60">Rejected (kg)</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-text-dark/60">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-light/20">
                {sortedWips.map((wip) => {
                  const latestCheck = getLatestMetalCheck(wip.id)
                  const attempts = metalChecksBySortingOutput[wip.id]?.length || 0
                  const rejectedKg = getFailedRejectedWeightBySortingOutput(wip.id)
                  const status: 'PENDING' | 'PASS' | 'FAIL' = latestCheck ? latestCheck.status : 'PENDING'

                  return (
                    <tr key={wip.id}>
                      <td className="px-3 py-2">
                        <span className="font-medium text-text-dark">{wip.product_name}</span>
                        {wip.product_sku && <span className="ml-1 text-text-dark/60">({wip.product_sku})</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-text-dark/80">{wip.quantity_kg.toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={
                            status === 'PASS'
                              ? 'inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
                              : status === 'FAIL'
                              ? 'inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'
                              : 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700'
                          }
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-text-dark/80">{attempts}</td>
                      <td className="px-3 py-2 text-right text-text-dark/80">{rejectedKg.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-olive-light/40"
                          onClick={() => openMetalCheckModal(wip)}
                          disabled={saving || externalLoading || !packagingRun}
                        >
                          Metal Check
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {sortedWips.length > 0 && (
          <div className="mt-4 border-t border-olive-light/30 pt-4">
            <h5 className="text-sm font-semibold text-text-dark mb-2">Pack WIPs into finished products</h5>
            {!packagingRun && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                {autoCreatingRun
                  ? 'Initializing packaging run…'
                  : 'Packaging run is initializing. You will be able to add pack entries in a moment.'}
              </p>
            )}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-text-dark/60">Record which WIP went into which pack and which finished product.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPackEntryForm(!showPackEntryForm)}
                disabled={saving || externalLoading || !packagingRun || !hasEligibleWipsForPacking}
                className="border-olive-light/30"
              >
                <PackageIcon className="mr-2 h-4 w-4" />
                Add pack entry
              </Button>
            </div>
            {!allSortedWipsPassedMetalCheck && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                Complete and pass metal checks before adding pack entries.
              </p>
            )}
            {showPackEntryForm && packagingRun && (
              <form onSubmit={handlePackEntrySubmit} className="rounded-lg border border-olive-light/30 bg-white p-4 mb-4">
                {(() => {
                  const selectedWip = sortedWips.find((w) => String(w.id) === packEntryForm.sorting_output_id)
                  const failedRejectedKg = selectedWip ? getFailedRejectedWeightBySortingOutput(selectedWip.id) : 0
                  const latestCheck = selectedWip ? getLatestMetalCheck(selectedWip.id) : null
                  const usedKg = selectedWip
                    ? packEntries
                        .filter((entry) => entry.sorting_output_id === selectedWip.id)
                        .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
                    : 0
                  const remainingKg = selectedWip ? Math.max(0, selectedWip.quantity_kg - failedRejectedKg - usedKg) : 0
                  const effectiveLimitKg = Math.max(0, remainingKg + packEntryAdditionalRemainderKg)
                  const selectedPacketUnit = activePacketUnits.find((unit) => unit.code === packEntryForm.packet_unit_code)
                  const selectedPackSizeKg = Number(selectedPacketUnit?.net_weight_kg) || 0
                  const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                  const remainderKg =
                    selectedPackSizeKg > 0 && Number.isFinite(quantityKg)
                      ? Math.max(0, quantityKg - Math.floor(quantityKg / selectedPackSizeKg) * selectedPackSizeKg)
                      : 0
                  const packCount =
                    selectedPackSizeKg > 0 && Number.isFinite(quantityKg)
                      ? Math.floor(quantityKg / selectedPackSizeKg)
                      : 0

                  return (
                    <div className="mb-4 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2 text-xs text-text-dark/70">
                      <div className="flex flex-wrap items-center gap-3">
                        <span>
                          Metal status:{' '}
                          <strong className="text-text-dark">{latestCheck ? latestCheck.status : 'PENDING'}</strong>
                        </span>
                        <span>
                          Remaining WIP:{' '}
                          <strong className="text-text-dark">
                            {selectedWip ? remainingKg.toFixed(2) : '—'} kg
                          </strong>
                        </span>
                        <span>
                          Qty limit:{' '}
                          <strong className="text-text-dark">
                            {selectedWip ? effectiveLimitKg.toFixed(2) : '—'} kg
                          </strong>
                        </span>
                        {packEntryAdditionalRemainderKg > 0 && (
                          <span>
                            Remainder added:{' '}
                            <strong className="text-text-dark">{packEntryAdditionalRemainderKg.toFixed(2)} kg</strong>
                          </span>
                        )}
                        <span>
                          Metal rejects deducted:{' '}
                          <strong className="text-text-dark">{selectedWip ? failedRejectedKg.toFixed(2) : '—'} kg</strong>
                        </span>
                        {selectedPackSizeKg > 0 && Number.isFinite(quantityKg) && quantityKg >= 0 && (
                          <span>
                            Packs from this entry:{' '}
                            <strong className="text-text-dark">
                              {packCount}
                            </strong>
                            {remainderKg > 0 ? ` (+ ${remainderKg.toFixed(2)} kg remainder)` : ''}
                          </span>
                        )}
              </div>
            </div>
          )
        })()}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-olive-light/30 bg-olive-light/5 px-3 py-2">
                  <p className="text-xs text-text-dark/70">
                    Reuse remainder history from recent packing runs for this WIP to speed up entry.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openRemaindersModal}
                    disabled={saving || externalLoading || !packagingRun || !selectedWipForPackEntry}
                    className="border-olive-light/40"
                    title={!selectedWipForPackEntry ? 'Select WIP first to load matching remainder history.' : 'Load recent remainders'}
                  >
                    <History className="mr-2 h-4 w-4" />
                    Add Remainders
                  </Button>
                </div>
                {remainderPrefillSource && (
                  <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Prefilled from remainder #{remainderPrefillSource.id} · {remainderPrefillSource.process_code} ·{' '}
                    {remainderPrefillSource.process_name}
                    {remainderPrefillSource.lot_no ? ` · Lot ${remainderPrefillSource.lot_no}` : ''}
                    {' '}({remainderPrefillSource.remainder_kg.toFixed(2)} kg)
                  </div>
                )}
                {addedRemainderSources.length > 0 && (
                  <div className="mb-3 rounded-md border border-olive-light/40 bg-olive-light/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-dark/70">Added Remainders</p>
                      <p className="text-xs font-semibold text-text-dark">
                        Total added: {packEntryAdditionalRemainderKg.toFixed(2)} kg
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {addedRemainderSources.map((source) => (
                        <span
                          key={`added-remainder-${source.id}`}
                          className="inline-flex items-center rounded-full border border-olive-light/40 bg-white px-2.5 py-1 text-[11px] text-text-dark/80"
                        >
                          #{source.id} · {source.process_code}
                          {source.lot_no ? ` · Lot ${source.lot_no}` : ''}
                          {' '}· {source.remainder_kg.toFixed(2)} kg
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>WIP (sorted output) *</Label>
                    <select
                      value={packEntryForm.sorting_output_id}
                      onChange={(e) => setPackEntryForm({ ...packEntryForm, sorting_output_id: e.target.value })}
                      required
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select WIP</option>
                      {eligibleWipsForPacking.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.product_name} — {w.quantity_kg.toFixed(2)} kg
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Finished product being packed *</Label>
                    <Input
                      type="text"
                      readOnly
                      value={
                        autoSelectedFinishedProduct
                          ? `${autoSelectedFinishedProduct.name}${autoSelectedFinishedProduct.sku ? ` (${autoSelectedFinishedProduct.sku})` : ''}`
                          : selectedWipForPackEntry
                          ? 'No finished product mapped from composition'
                          : 'Select WIP first'
                      }
                      disabled={saving || externalLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Packet unit *</Label>
                    <select
                      value={packEntryForm.packet_unit_code}
                      onChange={(e) => {
                        const nextPacketUnitCode = e.target.value
                        packAvailabilityOverflowToastShownRef.current = false
                        setPackEntryForm({
                          ...packEntryForm,
                          packet_unit_code: nextPacketUnitCode,
                        })
                      }}
                      required
                      disabled={saving || externalLoading}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select packet unit</option>
                      {activePacketUnits.map((unit) => (
                        <option key={unit.code} value={unit.code}>
                          {unit.code} - {unit.name} ({Number(unit.net_weight_kg).toFixed(3)} kg)
                        </option>
                      ))}
                    </select>
                    {packEntryForm.packet_unit_code ? (
                      <p className="text-xs text-text-dark/70">
                        {opStockLoading
                          ? 'Checking OP pack stock...'
                          : !selectedPacketUnitForPackEntry?.operational_product_id
                          ? 'This packet unit is not mapped to an operational product.'
                          : `Available packs: ${selectedPacketUnitAvailablePacks}`}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity (kg) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={packEntryForm.quantity_kg}
                      onChange={e => {
                        const rawValue = e.target.value
                        if (!selectedWipForPackEntry || rawValue === '') {
                          packAvailabilityOverflowToastShownRef.current = false
                          setPackEntryForm({ ...packEntryForm, quantity_kg: rawValue })
                          return
                        }
                        const remainingKg = packEntryEffectiveLimitKg ?? 0
                        const numericValue = parseFloat(rawValue)
                        if (!Number.isNaN(numericValue) && numericValue > remainingKg) {
                          toast.error(`Quantity cannot exceed ${remainingKg.toFixed(2)} kg for this WIP (including added remainder)`)
                          setPackEntryForm({ ...packEntryForm, quantity_kg: String(remainingKg) })
                          return
                        }
                        if (selectedPacketUnitForPackEntry) {
                          const selectedPackSizeKg = Number(selectedPacketUnitForPackEntry.net_weight_kg) || 0
                          const requiredPacks =
                            selectedPackSizeKg > 0 && Number.isFinite(numericValue) && numericValue > 0
                              ? Math.floor(numericValue / selectedPackSizeKg)
                              : 0
                          if (requiredPacks > selectedPacketUnitAvailablePacks) {
                            if (!packAvailabilityOverflowToastShownRef.current) {
                              toast.error(
                                `Packs required (${requiredPacks}) cannot exceed available packs (${selectedPacketUnitAvailablePacks}).`
                              )
                              packAvailabilityOverflowToastShownRef.current = true
                            }
                          } else {
                            packAvailabilityOverflowToastShownRef.current = false
                          }
                        } else {
                          packAvailabilityOverflowToastShownRef.current = false
                        }
                        setPackEntryForm({ ...packEntryForm, quantity_kg: rawValue })
                      }}
                      required
                      disabled={saving || externalLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Packs (auto)</Label>
                    <Input
                      type="text"
                      readOnly
                      value={(() => {
                        const selectedPackSizeKg = Number(selectedPacketUnitForPackEntry?.net_weight_kg) || 0
                        const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                        if (selectedPackSizeKg <= 0 || !Number.isFinite(quantityKg) || quantityKg <= 0) return ''
                        return Math.floor(quantityKg / selectedPackSizeKg).toString()
                      })()}
                      disabled={saving || externalLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Remainder (kg, auto)</Label>
                    <Input
                      type="text"
                      readOnly
                      value={(() => {
                        const selectedPackSizeKg = Number(selectedPacketUnitForPackEntry?.net_weight_kg) || 0
                        const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                        if (selectedPackSizeKg <= 0 || !Number.isFinite(quantityKg) || quantityKg <= 0) return ''
                        const packCount = Math.floor(quantityKg / selectedPackSizeKg)
                        const remainderKg = Math.max(0, quantityKg - packCount * selectedPackSizeKg)
                        return remainderKg.toFixed(2)
                      })()}
                      disabled={saving || externalLoading}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button type="button" variant="outline" onClick={() => setShowPackEntryForm(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                    Add pack entry
                  </Button>
                </div>
              </form>
            )}
            {packEntries.length === 0 ? (
              <p className="text-sm text-text-dark/60">No pack entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {packEntries.map((pe) => {
                  const wip = sortedWips.find((w) => w.id === pe.sorting_output_id)
                  const finishedProduct = pe.product_id ? finishedProducts.find((p) => p.id === pe.product_id) : null
                  const packetUnitCode = pe.packet_unit_code || pe.pack_identifier
                  const packetUnit = packetUnitByCode.get(packetUnitCode)
                  const packSizeKg =
                    typeof pe.pack_size_kg === 'number' && pe.pack_size_kg > 0
                      ? pe.pack_size_kg
                      : Number(packetUnit?.net_weight_kg) || 0
                  const packCount =
                    typeof pe.pack_count === 'number'
                      ? pe.pack_count
                      : packSizeKg > 0
                      ? Math.floor(pe.quantity_kg / packSizeKg)
                      : null
                  const remainderKg =
                    typeof pe.remainder_kg === 'number'
                      ? pe.remainder_kg
                      : packSizeKg > 0
                      ? pe.quantity_kg - (packCount ?? 0) * packSizeKg
                      : null
                  return (
                    <li
                      key={pe.id}
                      className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-text-dark">
                        {wip?.product_name ?? `Output #${pe.sorting_output_id}`} → {finishedProduct?.name ?? (pe.product_id ? `Product #${pe.product_id}` : '—')}
                        {pe.packing_type ? ` [${pe.packing_type}]` : ''} — {packetUnitCode}: {pe.quantity_kg} kg
                        {pe.metal_check_status && (
                          <span className="ml-2 text-text-dark/70">
                            | Metal: {pe.metal_check_status} (attempts: {pe.metal_check_attempts ?? 0})
                          </span>
                        )}
                        {packCount !== null && (
                          <span className="text-text-dark/60">
                            {' '}({packCount} packs{remainderKg !== null && remainderKg > 0 ? ` + ${remainderKg.toFixed(2)} kg remainder` : ''})
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePackEntry(pe.id)}
                        disabled={saving || externalLoading}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {showMetalCheckModal && selectedMetalCheckWip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl">
            <h4 className="text-lg font-semibold text-text-dark">
              Metal Check - {selectedMetalCheckWip.product_name} ({selectedMetalCheckWip.quantity_kg.toFixed(2)} kg)
            </h4>
            <p className="mt-1 text-sm text-text-dark/70">
              Record FAIL/PASS attempts. Failed checks must include foreign object details and can be repeated until PASS.
            </p>

            <form onSubmit={handleMetalCheckSubmit} className="mt-4 space-y-4 rounded-lg border border-olive-light/30 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Attempt Status *</Label>
                  <select
                    value={metalCheckForm.status}
                    onChange={(e) =>
                      setMetalCheckForm((prev) => ({ ...prev, status: e.target.value as '' | 'PASS' | 'FAIL' }))
                    }
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                    disabled={saving || externalLoading}
                  >
                    {METAL_CHECK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value || 'empty'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Input
                    value={metalCheckForm.remarks}
                    onChange={(e) => setMetalCheckForm((prev) => ({ ...prev, remarks: e.target.value }))}
                    placeholder="Optional remarks"
                    disabled={saving || externalLoading}
                  />
                </div>
              </div>

              {metalCheckForm.status === 'FAIL' && (
                <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-amber-900">Foreign Object Rejections (required for FAIL)</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMetalRejectionRow}
                      disabled={saving || externalLoading}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add Row
                    </Button>
                  </div>
                  {metalRejectionsForm.map((row, index) => (
                    <div key={`metal-rejection-${index}`} className="grid gap-2 md:grid-cols-12">
                      <Input
                        className="md:col-span-4"
                        value={row.object_type}
                        onChange={(e) =>
                          setMetalRejectionsForm((prev) =>
                            prev.map((item, idx) => (idx === index ? { ...item, object_type: e.target.value } : item))
                          )
                        }
                        placeholder="Object type"
                        disabled={saving || externalLoading}
                      />
                      <Input
                        className="md:col-span-3"
                        type="number"
                        step="0.001"
                        min="0"
                        value={row.weight_kg}
                        onChange={(e) =>
                          setMetalRejectionsForm((prev) =>
                            prev.map((item, idx) => (idx === index ? { ...item, weight_kg: e.target.value } : item))
                          )
                        }
                        placeholder="Weight (kg)"
                        disabled={saving || externalLoading}
                      />
                      <Input
                        className="md:col-span-4"
                        value={row.corrective_action}
                        onChange={(e) =>
                          setMetalRejectionsForm((prev) =>
                            prev.map((item, idx) => (idx === index ? { ...item, corrective_action: e.target.value } : item))
                          )
                        }
                        placeholder="Corrective action"
                        disabled={saving || externalLoading}
                      />
                      <div className="md:col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMetalRejectionRow(index)}
                          disabled={saving || externalLoading || metalRejectionsForm.length <= 1}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeMetalCheckModal} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={saving || externalLoading}>
                  Record Attempt
                </Button>
              </div>
            </form>

            <div className="mt-4 space-y-2">
              <h5 className="text-sm font-semibold text-text-dark">Attempt History</h5>
              {(metalChecksBySortingOutput[selectedMetalCheckWip.id] || []).length === 0 ? (
                <p className="text-sm text-text-dark/60">No attempts recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...(metalChecksBySortingOutput[selectedMetalCheckWip.id] || [])]
                    .sort((a, b) => b.attempt_no - a.attempt_no)
                    .map((attempt: ProcessPackagingMetalCheck) => {
                      const enteredBy = attempt.checked_by ? userProfilesByAuthId[attempt.checked_by] || attempt.checked_by : 'Unknown'
                      return (
                        <div key={attempt.id} className="rounded-lg border border-olive-light/30 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="font-semibold text-text-dark">Attempt #{attempt.attempt_no}</span>
                            <span
                              className={
                                attempt.status === 'PASS'
                                  ? 'inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
                                  : 'inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700'
                              }
                            >
                              {attempt.status}
                            </span>
                            <span className="text-text-dark/60">By: {enteredBy}</span>
                            <span className="text-text-dark/60">{new Date(attempt.checked_at).toLocaleString()}</span>
                          </div>
                          {attempt.remarks && <p className="mt-1 text-sm text-text-dark/70">Remarks: {attempt.remarks}</p>}
                          {attempt.status === 'FAIL' && (attempt.rejections || []).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {(attempt.rejections || []).map((rejection) => (
                                <p key={rejection.id} className="text-xs text-text-dark/70">
                                  • {rejection.object_type}: {Number(rejection.weight_kg).toFixed(3)} kg
                                  {rejection.corrective_action ? ` | Action: ${rejection.corrective_action}` : ''}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showRemaindersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={remaindersModalRef}
            className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Add remainders"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-text-dark">Add Remainders</h4>
                <p className="mt-1 text-sm text-text-dark/70">
                  Recent remainder history for {selectedWipForPackEntry?.product_name ?? 'selected WIP'}.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={closeRemaindersModal}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2">
                <p className="text-xs text-text-dark/60">Total Candidate Remainder</p>
                <p className="text-sm font-semibold text-text-dark">{remainderTotalKg.toFixed(2)} kg</p>
              </div>
              <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2">
                <p className="text-xs text-text-dark/60">Entries</p>
                <p className="text-sm font-semibold text-text-dark">{filteredRemainderRows.length}</p>
              </div>
              <div className="rounded-md border border-olive-light/30 bg-olive-light/10 px-3 py-2">
                <p className="text-xs text-text-dark/60">Source Runs</p>
                <p className="text-sm font-semibold text-text-dark">{remainderSourceRuns}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-md border border-olive-light/30 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dark/50" />
                <Input
                  className="pl-8"
                  placeholder="Search product, packet unit, lot..."
                  value={remainderSearchTerm}
                  onChange={(event) => setRemainderSearchTerm(event.target.value)}
                  disabled={loadingRemainders}
                />
              </div>
              <div className="flex items-center gap-2">
                {[
                  { value: 'ALL' as const, label: 'All' },
                  { value: '7D' as const, label: 'Last 7 days' },
                  { value: '30D' as const, label: 'Last 30 days' },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={remainderDateFilter === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRemainderDateFilter(option.value)}
                    className={remainderDateFilter === option.value ? 'bg-olive hover:bg-olive-dark' : 'border-olive-light/40'}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {remaindersError && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{remaindersError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadRecentRemaindersForSelectedWip}
                    disabled={loadingRemainders}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-olive-light/30 bg-white">
              <div className="max-h-[320px] overflow-auto">
                {loadingRemainders ? (
                  <p className="px-4 py-6 text-sm text-text-dark/60">Loading recent remainders…</p>
                ) : filteredRemainderRows.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-text-dark/60">No recent remainders found for this WIP product.</p>
                ) : (
                  <table className="min-w-full divide-y divide-olive-light/20 text-sm">
                    <thead className="bg-olive-light/10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-dark/60">Pick</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-dark/60">Source</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-dark/60">Finished Product</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-text-dark/60">Packet Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-text-dark/60">Remainder (kg)</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-text-dark/60">Packed At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-olive-light/20">
                      {filteredRemainderRows.map((row) => (
                        (() => {
                          const isUsed = usedRemainderIds.has(row.id)
                          return (
                        <tr
                          key={row.id}
                          className={[
                            selectedRemainderId === String(row.id) ? 'bg-olive-light/5' : '',
                            isUsed ? 'opacity-60' : '',
                          ].join(' ')}
                          onClick={() => {
                            if (isUsed) return
                            setSelectedRemainderId(String(row.id))
                          }}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name="remainder_pick"
                              checked={selectedRemainderId === String(row.id)}
                              onChange={() => {
                                if (isUsed) return
                                setSelectedRemainderId(String(row.id))
                              }}
                              disabled={isUsed}
                              aria-label={`Select remainder ${row.id}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-text-dark">{row.process_name}</p>
                            <p className="text-xs text-text-dark/60">{row.process_code}{row.lot_no ? ` · Lot ${row.lot_no}` : ''}</p>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-text-dark">{row.finished_product_name}</p>
                            {row.finished_product_sku ? <p className="text-xs text-text-dark/60">{row.finished_product_sku}</p> : null}
                          </td>
                          <td className="px-3 py-2 text-text-dark/80">
                            {row.packet_unit_code ?? '—'}
                            {isUsed ? <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Used</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">{row.remainder_kg.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-text-dark/70">
                            {row.packed_at ? new Date(row.packed_at).toLocaleString() : '—'}
                          </td>
                        </tr>
                          )
                        })()
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeRemaindersModal}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-olive hover:bg-olive-dark"
                disabled={!selectedRemainderRow || loadingRemainders || (selectedRemainderRow ? usedRemainderIds.has(selectedRemainderRow.id) : false)}
                onClick={applySelectedRemainder}
              >
                Use Selected Remainder
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="order-3 grid gap-4 md:grid-cols-3">
          {/* Visual Inspection */}
          <div className="rounded-lg border border-olive-light/20 p-4">
            <h4 className="text-sm font-semibold text-text-dark mb-4">Visual Inspection</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="visual_status">Visual Status</Label>
                <select
                  id="visual_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.visual_status}
                  onChange={(e) => setFormData({ ...formData, visual_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {VISUAL_STATUS_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select status'}
                    </option>
                  ))}
                </select>
              </div>

              {showReworkDropdown && (
                <div className="space-y-2">
                  <Label htmlFor="rework_destination">Rework Destination</Label>
                  <select
                    id="rework_destination"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.rework_destination}
                    onChange={(e) => setFormData({ ...formData, rework_destination: e.target.value })}
                    disabled={saving || externalLoading}
                  >
                    <option value="">Select destination</option>
                    {REWORK_DESTINATIONS.map((dest) => (
                      <option key={dest} value={dest}>
                        {dest}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="pest_status">Pest Status</Label>
                <select
                  id="pest_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.pest_status}
                  onChange={(e) => setFormData({ ...formData, pest_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {PEST_STATUS_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select pest status'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="foreign_object_status">Foreign Object Status</Label>
                <select
                  id="foreign_object_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.foreign_object_status}
                  onChange={(e) => setFormData({ ...formData, foreign_object_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {FOREIGN_OBJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select status'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mould_status">Mould Status</Label>
                <select
                  id="mould_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.mould_status}
                  onChange={(e) => setFormData({ ...formData, mould_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {MOULD_STATUS_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select mould status'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Kernel Damage */}
          <div className="rounded-lg border border-olive-light/20 p-4">
            <h4 className="text-sm font-semibold text-text-dark mb-4">Kernel Damage</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="damaged_kernels_pct">Damaged Kernels (%)</Label>
                <select
                  id="damaged_kernels_pct"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.damaged_kernels_pct}
                  onChange={(e) => setFormData({ ...formData, damaged_kernels_pct: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {KERNEL_DAMAGE_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select %'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="insect_damaged_kernels_pct">Insect Damaged Kernels (%)</Label>
                <select
                  id="insect_damaged_kernels_pct"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.insect_damaged_kernels_pct}
                  onChange={(e) => setFormData({ ...formData, insect_damaged_kernels_pct: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {KERNEL_DAMAGE_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select %'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Nitrogen */}
          <div className="rounded-lg border border-olive-light/20 p-4">
            <h4 className="text-sm font-semibold text-text-dark mb-4">Nitrogen</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nitrogen_used">Nitrogen Used</Label>
                <select
                  id="nitrogen_used"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.nitrogen_used}
                  onChange={(e) => setFormData({ ...formData, nitrogen_used: e.target.value })}
                  disabled={saving || externalLoading}
                >
                  {NITROGEN_USED_OPTIONS.map((option) => (
                    <option key={option || 'empty'} value={option}>
                      {option || 'Select amount'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nitrogen_batch_number">Nitrogen Batch Number</Label>
                <Input
                  id="nitrogen_batch_number"
                  type="text"
                  value={formData.nitrogen_batch_number}
                  onChange={(e) => setFormData({ ...formData, nitrogen_batch_number: e.target.value })}
                  placeholder="Batch number"
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Packaging Details */}
        <div className="order-2 border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Packaging Details</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary_packaging_type">Primary Packaging Type</Label>
              <SearchableSelect
                id="primary_packaging_type"
                options={PRIMARY_PACKAGING_OPTIONS}
                value={formData.primary_packaging_type}
                onChange={(value) => setFormData({ ...formData, primary_packaging_type: value })}
                placeholder="Select primary packaging"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="primary_packaging_batch">Primary Packaging Batch</Label>
              <Input
                id="primary_packaging_batch"
                type="text"
                value={formData.primary_packaging_batch}
                onChange={(e) => setFormData({ ...formData, primary_packaging_batch: e.target.value })}
                placeholder="Batch number"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_packaging">Secondary Packaging</Label>
              <SearchableSelect
                id="secondary_packaging"
                options={SECONDARY_PACKAGING_OPTIONS}
                value={formData.secondary_packaging}
                onChange={(value) => setFormData({ ...formData, secondary_packaging: value })}
                placeholder="Select secondary packaging"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_packaging_type">Secondary Packaging Type</Label>
              <SearchableSelect
                id="secondary_packaging_type"
                options={SECONDARY_TYPE_OPTIONS}
                value={formData.secondary_packaging_type}
                onChange={(value) => setFormData({ ...formData, secondary_packaging_type: value })}
                placeholder="Select type"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_packaging_batch">Secondary Packaging Batch</Label>
              <Input
                id="secondary_packaging_batch"
                type="text"
                value={formData.secondary_packaging_batch}
                onChange={(e) => setFormData({ ...formData, secondary_packaging_batch: e.target.value })}
                placeholder="Batch number"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>
          </div>
        </div>

        {/* Quality Control Check */}
        <div className="order-4 border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Quality Control Check</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="label_correct">Label Correct</Label>
              <select
                id="label_correct"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.label_correct}
                onChange={(e) => setFormData({ ...formData, label_correct: e.target.value as '' | 'Yes' | 'No' | 'NA' })}
                disabled={saving || externalLoading}
              >
                {YES_NO_NA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label_legible">Label Legible</Label>
              <select
                id="label_legible"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.label_legible}
                onChange={(e) => setFormData({ ...formData, label_legible: e.target.value as '' | 'Yes' | 'No' | 'NA' })}
                disabled={saving || externalLoading}
              >
                {YES_NO_NA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pallet_integrity">Pallet Integrity</Label>
              <select
                id="pallet_integrity"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.pallet_integrity}
                onChange={(e) =>
                  setFormData({ ...formData, pallet_integrity: e.target.value as '' | 'Yes' | 'No' | 'NA' })
                }
                disabled={saving || externalLoading}
              >
                {YES_NO_NA_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Storage Allocation */}
        <div className="order-1 border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Storage Allocation</h4>
          <p className="text-xs text-text-dark/60 mb-3">
            Allocate packed entries into storage units (box, bag, shop packing) for shipment readiness.
          </p>

          {packEntries.length === 0 ? (
            <p className="text-sm text-text-dark/60">Add pack entries first before creating storage allocations.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="order-1 rounded-lg border border-olive-light/30 bg-white">
                <div className="border-b border-olive-light/20 px-4 py-2 text-xs text-text-dark/60">
                  Pack Entry Summary
                </div>
                <div className="divide-y divide-olive-light/20">
                  {packEntries.map((entry) => (
                    <div key={`summary-${entry.id}`} className="px-4 py-2 text-sm text-text-dark/80">
                      {(entry.packet_unit_code || entry.pack_identifier)}: produced {Number(entry.pack_count) || 0} packs · allocated {getAllocatedPacksByEntry(entry.id)} · remaining {getRemainingPackCountByEntry(entry.id)}
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleStorageAllocationSubmit} className="order-2 rounded-lg border border-olive-light/30 bg-white p-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Pack Entry *</Label>
                    <select
                      value={storageAllocationForm.pack_entry_id}
                      onChange={(e) => {
                        setStorageUnitsAutoPrefillEnabled(true)
                        setStorageAllocationForm((prev) => ({ ...prev, pack_entry_id: e.target.value }))
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                      disabled={saving || externalLoading}
                    >
                      <option value="">Select pack entry</option>
                      {packEntries
                        .filter((entry) => (Number(entry.pack_count) || 0) > 0)
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {(entry.packet_unit_code || entry.pack_identifier)} · {(Number(entry.pack_count) || 0)} packs · {getRemainingPackCountByEntry(entry.id)} remaining
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Storage Type *</Label>
                    <select
                      value={storageAllocationForm.storage_type}
                      onChange={(e) => {
                        setStorageUnitsAutoPrefillEnabled(true)
                        setStorageAllocationForm((prev) => ({
                          ...prev,
                          storage_type: e.target.value as '' | 'BOX' | 'SHOP_PACKING',
                          box_unit_code: e.target.value === 'BOX' ? prev.box_unit_code || '' : '',
                        }))
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                      disabled={saving || externalLoading}
                    >
                      {STORAGE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value || 'empty'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {storageAllocationForm.storage_type === 'BOX' && (
                    <div className="space-y-2">
                      <Label>Box unit *</Label>
                      <select
                        value={storageAllocationForm.box_unit_code || ''}
                        onChange={(e) => {
                          setStorageUnitsAutoPrefillEnabled(true)
                          setStorageAllocationForm((prev) => ({ ...prev, box_unit_code: e.target.value }))
                        }}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        required
                        disabled={saving || externalLoading}
                      >
                        <option value="">Select box unit</option>
                        {matchingBoxUnitsForSelectedPacket.map((boxUnit) => {
                          const rule = matchingRulesForSelectedPacket.find((item) => item.box_unit_id === boxUnit.id)
                          if (!rule) return null
                          return (
                            <option key={boxUnit.code} value={boxUnit.code}>
                              {boxUnit.code} - {boxUnit.name} ({rule.packets_per_box} packs/box)
                            </option>
                          )
                        })}
                      </select>
                      {selectedStoragePacketCode && matchingBoxUnitsForSelectedPacket.length === 0 ? (
                        <p className="text-xs text-red-600">No active box pack rule found for this packet unit.</p>
                      ) : null}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Units Count *</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={storageAllocationForm.units_count}
                      onChange={(e) => {
                        setStorageUnitsAutoPrefillEnabled(false)
                        setStorageAllocationForm((prev) => ({ ...prev, units_count: e.target.value }))
                      }}
                      required
                      disabled={saving || externalLoading}
                    />
                    <p className="text-xs text-text-dark/60">
                      Auto-calculated from available packs and rule. Edit to override.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Packs/Unit *</Label>
                    <Input
                      type="number"
                      value={computedPacksPerUnit > 0 ? String(computedPacksPerUnit) : ''}
                      readOnly
                      disabled={saving || externalLoading}
                    />
                    <p className="text-xs text-text-dark/60">Calculated from storage type and active box pack rule.</p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3 mt-4">
                  <div className="space-y-2">
                    <Label>Total Packs (computed)</Label>
                    <Input readOnly value={storageTotalPacksPreview > 0 ? String(storageTotalPacksPreview) : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>Total Quantity (kg)</Label>
                    <Input readOnly value={storageTotalKgPreview > 0 ? storageTotalKgPreview.toFixed(2) : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Input
                      value={storageAllocationForm.notes}
                      onChange={(e) => setStorageAllocationForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Optional notes"
                      disabled={saving || externalLoading}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  {editingStorageAllocationId && (
                    <Button type="button" variant="outline" onClick={resetStorageAllocationForm} disabled={saving}>
                      Cancel Edit
                    </Button>
                  )}
                  <Button type="submit" className="bg-olive hover:bg-olive-dark" disabled={saving || externalLoading}>
                    {editingStorageAllocationId ? 'Update Allocation' : 'Add Allocation'}
                  </Button>
                </div>
              </form>

              {storageAllocations.length === 0 ? (
                <p className="order-3 text-sm text-text-dark/60">No storage allocations recorded yet.</p>
              ) : (
                <ul className="order-3 space-y-2">
                  {storageAllocations.map((allocation) => {
                    const entry = packEntries.find((item) => item.id === allocation.pack_entry_id)
                    return (
                      <li key={allocation.id} className="rounded-lg border border-olive-light/30 bg-white px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-text-dark">
                            {allocation.storage_type} · {allocation.units_count} units · {allocation.packs_per_unit} packs/unit · {allocation.total_packs} packs · {Number(allocation.total_quantity_kg).toFixed(2)} kg
                            {allocation.storage_type === 'BOX' && allocation.box_unit_code ? ` · ${allocation.box_unit_code}` : ''}
                            {entry ? ` · ${entry.packet_unit_code || entry.pack_identifier}` : ''}
                            {allocation.notes ? ` · ${allocation.notes}` : ''}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => startEditStorageAllocation(allocation.id)} disabled={saving || externalLoading}>
                              Edit
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteStorageAllocation(allocation.id)} disabled={saving || externalLoading} className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Allergen Swab */}
        <div className="order-5 border-b border-olive-light/20 pb-4">
          <div className="space-y-2">
            <Label>Allergen Swab Result</Label>
            <div className="grid grid-cols-3 gap-3">
              <Button
                type="button"
                variant="default"
                onClick={() => setFormData({ ...formData, allergen_swab_result: 'Pass' })}
                disabled={
                  saving ||
                  externalLoading ||
                  (!!formData.allergen_swab_result && formData.allergen_swab_result !== 'Pass')
                }
                className={
                  formData.allergen_swab_result === 'Pass'
                    ? 'h-12 bg-emerald-600 text-white hover:bg-emerald-600 hover:scale-105 transition-transform ring-2 ring-emerald-300'
                    : formData.allergen_swab_result
                    ? 'h-12 bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'h-12 bg-emerald-500 text-white hover:bg-emerald-500 hover:scale-105 transition-transform'
                }
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Passed
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => setFormData({ ...formData, allergen_swab_result: 'Pending' })}
                disabled={
                  saving ||
                  externalLoading ||
                  (!!formData.allergen_swab_result && formData.allergen_swab_result !== 'Pending')
                }
                className={
                  formData.allergen_swab_result === 'Pending'
                    ? 'h-12 bg-orange-600 text-white hover:bg-orange-600 hover:scale-105 transition-transform ring-2 ring-orange-300'
                    : formData.allergen_swab_result
                    ? 'h-12 bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'h-12 bg-orange-500 text-white hover:bg-orange-500 hover:scale-105 transition-transform'
                }
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Pending
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => setFormData({ ...formData, allergen_swab_result: 'Fail' })}
                disabled={
                  saving ||
                  externalLoading ||
                  (!!formData.allergen_swab_result && formData.allergen_swab_result !== 'Fail')
                }
                className={
                  formData.allergen_swab_result === 'Fail'
                    ? 'h-12 bg-red-600 text-white hover:bg-red-600 hover:scale-105 transition-transform ring-2 ring-red-300'
                    : formData.allergen_swab_result
                    ? 'h-12 bg-gray-300 text-gray-600 cursor-not-allowed'
                    : 'h-12 bg-red-500 text-white hover:bg-red-500 hover:scale-105 transition-transform'
                }
              >
                <XCircle className="mr-2 h-4 w-4" />
                Failed
                </Button>
            </div>
          </div>
        </div>

        {/* Weight Verification */}
        <div className="order-6 border-t border-olive-light/20 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-dark">Weight Verification (4 checks required)</h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowWeightForm(!showWeightForm)}
              disabled={saving || externalLoading || !packagingRun || availableWeightCheckNumbers.length === 0}
              className="border-olive-light/30"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Weight Check
            </Button>
          </div>

          {showWeightForm && (
            <form onSubmit={handleWeightCheckSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="check_no">Check Number (1-4) *</Label>
                  <select
                    id="check_no"
                    value={weightCheckFormData.check_no}
                    onChange={(e) =>
                      setWeightCheckFormData({ ...weightCheckFormData, check_no: parseInt(e.target.value, 10) })
                    }
                    required
                    disabled={saving || externalLoading || availableWeightCheckNumbers.length === 0}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4].map((checkNo) => {
                      const isUsed = usedWeightCheckNumbers.has(checkNo)
                      return (
                        <option key={checkNo} value={checkNo} disabled={isUsed}>
                          Check {checkNo}{isUsed ? ' (Already recorded)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight_kg">Weight (kg) *</Label>
                  <Input
                    id="weight_kg"
                    type="number"
                    step="0.01"
                    min="0"
                    value={weightCheckFormData.weight_kg}
                    onChange={(e) => setWeightCheckFormData({ ...weightCheckFormData, weight_kg: e.target.value })}
                    placeholder="0.00"
                    required
                    disabled={saving || externalLoading}
                    className="bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowWeightForm(false)
                    setWeightCheckFormData({ check_no: firstAvailableWeightCheckNo, weight_kg: '' })
                  }}
                  disabled={saving || externalLoading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || externalLoading || availableWeightCheckNumbers.length === 0}
                  className="bg-olive hover:bg-olive-dark"
                >
                  Add Check
                </Button>
              </div>
            </form>
          )}

          {weightChecks.length === 0 ? (
            <p className="text-sm text-text-dark/60 py-4 text-center">No weight checks recorded yet</p>
          ) : (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((checkNo) => {
                const check = weightChecks.find((c) => c.check_no === checkNo)
                return (
                  <div
                    key={checkNo}
                    className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-text-dark">Check {checkNo}</span>
                      {check ? (
                        <span className="text-sm text-text-dark/70">{check.weight_kg} kg</span>
                      ) : (
                        <span className="text-xs text-text-dark/50 italic">Not recorded</span>
                      )}
                    </div>
                    {check && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteWeightCheck(check.id)}
                        disabled={saving || externalLoading}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Photos */}
        <div className="order-7 border-t border-olive-light/20 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-text-dark">Photos (up to 3: product, label, pallet)</h4>
            <div className="flex gap-2">
              {PHOTO_TYPES.map((type) => {
                const existing = photos.find((p) => p.photo_type === type.value)
                return (
                  <label
                    key={type.value}
                    className="flex items-center gap-2 rounded-md border border-olive-light/30 bg-white px-3 py-2 text-sm cursor-pointer hover:bg-olive-light/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="h-4 w-4" />
                    {type.label}
                    {existing && <span className="text-xs text-green-600">✓</span>}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={saving || externalLoading || !packagingRun || existing !== undefined}
                      className="hidden"
                    />
                  </label>
                )
              })}
            </div>
          </div>

          {photos.length === 0 ? (
            <p className="text-sm text-text-dark/60 py-4 text-center">No photos uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-text-dark capitalize">{photo.photo_type}</span>
                    <span className="text-xs text-text-dark/50">{photo.file_path}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeletePhoto(photo.id)}
                    disabled={saving || externalLoading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remarks */}
        <div className="order-8 space-y-2">
          <Label htmlFor="remarks">Remarks</Label>
          <textarea
            id="remarks"
            className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
            placeholder="Add any remarks or notes..."
            disabled={saving || externalLoading}
          />
        </div>
      </div>

      {/* Waste recording disabled for Packaging step per requirements */}

      <AlertDialog open={deleteAlertOpen} onOpenChange={(open) => { setDeleteAlertOpen(open); if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === 'weightCheck' && 'Delete weight check?'}
              {deleteTarget?.type === 'waste' && 'Delete waste record?'}
              {deleteTarget?.type === 'photo' && 'Delete photo?'}
              {deleteTarget?.type === 'packEntry' && 'Remove pack entry?'}
              {!deleteTarget && 'Delete?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'weightCheck' && 'Are you sure you want to delete this weight check?'}
              {deleteTarget?.type === 'waste' && 'Are you sure you want to delete this waste record?'}
              {deleteTarget?.type === 'photo' && 'Are you sure you want to delete this photo?'}
              {deleteTarget?.type === 'packEntry' && 'Remove this pack entry?'}
              {!deleteTarget && 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => performDelete()}
            >
              {deleteTarget?.type === 'packEntry' ? 'Remove' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
