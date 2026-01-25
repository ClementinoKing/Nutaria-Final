import { supabase } from './supabaseClient'
import type {
  ProcessLotRun,
  ProcessStepRun,
  ProcessMeasurement,
  ProcessNonConformance,
  ProcessSignoff,
  ProductionBatch,
} from '@/types/processExecution'

/**
 * Get the default process for a product
 * 1. Check product_processes table for is_default = true
 * 2. Fall back to first process in processes.product_ids array
 */
export async function getDefaultProcessForProduct(productId: number): Promise<number | null> {
  // First, try to find default process in product_processes
  const { data: defaultProcess, error: productProcessError } = await supabase
    .from('product_processes')
    .select('process_id')
    .eq('product_id', productId)
    .eq('is_default', true)
    .maybeSingle()

  if (!productProcessError && defaultProcess) {
    return defaultProcess.process_id
  }

  // Fall back to first process in product_ids array
  const { data: processes, error: processesError } = await supabase
    .from('processes')
    .select('id, product_ids')
    .contains('product_ids', [productId])
    .order('id', { ascending: true })
    .limit(1)

  if (processesError || !processes || processes.length === 0) {
    return null
  }

  const firstProcess = processes[0]
  return firstProcess?.id ?? null
}

/**
 * Create a process lot run for a supply batch
 * Auto-generates process_step_runs via database trigger
 */
export async function createProcessLotRun(supplyBatchId: number): Promise<ProcessLotRun | null> {
  // Get supply batch details
  const { data: supplyBatch, error: batchError } = await supabase
    .from('supply_batches')
    .select('id, product_id, process_status, quality_status')
    .eq('id', supplyBatchId)
    .single()

  if (batchError || !supplyBatch) {
    throw new Error(`Supply batch ${supplyBatchId} not found`)
  }

  // Check if already has a process lot run
  const { data: existingRun } = await supabase
    .from('process_lot_runs')
    .select('id')
    .eq('supply_batch_id', supplyBatchId)
    .maybeSingle()

  if (existingRun) {
    return null // Already exists
  }

  // Get default process for product
  const processId = await getDefaultProcessForProduct(supplyBatch.product_id)

  if (!processId) {
    throw new Error(`No process found for product ${supplyBatch.product_id}`)
  }

  // Create process lot run (trigger will auto-create step runs)
  const { data: lotRun, error: createError } = await supabase
    .from('process_lot_runs')
    .insert({
      supply_batch_id: supplyBatchId,
      process_id: processId,
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
    })
    .select('id, supply_batch_id, process_id, status, started_at, completed_at, created_at, updated_at')
    .single()

  if (createError) {
    throw createError
  }

  // Update supply batch status to PROCESSING
  const { error: updateStatusError } = await supabase
    .from('supply_batches')
    .update({ process_status: 'PROCESSING' })
    .eq('id', supplyBatchId)

  if (updateStatusError) {
    console.warn(`Failed to update supply batch ${supplyBatchId} status to PROCESSING:`, updateStatusError)
    // Don't throw - the lot run was created successfully
  }

  // Verify step runs were created (trigger should have created them)
  // If not, create them manually as a fallback
  const { data: stepRunsCheck } = await supabase
    .from('process_step_runs')
    .select('id')
    .eq('process_lot_run_id', lotRun.id)
    .limit(1)

  if (!stepRunsCheck || stepRunsCheck.length === 0) {
    // Trigger didn't create step runs, create them manually
    console.warn('Trigger did not create step runs, creating manually...')
    const { data: processSteps } = await supabase
      .from('process_steps')
      .select('id')
      .eq('process_id', processId)
      .order('seq', { ascending: true })

    if (processSteps && processSteps.length > 0) {
      const stepRunsToInsert = processSteps.map((ps: any) => ({
        process_lot_run_id: lotRun.id,
        process_step_id: ps.id,
        status: 'PENDING',
      }))

      const { error: insertStepRunsError } = await supabase
        .from('process_step_runs')
        .insert(stepRunsToInsert)

      if (insertStepRunsError) {
        console.error('Failed to manually create step runs:', insertStepRunsError)
        // Don't throw - the lot run was created successfully
      }
    }
  }

  return lotRun as ProcessLotRun
}

