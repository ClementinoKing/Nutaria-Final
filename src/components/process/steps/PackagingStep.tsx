import { useState, FormEvent, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Save, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { usePackagingRun } from '@/hooks/usePackagingRun'
import { useSortingRun } from '@/hooks/useSortingRun'
import type {
  ProcessStepRun,
  PackagingFormData,
  PackagingWeightCheckFormData,
  PackagingWasteFormData,
  PackagingPackEntryFormData,
  ProcessSortingOutput,
} from '@/types/processExecution'

interface PackagingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
  availableQuantity?: {
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null
  onQuantityChange?: () => void
  sortingStepRunId?: number | null // Optional: ID of the sorting step run to fetch sorted WIPs
}

const YES_NO_NA_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Yes', label: 'Yes' },
  { value: 'No', label: 'No' },
  { value: 'NA', label: 'N/A' },
]

const VISUAL_STATUS_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Rework', label: 'Rework' },
  { value: 'Hold', label: 'Hold' },
]

const PEST_STATUS_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'None', label: 'None' },
  { value: 'Minor', label: 'Minor' },
  { value: 'Major', label: 'Major' },
]

const FOREIGN_OBJECT_STATUS_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'None', label: 'None' },
  { value: 'Detected', label: 'Detected' },
]

const MOULD_STATUS_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'None', label: 'None' },
  { value: 'Present', label: 'Present' },
]

const PRIMARY_PACKAGING_TYPE_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Bag', label: 'Bag' },
  { value: 'Box', label: 'Box' },
  { value: 'Pouch', label: 'Pouch' },
  { value: 'Container', label: 'Container' },
]

const SECONDARY_PACKAGING_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Carton', label: 'Carton' },
  { value: 'Pallet', label: 'Pallet' },
  { value: 'Crate', label: 'Crate' },
  { value: 'None', label: 'None' },
]

const ALLERGEN_SWAB_RESULT_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'Pass', label: 'Pass' },
  { value: 'Fail', label: 'Fail' },
  { value: 'Pending', label: 'Pending' },
]

const REWORK_DESTINATIONS = ['Washing', 'Drying', 'Sorting']
const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']
const PHOTO_TYPES: Array<{ value: 'product' | 'label' | 'pallet'; label: string }> = [
  { value: 'product', label: 'Product' },
  { value: 'label', label: 'Label' },
  { value: 'pallet', label: 'Pallet' },
]

