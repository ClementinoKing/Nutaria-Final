import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Camera, X } from 'lucide-react'
import { SignatureCanvas } from './SignatureCanvas'
import { CameraCapture } from '@/components/CameraCapture'

export interface SupplierSignOff {
  signatureType: 'E_SIGNATURE' | 'UPLOADED_DOCUMENT' | ''
  signatureData: string | null
  documentFile: File | null
  signedByName: string
  remarks: string
}

interface SupplierSignOffStepProps {
  signOff: SupplierSignOff
  onChange: (signOff: SupplierSignOff) => void
  disabled?: boolean
}

export function SupplierSignOffStep({ signOff, onChange, disabled }: SupplierSignOffStepProps) {
  const [cameraOpen, setCameraOpen] = useState(false)

  const handleFieldChange = (field: keyof SupplierSignOff, value: string | File | null) => {
    onChange({
      ...signOff,
      [field]: value,
    })
  }

  const handleSignatureTypeChange = (type: 'E_SIGNATURE' | 'UPLOADED_DOCUMENT') => {
    onChange({
      ...signOff,
      signatureType: type,
      signatureData: type === 'E_SIGNATURE' ? signOff.signatureData : null,
      documentFile: type === 'UPLOADED_DOCUMENT' ? signOff.documentFile : null,
    })
  }

  const handleCameraCapture = (file: File) => {
    handleFieldChange('documentFile', file)
    setCameraOpen(false)
  }

  const handleRemoveFile = () => {
    handleFieldChange('documentFile', null)
  }

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive dark:focus:ring-olive/40'

  return (
    <>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-12">
            <Label htmlFor="signature_type">Signature Type *</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="signature_type"
                  value="E_SIGNATURE"
                  checked={signOff.signatureType === 'E_SIGNATURE'}
                  onChange={() => handleSignatureTypeChange('E_SIGNATURE')}
                  disabled={disabled}
                  className="h-4 w-4 text-olive focus:ring-olive"
                />
                <span className="text-sm text-text-dark">E-Signature (Draw)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="signature_type"
                  value="UPLOADED_DOCUMENT"
                  checked={signOff.signatureType === 'UPLOADED_DOCUMENT'}
                  onChange={() => handleSignatureTypeChange('UPLOADED_DOCUMENT')}
                  disabled={disabled}
                  className="h-4 w-4 text-olive focus:ring-olive"
                />
                <span className="text-sm text-text-dark">Upload Document</span>
              </label>
            </div>
          </div>

          {signOff.signatureType === 'E_SIGNATURE' && (
            <div className="space-y-2 lg:col-span-12">
              <Label>Signature *</Label>
              <SignatureCanvas
                onSignatureChange={(data) => handleFieldChange('signatureData', data)}
                disabled={disabled}
              />
            </div>
          )}

          {signOff.signatureType === 'UPLOADED_DOCUMENT' && (
            <div className="space-y-2 lg:col-span-12">
              <Label htmlFor="signature_document">Signature Document *</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id="signature_document"
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      handleFieldChange('documentFile', file)
                    }}
                    disabled={disabled}
                    className={baseFieldClass}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(true)}
                  disabled={disabled}
                  className="shrink-0"
                  aria-label="Take photo with camera"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              {signOff.documentFile && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-olive-light/40 bg-olive-light/10 px-3 py-2">
                  <span className="text-sm text-text-dark">{signOff.documentFile.name}</span>
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
          )}

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="signed_by_name">Signed By Name *</Label>
            <Input
              id="signed_by_name"
              required
              value={signOff.signedByName}
              onChange={(e) => handleFieldChange('signedByName', e.target.value)}
              placeholder="Enter signer's name"
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2 lg:col-span-6">
            <Label htmlFor="sign_off_remarks">Remarks</Label>
            <Input
              id="sign_off_remarks"
              value={signOff.remarks}
              onChange={(e) => handleFieldChange('remarks', e.target.value)}
              placeholder="Enter any additional remarks"
              className={baseFieldClass}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      <CameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
        disabled={disabled}
      />
    </>
  )
}
