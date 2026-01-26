import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface VehicleInspection {
  vehicleClean: 'YES' | 'NO' | 'NA' | ''
  noForeignObjects: 'YES' | 'NO' | 'NA' | ''
  noPestInfestation: 'YES' | 'NO' | 'NA' | ''
  remarks: string
}

interface VehicleInspectionsStepProps {
  inspection: VehicleInspection
  onChange: (inspection: VehicleInspection) => void
  disabled?: boolean
}

export function VehicleInspectionsStep({ inspection, onChange, disabled }: VehicleInspectionsStepProps) {
  const handleFieldChange = (field: keyof VehicleInspection, value: string) => {
    onChange({
      ...inspection,
      [field]: value,
    })
  }

  const baseFieldClass =
    'h-11 w-full rounded-lg border border-olive-light/60 bg-white px-3 text-sm text-text-dark shadow-sm transition focus:border-olive focus:outline-none focus:ring-2 focus:ring-olive/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-olive dark:focus:ring-olive/40'

  const yesNoNaOptions = [
    { value: '', label: 'Select' },
    { value: 'YES', label: 'Yes' },
    { value: 'NO', label: 'No' },
    { value: 'NA', label: 'N/A' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-4">
          <Label htmlFor="vehicle_clean">Vehicle Clean *</Label>
          <select
            id="vehicle_clean"
            required
            value={inspection.vehicleClean}
            onChange={(e) => handleFieldChange('vehicleClean', e.target.value)}
            className={baseFieldClass}
            disabled={disabled}
          >
            {yesNoNaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 lg:col-span-4">
          <Label htmlFor="no_foreign_objects">No Foreign Objects *</Label>
          <select
            id="no_foreign_objects"
            required
            value={inspection.noForeignObjects}
            onChange={(e) => handleFieldChange('noForeignObjects', e.target.value)}
            className={baseFieldClass}
            disabled={disabled}
          >
            {yesNoNaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 lg:col-span-4">
          <Label htmlFor="no_pest_infestation">No Pest Infestation *</Label>
          <select
            id="no_pest_infestation"
            required
            value={inspection.noPestInfestation}
            onChange={(e) => handleFieldChange('noPestInfestation', e.target.value)}
            className={baseFieldClass}
            disabled={disabled}
          >
            {yesNoNaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 lg:col-span-12">
          <Label htmlFor="vehicle_remarks">Remarks</Label>
          <Input
            id="vehicle_remarks"
            value={inspection.remarks}
            onChange={(e) => handleFieldChange('remarks', e.target.value)}
            placeholder="Enter any additional remarks"
            className={baseFieldClass}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
