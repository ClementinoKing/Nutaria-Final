import { supabase } from './supabaseClient'
import type {
  ProcessLotRun,
  ProcessStepRun,
  ProcessNonConformance,
  ProcessSignoff,
  ProductionBatch,
  BatchStepTransition,
  ReworkedLot,
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

/**
 * Create a batch step transition record
 * Records movement of a batch between steps (forward, backward, or held)
 */
export async function createBatchStepTransition(
  manufacturingBatchId: number,
  fromStep: string | null,
  toStep: string,
  reason: string | null,
  createdBy: string,
): Promise<BatchStepTransition> {
  const { data, error } = await supabase
    .from('batch_step_transitions')
    .insert({
      manufacturing_batch_id: manufacturingBatchId,
      from_step: fromStep,
      to_step: toStep,
      reason: reason,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as BatchStepTransition
}

/**
 * Save process step quality check data
 * Creates or updates a quality check record and its items
 */
export async function saveProcessStepQualityCheck(
  stepRunId: number,
  qualityCheckData: {
    scores: Record<string, number>
    results: Record<string, string>
    remarks: Record<string, string>
    qualityParameters: Array<{ id: number; code: string }>
    evaluatedBy?: string | null
  }
): Promise<void> {
  const { scores, results, remarks, qualityParameters, evaluatedBy } = qualityCheckData

  // Calculate overall score (average of all scores, excluding N/A which is 4)
  const validScores = Object.values(scores).filter((score) => score > 0 && score !== 4)
  const overallScore =
    validScores.length > 0 ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length : null

  // Determine status based on scores
  const hasFailures = Object.values(scores).some((score) => score > 0 && score < 3 && score !== 4)
  const status = hasFailures ? 'FAIL' : 'PASS'

  // Check if quality check already exists for this step run
  const { data: existingCheck, error: checkError } = await supabase
    .from('process_step_quality_checks')
    .select('id')
    .eq('process_step_run_id', stepRunId)
    .maybeSingle()

  // If table doesn't exist, provide helpful error
  if (checkError) {
    const errorMessage = checkError.message || ''
    const errorCode = (checkError as any).code || ''
    
    // Check for table not found errors (PGRST205, PGRST116, 404, etc.)
    if (
      errorCode === 'PGRST205' ||
      errorCode === 'PGRST116' ||
      errorMessage.includes('Could not find the table') ||
      errorMessage.includes('relation') ||
      errorMessage.includes('does not exist') ||
      checkError.status === 404
    ) {
      throw new Error(
        'Database tables for process step quality checks do not exist. Please run the migration file: supabase/ddl/migrations/20250202_create_process_step_quality_checks.sql in your Supabase SQL editor.'
      )
    }
    
    throw checkError
  }

  let qualityCheckId: number

  if (existingCheck) {
    // Update existing check
    const { data: updatedCheck, error: updateError } = await supabase
      .from('process_step_quality_checks')
      .update({
        status,
        overall_score: overallScore,
        evaluated_by: evaluatedBy || null,
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingCheck.id)
      .select('id')
      .single()

    if (updateError) {
      throw updateError
    }

    qualityCheckId = updatedCheck.id

    // Delete existing items
    await supabase.from('process_step_quality_check_items').delete().eq('quality_check_id', qualityCheckId)
  } else {
    // Create new check
    const { data: newCheck, error: createError } = await supabase
      .from('process_step_quality_checks')
      .insert({
        process_step_run_id: stepRunId,
        status,
        overall_score: overallScore,
        evaluated_by: evaluatedBy || null,
        evaluated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (createError) {
      throw createError
    }

    qualityCheckId = newCheck.id
  }

  // Create quality check items
  const itemsPayload = qualityParameters
    .map((param) => {
      const score = scores[param.code]
      if (!score || score === 0) {
        return null
      }

      return {
        quality_check_id: qualityCheckId,
        parameter_id: param.id,
        score: score,
        remarks: remarks[param.code]?.trim() || null,
        results: results[param.code]?.trim() || null,
      }
    })
    .filter(Boolean)

  if (itemsPayload.length > 0) {
    const { error: itemsError } = await supabase.from('process_step_quality_check_items').insert(itemsPayload)

    if (itemsError) {
      throw itemsError
    }
  }
}

/**
 * Get process step quality check data
 * Returns the quality check record and its items
 */
export async function getProcessStepQualityCheck(stepRunId: number): Promise<{
  qualityCheck: {
    id: number
    status: string
    overall_score: number | null
    remarks: string | null
    evaluated_by: string | null
    evaluated_at: string | null
  } | null
  items: Array<{
    id: number
    parameter_id: number
    score: number
    remarks: string | null
    results: string | null
    quality_parameter: {
      id: number
      code: string
      name: string
    }
  }>
}> {
  // Fetch quality check
  const { data: qualityCheck, error: checkError } = await supabase
    .from('process_step_quality_checks')
    .select('id, status, overall_score, remarks, evaluated_by, evaluated_at')
    .eq('process_step_run_id', stepRunId)
    .maybeSingle()

  if (checkError && checkError.code !== 'PGRST205' && checkError.code !== 'PGRST116') {
    throw checkError
  }

  if (!qualityCheck) {
    return { qualityCheck: null, items: [] }
  }

  // Fetch quality check items with parameter details
  const { data: items, error: itemsError } = await supabase
    .from('process_step_quality_check_items')
    .select(`
      id,
      parameter_id,
      score,
      remarks,
      results,
      quality_parameters:parameter_id (
        id,
        code,
        name
      )
    `)
    .eq('quality_check_id', qualityCheck.id)
    .order('parameter_id')

  if (itemsError) {
    throw itemsError
  }

  // Transform the data to flatten the nested quality_parameters
  const transformedItems = (items || []).map((item: any) => ({
    id: item.id,
    parameter_id: item.parameter_id,
    score: item.score,
    remarks: item.remarks,
    results: item.results,
    quality_parameter: Array.isArray(item.quality_parameters)
      ? item.quality_parameters[0]
      : item.quality_parameters,
  }))

  return {
    qualityCheck,
    items: transformedItems,
  }
}

/**
 * Generate a unique rework lot number
 * Format: REWORK-{original_lot_no}-{timestamp}
 */
async function generateReworkLotNumber(originalLotNo: string): Promise<string> {
  const timestamp = Date.now().toString().slice(-6) // Last 6 digits of timestamp
  const baseLotNo = `REWORK-${originalLotNo}-${timestamp}`
  
  // Check if lot number already exists, append sequence if needed
  const { data: existing } = await supabase
    .from('supply_batches')
    .select('lot_no')
    .eq('lot_no', baseLotNo)
    .maybeSingle()

  if (!existing) {
    return baseLotNo
  }

  // If exists, try with sequence numbers
  let sequence = 1
  let lotNo = `${baseLotNo}-${sequence}`
  
  while (true) {
    const { data: check } = await supabase
      .from('supply_batches')
      .select('lot_no')
      .eq('lot_no', lotNo)
      .maybeSingle()

    if (!check) {
      return lotNo
    }
    
    sequence++
    lotNo = `${baseLotNo}-${sequence}`
    
    if (sequence > 999) {
      throw new Error('Unable to generate unique rework lot number')
    }
  }
}

/**
 * Create a reworked lot from a sorting step
 * Creates a new supply batch from the original supply batch, links it to the original, and creates a process lot run
 * The quantity is taken from the supply batch's available quantity, not from sorting outputs
 */
export async function createReworkedLot(
  processStepRunId: number,
  quantityKg: number,
  reason: string | null,
  userId: string | null
): Promise<{
  reworkBatchId: number
  reworkLotRunId: number
  reworkedLot: ReworkedLot
}> {
  // Get the process step run and its lot run
  const { data: stepRun, error: stepRunError } = await supabase
    .from('process_step_runs')
    .select(`
      id,
      process_lot_run_id,
      process_lot_runs:process_lot_run_id (
        id,
        supply_batch_id,
        process_id,
        supply_batches:supply_batch_id (
          id,
          lot_no,
          product_id,
          unit_id,
          supply_id,
          current_qty,
          expiry_date
        )
      )
    `)
    .eq('id', processStepRunId)
    .single()

  if (stepRunError || !stepRun) {
    throw new Error(`Process step run ${processStepRunId} not found`)
  }

  const lotRun = (stepRun as any).process_lot_runs
  if (!lotRun) {
    throw new Error(`Process lot run not found for step run ${processStepRunId}`)
  }

  const originalBatch = (lotRun as any).supply_batches
  if (!originalBatch) {
    throw new Error(`Supply batch not found for lot run ${lotRun.id}`)
  }

  if (quantityKg <= 0) {
    throw new Error('Rework quantity must be greater than zero')
  }

  // Get sorting outputs to calculate remaining quantity after sorting
  const { data: sortingOutputs } = await supabase
    .from('process_sorting_outputs')
    .select('quantity_kg')
    .eq('process_step_run_id', processStepRunId)

  const totalOutputQuantity = sortingOutputs?.reduce((sum, o) => sum + (Number(o.quantity_kg) || 0), 0) || 0

  // Get existing reworks for this step run
  const { data: existingReworks } = await supabase
    .from('reworked_lots')
    .select('quantity_kg')
    .eq('process_step_run_id', processStepRunId)

  const totalReworkQuantity = existingReworks?.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0) || 0

  // Calculate available quantity: initial - waste from previous steps - sorting outputs
  // Reworks come from remaining after sorting outputs
  const { data: lotRunForQty } = await supabase
    .from('process_lot_runs')
    .select(`
      supply_batches:supply_batch_id (
        current_qty
      )
    `)
    .eq('id', lotRun.id)
    .single()

  const initialQty = (lotRunForQty as any)?.supply_batches?.current_qty || 0

  // Get waste from previous steps (before sorting)
  const { data: previousStepRuns } = await supabase
    .from('process_step_runs')
    .select(`
      id,
      process_steps:process_step_id (
        seq,
        step_code
      )
    `)
    .eq('process_lot_run_id', lotRun.id)

  let previousWaste = 0
  if (previousStepRuns) {
    const sortStepRun = previousStepRuns.find((sr: any) => {
      const stepCode = (sr.process_steps?.step_code || '').toUpperCase()
      return stepCode === 'SORT'
    })
    const sortStepSeq = sortStepRun?.process_steps?.seq || 999

    for (const prevStepRun of previousStepRuns) {
      const stepSeq = prevStepRun.process_steps?.seq || 0
      const stepCode = (prevStepRun.process_steps?.step_code || '').toUpperCase()
      
      if (stepSeq < sortStepSeq) {
        // Calculate waste from this step
        if (stepCode === 'WASH') {
          const { data: washRun } = await supabase
            .from('process_washing_runs')
            .select('id')
            .eq('process_step_run_id', prevStepRun.id)
            .maybeSingle()
          if (washRun) {
            const { data: washWaste } = await supabase
              .from('process_washing_waste')
              .select('quantity_kg')
              .eq('washing_run_id', washRun.id)
            if (washWaste) {
              previousWaste += washWaste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
            }
          }
        } else if (stepCode === 'METAL') {
          const { data: metalSession } = await supabase
            .from('process_metal_detector')
            .select('id')
            .eq('process_step_run_id', prevStepRun.id)
            .maybeSingle()
          if (metalSession) {
            const { data: rejections } = await supabase
              .from('process_foreign_object_rejections')
              .select('weight')
              .eq('session_id', metalSession.id)
            if (rejections) {
              previousWaste += rejections.reduce((sum, r) => sum + (Number(r.weight) || 0), 0)
            }
          }
        }
      }
    }
  }

  // Available for reworks = initial - previous waste - sorting outputs
  const availableForReworks = Math.max(0, initialQty - previousWaste - totalOutputQuantity)
  const remainingAfterReworks = availableForReworks - totalReworkQuantity

  // Validate quantity doesn't exceed remaining after sorting outputs
  if (quantityKg > remainingAfterReworks) {
    throw new Error(`Rework quantity (${quantityKg} kg) cannot exceed remaining quantity after sorting outputs (${remainingAfterReworks.toFixed(2)} kg)`)
  }

  // Get sorting output for tracking (optional - just for reference)
  const { data: sortingOutput } = await supabase
    .from('process_sorting_outputs')
    .select('id')
    .eq('process_step_run_id', processStepRunId)
    .limit(1)
    .maybeSingle()

  // Generate rework lot number
  const reworkLotNo = await generateReworkLotNumber(originalBatch.lot_no)

  // Create new supply batch for rework
  // Note: We do NOT reduce the original supply batch's current_qty here
  // because reworks are accounted for separately in quantity calculations
  const { data: reworkBatch, error: batchError } = await supabase
    .from('supply_batches')
    .insert({
      supply_id: originalBatch.supply_id,
      product_id: originalBatch.product_id,
      unit_id: originalBatch.unit_id,
      lot_no: reworkLotNo,
      received_qty: quantityKg,
      accepted_qty: quantityKg,
      rejected_qty: 0,
      current_qty: quantityKg,
      quality_status: 'PASSED',
      process_status: 'UNPROCESSED',
      expiry_date: originalBatch.expiry_date,
    })
    .select('id')
    .single()

  if (batchError || !reworkBatch) {
    throw new Error(`Failed to create rework supply batch: ${batchError?.message || 'Unknown error'}`)
  }

  // Create reworked_lots record
  const { data: reworkedLot, error: reworkedLotError } = await supabase
    .from('reworked_lots')
    .insert({
      original_supply_batch_id: originalBatch.id,
      rework_supply_batch_id: reworkBatch.id,
      sorting_output_id: sortingOutput?.id || null,
      process_step_run_id: processStepRunId,
      quantity_kg: quantityKg,
      reason: reason || null,
      created_by: userId || null,
    })
    .select()
    .single()

  if (reworkedLotError || !reworkedLot) {
    // Rollback: delete rework batch
    await supabase.from('supply_batches').delete().eq('id', reworkBatch.id)
    throw new Error(`Failed to create reworked_lots record: ${reworkedLotError?.message || 'Unknown error'}`)
  }

  // Create process lot run for rework (with is_rework flag)
  const { data: reworkLotRun, error: reworkLotRunError } = await supabase
    .from('process_lot_runs')
    .insert({
      supply_batch_id: reworkBatch.id,
      process_id: lotRun.process_id,
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
      is_rework: true,
      original_process_lot_run_id: lotRun.id,
    })
    .select('id')
    .single()

  if (reworkLotRunError || !reworkLotRun) {
    // Rollback: delete reworked_lots record and delete rework batch
    await supabase.from('reworked_lots').delete().eq('id', reworkedLot.id)
    await supabase.from('supply_batches').delete().eq('id', reworkBatch.id)
    throw new Error(`Failed to create rework process lot run: ${reworkLotRunError?.message || 'Unknown error'}`)
  }

  // Create process step runs for the rework (same process as original)
  await createProcessStepRuns(reworkLotRun.id)

  // Update rework batch status to PROCESSING
  await supabase
    .from('supply_batches')
    .update({ process_status: 'PROCESSING' })
    .eq('id', reworkBatch.id)

  return {
    reworkBatchId: reworkBatch.id,
    reworkLotRunId: reworkLotRun.id,
    reworkedLot: reworkedLot as ReworkedLot,
  }
}

/**
 * Skip a process step
 * Validates that the step can be skipped and updates its status
 */
export async function skipProcessStep(
  stepRunId: number,
  userId: string
): Promise<ProcessStepRun> {
  // Get the step run with process step details
  const { data: stepRun, error: stepRunError } = await supabase
    .from('process_step_runs')
    .select(`
      id,
      status,
      process_step_id,
      process_steps:process_step_id (
        id,
        can_be_skipped
      )
    `)
    .eq('id', stepRunId)
    .single()

  if (stepRunError || !stepRun) {
    throw new Error(`Process step run ${stepRunId} not found`)
  }

  const processStep = (stepRun as any).process_steps
  if (!processStep || !processStep.can_be_skipped) {
    throw new Error(`Step cannot be skipped (can_be_skipped is false)`)
  }

  // Validate step is in a skippable state
  if (stepRun.status !== 'PENDING' && stepRun.status !== 'IN_PROGRESS') {
    throw new Error(`Cannot skip step with status ${stepRun.status}`)
  }

  // Update step run to SKIPPED
  const { data: updatedStepRun, error: updateError } = await supabase
    .from('process_step_runs')
    .update({
      status: 'SKIPPED',
      skipped_at: new Date().toISOString(),
      skipped_by: userId,
    })
    .eq('id', stepRunId)
    .select()
    .single()

  if (updateError) {
    throw updateError
  }

  return updatedStepRun as ProcessStepRun
}
