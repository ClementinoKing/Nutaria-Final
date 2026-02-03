import { useState, FormEvent, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Save, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useSortingRun } from '@/hooks/useSortingRun'
import { useAuth } from '@/context/AuthContext'
import { createReworkedLot } from '@/lib/processExecution'
import type { ProcessStepRun, SortingOutputFormData, SortingWasteFormData } from '@/types/processExecution'

interface SortingStepProps {
  stepRun: ProcessStepRun
  loading?: boolean
  availableQuantity?: {
    availableQty: number
    initialQty: number
    totalWaste: number
  } | null
  onQuantityChange?: () => void
}

const WASTE_TYPES = ['Final Product Waste', 'Dust', 'Floor Sweepings']

export function SortingStep({
  stepRun,
  loading: externalLoading = false,
  availableQuantity,
  onQuantityChange,
}: SortingStepProps) {
  const { outputs, waste, loading, addOutput, updateOutput, deleteOutput, addWaste, deleteWaste } = useSortingRun({
    stepRunId: stepRun.id,
    enabled: true,
  })

  const [products, setProducts] = useState<Array<{ id: number; name: string; sku: string | null }>>([])
  const [outputFormData, setOutputFormData] = useState<SortingOutputFormData>({
    product_id: '',
    quantity_kg: '',
    moisture_percent: '',
    remarks: '',
  })

  const [wasteFormData, setWasteFormData] = useState<SortingWasteFormData>({
    waste_type: '',
    quantity_kg: '',
  })

  const [showOutputForm, setShowOutputForm] = useState(false)
  const [showWasteForm, setShowWasteForm] = useState(false)
  const [showReworkForm, setShowReworkForm] = useState(false)
  const [editingOutputId, setEditingOutputId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const { user } = useAuth()
  
  const [reworkFormData, setReworkFormData] = useState<{
    quantity_kg: string
    reason: string
  }>({
    quantity_kg: '',
    reason: '',
  })

  const [reworks, setReworks] = useState<Array<{ id: number; quantity_kg: number; reason: string | null; created_at: string }>>([])
  const [loadingReworks, setLoadingReworks] = useState(false)

  useEffect(() => {
    // Fetch only Work In Progress (WIP) products
    supabase
      .from('products')
      .select('id, name, sku')
      .eq('status', 'ACTIVE')
      .eq('product_type', 'WIP')
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setProducts(data as Array<{ id: number; name: string; sku: string | null }>)
        }
      })
  }, [])

  // Fetch reworks for this step run
  useEffect(() => {
    const fetchReworks = async () => {
      if (!stepRun?.id) {
        setReworks([])
        return
      }

      setLoadingReworks(true)
      try {
        const { data, error } = await supabase
          .from('reworked_lots')
          .select('id, quantity_kg, reason, created_at')
          .eq('process_step_run_id', stepRun.id)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error fetching reworks:', error)
          setReworks([])
        } else {
          setReworks((data || []) as Array<{ id: number; quantity_kg: number; reason: string | null; created_at: string }>)
        }
      } catch (error) {
        console.error('Error fetching reworks:', error)
        setReworks([])
      } finally {
        setLoadingReworks(false)
      }
    }

    fetchReworks()
  }, [stepRun?.id, onQuantityChange])

  const handleOutputSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const productId = parseInt(outputFormData.product_id, 10)
    const quantity = parseFloat(outputFormData.quantity_kg)
    const moisture = outputFormData.moisture_percent ? parseFloat(outputFormData.moisture_percent) : null

    if (isNaN(productId) || productId <= 0) {
      toast.error('Please select a product')
      return
    }

    if (isNaN(quantity) || quantity <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    if (!availableQuantity) {
      toast.error('Available quantity is not set. Cannot add or edit outputs until it is loaded.')
      return
    }

    setSaving(true)
    try {
      if (editingOutputId) {
      // Validate: outputs must not exceed available (reworks and waste come after)
      const currentTotalOutput = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
      const editingOutput = outputs.find((o) => o.id === editingOutputId)
      const currentEditingQty = editingOutput?.quantity_kg || 0
      const newTotalOutput = currentTotalOutput - currentEditingQty + quantity

      if (newTotalOutput > availableQuantity.availableQty) {
        toast.error(
          `Total outputs cannot exceed available quantity. Available: ${availableQuantity.availableQty.toFixed(2)} kg, Attempted: ${newTotalOutput.toFixed(2)} kg`
        )
        setSaving(false)
        return
      }

      await updateOutput(editingOutputId, {
        product_id: productId,
        quantity_kg: quantity,
        moisture_percent: moisture,
        remarks: outputFormData.remarks.trim() || null,
      })
      toast.success('Output updated')
      onQuantityChange?.()
      } else {
      // Validate: outputs must not exceed available (reworks and waste come after)
      const currentTotalOutput = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
      const newTotalOutput = currentTotalOutput + quantity

      if (newTotalOutput > availableQuantity.availableQty) {
        toast.error(
          `Total outputs cannot exceed available quantity. Available: ${availableQuantity.availableQty.toFixed(2)} kg, Attempted: ${newTotalOutput.toFixed(2)} kg`
        )
        setSaving(false)
        return
      }

      await addOutput({
        product_id: productId,
        quantity_kg: quantity,
        moisture_percent: moisture,
        remarks: outputFormData.remarks.trim() || null,
      })
      toast.success('Output added')
      onQuantityChange?.()
      }
      setOutputFormData({ product_id: '', quantity_kg: '', moisture_percent: '', remarks: '' })
      setShowOutputForm(false)
      setEditingOutputId(null)
    } catch (error) {
      console.error('Error saving output:', error)
      toast.error('Failed to save output')
    } finally {
      setSaving(false)
    }
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

    // Find first output to link waste to
    if (outputs.length === 0) {
      toast.error('Please add at least one output before adding waste')
      return
    }

    if (!availableQuantity) {
      toast.error('Available quantity is not set. Cannot add waste until it is loaded.')
      return
    }

    // Validate: waste comes after outputs and reworks
    // Remaining after outputs and reworks must be >= waste quantity
    const currentTotalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
    const newTotalWaste = currentTotalWaste + quantity

    if (remainingAfterReworks === null || newTotalWaste > remainingAfterReworks) {
      toast.error(
        `Total waste cannot exceed remaining quantity after outputs and reworks. Remaining: ${remainingAfterReworks?.toFixed(2) || 0} kg, Attempted: ${newTotalWaste.toFixed(2)} kg`
      )
      return
    }

    setSaving(true)
    try {
      await addWaste({
        sorting_run_id: outputs[0].id,
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

  const handleEditOutput = (outputId: number) => {
    const output = outputs.find((o) => o.id === outputId)
    if (output) {
      setOutputFormData({
        product_id: output.product_id.toString(),
        quantity_kg: output.quantity_kg.toString(),
        moisture_percent: output.moisture_percent?.toString() || '',
        remarks: output.remarks || '',
      })
      setEditingOutputId(outputId)
      setShowOutputForm(true)
    }
  }

  // Get products that are not already selected (excluding the one being edited)
  const availableProducts = useMemo(() => {
    const selectedProductIds = outputs
      .filter((output) => output.id !== editingOutputId) // Exclude the product being edited
      .map((output) => output.product_id)
    
    return products.filter((product) => !selectedProductIds.includes(product.id))
  }, [products, outputs, editingOutputId])

  const handleDeleteOutput = async (outputId: number) => {
    if (!confirm('Are you sure you want to delete this output?')) {
      return
    }

    setSaving(true)
    try {
      await deleteOutput(outputId)
      toast.success('Output deleted')
      onQuantityChange?.()
    } catch (error) {
      console.error('Error deleting output:', error)
      toast.error('Failed to delete output')
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

  const handleReworkSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const quantityKg = parseFloat(reworkFormData.quantity_kg)

    if (isNaN(quantityKg) || quantityKg <= 0) {
      toast.error('Please enter a valid quantity')
      return
    }

    if (!availableQuantity) {
      toast.error('Available quantity is not set. Cannot create rework until it is loaded.')
      return
    }

    // Validate: reworks come after sorting outputs
    // Remaining after outputs must be >= rework quantity
    if (remainingAfterOutputs === null || quantityKg > remainingAfterOutputs) {
      toast.error(`Rework quantity cannot exceed remaining quantity after sorting outputs (${remainingAfterOutputs?.toFixed(2) || 0} kg)`)
      return
    }

    if (!user?.id) {
      toast.error('You must be logged in to create a rework')
      return
    }

    if (!stepRun?.id) {
      toast.error('Step run not found')
      return
    }

    setSaving(true)
    try {
      const result = await createReworkedLot(
        stepRun.id,
        quantityKg,
        reworkFormData.reason.trim() || null,
        user.id
      )
      
      toast.success(`Rework created successfully. New lot created.`)
      setReworkFormData({ quantity_kg: '', reason: '' })
      setShowReworkForm(false)
      onQuantityChange?.()
    } catch (error) {
      console.error('Error creating rework:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create rework'
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const totalOutputQuantity = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
  const totalReworkQuantity = reworks.reduce((sum, r) => sum + r.quantity_kg, 0)
  const totalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
  
  // Calculate remaining quantities in order: outputs → reworks → waste
  // Available quantity = supply - previous waste (from calculateAvailableQuantity)
  // This excludes sorting waste and reworks, which are handled within this step
  const remainingAfterOutputs = availableQuantity ? availableQuantity.availableQty - totalOutputQuantity : null
  const remainingAfterReworks = remainingAfterOutputs !== null ? remainingAfterOutputs - totalReworkQuantity : null
  const remainingAfterWaste = remainingAfterReworks !== null ? remainingAfterReworks - totalWaste : null
  
  // When adding: max = remainingAfterOutputs. When editing: max = remainingAfterOutputs + current row's qty (we're replacing it).
  const editingOutputQty = editingOutputId ? (outputs.find((o) => o.id === editingOutputId)?.quantity_kg ?? 0) : 0
  const maxQtyForOutput =
    availableQuantity && remainingAfterOutputs !== null ? Math.max(0, remainingAfterOutputs + editingOutputQty) : null
  const maxQtyForRework = remainingAfterOutputs !== null ? Math.max(0, remainingAfterOutputs) : null
  const maxQtyForWaste = remainingAfterReworks !== null ? Math.max(0, remainingAfterReworks) : null
  
  // Alias for backward compatibility in forms
  const remainingQty = remainingAfterOutputs // For output form
  const maxQtyForEntry = maxQtyForOutput // For output form

  return (
    <div className="space-y-6">
      {/* Available Quantity Info */}
      {availableQuantity && (
        <div className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Available Quantity</p>
              <p className="text-base font-semibold text-text-dark">
                {availableQuantity.availableQty.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Outputs</p>
              <p className="text-base font-semibold text-text-dark">
                {totalOutputQuantity.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Reworks</p>
              <p className="text-base font-semibold text-text-dark">
                {totalReworkQuantity.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Waste</p>
              <p className="text-base font-semibold text-text-dark">
                {totalWaste.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Remaining</p>
              <p
                className={`text-base font-semibold ${
                  remainingAfterWaste !== null && remainingAfterWaste < 0
                    ? 'text-red-600'
                    : remainingAfterWaste !== null && remainingAfterWaste < 10
                    ? 'text-orange-600'
                    : 'text-text-dark'
                }`}
              >
                {remainingAfterWaste !== null ? `${remainingAfterWaste.toFixed(2)} kg` : '—'}
              </p>
            </div>
          </div>
          {remainingAfterWaste !== null && remainingAfterWaste < 0 && (
            <p className="text-xs text-red-600 mt-2">
              ⚠️ Warning: Total used quantity (outputs + reworks + waste) exceeds available quantity!
            </p>
          )}
        </div>
      )}

      {/* Outputs Section */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-text-dark">Sorting Outputs</h4>
              <p className="text-xs text-text-dark/60 mt-1">
                Total Output: {totalOutputQuantity.toFixed(2)} kg
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowOutputForm(!showOutputForm)
                setEditingOutputId(null)
                setOutputFormData({ product_id: '', quantity_kg: '', moisture_percent: '', remarks: '' })
              }}
              disabled={saving || externalLoading || !availableQuantity}
              className="border-olive-light/30"
              title={!availableQuantity ? 'Available quantity is loading…' : undefined}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Output
            </Button>
          </div>
          {!availableQuantity && (
            <p className="text-xs text-text-dark/60 mt-2">Loading available quantity… You cannot add outputs until it is known.</p>
          )}
        </div>

        {showOutputForm && (
          <form onSubmit={handleOutputSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
            {/* Remaining Quantity Display */}
            {availableQuantity && (
              <div className="mb-4 rounded-md bg-white border-2 border-olive p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-dark">Remaining Quantity:</span>
                  <span
                    className={`text-lg font-bold ${
                      remainingQty !== null && remainingQty < 0
                        ? 'text-red-600'
                        : remainingQty !== null && remainingQty < 10
                        ? 'text-orange-600'
                        : 'text-olive-dark'
                    }`}
                  >
                    {remainingQty !== null ? `${remainingQty.toFixed(2)} kg` : '—'}
                  </span>
                </div>
                {remainingQty !== null && remainingQty < 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ Warning: You have exceeded the available quantity
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="output_product">Product *</Label>
                <select
                  id="output_product"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={outputFormData.product_id}
                  onChange={(e) => setOutputFormData({ ...outputFormData, product_id: e.target.value })}
                  required
                  disabled={saving || externalLoading}
                >
                  <option value="">Select product</option>
                  {availableProducts.length === 0 ? (
                    <option value="" disabled>
                      {editingOutputId ? 'No other products available' : 'All products already selected'}
                    </option>
                  ) : (
                    availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} {product.sku ? `(${product.sku})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="output_quantity">
                  Quantity (kg) *
                  {maxQtyForEntry !== null && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {maxQtyForEntry.toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="output_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={maxQtyForEntry ?? undefined}
                  value={outputFormData.quantity_kg}
                  onChange={(e) => {
                    let newValue = e.target.value
                    if (maxQtyForEntry !== null && newValue !== '') {
                      const num = parseFloat(newValue)
                      if (!Number.isNaN(num) && num > maxQtyForEntry) {
                        newValue = String(maxQtyForEntry)
                        toast.error(`Quantity cannot exceed available ${maxQtyForEntry.toFixed(2)} kg`)
                      }
                    }
                    setOutputFormData({ ...outputFormData, quantity_kg: newValue })
                  }}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
                {maxQtyForEntry !== null && (
                  <p className="text-xs text-text-dark/50">
                    Remaining after this entry:{' '}
                    {(
                      maxQtyForEntry -
                      parseFloat(outputFormData.quantity_kg || '0')
                    ).toFixed(2)}{' '}
                    kg
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="output_moisture">Moisture (%)</Label>
                <Input
                  id="output_moisture"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={outputFormData.moisture_percent}
                  onChange={(e) => setOutputFormData({ ...outputFormData, moisture_percent: e.target.value })}
                  placeholder="0.00"
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="output_remarks">Remarks</Label>
                <Input
                  id="output_remarks"
                  type="text"
                  value={outputFormData.remarks}
                  onChange={(e) => setOutputFormData({ ...outputFormData, remarks: e.target.value })}
                  placeholder="Optional"
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
                  setShowOutputForm(false)
                  setEditingOutputId(null)
                  setOutputFormData({ product_id: '', quantity_kg: '', moisture_percent: '', remarks: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || externalLoading} className="bg-olive hover:bg-olive-dark">
                {editingOutputId ? 'Update' : 'Add'} Output
              </Button>
            </div>
          </form>
        )}

        {outputs.length === 0 ? (
          <p className="text-sm text-text-dark/60 py-4 text-center">No outputs recorded yet</p>
        ) : (
          <div className="space-y-2">
            {outputs.map((output) => (
              <div
                key={output.id}
                className="flex items-center justify-between rounded-lg border border-olive-light/30 bg-white p-3"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-text-dark">
                    {output.product?.name || `Product #${output.product_id}`}
                  </span>
                  <span className="text-sm text-text-dark/70">{output.quantity_kg} kg</span>
                  {output.moisture_percent !== null && (
                    <span className="text-xs text-text-dark/50">Moisture: {output.moisture_percent}%</span>
                  )}
                  {output.remarks && (
                    <span className="text-xs text-text-dark/50 italic">{output.remarks}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditOutput(output.id)}
                    disabled={saving || externalLoading}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteOutput(output.id)}
                    disabled={saving || externalLoading}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rework Section */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Create Rework</h4>
            <p className="text-xs text-text-dark/60 mt-1">
              Mark outputs for rework - they will go through the same process steps again
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowReworkForm(!showReworkForm)}
            disabled={saving || externalLoading || !availableQuantity}
            className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
            title={!availableQuantity ? 'Available quantity is loading…' : undefined}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Create Rework
          </Button>
        </div>

        {showReworkForm && (
          <form onSubmit={handleReworkSubmit} className="rounded-lg border border-yellow-300 bg-yellow-50/50 p-4">
            {remainingAfterOutputs !== null && (
              <div className="mb-4 rounded-md bg-white border-2 border-yellow-400 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-dark">Remaining After Sorting Outputs:</span>
                  <span className="text-lg font-bold text-yellow-700">
                    {remainingAfterOutputs.toFixed(2)} kg
                  </span>
                </div>
                <p className="text-xs text-text-dark/60 mt-1">
                  Rework quantity comes from remaining after sorting outputs
                </p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rework_quantity">
                  Quantity to Rework (kg) *
                  {remainingAfterOutputs !== null && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {remainingAfterOutputs.toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="rework_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={remainingAfterOutputs ?? undefined}
                  value={reworkFormData.quantity_kg}
                  onChange={(e) => {
                    let newValue = e.target.value
                    if (remainingAfterOutputs !== null && newValue !== '') {
                      const num = parseFloat(newValue)
                      if (!Number.isNaN(num) && num > remainingAfterOutputs) {
                        newValue = String(remainingAfterOutputs)
                        toast.error(`Quantity cannot exceed remaining after outputs ${remainingAfterOutputs.toFixed(2)} kg`)
                      }
                    }
                    setReworkFormData({ ...reworkFormData, quantity_kg: newValue })
                  }}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading || remainingAfterOutputs === null}
                  className="bg-white"
                />
                {remainingAfterOutputs !== null && (
                  <p className="text-xs text-text-dark/50">
                    Remaining after rework:{' '}
                    {(remainingAfterOutputs - parseFloat(reworkFormData.quantity_kg || '0')).toFixed(2)} kg
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="rework_reason">Reason for Rework (Optional)</Label>
                <Input
                  id="rework_reason"
                  type="text"
                  value={reworkFormData.reason}
                  onChange={(e) => setReworkFormData({ ...reworkFormData, reason: e.target.value })}
                  placeholder="e.g., Quality issues, contamination, etc."
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
                  setShowReworkForm(false)
                  setReworkFormData({ quantity_kg: '', reason: '' })
                }}
                disabled={saving || externalLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || externalLoading || remainingAfterOutputs === null}
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                Create Rework
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Waste Section */}
      <div className="border-t border-olive-light/20 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-dark">Waste Records</h4>
            <p className="text-xs text-text-dark/60 mt-1">
              Total Waste: {totalWaste.toFixed(2)} kg
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowWasteForm(!showWasteForm)}
            disabled={saving || externalLoading || outputs.length === 0}
            className="border-olive-light/30"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Waste
          </Button>
        </div>

        {showWasteForm && (
          <form onSubmit={handleWasteSubmit} className="rounded-lg border border-olive-light/30 bg-olive-light/10 p-4">
            {/* Remaining Quantity Display */}
            {availableQuantity && (
              <div className="mb-4 rounded-md bg-white border-2 border-olive p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-dark">Remaining After Outputs & Reworks:</span>
                  <span
                    className={`text-lg font-bold ${
                      remainingAfterReworks !== null && remainingAfterReworks < 0
                        ? 'text-red-600'
                        : remainingAfterReworks !== null && remainingAfterReworks < 10
                        ? 'text-orange-600'
                        : 'text-olive-dark'
                    }`}
                  >
                    {remainingAfterReworks !== null ? `${remainingAfterReworks.toFixed(2)} kg` : '—'}
                  </span>
                </div>
                {remainingAfterReworks !== null && remainingAfterReworks < 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ Warning: You have exceeded the available quantity
                  </p>
                )}
                <p className="text-xs text-text-dark/60 mt-1">
                  Waste comes after outputs and reworks
                </p>
              </div>
            )}
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
                <Label htmlFor="waste_quantity">
                  Quantity (kg) *
                  {availableQuantity && remainingAfterReworks !== null && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {Math.max(0, remainingAfterReworks).toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="waste_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={availableQuantity && remainingAfterReworks !== null ? Math.max(0, remainingAfterReworks) : undefined}
                  value={wasteFormData.quantity_kg}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, quantity_kg: e.target.value })}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
                {availableQuantity && remainingAfterReworks !== null && (
                  <p className="text-xs text-text-dark/50">
                    Remaining after this entry: {(remainingAfterReworks - parseFloat(wasteFormData.quantity_kg || '0')).toFixed(2)} kg
                  </p>
                )}
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
