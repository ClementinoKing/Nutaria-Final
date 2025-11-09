import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Activity, ChevronRight, ChevronLeft, CheckCircle2, Circle, Save, ArrowLeft } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

// Mock data for available batches
const mockBatches = [
  { 
    id: 1,
    batch_lot_no: 'LOT-2024-001',
    supply_doc_no: 'SUP-2024-001',
    product_name: 'Pecan Wholes',
    product_sku: 'PEC001',
    quantity: 1000.0,
    unit: 'kg',
    status: 'Ready'
  },
  { 
    id: 2,
    batch_lot_no: 'LOT-2024-002',
    supply_doc_no: 'SUP-2024-002',
    product_name: 'Mac Wholes',
    product_sku: 'MAC001',
    quantity: 800.0,
    unit: 'kg',
    status: 'Ready'
  },
  { 
    id: 3,
    batch_lot_no: 'LOT-2024-003',
    supply_doc_no: 'SUP-2024-003',
    product_name: 'Mac Pieces',
    product_sku: 'MAC003',
    quantity: 600.0,
    unit: 'kg',
    status: 'Ready'
  },
]

const PROCESS_STEPS = [
  { id: 1, name: 'Batch Selection', key: 'batch' },
  { id: 2, name: 'Cleaning', key: 'cleaning' },
  { id: 3, name: 'Drying', key: 'drying' },
  { id: 4, name: 'Cooling', key: 'cooling' },
  { id: 5, name: 'Metal Detection', key: 'metal_detection' },
  { id: 6, name: 'Vacuum Packing', key: 'vacuum_packing' },
  { id: 7, name: 'Allocation', key: 'allocation' },
]

