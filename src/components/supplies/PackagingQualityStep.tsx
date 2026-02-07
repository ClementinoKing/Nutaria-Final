import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface PackagingQuality {
  inaccurateLabelling: 'YES' | 'NO' | 'NA' | ''
  visibleDamage: 'YES' | 'NO' | 'NA' | ''
  specifiedQuantity: string
  odor: 'YES' | 'NO' | 'NA' | ''
  strengthIntegrity: 'GOOD' | 'BAD' | 'NA' | ''
}

interface PackagingQualityStepProps {
  packaging: PackagingQuality
  onChange: (packaging: PackagingQuality) => void
  disabled?: boolean
}

export function PackagingQualityStep({ packaging, onChange, disabled }: PackagingQualityStepProps) {
  const handleFieldChange = (field: keyof PackagingQuality, value: string) => {
    onChange({
      ...packaging,
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

  const goodBadNaOptions = [
    { value: '', label: 'Select' },
    { value: 'GOOD', label: 'Good' },
    { value: 'BAD', label: 'Bad' },
    { value: 'NA', label: 'N/A' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
        <div className="space-y-2 lg:col-span-6">
          <Label htmlFor="inaccurate_labelling">Inaccurate Labelling *</Label>
          <select
            id="inaccurate_labelling"
            required
            value={packaging.inaccurateLabelling}
            onChange={(e) => handleFieldChange('inaccurateLabelling', e.target.value)}
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

        <div className="space-y-2 lg:col-span-6">
          <Label htmlFor="visible_damage">Visible Damage *</Label>
          <select
            id="visible_damage"
            required
            value={packaging.visibleDamage}
            onChange={(e) => handleFieldChange('visibleDamage', e.target.value)}
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

        <div className="space-y-2 lg:col-span-6">
          <Label htmlFor="odor">Odor *</Label>
          <select
            id="odor"
            required
            value={packaging.odor}
            onChange={(e) => handleFieldChange('odor', e.target.value)}
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

        <div className="space-y-2 lg:col-span-6">
          <Label htmlFor="specified_quantity">Specified Quantity (kg) *</Label>
          <Input
            id="specified_quantity"
            type="number"
            required
            value={packaging.specifiedQuantity}
            onChange={(e) => handleFieldChange('specifiedQuantity', e.target.value)}
            placeholder="Enter quantity in kg"
            className={baseFieldClass}
            disabled={disabled}
            min="0"
            step="0.01"
          />
        </div>

        <div className="space-y-2 lg:col-span-6">
          <Label htmlFor="strength_integrity">Strength/Integrity *</Label>
          <select
            id="strength_integrity"
            required
            value={packaging.strengthIntegrity}
            onChange={(e) => handleFieldChange('strengthIntegrity', e.target.value)}
            className={baseFieldClass}
            disabled={disabled}
          >
            {goodBadNaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
