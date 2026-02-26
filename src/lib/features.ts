export function isFeatureEnabled(flag: string | undefined): boolean {
  if (!flag) return false
  const normalized = String(flag).trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export const FEATURE_INVENTORY_ADJUSTMENTS = isFeatureEnabled(import.meta.env.VITE_FEATURE_INVENTORY_ADJUSTMENTS)
export const FEATURE_CYCLE_COUNTS = isFeatureEnabled(import.meta.env.VITE_FEATURE_CYCLE_COUNTS)
export const FEATURE_CARRIERS = isFeatureEnabled(import.meta.env.VITE_FEATURE_CARRIERS)
export const FEATURE_ACTIVITY_TIMELINES = isFeatureEnabled(import.meta.env.VITE_FEATURE_ACTIVITY_TIMELINES)
export const FEATURE_SHIPMENT_LOT_ALLOCATIONS = isFeatureEnabled(import.meta.env.VITE_FEATURE_SHIPMENT_LOT_ALLOCATIONS)
export const FEATURE_PROCESSING_PRODUCT_WIZARD = isFeatureEnabled(import.meta.env.VITE_FEATURE_PROCESSING_PRODUCT_WIZARD)
