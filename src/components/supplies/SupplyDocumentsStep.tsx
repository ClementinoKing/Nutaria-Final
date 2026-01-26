import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Camera, X } from 'lucide-react'
import { CameraCapture } from '@/components/CameraCapture'

export interface SupplyDocument {
  invoiceNumber: string
  driverLicenseName: string
  batchNumber: string
  productionDate: string
  expiryDate: string
  coaAvailable: 'YES' | 'NO' | 'NA' | ''
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
            <Input
              id="batch_number"
              required
              value={documents.batchNumber}
              onChange={(e) => handleFieldChange('batchNumber', e.target.value)}
              placeholder="Enter supply batch number"
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="production_date">Production Date</Label>
            <Input
              id="production_date"
              type="date"
              value={documents.productionDate}
              onChange={(e) => handleFieldChange('productionDate', e.target.value)}
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="expiry_date">Expiry Date</Label>
            <Input
              id="expiry_date"
              type="date"
              value={documents.expiryDate}
              onChange={(e) => handleFieldChange('expiryDate', e.target.value)}
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="coa_available">COA Available</Label>
            <select
              id="coa_available"
              value={documents.coaAvailable}
              onChange={(e) => handleFieldChange('coaAvailable', e.target.value as 'YES' | 'NO' | 'NA' | '')}
              className={baseFieldClass}
              disabled={disabled}
            >
              <option value="">Select</option>
              <option value="YES">Yes</option>
              <option value="NO">No</option>
              <option value="NA">N/A</option>
            </select>
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
