import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Camera, X, Sparkles } from 'lucide-react'
import { CameraCapture } from '@/components/CameraCapture'

function generateBatchNumber(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const r = Math.floor(1000 + Math.random() * 9000)
  return `BATCH-${y}${m}${d}-${h}${min}-${r}`
}

export interface SupplyDocument {
  invoiceNumber: string
  driverLicenseName: string
  batchNumber: string
  productionDate: string
  expiryDate: string
  invoiceFile: File | null
}

interface SupplyDocumentsStepProps {
  documents: SupplyDocument
  onChange: (documents: SupplyDocument) => void
  disabled?: boolean
}

export function SupplyDocumentsStep({ documents, onChange, disabled }: SupplyDocumentsStepProps) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraForField, setCameraForField] = useState<'invoice' | null>(null)

  const handleFieldChange = (field: keyof SupplyDocument, value: string | File | null) => {
    onChange({
      ...documents,
      [field]: value,
    })
  }

  const handleOpenCamera = (field: 'invoice') => {
    setCameraForField(field)
    setCameraOpen(true)
  }

  const handleCameraCapture = (file: File) => {
    if (cameraForField === 'invoice') {
      handleFieldChange('invoiceFile', file)
    }
    setCameraOpen(false)
    setCameraForField(null)
  }

  const handleRemoveFile = () => {
    handleFieldChange('invoiceFile', null)
  }

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive dark:focus:ring-olive/40'

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="invoice_number">Invoice Number *</Label>
            <Input
              id="invoice_number"
              required
              value={documents.invoiceNumber}
              onChange={(e) => handleFieldChange('invoiceNumber', e.target.value)}
              placeholder="Enter invoice number"
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="driver_license_name">Driver License/Name *</Label>
            <Input
              id="driver_license_name"
              required
              value={documents.driverLicenseName}
              onChange={(e) => handleFieldChange('driverLicenseName', e.target.value)}
              placeholder="Enter driver license or name"
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="batch_number">Supply Batch Number *</Label>
            <div className="flex gap-2">
              <Input
                id="batch_number"
                required
                value={documents.batchNumber}
                onChange={(e) => handleFieldChange('batchNumber', e.target.value)}
                placeholder="Enter supply batch number"
                className={baseFieldClass}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => handleFieldChange('batchNumber', generateBatchNumber())}
                disabled={disabled}
                className="shrink-0"
                title="Auto-generate batch number"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="production_date">Production Date</Label>
            <DatePicker
              id="production_date"
              value={documents.productionDate}
              onChange={(value) => handleFieldChange('productionDate', value)}
              triggerClassName={baseFieldClass}
              popoverClassName="w-[18rem]"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="expiry_date">Expiry Date</Label>
            <DatePicker
              id="expiry_date"
              value={documents.expiryDate}
              onChange={(value) => handleFieldChange('expiryDate', value)}
              triggerClassName={baseFieldClass}
              popoverClassName="w-[18rem]"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-12">
            <Label htmlFor="invoice_file">Invoice Document (Upload)</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="invoice_file"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    handleFieldChange('invoiceFile', file)
                  }}
                  disabled={disabled}
                  className={baseFieldClass}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenCamera('invoice')}
                disabled={disabled}
                className="shrink-0"
                aria-label="Take photo with camera"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            {documents.invoiceFile && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-olive-light/40 bg-olive-light/10 px-3 py-2">
                <span className="text-sm text-text-dark">{documents.invoiceFile.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={disabled}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <CameraCapture
        isOpen={cameraOpen}
        onClose={() => {
          setCameraOpen(false)
          setCameraForField(null)
        }}
        onCapture={handleCameraCapture}
        disabled={disabled}
      />
    </>
  )
}
