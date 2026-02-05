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
    dryingWaste: number
    metalRejections: number
    metalWaste: number
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

  // Get initial quantity from supply batch
  // Note: Reworks and sorting outputs/waste are NOT deducted from current_qty
  // They are handled within the sorting step itself with sequential deduction: outputs → reworks → waste
  const initialQty = (lotRun as any).supply_batches?.current_qty || 0

  // Get all step runs for this lot run (no embed: process_step_runs has no seq, and process_steps schema varies)
  const { data: stepRunsRaw, error: stepRunsError } = await supabase
    .from('process_step_runs')
    .select('id, process_step_id')
    .eq('process_lot_run_id', lotRunId)

  if (stepRunsError) {
    throw stepRunsError
  }

  const stepIds = (stepRunsRaw || [])
    .map((sr: any) => sr.process_step_id)
    .filter((id: unknown): id is number => id != null && typeof id === 'number')

  if (stepIds.length === 0) {
    return {
      availableQty: initialQty,
      initialQty,
      totalWaste: 0,
      breakdown: {
        washingWaste: 0,
        dryingWaste: 0,
        metalRejections: 0,
        metalWaste: 0,
        sortingWaste: 0,
        packagingWaste: 0,
      },
    }
  }

  // Fetch process_steps (id, seq only - columns that exist in all schemas)
  const { data: stepsData, error: stepsError } = await supabase
    .from('process_steps')
    .select('id, seq')
    .in('id', [...new Set(stepIds)])

  if (stepsError) {
    throw stepsError
  }

  const stepsById = new Map<number, number>()
  ;(stepsData || []).forEach((s: any) => {
    stepsById.set(s.id, s.seq ?? 0)
  })

  // Resolve step codes using step_name_id + process_step_names (avoids step_code column on older schemas)
  const stepCodeByStepId = new Map<number, string>()
  const { data: stepsWithNameId } = await supabase
    .from('process_steps')
    .select('id, step_name_id')
    .in('id', [...new Set(stepIds)])

  const stepNameIds = (stepsWithNameId || [])
    .map((s: any) => s.step_name_id)
    .filter((id: unknown): id is number => id != null && typeof id === 'number')

  const nameIdToCode = new Map<number, string>()
  if (stepNameIds.length > 0) {
    const { data: namesData } = await supabase
      .from('process_step_names')
      .select('id, code')
      .in('id', [...new Set(stepNameIds)])
    ;(namesData || []).forEach((n: any) => {
      nameIdToCode.set(n.id, ((n.code ?? '') as string).toUpperCase())
    })
  }

  stepsWithNameId?.forEach((s: any) => {
    const code = s.step_name_id ? nameIdToCode.get(s.step_name_id) : null
    if (code) stepCodeByStepId.set(s.id, code)
  })

  // Build step runs with seq and step code, sorted by seq
  const stepRuns = (stepRunsRaw || [])
    .map((sr: any) => {
      const seq = stepsById.get(sr.process_step_id) ?? 0
      const code = stepCodeByStepId.get(sr.process_step_id) ?? ''
      return { id: sr.id, process_step_id: sr.process_step_id, process_steps: { seq, _code: code } }
    })
    .filter((x) => x !== null)
    .sort((a, b) => a.process_steps.seq - b.process_steps.seq)

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
    dryingWaste: 0,
    metalRejections: 0,
    metalWaste: 0,
    sortingWaste: 0,
    packagingWaste: 0,
  }

  // Calculate waste/rejections from each step
  for (const stepRun of stepsToProcess) {
    const stepCode = ((stepRun as any).process_steps?._code as string) || ''

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
    } else if (stepCode === 'DRY') {
      const { data: dryingRun } = await supabase
        .from('process_drying_runs')
        .select('id')
        .eq('process_step_run_id', stepRun.id)
        .maybeSingle()

      if (dryingRun) {
        const { data: waste } = await supabase
          .from('process_drying_waste')
          .select('quantity_kg')
          .eq('drying_run_id', dryingRun.id)

        if (waste) {
          const totalWaste = waste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
          breakdown.dryingWaste += totalWaste
        }
      }
    } else if (stepCode === 'METAL') {
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

      const { data: metalWaste } = await supabase
        .from('process_metal_detector_waste')
        .select('quantity_kg')
        .eq('process_step_run_id', stepRun.id)

      if (metalWaste) {
        const totalMetalWaste = metalWaste.reduce((sum, w) => sum + (Number(w.quantity_kg) || 0), 0)
        breakdown.metalWaste += totalMetalWaste
      }
    } else if (stepCode === 'SORT') {
      // Sorting step: outputs, reworks, and waste are handled within the sorting step UI
      // with sequential deduction: outputs → reworks → waste
      // We do NOT deduct sorting waste or reworks here because they come from the remaining
      // quantity after sorting outputs, not from the initial supply quantity
      // The available quantity returned here is used as the base for sorting step calculations
      // Sorting waste is tracked in breakdown for reporting but not deducted from availableQty
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
          // Note: sortingWaste is tracked but NOT deducted from availableQty
          // because it's handled within the sorting step's sequential calculation
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

  // Calculate total waste from steps BEFORE sorting
  // Sorting waste and reworks are NOT included here because they are handled
  // within the sorting step with sequential deduction: outputs → reworks → waste
  const totalWaste =
    breakdown.washingWaste +
    breakdown.dryingWaste +
    breakdown.metalRejections +
    breakdown.metalWaste +
    breakdown.packagingWaste

  // Available quantity = initial - waste from previous steps (before sorting)
  // This becomes the base for sorting step calculations where:
  // remainingAfterOutputs = availableQty - sorting outputs
  // remainingAfterReworks = remainingAfterOutputs - reworks
  // remainingAfterWaste = remainingAfterReworks - sorting waste
  const availableQty = Math.max(0, initialQty - totalWaste)

  return {
    availableQty,
    initialQty,
    totalWaste,
    breakdown,
  }
}