export function PackagingStep({
  stepRun,
  loading: externalLoading = false,
  availableQuantity,
  onQuantityChange,
  sortingStepRunId,
}: PackagingStepProps) {
  const {
    packagingRun,
    weightChecks,
    photos,
    waste,
    packEntries,
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
    updatePackEntry,
    deletePackEntry,
  } = usePackagingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  // Use the useSortingRun hook to fetch sorted outputs if sortingStepRunId is provided
  // This is the best approach as it reuses existing hooks and avoids duplicate queries
  const {
    outputs: sortedOutputs,
    loading: loadingSortedOutputs,
  } = useSortingRun({
    stepRunId: sortingStepRunId ?? null,
    enabled: sortingStepRunId !== null && sortingStepRunId !== undefined,
  })

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

  const [packEntryFormData, setPackEntryFormData] = useState<PackagingPackEntryFormData>({
    sorting_output_id: '',
    pack_identifier: '',
    quantity_kg: '',
  })

  const [showWeightForm, setShowWeightForm] = useState(false)
  const [showWasteForm, setShowWasteForm] = useState(false)
  const [showPackEntryForm, setShowPackEntryForm] = useState(false)
  const [saving, setSaving] = useState(false)

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
    }
  }, [packagingRun])

  // Calculate available quantities for each sorted output
  // This is memoized to avoid recalculating on every render
  const getAvailableQuantity = useCallback((outputId: number) => {
    const output = sortedOutputs.find((o) => o.id === outputId)
    if (!output) return 0
    const usedQuantity = packEntries
      .filter((e) => e.sorting_output_id === outputId)
      .reduce((sum, e) => sum + e.quantity_kg, 0)
    return output.quantity_kg - usedQuantity
  }, [sortedOutputs, packEntries])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
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
      toast.success('Packaging data saved successfully')
    } catch (error) {
      console.error('Error saving packaging data:', error)
      toast.error('Failed to save packaging data')
    } finally {
      setSaving(false)
    }
  }

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
      onQuantityChange?.()
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

  const handleDeleteWeightCheck = async (checkId: number) => {
    if (!confirm('Are you sure you want to delete this weight check?')) {
      return
    }

    setSaving(true)
    try {
      await deleteWeightCheck(checkId)
      toast.success('Weight check deleted')
    } catch (error) {
      console.error('Error deleting weight check:', error)
      toast.error('Failed to delete weight check')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteWaste = async (wasteId: number) => {
    if (!confirm('Are you sure you want to delete this waste record?')) {
      return
    }

    setSaving(true)
    try {
      await deleteWaste(wasteId)
      toast.success('Waste record deleted')
      onQuantityChange?.()
    } catch (error) {
      console.error('Error deleting waste:', error)
      toast.error('Failed to delete waste record')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePhoto = async (photoId: number) => {
    if (!confirm('Are you sure you want to delete this photo?')) {
      return
    }

    setSaving(true)
    try {
      await deletePhoto(photoId)
      toast.success('Photo deleted')
    } catch (error) {
      console.error('Error deleting photo:', error)
      toast.error('Failed to delete photo')
    } finally {
      setSaving(false)
    }
  }

  const handlePackEntrySubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!packEntryFormData.sorting_output_id.trim()) {
      toast.error('Please select a sorted WIP')
      return
    }

    if (!packEntryFormData.pack_identifier.trim()) {
      toast.error('Please enter a pack identifier')
      return
    }

    const quantity = parseFloat(packEntryFormData.quantity_kg)
    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    // Check if quantity exceeds available quantity for this sorted output
    const selectedOutput = sortedOutputs.find(
      (o) => o.id.toString() === packEntryFormData.sorting_output_id
    )
    if (selectedOutput) {
      const usedQuantity = packEntries
        .filter((e) => e.sorting_output_id === selectedOutput.id)
        .reduce((sum, e) => sum + e.quantity_kg, 0)
      const availableQty = selectedOutput.quantity_kg - usedQuantity

      if (quantity > availableQty) {
        toast.error(
          `Quantity exceeds available. Available: ${availableQty.toFixed(2)} kg, Attempted: ${quantity.toFixed(2)} kg`
        )
        return
      }
    }

    setSaving(true)
    try {
      await addPackEntry({
        sorting_output_id: parseInt(packEntryFormData.sorting_output_id, 10),
        pack_identifier: packEntryFormData.pack_identifier.trim(),
        quantity_kg: quantity,
      })
      setPackEntryFormData({ sorting_output_id: '', pack_identifier: '', quantity_kg: '' })
      setShowPackEntryForm(false)
      toast.success('Pack entry added')
    } catch (error) {
      console.error('Error adding pack entry:', error)
      toast.error('Failed to add pack entry')
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePackEntry = async (entryId: number) => {
    if (!confirm('Are you sure you want to delete this pack entry?')) {
      return
    }

    setSaving(true)
    try {
      await deletePackEntry(entryId)
      toast.success('Pack entry deleted')
    } catch (error) {
      console.error('Error deleting pack entry:', error)
      toast.error('Failed to delete pack entry')
    } finally {
      setSaving(false)
    }
  }

  const showReworkDropdown = formData.visual_status?.toLowerCase().includes('rework')
  const totalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Sorted WIPs Section - at top for quick access */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Sorted WIPs Available</h4>
            <p className="text-xs text-text-dark/60 mt-1">
              WIPs from the sorting step that can be packaged
            </p>
          </div>
          {sortedOutputs.length > 0 && (
            <span className="text-xs font-medium text-olive-dark bg-olive-light/20 px-2 py-1 rounded">
              {sortedOutputs.length} {sortedOutputs.length === 1 ? 'product' : 'products'}
            </span>
          )}
        </div>

        {loadingSortedOutputs ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 border-2 border-olive border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-text-dark/60">Loading sorted WIPs...</p>
            </div>
          </div>
        ) : sortedOutputs.length === 0 ? (
          <div className="rounded-lg border border-olive-light/30 bg-olive-light/5 p-6 text-center">
            <p className="text-sm text-text-dark/60 mb-1">No sorted WIPs available</p>
            <p className="text-xs text-text-dark/50">
              Please complete the sorting step first to add sorted products here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedOutputs.map((output) => {
              const availableQty = getAvailableQuantity(output.id)
              const usedQty = output.quantity_kg - availableQty
              const isLowStock = availableQty > 0 && availableQty < output.quantity_kg * 0.2
              return (
                <div
                  key={output.id}
                  className="rounded-lg border border-olive-light/30 bg-white p-4 transition-all hover:shadow-md hover:border-olive-light/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-text-dark">
                          {output.product?.name || `Product #${output.product_id}`}
                        </span>
                        {output.product?.sku && (
                          <span className="text-xs text-text-dark/50 bg-olive-light/10 px-2 py-0.5 rounded">
                            {output.product.sku}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-text-dark/50 block mb-0.5">Total</span>
                          <span className="text-sm font-medium text-text-dark">{output.quantity_kg.toFixed(2)} kg</span>
                        </div>
                        <div>
                          <span className="text-text-dark/50 block mb-0.5">Used</span>
                          <span className={`text-sm font-medium ${usedQty > 0 ? 'text-olive-dark' : 'text-text-dark/50'}`}>
                            {usedQty.toFixed(2)} kg
                          </span>
                        </div>
                        <div>
                          <span className="text-text-dark/50 block mb-0.5">Available</span>
                          <span
                            className={`text-sm font-semibold ${
                              availableQty > 0
                                ? isLowStock
                                  ? 'text-orange-600'
                                  : 'text-olive-dark'
                                : availableQty === 0
                                ? 'text-text-dark/50'
                                : 'text-red-600'
                            }`}
                          >
                            {availableQty.toFixed(2)} kg
                          </span>
                        </div>
                      </div>
                      {availableQty === 0 && (
                        <div className="mt-2 text-xs text-text-dark/50 italic">
                          All quantity has been allocated to packs
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pack Entries Section - at top for quick access */}
      <div className="border-t border-olive-light/20 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Pack Entries</h4>
            <p className="text-xs text-text-dark/60 mt-1">
              Track how much quantity of each sorted WIP went into which packs
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPackEntryForm(!showPackEntryForm)}
            disabled={saving || externalLoading || sortedOutputs.length === 0}
            className="border-olive-light/30 transition-all hover:bg-olive-light/10 hover:border-olive disabled:opacity-50"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Pack Entry
          </Button>
        </div>

        {showPackEntryForm && (
          <form onSubmit={handlePackEntrySubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4 animate-in slide-in-from-top-2 duration-200">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pack_entry_sorting_output">Sorted WIP *</Label>
                <select
                  id="pack_entry_sorting_output"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={packEntryFormData.sorting_output_id}
                  onChange={(e) =>
                    setPackEntryFormData({ ...packEntryFormData, sorting_output_id: e.target.value })
                  }
                  required
                  disabled={saving || externalLoading}
                >
                  <option value="">Select sorted WIP</option>
                  {sortedOutputs.map((output) => {
                    const availableQty = getAvailableQuantity(output.id)
                    return (
                      <option
                        key={output.id}
                        value={output.id}
                        disabled={availableQty <= 0}
                      >
                        {output.product?.name || `Product #${output.product_id}`} - Available: {availableQty.toFixed(2)} kg
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pack_entry_identifier">Pack Identifier *</Label>
                <Input
                  id="pack_entry_identifier"
                  type="text"
                  value={packEntryFormData.pack_identifier}
                  onChange={(e) =>
                    setPackEntryFormData({ ...packEntryFormData, pack_identifier: e.target.value })
                  }
                  placeholder="e.g., Pack-001, Box-A1"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pack_entry_quantity">
                  Quantity (kg) *
                  {packEntryFormData.sorting_output_id && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {getAvailableQuantity(parseInt(packEntryFormData.sorting_output_id, 10)).toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="pack_entry_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={
                    packEntryFormData.sorting_output_id
                      ? getAvailableQuantity(parseInt(packEntryFormData.sorting_output_id, 10))
                      : undefined
                  }
                  value={packEntryFormData.quantity_kg}
                  onChange={(e) =>
                    setPackEntryFormData({ ...packEntryFormData, quantity_kg: e.target.value })
                  }
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPackEntryForm(false)
                  setPackEntryFormData({ sorting_output_id: '', pack_identifier: '', quantity_kg: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                Add Pack Entry
              </Button>
            </div>
          </form>
        )}

        {packEntries.length === 0 ? (
          <div className="rounded-lg border border-olive-light/30 bg-olive-light/5 p-6 text-center">
            <p className="text-sm text-text-dark/60">No pack entries recorded yet</p>
            <p className="text-xs text-text-dark/50 mt-1">
              Click "Add Pack Entry" to start tracking packs
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {packEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-4 transition-all hover:shadow-md hover:border-olive-light/50"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-text-dark">
                        {entry.sorting_output?.product?.name || `Product #${entry.sorting_output?.product_id || 'N/A'}`}
                      </span>
                      <span className="text-xs text-text-dark/40">→</span>
                      <span className="text-sm font-semibold text-olive-dark bg-olive-light/20 px-2 py-0.5 rounded">
                        {entry.pack_identifier}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="text-sm text-text-dark/70 font-medium">{entry.quantity_kg.toFixed(2)} kg</span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeletePackEntry(entry.id)}
                  disabled={saving || externalLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 transition-all flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Quantity Info */}
      {availableQuantity && (
        <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4 transition-all hover:shadow-md">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Quantity</p>
              <p className="text-base font-semibold text-text-dark">
                {availableQuantity.availableQty.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Waste Recorded</p>
              <p className="text-base font-semibold text-text-dark">{totalWaste.toFixed(2)} kg</p>
            </div>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visual Inspection */}
        <div className="border-b border-olive-light/20 pb-6 transition-all">
          <h4 className="text-sm font-semibold text-text-dark mb-4">Visual Inspection</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="visual_status">Visual Status</Label>
              <select
                id="visual_status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={formData.visual_status}
                onChange={(e) => setFormData({ ...formData, visual_status: e.target.value })}
                disabled={saving || externalLoading}
              >
                {VISUAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.pest_status}
                  onChange={(e) => setFormData({ ...formData, pest_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                {PEST_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="foreign_object_status">Foreign Object Status</Label>
                <select
                  id="foreign_object_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.foreign_object_status}
                  onChange={(e) => setFormData({ ...formData, foreign_object_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                {FOREIGN_OBJECT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mould_status">Mould Status</Label>
                <select
                  id="mould_status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={formData.mould_status}
                  onChange={(e) => setFormData({ ...formData, mould_status: e.target.value })}
                  disabled={saving || externalLoading}
                >
                {MOULD_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <select
                id="primary_packaging_type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={formData.primary_packaging_type}
                onChange={(e) => setFormData({ ...formData, primary_packaging_type: e.target.value })}
                disabled={saving || externalLoading}
              >
                {PRIMARY_PACKAGING_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_packaging">Secondary Packaging</Label>
              <select
                id="secondary_packaging"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={formData.secondary_packaging}
                onChange={(e) => setFormData({ ...formData, secondary_packaging: e.target.value })}
                disabled={saving || externalLoading}
              >
                {SECONDARY_PACKAGING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <select
                id="allergen_swab_result"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                value={formData.allergen_swab_result}
                onChange={(e) => setFormData({ ...formData, allergen_swab_result: e.target.value })}
                disabled={saving || externalLoading}
              >
              {ALLERGEN_SWAB_RESULT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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

        <div className="flex justify-end pt-2">
          <Button 
            type="submit" 
            disabled={saving || externalLoading || loading} 
            className="bg-olive hover:bg-olive-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px]"
          >
            {saving ? (
              <>
                <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Packaging Data
              </>
            )}
          </Button>
        </div>
      </form>

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
          <form onSubmit={handleWeightCheckSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4 animate-in slide-in-from-top-2 duration-200">
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
                  className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Waste Section */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-text-dark">Waste Records</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowWasteForm(!showWasteForm)}
            disabled={saving || externalLoading || !packagingRun}
            className="border-olive-light/30"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Waste
          </Button>
        </div>

        {showWasteForm && (
          <form onSubmit={handleWasteSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="waste_type">Waste Type *</Label>
                <select
                  id="waste_type"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={wasteFormData.waste_type}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, waste_type: e.target.value })}
                  required
                  disabled={saving || externalLoading}
                >
                  <option value="">Select type</option>
                  {WASTE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="waste_quantity">Quantity (kg) *</Label>
                <Input
                  id="waste_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={wasteFormData.quantity_kg}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, quantity_kg: e.target.value })}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white transition-all hover:border-olive-light focus:border-olive focus:ring-2 focus:ring-olive/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowWasteForm(false)
                  setWasteFormData({ waste_type: '', quantity_kg: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                Add Waste
              </Button>
            </div>
          </form>
        )}

        {waste.length === 0 ? (
          <p className="text-sm text-text-dark/60 py-4 text-center">No waste records yet</p>
        ) : (
          <div className="space-y-2">
            {waste.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-text-dark">{w.waste_type}</span>
                  <span className="text-sm text-text-dark/70">{w.quantity_kg} kg</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteWaste(w.id)}
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
    </div>
  )
}
