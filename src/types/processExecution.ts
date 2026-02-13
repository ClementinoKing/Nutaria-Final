export interface ProcessLotRun {
  id: number
  supply_batch_id: number
  process_id: number
  status: 'IN_PROGRESS' | 'COMPLETED'
  step_progress?: unknown // JSONB - kept for backward compatibility
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  is_rework?: boolean
  original_process_lot_run_id?: number | null
}

export interface ProcessRunLot {
  id: number
  process_lot_run_id: number
  supply_batch_id: number
  is_primary: boolean
  created_at: string
  supply_batch?: {
    id: number
    lot_no: string
    product_id: number
    current_qty: number
    unit_id: number
    process_status: string
    quality_status: string
    products?: {
      name: string
      sku: string | null
    }
    units?: {
      name: string
      symbol: string
    }
  }
}

export interface ProcessStepRun {
  id: number
  process_lot_run_id: number
  process_step_id: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
  started_at: string | null
  completed_at: string | null
  performed_by: string | null // UUID
  location_id: number | null
  skipped_at?: string | null
  skipped_by?: string | null // UUID
  // Joined fields
  process_step?: ProcessStep
  performed_by_user?: {
    id: string
    full_name?: string
    email?: string
  }
  skipped_by_user?: {
    id: string
    full_name?: string
    email?: string
  }
  location?: {
    id: number
    name: string
  }
}

export interface ProcessStep {
  id: number
  process_id: number
  seq: number
  step_code: string | null
  step_name: string | null
  step_name_id: number | null
  description: string | null
  requires_qc: boolean
  can_be_skipped?: boolean
  default_location_id: number | null
  estimated_duration: string | null
  created_at: string
  updated_at: string
}

export interface ProcessMeasurement {
  id: number
  process_step_run_id: number
  metric: 'moisture_in' | 'moisture_out' | 'weight' | 'temp'
  value: number
  unit: string
  recorded_at: string
}

export interface ProcessNonConformance {
  id: number
  process_step_run_id: number
  nc_type: string
  description: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  corrective_action: string | null
  resolved: boolean
  resolved_at: string | null
}

export interface ProcessSignoff {
  id: number
  process_lot_run_id: number
  role: 'operator' | 'supervisor' | 'qa'
  signed_by: string // UUID
  signed_at: string
  // Joined fields
  signed_by_user?: {
    id: string
    full_name?: string
    email?: string
  }
}

export interface ProductionBatch {
  id: number
  process_lot_run_id: number
  supply_batch_id?: number | null
  product_id: number
  batch_code: string
  quantity: number
  unit: string
  expiry_date: string | null
  created_at: string
  // Joined fields
  product?: {
    id: number
    name: string
    sku: string | null
  }
}

export interface ProcessLotRunWithDetails extends ProcessLotRun {
  supply_batch?: {
    id: number
    lot_no: string
    product_id: number
    current_qty: number
    unit_id: number
    process_status: string
    quality_status: string
    products?: {
      name: string
      sku: string | null
    }
    units?: {
      name: string
      symbol: string
    }
  }
  process?: {
    id: number
    code: string
    name: string
    description: string | null
  }
  step_runs?: ProcessStepRun[]
  signoffs?: ProcessSignoff[]
  production_batch?: ProductionBatch
  run_lots?: ProcessRunLot[]
}

// Form state types
export interface MeasurementFormData {
  metric: ProcessMeasurement['metric']
  value: string
  unit: string
  recorded_at: string
}

export interface NonConformanceFormData {
  nc_type: string
  description: string
  severity: ProcessNonConformance['severity']
  corrective_action: string
}

export interface StepExecutionFormData {
  status: ProcessStepRun['status']
  started_at: string | null
  completed_at: string | null
  location_id: string
  quantity_out: string
}

