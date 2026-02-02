import { supabase } from './supabaseClient'

/**
 * Calculate available quantity (in kg) at a specific step
 * This subtracts all waste and rejections from previous steps
 */
export async function calculateAvailableQuantity(
  lotRunId: number,
  upToStepRunId?: number | null
): Promise<{
  availableQty: number
  initialQty: number
  totalWaste: number
  breakdown: {
    washingWaste: number
    metalRejections: number
    sortingWaste: number
    packagingWaste: number
  }
}> {
  // Get the supply batch initial quantity
  const { data: lotRun, error: lotRunError } = await supabase
    .from('process_lot_runs')
    .select(`
      supply_batch_id,
      supply_batches:supply_batch_id (
        current_qty
      )
    `)
    .eq('id', lotRunId)
    .single()

  if (lotRunError || !lotRun) {
    throw new Error(`Process lot run ${lotRunId} not found`)
  }

  const initialQty = (lotRun as any).supply_batches?.current_qty || 0

  // Get all step runs for this lot run, ordered by sequence
  const { data: stepRuns, error: stepRunsError } = await supabase
    .from('process_step_runs')
    .select(`
      id,
      process_step_id,
      process_steps:process_step_id (
        seq,
        step_code
      )
    `)
    .eq('process_lot_run_id', lotRunId)
    .order('seq', { ascending: true })

  if (stepRunsError) {
    throw stepRunsError
  }

  // If upToStepRunId is provided, only calculate up to that step
  let stepsToProcess = stepRuns || []
  if (upToStepRunId) {
    const targetStepIndex = stepsToProcess.findIndex((sr: any) => sr.id === upToStepRunId)
    if (targetStepIndex !== -1) {
      stepsToProcess = stepsToProcess.slice(0, targetStepIndex + 1)
    }
  }

  const breakdown = {
    washingWaste: 0,
    metalRejections: 0,
    sortingWaste: 0,
    packagingWaste: 0,
  }

  // Calculate waste/rejections from each step
  for (const stepRun of stepsToProcess) {
    const stepCode = (stepRun as any).process_steps?.step_code?.toUpperCase() || ''

    if (stepCode === 'WASH') {
      // Get washing run and its waste
      const { data: washingRun } = await supabase
        .from('process_washing_runs')
        .select('id')
        .eq('process_step_run_id', stepRun.id)
        .maybeSingle()

      if (washingRun) {
        const { data: waste } = await supabase
          .from('process_washing_waste')
          .select('quantity_kg')
          .eq('washing_run_id', washingRun.id)

        if (waste) {
          const totalWaste = waste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
          breakdown.washingWaste += totalWaste
        }
      }
    } else if (stepCode === 'METAL') {
      // Get metal detection session and its rejections
      const { data: session } = await supabase
        .from('process_metal_detector')
        .select('id')
        .eq('process_step_run_id', stepRun.id)
        .maybeSingle()

      if (session) {
        const { data: rejections } = await supabase
          .from('process_foreign_object_rejections')
          .select('weight')
          .eq('session_id', session.id)

        if (rejections) {
          const totalRejections = rejections.reduce(
            (sum, r) => sum + (Number(r.weight) || 0),
            0
          )
          breakdown.metalRejections += totalRejections
        }
      }
    } else if (stepCode === 'SORT') {
      // Get sorting outputs and their waste
      const { data: outputs } = await supabase
        .from('process_sorting_outputs')
        .select('id')
        .eq('process_step_run_id', stepRun.id)

      if (outputs && outputs.length > 0) {
        const outputIds = outputs.map((o: any) => o.id)
        const { data: waste } = await supabase
          .from('process_sorting_waste')
          .select('quantity_kg')
          .in('sorting_run_id', outputIds)

        if (waste) {
          const totalWaste = waste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
          breakdown.sortingWaste += totalWaste
        }
      }
    } else if (stepCode === 'PACK') {
      // Get packaging run and its waste
      const { data: packagingRun } = await supabase
        .from('process_packaging_runs')
        .select('id')
        .eq('process_step_run_id', stepRun.id)
        .maybeSingle()

      if (packagingRun) {
        const { data: waste } = await supabase
          .from('process_packaging_waste')
          .select('quantity_kg')
          .eq('packaging_run_id', packagingRun.id)

        if (waste) {
          const totalWaste = waste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
          breakdown.packagingWaste += totalWaste
        }
      }
    }
  }

  const totalWaste =
    breakdown.washingWaste +
    breakdown.metalRejections +
    breakdown.sortingWaste +
    breakdown.packagingWaste

  const availableQty = Math.max(0, initialQty - totalWaste)

  return {
    availableQty,
    initialQty,
    totalWaste,
    breakdown,
  }
}