function ProcessSteps() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    // Batch Selection
    batch_id: '',
    batch_lot_no: '',
    supply_doc_no: '',
    product_name: '',
    product_sku: '',
    initial_quantity: '',
    unit: 'kg',
    
    // Cleaning
    cleaning_started_at: '',
    cleaning_completed_at: '',
    cleaning_operator: '',
    cleaning_quantity_in: '',
    cleaning_quantity_out: '',
    cleaning_notes: '',
    
    // Drying
    drying_started_at: '',
    drying_completed_at: '',
    drying_operator: '',
    drying_temperature: '',
    drying_duration: '',
    drying_quantity_in: '',
    drying_quantity_out: '',
    drying_notes: '',
    
    // Cooling
    cooling_started_at: '',
    cooling_completed_at: '',
    cooling_operator: '',
    cooling_temperature: '',
    cooling_duration: '',
    cooling_quantity_in: '',
    cooling_quantity_out: '',
    cooling_notes: '',
    
    // Metal Detection
    metal_detection_started_at: '',
    metal_detection_completed_at: '',
    metal_detection_operator: '',
    metal_detection_passed: '',
    metal_detection_quantity_in: '',
    metal_detection_quantity_out: '',
    metal_detection_notes: '',
    
    // Vacuum Packing
    vacuum_packing_started_at: '',
    vacuum_packing_completed_at: '',
    vacuum_packing_operator: '',
    vacuum_packing_bag_size: '',
    vacuum_packing_quantity_packed: '',
    vacuum_packing_quantity_in: '',
    vacuum_packing_quantity_out: '',
    vacuum_packing_notes: '',
    
    // Allocation
    allocation_location: '',
    allocation_warehouse: '',
    allocation_zone: '',
    allocation_shelf: '',
    allocation_quantity: '',
    allocation_operator: '',
    allocation_notes: '',
  })

  const handleLogout = () => {
    logout()
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleBatchSelect = (batch) => {
    setFormData(prev => ({
      ...prev,
      batch_id: batch.id,
      batch_lot_no: batch.batch_lot_no,
      supply_doc_no: batch.supply_doc_no,
      product_name: batch.product_name,
      product_sku: batch.product_sku,
      initial_quantity: batch.quantity,
      unit: batch.unit,
    }))
  }

  const nextStep = () => {
    if (currentStep < PROCESS_STEPS.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const goToStep = (step) => {
    setCurrentStep(step)
  }

  const handleSave = () => {
    // Save form data
    console.log('Saving process step progress:', formData)
    alert('Process steps saved successfully!')
    // Reset form
    setFormData({
      batch_id: '',
      batch_lot_no: '',
      supply_doc_no: '',
      product_name: '',
      product_sku: '',
      initial_quantity: '',
      unit: 'kg',
      cleaning_started_at: '',
      cleaning_completed_at: '',
      cleaning_operator: '',
      cleaning_quantity_in: '',
      cleaning_quantity_out: '',
      cleaning_notes: '',
      drying_started_at: '',
      drying_completed_at: '',
      drying_operator: '',
      drying_temperature: '',
      drying_duration: '',
      drying_quantity_in: '',
      drying_quantity_out: '',
      drying_notes: '',
      cooling_started_at: '',
      cooling_completed_at: '',
      cooling_operator: '',
      cooling_temperature: '',
      cooling_duration: '',
      cooling_quantity_in: '',
      cooling_quantity_out: '',
      cooling_notes: '',
      metal_detection_started_at: '',
      metal_detection_completed_at: '',
      metal_detection_operator: '',
      metal_detection_passed: '',
      metal_detection_quantity_in: '',
      metal_detection_quantity_out: '',
      metal_detection_notes: '',
      vacuum_packing_started_at: '',
      vacuum_packing_completed_at: '',
      vacuum_packing_operator: '',
      vacuum_packing_bag_size: '',
      vacuum_packing_quantity_packed: '',
      vacuum_packing_quantity_in: '',
      vacuum_packing_quantity_out: '',
      vacuum_packing_notes: '',
      allocation_location: '',
      allocation_warehouse: '',
      allocation_zone: '',
      allocation_shelf: '',
      allocation_quantity: '',
      allocation_operator: '',
      allocation_notes: '',
    })
    setCurrentStep(1)
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: // Batch Selection
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-4">Select Batch</h3>
              <p className="text-sm text-text-dark/70 mb-4">Choose a batch to process through all steps</p>
            </div>
            <div className="grid gap-4">
              {mockBatches.map((batch) => (
                <Card
                  key={batch.id}
                  className={`cursor-pointer transition-all ${
                    formData.batch_id === batch.id
                      ? 'border-olive bg-olive-light/10'
                      : 'border-olive-light/30 hover:border-olive-light/50'
                  }`}
                  onClick={() => handleBatchSelect(batch)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-text-dark">{batch.batch_lot_no}</div>
                        <div className="text-sm text-text-dark/70">{batch.supply_doc_no}</div>
                        <div className="text-sm font-medium text-text-dark mt-1">{batch.product_name} ({batch.product_sku})</div>
                        <div className="text-sm text-text-dark/60 mt-1">{batch.quantity} {batch.unit}</div>
                      </div>
                      {formData.batch_id === batch.id && (
                        <CheckCircle2 className="h-6 w-6 text-olive" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            {formData.batch_id && (
              <div className="bg-olive-light/10 border border-olive-light/30 rounded-lg p-4">
                <p className="text-sm font-medium text-text-dark">
                  Selected: <span className="font-semibold">{formData.batch_lot_no}</span> - {formData.product_name}
                </p>
              </div>
            )}
          </div>
        )

      case 2: // Cleaning
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Cleaning</h3>
              <p className="text-sm text-text-dark/70">Record cleaning process details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cleaning_started_at">Started At</Label>
                <Input
                  id="cleaning_started_at"
                  type="datetime-local"
                  value={formData.cleaning_started_at}
                  onChange={(e) => handleInputChange('cleaning_started_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleaning_completed_at">Completed At</Label>
                <Input
                  id="cleaning_completed_at"
                  type="datetime-local"
                  value={formData.cleaning_completed_at}
                  onChange={(e) => handleInputChange('cleaning_completed_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleaning_operator">Operator</Label>
                <Input
                  id="cleaning_operator"
                  value={formData.cleaning_operator}
                  onChange={(e) => handleInputChange('cleaning_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleaning_quantity_in">Quantity In ({formData.unit})</Label>
                <Input
                  id="cleaning_quantity_in"
                  type="number"
                  step="0.01"
                  value={formData.cleaning_quantity_in}
                  onChange={(e) => handleInputChange('cleaning_quantity_in', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cleaning_quantity_out">Quantity Out ({formData.unit})</Label>
                <Input
                  id="cleaning_quantity_out"
                  type="number"
                  step="0.01"
                  value={formData.cleaning_quantity_out}
                  onChange={(e) => handleInputChange('cleaning_quantity_out', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cleaning_notes">Notes</Label>
              <textarea
                id="cleaning_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.cleaning_notes}
                onChange={(e) => handleInputChange('cleaning_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      case 3: // Drying
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Drying</h3>
              <p className="text-sm text-text-dark/70">Record drying process details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="drying_started_at">Started At</Label>
                <Input
                  id="drying_started_at"
                  type="datetime-local"
                  value={formData.drying_started_at}
                  onChange={(e) => handleInputChange('drying_started_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_completed_at">Completed At</Label>
                <Input
                  id="drying_completed_at"
                  type="datetime-local"
                  value={formData.drying_completed_at}
                  onChange={(e) => handleInputChange('drying_completed_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_operator">Operator</Label>
                <Input
                  id="drying_operator"
                  value={formData.drying_operator}
                  onChange={(e) => handleInputChange('drying_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_temperature">Temperature (°C)</Label>
                <Input
                  id="drying_temperature"
                  type="number"
                  step="0.1"
                  value={formData.drying_temperature}
                  onChange={(e) => handleInputChange('drying_temperature', e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_duration">Duration (minutes)</Label>
                <Input
                  id="drying_duration"
                  type="number"
                  value={formData.drying_duration}
                  onChange={(e) => handleInputChange('drying_duration', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_quantity_in">Quantity In ({formData.unit})</Label>
                <Input
                  id="drying_quantity_in"
                  type="number"
                  step="0.01"
                  value={formData.drying_quantity_in}
                  onChange={(e) => handleInputChange('drying_quantity_in', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="drying_quantity_out">Quantity Out ({formData.unit})</Label>
                <Input
                  id="drying_quantity_out"
                  type="number"
                  step="0.01"
                  value={formData.drying_quantity_out}
                  onChange={(e) => handleInputChange('drying_quantity_out', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="drying_notes">Notes</Label>
              <textarea
                id="drying_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.drying_notes}
                onChange={(e) => handleInputChange('drying_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      case 4: // Cooling
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Cooling</h3>
              <p className="text-sm text-text-dark/70">Record cooling process details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cooling_started_at">Started At</Label>
                <Input
                  id="cooling_started_at"
                  type="datetime-local"
                  value={formData.cooling_started_at}
                  onChange={(e) => handleInputChange('cooling_started_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_completed_at">Completed At</Label>
                <Input
                  id="cooling_completed_at"
                  type="datetime-local"
                  value={formData.cooling_completed_at}
                  onChange={(e) => handleInputChange('cooling_completed_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_operator">Operator</Label>
                <Input
                  id="cooling_operator"
                  value={formData.cooling_operator}
                  onChange={(e) => handleInputChange('cooling_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_temperature">Temperature (°C)</Label>
                <Input
                  id="cooling_temperature"
                  type="number"
                  step="0.1"
                  value={formData.cooling_temperature}
                  onChange={(e) => handleInputChange('cooling_temperature', e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_duration">Duration (minutes)</Label>
                <Input
                  id="cooling_duration"
                  type="number"
                  value={formData.cooling_duration}
                  onChange={(e) => handleInputChange('cooling_duration', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_quantity_in">Quantity In ({formData.unit})</Label>
                <Input
                  id="cooling_quantity_in"
                  type="number"
                  step="0.01"
                  value={formData.cooling_quantity_in}
                  onChange={(e) => handleInputChange('cooling_quantity_in', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooling_quantity_out">Quantity Out ({formData.unit})</Label>
                <Input
                  id="cooling_quantity_out"
                  type="number"
                  step="0.01"
                  value={formData.cooling_quantity_out}
                  onChange={(e) => handleInputChange('cooling_quantity_out', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cooling_notes">Notes</Label>
              <textarea
                id="cooling_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.cooling_notes}
                onChange={(e) => handleInputChange('cooling_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      case 5: // Metal Detection
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Metal Detection</h3>
              <p className="text-sm text-text-dark/70">Record metal detection test results</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="metal_detection_started_at">Started At</Label>
                <Input
                  id="metal_detection_started_at"
                  type="datetime-local"
                  value={formData.metal_detection_started_at}
                  onChange={(e) => handleInputChange('metal_detection_started_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metal_detection_completed_at">Completed At</Label>
                <Input
                  id="metal_detection_completed_at"
                  type="datetime-local"
                  value={formData.metal_detection_completed_at}
                  onChange={(e) => handleInputChange('metal_detection_completed_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metal_detection_operator">Operator</Label>
                <Input
                  id="metal_detection_operator"
                  value={formData.metal_detection_operator}
                  onChange={(e) => handleInputChange('metal_detection_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metal_detection_passed">Test Result</Label>
                <select
                  id="metal_detection_passed"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.metal_detection_passed}
                  onChange={(e) => handleInputChange('metal_detection_passed', e.target.value)}
                >
                  <option value="">Select result</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="metal_detection_quantity_in">Quantity In ({formData.unit})</Label>
                <Input
                  id="metal_detection_quantity_in"
                  type="number"
                  step="0.01"
                  value={formData.metal_detection_quantity_in}
                  onChange={(e) => handleInputChange('metal_detection_quantity_in', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metal_detection_quantity_out">Quantity Out ({formData.unit})</Label>
                <Input
                  id="metal_detection_quantity_out"
                  type="number"
                  step="0.01"
                  value={formData.metal_detection_quantity_out}
                  onChange={(e) => handleInputChange('metal_detection_quantity_out', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="metal_detection_notes">Notes</Label>
              <textarea
                id="metal_detection_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.metal_detection_notes}
                onChange={(e) => handleInputChange('metal_detection_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      case 6: // Vacuum Packing
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Vacuum Packing</h3>
              <p className="text-sm text-text-dark/70">Record vacuum packing details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_started_at">Started At</Label>
                <Input
                  id="vacuum_packing_started_at"
                  type="datetime-local"
                  value={formData.vacuum_packing_started_at}
                  onChange={(e) => handleInputChange('vacuum_packing_started_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_completed_at">Completed At</Label>
                <Input
                  id="vacuum_packing_completed_at"
                  type="datetime-local"
                  value={formData.vacuum_packing_completed_at}
                  onChange={(e) => handleInputChange('vacuum_packing_completed_at', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_operator">Operator</Label>
                <Input
                  id="vacuum_packing_operator"
                  value={formData.vacuum_packing_operator}
                  onChange={(e) => handleInputChange('vacuum_packing_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_bag_size">Bag Size</Label>
                <Input
                  id="vacuum_packing_bag_size"
                  value={formData.vacuum_packing_bag_size}
                  onChange={(e) => handleInputChange('vacuum_packing_bag_size', e.target.value)}
                  placeholder="e.g., 1kg, 500g"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_quantity_packed">Quantity Packed</Label>
                <Input
                  id="vacuum_packing_quantity_packed"
                  type="number"
                  value={formData.vacuum_packing_quantity_packed}
                  onChange={(e) => handleInputChange('vacuum_packing_quantity_packed', e.target.value)}
                  placeholder="Number of bags"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_quantity_in">Quantity In ({formData.unit})</Label>
                <Input
                  id="vacuum_packing_quantity_in"
                  type="number"
                  step="0.01"
                  value={formData.vacuum_packing_quantity_in}
                  onChange={(e) => handleInputChange('vacuum_packing_quantity_in', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vacuum_packing_quantity_out">Quantity Out ({formData.unit})</Label>
                <Input
                  id="vacuum_packing_quantity_out"
                  type="number"
                  step="0.01"
                  value={formData.vacuum_packing_quantity_out}
                  onChange={(e) => handleInputChange('vacuum_packing_quantity_out', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vacuum_packing_notes">Notes</Label>
              <textarea
                id="vacuum_packing_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.vacuum_packing_notes}
                onChange={(e) => handleInputChange('vacuum_packing_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      case 7: // Allocation
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-text-dark mb-2">Allocation</h3>
              <p className="text-sm text-text-dark/70">Record storage allocation details</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="allocation_warehouse">Warehouse</Label>
                <Input
                  id="allocation_warehouse"
                  value={formData.allocation_warehouse}
                  onChange={(e) => handleInputChange('allocation_warehouse', e.target.value)}
                  placeholder="Warehouse name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocation_zone">Zone</Label>
                <Input
                  id="allocation_zone"
                  value={formData.allocation_zone}
                  onChange={(e) => handleInputChange('allocation_zone', e.target.value)}
                  placeholder="Zone identifier"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocation_shelf">Shelf</Label>
                <Input
                  id="allocation_shelf"
                  value={formData.allocation_shelf}
                  onChange={(e) => handleInputChange('allocation_shelf', e.target.value)}
                  placeholder="Shelf identifier"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocation_location">Location Code</Label>
                <Input
                  id="allocation_location"
                  value={formData.allocation_location}
                  onChange={(e) => handleInputChange('allocation_location', e.target.value)}
                  placeholder="e.g., A-01-05"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocation_quantity">Quantity ({formData.unit})</Label>
                <Input
                  id="allocation_quantity"
                  type="number"
                  step="0.01"
                  value={formData.allocation_quantity}
                  onChange={(e) => handleInputChange('allocation_quantity', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="allocation_operator">Operator</Label>
                <Input
                  id="allocation_operator"
                  value={formData.allocation_operator}
                  onChange={(e) => handleInputChange('allocation_operator', e.target.value)}
                  placeholder="Operator name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="allocation_notes">Notes</Label>
              <textarea
                id="allocation_notes"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.allocation_notes}
                onChange={(e) => handleInputChange('allocation_notes', e.target.value)}
                placeholder="Additional notes..."
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-beige flex">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeItem="process"
        user={user}
        onLogout={handleLogout}
      />

      <div className={`flex-1 ${sidebarOpen ? 'ml-80' : 'ml-20'} transition-all duration-300`}>
        <header className="bg-white border-b border-olive-light/20 shadow-sm sticky top-0 z-10">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div>
                <h1 className="text-xl font-semibold text-text-dark">Process Steps</h1>
                <p className="text-sm text-text-dark/60">Track each lot as it progresses through the factory workflow</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 sm:px-6 lg:px-8 py-8">
          <Card className="bg-white border-olive-light/30">
            <CardHeader>
              <CardTitle className="text-text-dark">Process Steps Progress</CardTitle>
              <CardDescription>
                {formData.batch_lot_no
                  ? `Tracking: ${formData.batch_lot_no} - ${formData.product_name}`
                  : 'Select a lot and capture data for each process step'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Step Progress Indicator */}
              <div className="mb-8">
                <div className="flex items-center justify-between">
                  {PROCESS_STEPS.map((step, index) => (
                    <div key={step.id} className="flex items-center flex-1">
                      <button
                        onClick={() => goToStep(step.id)}
                        className={`flex flex-col items-center flex-1 ${
                          currentStep === step.id
                            ? 'text-olive'
                            : currentStep > step.id
                            ? 'text-green-600'
                            : 'text-text-dark/40'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 mb-2 ${
                          currentStep === step.id
                            ? 'border-olive bg-olive-light/20'
                            : currentStep > step.id
                            ? 'border-green-600 bg-green-100'
                            : 'border-text-dark/20 bg-white'
                        }`}>
                          {currentStep > step.id ? (
                            <CheckCircle2 className="h-6 w-6 text-green-600" />
                          ) : (
                            <span className="text-sm font-semibold">{step.id}</span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-center max-w-[80px]">{step.name}</span>
                      </button>
                      {index < PROCESS_STEPS.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-2 mb-6 ${
                          currentStep > step.id ? 'bg-green-600' : 'bg-text-dark/20'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Content */}
              <div className="border-t border-olive-light/20 pt-6">
                {renderStepContent()}
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between items-center mt-8 pt-6 border-t border-olive-light/20">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className="flex items-center"
                >
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    className="flex items-center"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Progress
                  </Button>
                  {currentStep < PROCESS_STEPS.length ? (
                    <Button
                      onClick={nextStep}
                      disabled={currentStep === 1 && !formData.batch_id}
                      className="bg-olive hover:bg-olive-dark flex items-center"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  ) : (
                    <Button
                      onClick={handleSave}
                      className="bg-olive hover:bg-olive-dark flex items-center"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Complete Process
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}

export default ProcessSteps