// Washing Step Types
export interface ProcessWashingRun {
  id: number
  process_step_run_id: number
  washing_water_litres: number | null
  oxy_acid_ml: number | null
  moisture_percent: number | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ProcessWashingWaste {
  id: number
  washing_run_id: number
  waste_type: string
  quantity_kg: number
  remarks: string | null
  created_at: string
}

export interface WashingFormData {
  washing_water_litres: string
  oxy_acid_ml: string
  moisture_percent: string
  remarks: string
}

export interface WashingWasteFormData {
  waste_type: string
  quantity_kg: string
  remarks: string
}

// Drying Step Types
export interface ProcessDryingRun {
  id: number
  process_step_run_id: number
  dryer_temperature_c: number | null
  time_in: string | null
  time_out: string | null
  moisture_in: number | null
  moisture_out: number | null
  crates_clean: 'Yes' | 'No' | 'NA' | null
  insect_infestation: 'Yes' | 'No' | 'NA' | null
  dryer_hygiene_clean: 'Yes' | 'No' | 'NA' | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ProcessDryingWaste {
  id: number
  drying_run_id: number
  waste_type: string
  quantity_kg: number
  remarks: string | null
  created_at: string
}

export interface DryingFormData {
  dryer_temperature_c: string
  time_in: string
  time_out: string
  moisture_in: string
  moisture_out: string
  crates_clean: 'Yes' | 'No' | 'NA' | ''
  insect_infestation: 'Yes' | 'No' | 'NA' | ''
  dryer_hygiene_clean: 'Yes' | 'No' | 'NA' | ''
  remarks: string
}

export interface DryingWasteFormData {
  waste_type: string
  quantity_kg: string
  remarks: string
}

// Sorting Step Types
export interface ProcessSortingOutput {
  id: number
  process_step_run_id: number
  product_id: number
  quantity_kg: number
  moisture_percent: number | null
  remarks: string | null
  created_at: string
  updated_at: string
  // Joined fields
  product?: {
    id: number
    name: string
    sku: string | null
  }
}

export interface ProcessSortingWaste {
  id: number
  sorting_run_id: number
  waste_type: string
  quantity_kg: number
  created_at: string
}

export interface SortingOutputFormData {
  product_id: string
  quantity_kg: string
  moisture_percent: string
  remarks: string
}

export interface SortingWasteFormData {
  waste_type: string
  quantity_kg: string
}

// Metal Detection Step Types
export interface ProcessMetalDetector {
  id: number
  process_step_run_id: number
  start_time: string
  end_time: string | null
  created_at: string
  updated_at: string
}

export interface ProcessForeignObjectRejection {
  id: number
  session_id: number
  rejection_time: string
  object_type: string
  weight: number | null
  corrective_action: string | null
  created_at: string
}

export interface MetalDetectionFormData {
  start_time: string
  end_time: string
}

export interface ProcessMetalDetectorWaste {
  id: number
  process_step_run_id: number
  waste_type: string
  quantity_kg: number
  remarks: string | null
  created_at: string
}

export interface ForeignObjectRejectionFormData {
  rejection_time: string
  object_type: string
  weight: string
  corrective_action: string
}

export interface MetalDetectorWasteFormData {
  waste_type: string
  quantity_kg: string
  remarks: string
}

export interface MetalDetectorHourlyCheck {
  hour: string
  fe_1_5mm: 'Yes' | 'No' | ''
  non_fe_1_5mm: 'Yes' | 'No' | ''
  ss_1_5mm: 'Yes' | 'No' | ''
  remarks: string
  corrective_action: string
}

// Packaging Step Types
export interface ProcessPackagingRun {
  id: number
  process_step_run_id: number
  visual_status: string | null
  rework_destination: string | null
  pest_status: string | null
  foreign_object_status: string | null
  mould_status: string | null
  damaged_kernels_pct: number | null
  insect_damaged_kernels_pct: number | null
  nitrogen_used: number | null
  nitrogen_batch_number: string | null
  primary_packaging_type: string | null
  primary_packaging_batch: string | null
  secondary_packaging: string | null
  secondary_packaging_type: string | null
  secondary_packaging_batch: string | null
  label_correct: 'Yes' | 'No' | 'NA' | null
  label_legible: 'Yes' | 'No' | 'NA' | null
  pallet_integrity: 'Yes' | 'No' | 'NA' | null
  allergen_swab_result: string | null
  remarks: string | null
  created_at: string
  updated_at: string
}

export interface ProcessPackagingWeightCheck {
  id: number
  packaging_run_id: number
  check_no: number
  weight_kg: number
  created_at: string
}

export interface ProcessPackagingPhoto {
  id: number
  packaging_run_id: number
  photo_type: 'product' | 'label' | 'pallet'
  file_path: string
  created_at: string
}

export interface ProcessPackagingWaste {
  id: number
  packaging_run_id: number
  waste_type: string
  quantity_kg: number
  created_at: string
}

export interface ProcessPackagingMetalCheckRejection {
  id: number
  metal_check_id: number
  object_type: string
  weight_kg: number
  corrective_action: string | null
  created_by: string | null
  created_at: string
}

export interface ProcessPackagingMetalCheck {
  id: number
  packaging_run_id: number
  sorting_output_id: number
  attempt_no: number
  status: 'PASS' | 'FAIL'
  remarks: string | null
  checked_by: string | null
  checked_at: string
  created_at: string
  updated_at: string
  rejections?: ProcessPackagingMetalCheckRejection[]
}

export interface ProcessPackagingPackEntry {
  id: number
  packaging_run_id: number
  sorting_output_id: number
  product_id: number | null
  packet_unit_code?: string | null
  pack_identifier: string
  quantity_kg: number
  packing_type: string | null
  pack_size_kg?: number | null
  pack_count?: number | null
  remainder_kg?: number | null
  metal_check_status?: 'PASS' | 'FAIL' | null
  metal_check_attempts?: number
  metal_check_last_id?: number | null
  metal_check_last_checked_at?: string | null
  metal_check_last_checked_by?: string | null
}

export interface ProcessPackagingStorageAllocation {
  id: number
  packaging_run_id: number
  pack_entry_id: number
  storage_type: 'BOX' | 'BAG' | 'SHOP_PACKING'
  box_unit_code?: string | null
  units_count: number
  packs_per_unit: number
  total_packs: number
  total_quantity_kg: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PackagingFormData {
  visual_status: string
  rework_destination: string
  pest_status: string
  foreign_object_status: string
  mould_status: string
  damaged_kernels_pct: string
  insect_damaged_kernels_pct: string
  nitrogen_used: string
  nitrogen_batch_number: string
  primary_packaging_type: string
  primary_packaging_batch: string
  secondary_packaging: string
  secondary_packaging_type: string
  secondary_packaging_batch: string
  label_correct: 'Yes' | 'No' | 'NA' | ''
  label_legible: 'Yes' | 'No' | 'NA' | ''
  pallet_integrity: 'Yes' | 'No' | 'NA' | ''
  allergen_swab_result: string
  remarks: string
}

export interface PackagingWeightCheckFormData {
  check_no: number
  weight_kg: string
}

export interface PackagingWasteFormData {
  waste_type: string
  quantity_kg: string
}

export interface PackagingMetalCheckAttemptFormData {
  status: 'PASS' | 'FAIL' | ''
  remarks: string
}

export interface PackagingMetalCheckRejectionFormData {
  object_type: string
  weight_kg: string
  corrective_action: string
}

export interface PackagingStorageAllocationFormData {
  pack_entry_id: string
  storage_type: '' | 'BOX' | 'BAG' | 'SHOP_PACKING'
  box_unit_code?: string
  units_count: string
  packs_per_unit: string
  notes: string
}

// Batch Step Transitions
export interface BatchStepTransition {
  id: number
  manufacturing_batch_id: number
  from_step: string | null
  to_step: string
  reason: string | null
  created_by: string // UUID
  created_at: string
  // Joined fields
  created_by_user?: {
    id: string
    full_name?: string
    email?: string
  }
}

// Reworked Lots
export interface ReworkedLot {
  id: number
  original_supply_batch_id: number
  rework_supply_batch_id: number
  sorting_output_id: number | null
  process_step_run_id: number
  quantity_kg: number
  reason: string | null
  created_at: string
  created_by: string | null // UUID
  // Joined fields
  original_supply_batch?: {
    id: number
    lot_no: string
  }
  rework_supply_batch?: {
    id: number
    lot_no: string
  }
  sorting_output?: ProcessSortingOutput
  created_by_user?: {
    id: string
    full_name?: string
    email?: string
  }
}
