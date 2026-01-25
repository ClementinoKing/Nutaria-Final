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
}

export interface ProcessStepRun {
  id: number
  process_lot_run_id: number
  process_step_id: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  started_at: string | null
  completed_at: string | null
  performed_by: string | null // UUID
  location_id: number | null
  notes: string | null
  // Joined fields
  process_step?: ProcessStep
  performed_by_user?: {
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
  step_code: string
  step_name: string
  description: string | null
  requires_qc: boolean
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
  notes: string
  quantity_out: string
}
