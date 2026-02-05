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
  PackagingFormData,
  PackagingWeightCheckFormData,
  PackagingWasteFormData,
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
    { type: 'weightCheck'; id: number } | { type: 'waste'; id: number } | { type: 'photo'; id: number } | { type: 'packEntry'; id: number } | null
  >(null)

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

  useEffect(() => {
    if (packagingRun) {
      setFormData({
        visual_status: packagingRun.visual_status || '',
        rework_destination: packagingRun.rework_destination || '',
        pest_status: packagingRun.pest_status || '',
        foreign_object_status: packagingRun.foreign_object_status || '',
        mould_status: packagingRun.mould_status || '',
        damaged_kernels_pct: packagingRun.damaged_kernels_pct?.toString() || '',
        insect_damaged_kernels_pct: packagingRun.insect_damaged_kernels_pct?.toString() || '',
        nitrogen_used: packagingRun.nitrogen_used?.toString() || '',
        nitrogen_batch_number: packagingRun.nitrogen_batch_number || '',
        primary_packaging_type: packagingRun.primary_packaging_type || '',
        primary_packaging_batch: packagingRun.primary_packaging_batch || '',
        secondary_packaging: packagingRun.secondary_packaging || '',
        secondary_packaging_type: packagingRun.secondary_packaging_type || '',
        secondary_packaging_batch: packagingRun.secondary_packaging_batch || '',
        label_correct: packagingRun.label_correct || '',
        label_legible: packagingRun.label_legible || '',
        pallet_integrity: packagingRun.pallet_integrity || '',
        allergen_swab_result: packagingRun.allergen_swab_result || '',
        remarks: packagingRun.remarks || '',
      })
      skipNextSaveRef.current = true
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
      performSavePackaging()
    }, 300)
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
        flushSavePackaging()
      }
    }
  }, [formData, flushSavePackaging])

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
  const selectedWipRemainingKg = useMemo(() => {
    if (!selectedWipForPackEntry) return null
    return Math.max(0, selectedWipForPackEntry.quantity_kg - selectedWipUsedKg)
  }, [selectedWipForPackEntry, selectedWipUsedKg])

  const handlePackEntrySubmit = async (e: FormEvent) => {
    e.preventDefault()
    const sortingOutputId = parseInt(packEntryForm.sorting_output_id, 10)
    const productId = packEntryForm.product_id ? parseInt(packEntryForm.product_id, 10) : null
    const selectedPackSize = PACK_SIZE_OPTIONS.find((size) => size.value === packEntryForm.pack_identifier.trim())
    const quantityKg = parseFloat(packEntryForm.quantity_kg)
    const selectedWip = sortedWips.find((w) => w.id === sortingOutputId)
    const remainingKg =
      selectedWipForPackEntry && selectedWipForPackEntry.id === sortingOutputId
        ? selectedWipRemainingKg ?? 0
        : selectedWip
        ? selectedWip.quantity_kg -
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
      toast.error('Failed to add pack entry')
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
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-light/20">
                {sortedWips.map((wip) => (
                  <tr key={wip.id}>
                    <td className="px-3 py-2">
                      <span className="font-medium text-text-dark">{wip.product_name}</span>
                      {wip.product_sku && <span className="ml-1 text-text-dark/60">({wip.product_sku})</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-text-dark/80">{wip.quantity_kg.toFixed(2)}</td>
                  </tr>
                ))}
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
                disabled={saving || externalLoading || !packagingRun}
                className="border-olive-light/30"
              >
                <PackageIcon className="mr-2 h-4 w-4" />
                Add pack entry
              </Button>
            </div>
            {showPackEntryForm && packagingRun && (
              <form onSubmit={handlePackEntrySubmit} className="rounded-lg border border-olive-light/30 bg-white p-4 mb-4">
                {(() => {
                  const selectedWip = sortedWips.find((w) => String(w.id) === packEntryForm.sorting_output_id)
                  const usedKg = selectedWip
                    ? packEntries
                        .filter((entry) => entry.sorting_output_id === selectedWip.id)
                        .reduce((sum, entry) => sum + (Number(entry.quantity_kg) || 0), 0)
                    : 0
                  const remainingKg = selectedWip ? Math.max(0, selectedWip.quantity_kg - usedKg) : 0
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
                          Remaining WIP:{' '}
                          <strong className="text-text-dark">
                            {selectedWip ? remainingKg.toFixed(2) : '—'} kg
                          </strong>
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
                      {sortedWips.map((w) => (
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

      <div className="space-y-4">
        {/* Visual Inspection */}
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Visual Inspection</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="visual_status">Visual Status</Label>
              <Input
                id="visual_status"
                type="text"
                value={formData.visual_status}
                onChange={(e) => setFormData({ ...formData, visual_status: e.target.value })}
                placeholder="e.g., Pass, Rework, Hold"
                disabled={saving || externalLoading}
                className="bg-white"
              />
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
              <Input
                id="pest_status"
                type="text"
                value={formData.pest_status}
                onChange={(e) => setFormData({ ...formData, pest_status: e.target.value })}
                placeholder="e.g., None, Minor, Major"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="foreign_object_status">Foreign Object Status</Label>
              <Input
                id="foreign_object_status"
                type="text"
                value={formData.foreign_object_status}
                onChange={(e) => setFormData({ ...formData, foreign_object_status: e.target.value })}
                placeholder="e.g., None, Detected"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mould_status">Mould Status</Label>
              <Input
                id="mould_status"
                type="text"
                value={formData.mould_status}
                onChange={(e) => setFormData({ ...formData, mould_status: e.target.value })}
                placeholder="e.g., None, Present"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>
          </div>
        </div>

        {/* Kernel Damage */}
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Kernel Damage</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="damaged_kernels_pct">Damaged Kernels (%)</Label>
              <Input
                id="damaged_kernels_pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.damaged_kernels_pct}
                onChange={(e) => setFormData({ ...formData, damaged_kernels_pct: e.target.value })}
                placeholder="0.00"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="insect_damaged_kernels_pct">Insect Damaged Kernels (%)</Label>
              <Input
                id="insect_damaged_kernels_pct"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.insect_damaged_kernels_pct}
                onChange={(e) => setFormData({ ...formData, insect_damaged_kernels_pct: e.target.value })}
                placeholder="0.00"
                disabled={saving || externalLoading}
                className="bg-white"
              />
            </div>
          </div>
        </div>

        {/* Nitrogen */}
        <div className="border-b border-olive-light/20 pb-4">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Nitrogen</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nitrogen_used">Nitrogen Used</Label>
              <Input
                id="nitrogen_used"
                type="number"
                step="0.01"
                min="0"
                value={formData.nitrogen_used}
                onChange={(e) => setFormData({ ...formData, nitrogen_used: e.target.value })}
                placeholder="0.00"
                disabled={saving || externalLoading}
                className="bg-white"
              />
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
