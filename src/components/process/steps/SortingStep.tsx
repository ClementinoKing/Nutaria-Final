import { useState, FormEvent, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabaseClient'
import { useSortingRun } from '@/hooks/useSortingRun'
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
  const [editingOutputId, setEditingOutputId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

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

    setSaving(true)
    try {
      if (editingOutputId) {
      // Validate total quantity doesn't exceed available
      const currentTotalOutput = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
      const editingOutput = outputs.find((o) => o.id === editingOutputId)
      const currentEditingQty = editingOutput?.quantity_kg || 0
      const newTotalOutput = currentTotalOutput - currentEditingQty + quantity
      const currentTotalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
      const totalUsed = newTotalOutput + currentTotalWaste

      if (availableQuantity && totalUsed > availableQuantity.availableQty) {
        toast.error(
          `Total quantity (outputs + waste) cannot exceed available quantity. Available: ${availableQuantity.availableQty.toFixed(2)} kg, Attempted: ${totalUsed.toFixed(2)} kg`
        )
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
      // Validate total quantity doesn't exceed available
      const currentTotalOutput = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
      const newTotalOutput = currentTotalOutput + quantity
      const currentTotalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
      const totalUsed = newTotalOutput + currentTotalWaste

      if (availableQuantity && totalUsed > availableQuantity.availableQty) {
        toast.error(
          `Total quantity (outputs + waste) cannot exceed available quantity. Available: ${availableQuantity.availableQty.toFixed(2)} kg, Attempted: ${totalUsed.toFixed(2)} kg`
        )
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

    // Validate total quantity doesn't exceed available
    const currentTotalOutput = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
    const currentTotalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
    const totalUsed = currentTotalOutput + currentTotalWaste + quantity

    if (availableQuantity && totalUsed > availableQuantity.availableQty) {
      toast.error(
        `Total quantity (outputs + waste) cannot exceed available quantity. Available: ${availableQuantity.availableQty.toFixed(2)} kg, Attempted: ${totalUsed.toFixed(2)} kg`
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

  const totalOutputQuantity = outputs.reduce((sum, o) => sum + o.quantity_kg, 0)
  const totalWaste = waste.reduce((sum, w) => sum + w.quantity_kg, 0)
  const totalUsed = totalOutputQuantity + totalWaste
  const remainingQty = availableQuantity ? availableQuantity.availableQty - totalUsed : null

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
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Total Used</p>
              <p className="text-base font-semibold text-text-dark">
                {totalUsed.toFixed(2)} kg
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-text-dark/50">Remaining</p>
              <p
                className={`text-base font-semibold ${
                  remainingQty !== null && remainingQty < 0
                    ? 'text-red-600'
                    : remainingQty !== null && remainingQty < 10
                    ? 'text-orange-600'
                    : 'text-text-dark'
                }`}
              >
                {remainingQty !== null ? `${remainingQty.toFixed(2)} kg` : '—'}
              </p>
            </div>
          </div>
          {remainingQty !== null && remainingQty < 0 && (
            <p className="text-xs text-red-600 mt-2">
              ⚠️ Warning: Total used quantity exceeds available quantity!
            </p>
          )}
        </div>
      )}

      {/* Outputs Section */}
      <div className="space-y-4">
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
            disabled={saving || externalLoading}
            className="border-olive-light/30"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Output
          </Button>
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
                  {availableQuantity && remainingQty !== null && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {Math.max(0, remainingQty + parseFloat(outputFormData.quantity_kg || '0')).toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="output_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={availableQuantity && remainingQty !== null ? Math.max(0, remainingQty + parseFloat(outputFormData.quantity_kg || '0')) : undefined}
                  value={outputFormData.quantity_kg}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setOutputFormData({ ...outputFormData, quantity_kg: newValue })
                    
                    // Show warning if exceeding remaining quantity
                    if (availableQuantity && remainingQty !== null && newValue) {
                      const newQty = parseFloat(newValue)
                      const currentOutputQty = editingOutputId 
                        ? outputs.find(o => o.id === editingOutputId)?.quantity_kg || 0
                        : 0
                      const adjustedRemaining = remainingQty + currentOutputQty
                      if (newQty > adjustedRemaining) {
                        // Warning will be shown in validation
                      }
                    }
                  }}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
                {availableQuantity && remainingQty !== null && (
                  <p className="text-xs text-text-dark/50">
                    Remaining after this entry: {(
                      remainingQty - parseFloat(outputFormData.quantity_kg || '0') + 
                      (editingOutputId ? (outputs.find(o => o.id === editingOutputId)?.quantity_kg || 0) : 0)
                    ).toFixed(2)} kg
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
                  {availableQuantity && remainingQty !== null && (
                    <span className="ml-2 text-xs font-normal text-text-dark/60">
                      (Max: {Math.max(0, remainingQty).toFixed(2)} kg)
                    </span>
                  )}
                </Label>
                <Input
                  id="waste_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  max={availableQuantity && remainingQty !== null ? Math.max(0, remainingQty) : undefined}
                  value={wasteFormData.quantity_kg}
                  onChange={(e) => setWasteFormData({ ...wasteFormData, quantity_kg: e.target.value })}
                  placeholder="0.00"
                  required
                  disabled={saving || externalLoading}
                  className="bg-white"
                />
                {availableQuantity && remainingQty !== null && (
                  <p className="text-xs text-text-dark/50">
                    Remaining after this entry: {(remainingQty - parseFloat(wasteFormData.quantity_kg || '0')).toFixed(2)} kg
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