/**
 * Manually create process step runs for a process lot run
 * This is a fallback if the trigger didn't create them
 */
export async function createProcessStepRuns(lotRunId: number): Promise<void> {
  // Get the process_id from the lot run
  const { data: lotRun, error: lotRunError } = await supabase
    .from('process_lot_runs')
    .select('id, process_id')
    .eq('id', lotRunId)
    .single()

  if (lotRunError || !lotRun) {
    throw new Error(`Process lot run ${lotRunId} not found`)
  }

  // Check if step runs already exist
  const { data: existingStepRuns } = await supabase
    .from('process_step_runs')
    .select('id')
    .eq('process_lot_run_id', lotRunId)
    .limit(1)

  if (existingStepRuns && existingStepRuns.length > 0) {
    return // Step runs already exist
  }

  // Get all process steps for this process
  const { data: processSteps, error: stepsError } = await supabase
    .from('process_steps')
    .select('id')
    .eq('process_id', (lotRun as any).process_id)
    .order('seq', { ascending: true })

  if (stepsError) {
    throw new Error(`Failed to fetch process steps: ${stepsError.message}`)
  }

  if (!processSteps || processSteps.length === 0) {
    throw new Error(`No process steps found for process ${(lotRun as any).process_id}`)
  }

  // Create step runs
  const stepRunsToInsert = processSteps.map((ps: any) => ({
    process_lot_run_id: lotRunId,
    process_step_id: ps.id,
    status: 'PENDING',
  }))

  const { error: insertError } = await supabase
    .from('process_step_runs')
    .insert(stepRunsToInsert)

  if (insertError) {
    throw insertError
  }
}

/**
 * Update process step run status and timestamps
 */
