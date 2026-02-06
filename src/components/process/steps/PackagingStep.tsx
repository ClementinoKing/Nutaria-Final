import { useState, FormEvent, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Plus, Trash2, Upload, Package as PackageIcon } from 'lucide-react'
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

interface PackagingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
}

const YES_NO_NA_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'NA', label: 'N/A' },
]

const REWORK_DESTINATIONS = ['Washing', 'Drying', 'Sorting']
const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']
const PACKING_TYPES = ['Vacuum packing', 'Bag packing', 'Shop packing'] as const
const PACK_SIZE_OPTIONS = [
  { value: '100 g', kg: 0.1 },
  { value: '200 g', kg: 0.2 },
  { value: '250 g', kg: 0.25 },
  { value: '500 g', kg: 0.5 },
  { value: '1 kg', kg: 1 },
  { value: '2 kg', kg: 2 },
  { value: '5 kg', kg: 5 },
  { value: '10 kg', kg: 10 },
  { value: '25 kg', kg: 25 },
] as const
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
const VISUAL_STATUS_OPTIONS = ['', 'Pass', 'Rework', 'Hold']
const PEST_STATUS_OPTIONS = ['', 'None', 'Minor', 'Major']
const FOREIGN_OBJECT_STATUS_OPTIONS = ['', 'None', 'Detected']
const MOULD_STATUS_OPTIONS = ['', 'None', 'Present']
const KERNEL_DAMAGE_OPTIONS = ['', '0', '0.5', '1', '2', '5', '10']
const NITROGEN_USED_OPTIONS = ['', '0', '0.25', '0.5', '1', '2', '3']
const STORAGE_TYPE_OPTIONS: Array<{ value: '' | 'BOX' | 'BAG' | 'SHOP_PACKING'; label: string }> = [
  { value: '', label: 'Select type' },
  { value: 'BOX', label: 'Box' },
  { value: 'BAG', label: 'Bag' },
  { value: 'SHOP_PACKING', label: 'Shop packing' },
]

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
    updateWeightCheck,
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
  const [loadingWips, setLoadingWips] = useState(false)
  const [showPackEntryForm, setShowPackEntryForm] = useState(false)
  const [packEntryForm, setPackEntryForm] = useState({
    sorting_output_id: '',
    product_id: '',
    packing_type: '',
    pack_identifier: '',
    quantity_kg: '',
  })
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
    units_count: '',
    packs_per_unit: '',
    notes: '',
  })
  const [editingStorageAllocationId, setEditingStorageAllocationId] = useState<number | null>(null)
  const [userProfilesByAuthId, setUserProfilesByAuthId] = useState<Record<string, string>>({})

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
        .select('id, name, sku')
        .eq('product_type', 'FINISHED')
        .order('name', { ascending: true })
      if (error) {
        setFinishedProducts([])
        return
      }
      setFinishedProducts((data as FinishedProductOption[]) ?? [])
    } catch {
      setFinishedProducts([])
    }
  }, [])

  useEffect(() => {
    loadSortedWips()
  }, [loadSortedWips])

  useEffect(() => {
    loadFinishedProducts()
  }, [loadFinishedProducts])

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
    }, 300)
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

    // Check if check_no already exists
    const existing = weightChecks.find((c) => c.check_no === weightCheckFormData.check_no)
    if (existing) {
      setSaving(true)
      try {
        await updateWeightCheck(existing.id, { weight_kg: weight })
        toast.success('Weight check updated')
      } catch (error) {
        console.error('Error updating weight check:', error)
        toast.error('Failed to update weight check')
      } finally {
        setSaving(false)
      }
    } else {
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
    }

    setWeightCheckFormData({ check_no: 1, weight_kg: '' })
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

  const selectedWipForPackEntry = useMemo(
    () => sortedWips.find((w) => String(w.id) === packEntryForm.sorting_output_id) ?? null,
    [sortedWips, packEntryForm.sorting_output_id]
  )
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
  const selectedStoragePackEntryId = Number(storageAllocationForm.pack_entry_id || 0)
  const selectedStoragePackEntry = packEntries.find((entry) => entry.id === selectedStoragePackEntryId) ?? null
  const storageTotalPacksPreview =
    (Number(storageAllocationForm.units_count) || 0) * (Number(storageAllocationForm.packs_per_unit) || 0)
  const storageTotalKgPreview =
    storageTotalPacksPreview * (Number(selectedStoragePackEntry?.pack_size_kg) || 0)

  useEffect(() => {
    if (!packEntryForm.sorting_output_id) return
    const selectedId = Number(packEntryForm.sorting_output_id)
    const stillEligible = eligibleWipsForPacking.some((w) => w.id === selectedId)
    if (!stillEligible) {
      setPackEntryForm((prev) => ({ ...prev, sorting_output_id: '', quantity_kg: '' }))
    }
  }, [eligibleWipsForPacking, packEntryForm.sorting_output_id])

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
    const selectedPackSize = PACK_SIZE_OPTIONS.find((size) => size.value === packEntryForm.pack_identifier.trim())
    const quantityKg = parseFloat(packEntryForm.quantity_kg)
    const selectedWip = sortedWips.find((w) => w.id === sortingOutputId)
    const failedRejectedKg = selectedWip ? getFailedRejectedWeightBySortingOutput(selectedWip.id) : 0
    const latestCheck = sortingOutputId ? getLatestMetalCheck(sortingOutputId) : null
    const remainingKg =
      selectedWipForPackEntry && selectedWipForPackEntry.id === sortingOutputId
        ? selectedWipRemainingKg ?? 0
        : selectedWip
        ? selectedWip.quantity_kg -
          failedRejectedKg -
          packEntries
            .filter((entry) => entry.sorting_output_id === selectedWip.id)
            .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
        : 0

    if (!sortingOutputId || !selectedPackSize || !Number.isFinite(quantityKg) || quantityKg <= 0) {
      toast.error('Select a WIP, pack size, and valid quantity')
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
    const packCount = Math.floor(quantityKg / selectedPackSize.kg)
    const remainderKg = Math.max(0, quantityKg - packCount * selectedPackSize.kg)
    setSaving(true)
    try {
      await addPackEntry({
        sorting_output_id: sortingOutputId,
        product_id: productId,
        pack_identifier: packEntryForm.pack_identifier.trim(),
        quantity_kg: quantityKg,
        packing_type: packEntryForm.packing_type.trim() || null,
        pack_size_kg: selectedPackSize.kg,
      })
      setPackEntryForm({
        sorting_output_id: '',
        product_id: '',
        packing_type: '',
        pack_identifier: '',
        quantity_kg: '',
      })
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
      units_count: '',
      packs_per_unit: '',
      notes: '',
    })
    setEditingStorageAllocationId(null)
  }

  const startEditStorageAllocation = (allocationId: number) => {
    const row = storageAllocations.find((item) => item.id === allocationId)
    if (!row) return
    setStorageAllocationForm({
      pack_entry_id: String(row.pack_entry_id),
      storage_type: row.storage_type,
      units_count: String(row.units_count),
      packs_per_unit: String(row.packs_per_unit),
      notes: row.notes || '',
    })
    setEditingStorageAllocationId(row.id)
  }

  const handleStorageAllocationSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const packEntryId = Number(storageAllocationForm.pack_entry_id)
    const unitsCount = Number(storageAllocationForm.units_count)
    const packsPerUnit = Number(storageAllocationForm.packs_per_unit)

    if (!packEntryId || !storageAllocationForm.storage_type) {
      toast.error('Select pack entry and storage type')
      return
    }
    if (!Number.isInteger(unitsCount) || unitsCount <= 0) {
      toast.error('Units count must be a whole number greater than 0')
      return
    }
    if (!Number.isInteger(packsPerUnit) || packsPerUnit <= 0) {
      toast.error('Packs per unit must be a whole number greater than 0')
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
          storage_type: storageAllocationForm.storage_type as 'BOX' | 'BAG' | 'SHOP_PACKING',
          units_count: unitsCount,
          packs_per_unit: packsPerUnit,
          notes: storageAllocationForm.notes || null,
        })
        toast.success('Storage allocation updated')
      } else {
        await addStorageAllocation({
          pack_entry_id: packEntryId,
          storage_type: storageAllocationForm.storage_type as 'BOX' | 'BAG' | 'SHOP_PACKING',
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
        <h4 className="text-sm font-semibold text-text-dark mb-2">Sorted WIPs to be packed</h4>
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
            {!hasEligibleWipsForPacking && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                Complete and pass metal checks for at least one sorted output before adding pack entries.
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
                  const selectedPackSize = PACK_SIZE_OPTIONS.find((size) => size.value === packEntryForm.pack_identifier)
                  const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                  const remainderKg =
                    selectedPackSize && Number.isFinite(quantityKg)
                      ? Math.max(0, quantityKg - Math.floor(quantityKg / selectedPackSize.kg) * selectedPackSize.kg)
                      : 0
                  const packCount =
                    selectedPackSize && Number.isFinite(quantityKg)
                      ? Math.floor(quantityKg / selectedPackSize.kg)
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
                          Metal rejects deducted:{' '}
                          <strong className="text-text-dark">{selectedWip ? failedRejectedKg.toFixed(2) : '—'} kg</strong>
                        </span>
                        {selectedPackSize && Number.isFinite(quantityKg) && quantityKg >= 0 && (
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
                    <SearchableSelect
                      options={finishedProducts.map((p) => ({
                        value: String(p.id),
                        label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                      }))}
                      value={packEntryForm.product_id}
                      onChange={(value) => setPackEntryForm({ ...packEntryForm, product_id: value })}
                      placeholder="Select finished product"
                      required
                      disabled={saving || externalLoading}
                      emptyMessage="No finished products found"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Packing type</Label>
                    <select
                      value={packEntryForm.packing_type}
                      onChange={(e) => setPackEntryForm({ ...packEntryForm, packing_type: e.target.value })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={saving || externalLoading}
                    >
                      <option value="">Select packing type</option>
                      {PACKING_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pack size *</Label>
                    <select
                      value={packEntryForm.pack_identifier}
                      onChange={(e) =>
                        setPackEntryForm({
                          ...packEntryForm,
                          pack_identifier: e.target.value,
                        })
                      }
                      required
                      disabled={saving || externalLoading}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select pack size</option>
                      {PACK_SIZE_OPTIONS.map((size) => (
                        <option key={size.value} value={size.value}>
                          {size.value}
                        </option>
                      ))}
                    </select>
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
                          setPackEntryForm({ ...packEntryForm, quantity_kg: rawValue })
                          return
                        }
                        const remainingKg = selectedWipRemainingKg ?? 0
                        const numericValue = parseFloat(rawValue)
                        if (!Number.isNaN(numericValue) && numericValue > remainingKg) {
                          toast.error(`Quantity cannot exceed remaining ${remainingKg.toFixed(2)} kg for this WIP`)
                          setPackEntryForm({ ...packEntryForm, quantity_kg: String(remainingKg) })
                          return
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
                        const selectedPackSize = PACK_SIZE_OPTIONS.find((size) => size.value === packEntryForm.pack_identifier)
                        const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                        if (!selectedPackSize || !Number.isFinite(quantityKg) || quantityKg <= 0) return ''
                        return Math.floor(quantityKg / selectedPackSize.kg).toString()
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
                        const selectedPackSize = PACK_SIZE_OPTIONS.find((size) => size.value === packEntryForm.pack_identifier)
                        const quantityKg = parseFloat(packEntryForm.quantity_kg || '0')
                        if (!selectedPackSize || !Number.isFinite(quantityKg) || quantityKg <= 0) return ''
                        const packCount = Math.floor(quantityKg / selectedPackSize.kg)
                        const remainderKg = Math.max(0, quantityKg - packCount * selectedPackSize.kg)
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
                  const packSize =
                    typeof pe.pack_size_kg === 'number'
                      ? { value: pe.pack_identifier, kg: pe.pack_size_kg }
                      : PACK_SIZE_OPTIONS.find((size) => size.value === pe.pack_identifier)
                  const packCount =
                    typeof pe.pack_count === 'number'
                      ? pe.pack_count
                      : packSize
                      ? Math.floor(pe.quantity_kg / packSize.kg)
                      : null
                  const remainderKg =
                    typeof pe.remainder_kg === 'number'
                      ? pe.remainder_kg
                      : packSize
                      ? pe.quantity_kg - (packCount ?? 0) * packSize.kg
                      : null
                  return (
                    <li
                      key={pe.id}
                      className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white px-3 py-2 text-sm"
                    >
                      <span className="text-text-dark">
                        {wip?.product_name ?? `Output #${pe.sorting_output_id}`} → {finishedProduct?.name ?? (pe.product_id ? `Product #${pe.product_id}` : '—')}
                        {pe.packing_type ? ` [${pe.packing_type}]` : ''} — {pe.pack_identifier}: {pe.quantity_kg} kg
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

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
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
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Packaging Details</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary_packaging_type">Primary Packaging Type</Label>
              <Input
                id="primary_packaging_type"
                type="text"
                value={formData.primary_packaging_type}
                onChange={(e) => setFormData({ ...formData, primary_packaging_type: e.target.value })}
                placeholder="e.g., Bag, Box"
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
              <Input
                id="secondary_packaging"
                type="text"
                value={formData.secondary_packaging}
                onChange={(e) => setFormData({ ...formData, secondary_packaging: e.target.value })}
                placeholder="e.g., Carton, Pallet"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_packaging_type">Secondary Packaging Type</Label>
              <Input
                id="secondary_packaging_type"
                type="text"
                value={formData.secondary_packaging_type}
                onChange={(e) => setFormData({ ...formData, secondary_packaging_type: e.target.value })}
                placeholder="Type"
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

        {/* Label and Pallet Checks */}
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Label and Pallet Checks</h4>
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
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Storage Allocation</h4>
          <p className="text-xs text-text-dark/60 mb-3">
            Allocate packed entries into storage units (box, bag, shop packing) for shipment readiness.
          </p>

          {packEntries.length === 0 ? (
            <p className="text-sm text-text-dark/60">Add pack entries first before creating storage allocations.</p>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleStorageAllocationSubmit} className="rounded-lg border border-olive-light/30 bg-white p-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-2 lg:col-span-2">
                    <Label>Pack Entry *</Label>
                    <select
                      value={storageAllocationForm.pack_entry_id}
                      onChange={(e) => setStorageAllocationForm((prev) => ({ ...prev, pack_entry_id: e.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                      disabled={saving || externalLoading}
                    >
                      <option value="">Select pack entry</option>
                      {packEntries
                        .filter((entry) => (Number(entry.pack_count) || 0) > 0)
                        .map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.pack_identifier} · {(Number(entry.pack_count) || 0)} packs · {getRemainingPackCountByEntry(entry.id)} remaining
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Storage Type *</Label>
                    <select
                      value={storageAllocationForm.storage_type}
                      onChange={(e) => setStorageAllocationForm((prev) => ({ ...prev, storage_type: e.target.value as '' | 'BOX' | 'BAG' | 'SHOP_PACKING' }))}
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
                  <div className="space-y-2">
                    <Label>Units Count *</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={storageAllocationForm.units_count}
                      onChange={(e) => setStorageAllocationForm((prev) => ({ ...prev, units_count: e.target.value }))}
                      required
                      disabled={saving || externalLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Packs/Unit *</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={storageAllocationForm.packs_per_unit}
                      onChange={(e) => setStorageAllocationForm((prev) => ({ ...prev, packs_per_unit: e.target.value }))}
                      required
                      disabled={saving || externalLoading}
                    />
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

              <div className="rounded-lg border border-olive-light/30 bg-white">
                <div className="border-b border-olive-light/20 px-4 py-2 text-xs text-text-dark/60">
                  Pack Entry Summary
                </div>
                <div className="divide-y divide-olive-light/20">
                  {packEntries.map((entry) => (
                    <div key={`summary-${entry.id}`} className="px-4 py-2 text-sm text-text-dark/80">
                      {entry.pack_identifier}: produced {Number(entry.pack_count) || 0} packs · allocated {getAllocatedPacksByEntry(entry.id)} · remaining {getRemainingPackCountByEntry(entry.id)}
                    </div>
                  ))}
                </div>
              </div>

              {storageAllocations.length === 0 ? (
                <p className="text-sm text-text-dark/60">No storage allocations recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {storageAllocations.map((allocation) => {
                    const entry = packEntries.find((item) => item.id === allocation.pack_entry_id)
                    return (
                      <li key={allocation.id} className="rounded-lg border border-olive-light/30 bg-white px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-text-dark">
                            {allocation.storage_type} · {allocation.units_count} units · {allocation.packs_per_unit} packs/unit · {allocation.total_packs} packs · {Number(allocation.total_quantity_kg).toFixed(2)} kg
                            {entry ? ` · ${entry.pack_identifier}` : ''}
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
        <div className="border-b border-olive-light/20 pb-4">
          <div className="space-y-2">
            <Label htmlFor="allergen_swab_result">Allergen Swab Result</Label>
            <Input
              id="allergen_swab_result"
              type="text"
              value={formData.allergen_swab_result}
              onChange={(e) => setFormData({ ...formData, allergen_swab_result: e.target.value })}
              placeholder="e.g., Pass, Fail, Pending"
              disabled={saving || externalLoading}
              className="bg-white"
            />
          </div>
        </div>

        {/* Remarks */}
        <div className="space-y-2">
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

      {/* Weight Verification */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text-dark">Weight Verification (4 checks required)</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowWeightForm(!showWeightForm)}
            disabled={saving || externalLoading || !packagingRun}
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
                <Input
                  id="check_no"
                  type="number"
                  min="1"
                  max="4"
                  value={weightCheckFormData.check_no}
                  onChange={(e) =>
                    setWeightCheckFormData({ ...weightCheckFormData, check_no: parseInt(e.target.value, 10) })
                  }
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
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
                  setWeightCheckFormData({ check_no: 1, weight_kg: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                {weightChecks.find((c) => c.check_no === weightCheckFormData.check_no) ? 'Update' : 'Add'} Check
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
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
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