export async function updateProcessStepRun(
  stepRunId: number,
  updates: {
    status?: ProcessStepRun['status']
    started_at?: string | null
    completed_at?: string | null
    performed_by?: string | null
    location_id?: number | null
    notes?: string | null
  }
): Promise<ProcessStepRun> {
  const { data, error } = await supabase
    .from('process_step_runs')
    .update(updates)
    .eq('id', stepRunId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ProcessStepRun
}

/**
 * Create a process measurement
 */
export async function createProcessMeasurement(
  stepRunId: number,
  measurement: {
    metric: ProcessMeasurement['metric']
    value: number
    unit: string
    recorded_at?: string
  }
): Promise<ProcessMeasurement> {
  const { data, error } = await supabase
    .from('process_measurements')
    .insert({
      process_step_run_id: stepRunId,
      metric: measurement.metric,
      value: measurement.value,
      unit: measurement.unit,
      recorded_at: measurement.recorded_at || new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ProcessMeasurement
}

/**
 * Create a non-conformance record
 */
export async function createNonConformance(
  stepRunId: number,
  nc: {
    nc_type: string
    description: string
    severity: ProcessNonConformance['severity']
    corrective_action?: string | null
  }
): Promise<ProcessNonConformance> {
  const { data, error } = await supabase
    .from('process_non_conformances')
    .insert({
      process_step_run_id: stepRunId,
      nc_type: nc.nc_type,
      description: nc.description,
      severity: nc.severity,
      corrective_action: nc.corrective_action || null,
      resolved: false,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ProcessNonConformance
}

/**
 * Resolve a non-conformance
 */
export async function resolveNonConformance(ncId: number): Promise<ProcessNonConformance> {
  const { data, error } = await supabase
    .from('process_non_conformances')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', ncId)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ProcessNonConformance
}

/**
 * Create a process signoff
 * signed_by should be the auth user UUID
 */
export async function createProcessSignoff(
  lotRunId: number,
  signoff: {
    role: ProcessSignoff['role']
    signed_by: string // Auth user UUID
  }
): Promise<ProcessSignoff> {
  const { data, error } = await supabase
    .from('process_signoffs')
    .insert({
      process_lot_run_id: lotRunId,
      role: signoff.role,
      signed_by: signoff.signed_by,
      signed_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as ProcessSignoff
}

/**
 * Generate production batch code
 * Format: PROD-{YYYYMMDD}-{sequence}
 */
async function generateProductionBatchCode(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `PROD-${today}-`

  // Get the highest sequence number for today
  const { data: existingBatches } = await supabase
    .from('production_batches')
    .select('batch_code')
    .like('batch_code', `${prefix}%`)
    .order('batch_code', { ascending: false })
    .limit(1)

  let sequence = 1
  const firstBatch = existingBatches?.[0]
  if (firstBatch?.batch_code) {
    const lastCode = firstBatch.batch_code
    const lastSequence = parseInt(lastCode.split('-').pop() || '0', 10)
    sequence = lastSequence + 1
  }

  return `${prefix}${String(sequence).padStart(3, '0')}`
}

/**
 * Create a production batch when process is completed
 */
export async function createProductionBatch(lotRunId: number): Promise<ProductionBatch> {
  // Get process lot run with supply batch details
  const { data: lotRun, error: lotRunError } = await supabase
    .from('process_lot_runs')
    .select(`
      id,
      supply_batch_id,
      supply_batches:supply_batch_id (
        id,
        product_id,
        current_qty,
        unit_id,
        expiry_date,
        units:unit_id (
          symbol
        )
      )
    `)
    .eq('id', lotRunId)
    .single()

  if (lotRunError || !lotRun) {
    throw new Error(`Process lot run ${lotRunId} not found`)
  }

  const supplyBatch = (lotRun as any).supply_batches
  if (!supplyBatch) {
    throw new Error(`Supply batch not found for lot run ${lotRunId}`)
  }

  // Get the last completed step to get final quantity
  // For now, use supply batch current_qty as quantity
  // TODO: Could calculate from step measurements if available
  const quantity = supplyBatch.current_qty || 0
  const unit = (supplyBatch.units as any)?.symbol || ''

  const batchCode = await generateProductionBatchCode()

  const { data: productionBatch, error: createError } = await supabase
    .from('production_batches')
    .insert({
      process_lot_run_id: lotRunId,
      product_id: supplyBatch.product_id,
      batch_code: batchCode,
      quantity: quantity,
      unit: unit,
      expiry_date: supplyBatch.expiry_date,
    })
    .select()
    .single()

  if (createError) {
    throw createError
  }

  return productionBatch as ProductionBatch
}

/**
 * Complete a process lot run
 * Checks all steps are completed, creates production batch, updates status
 */
export async function completeProcessLotRun(lotRunId: number): Promise<{
  lotRun: ProcessLotRun
  productionBatch: ProductionBatch
}> {
  // Check all steps are completed
  const { data: stepRuns, error: stepsError } = await supabase
    .from('process_step_runs')
    .select('id, status')
    .eq('process_lot_run_id', lotRunId)

  if (stepsError) {
    throw stepsError
  }

  const allCompleted = stepRuns?.every((step) => step.status === 'COMPLETED') ?? false
  if (!allCompleted) {
    throw new Error('Cannot complete process: not all steps are completed')
  }

  // Check for unresolved non-conformances (optional - may allow with warning)
  const { data: unresolvedNCs } = await supabase
    .from('process_non_conformances')
    .select('id')
    .eq('resolved', false)
    .in(
      'process_step_run_id',
      stepRuns.map((s) => s.id)
    )

  if (unresolvedNCs && unresolvedNCs.length > 0) {
    // Warning: unresolved NCs exist, but allow completion
    console.warn(`Process ${lotRunId} has ${unresolvedNCs.length} unresolved non-conformances`)
  }

  // Update lot run status
  const { data: updatedLotRun, error: updateError } = await supabase
    .from('process_lot_runs')
    .update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    })
    .eq('id', lotRunId)
    .select()
    .single()

  if (updateError) {
    throw updateError
  }

  // Create production batch
  const productionBatch = await createProductionBatch(lotRunId)

  // Update supply batch status
  const { data: lotRun } = await supabase
    .from('process_lot_runs')
    .select('supply_batch_id')
    .eq('id', lotRunId)
    .single()

  if (lotRun) {
    await supabase
      .from('supply_batches')
      .update({ process_status: 'PROCESSED' })
      .eq('id', (lotRun as any).supply_batch_id)
  }

  return {
    lotRun: updatedLotRun as ProcessLotRun,
    productionBatch,
  }
}
