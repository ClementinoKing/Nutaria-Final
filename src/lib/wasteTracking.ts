import { supabase } from '@/lib/supabaseClient'

export type WasteSourceKind =
  | 'WASHING_WASTE'
  | 'DRYING_WASTE'
  | 'SORTING_WASTE'
  | 'PACKAGING_WASTE'
  | 'METAL_DETECTOR_WASTE'
  | 'METAL_DETECTOR_FOREIGN_OBJECT'
  | 'PACKAGING_FOREIGN_OBJECT'

export interface WasteRecord {
  id: string
  lot_run_id: number
  source: WasteSourceKind
  waste_type_or_object: string
  quantity_kg: number
  recorded_at: string | null
  remarks: string | null
  step_run_id: number | null
}

export interface LotWasteSummary {
  lot_run_id: number
  lot_no: string | null
  qa_status: string | null
  supplier_name: string | null
  supply_doc_no: string | null
  waste_kg: number
  foreign_object_kg: number
  lost_kg: number
  records_count: number
  last_recorded_at: string | null
}

export interface LotWasteContext {
  lot_run_id: number
  lot_no: string | null
  qa_status: string | null
  supplier_name: string | null
  supply_doc_no: string | null
  process_status: string | null
  started_at: string | null
  completed_at: string | null
}

export interface WasteTrackingData {
  records: WasteRecord[]
  summaries: LotWasteSummary[]
  lotContexts: LotWasteContext[]
}

interface LoadWasteTrackingOptions {
  lotRunId?: number | null
}

const EMPTY_RESULT: WasteTrackingData = {
  records: [],
  summaries: [],
  lotContexts: [],
}

function toNum(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function findLotRunId(
  sourceName: string,
  sourceId: number,
  stepRunId: number | null,
  stepRunToLotRun: Map<number, number>
): number | null {
  if (!stepRunId) {
    console.warn(`[wasteTracking] ${sourceName}:${sourceId} has no step_run_id mapping`)
    return null
  }
  const lotRunId = stepRunToLotRun.get(stepRunId) ?? null
  if (!lotRunId) {
    console.warn(`[wasteTracking] ${sourceName}:${sourceId} step_run_id=${stepRunId} has no lot_run mapping`)
    return null
  }
  return lotRunId
}

export async function loadWasteTrackingData(options: LoadWasteTrackingOptions = {}): Promise<WasteTrackingData> {
  const { lotRunId = null } = options

  const lotRunQuery = supabase
    .from('process_lot_runs')
    .select(`
      id,
      status,
      started_at,
      completed_at,
      supply_batches(
        lot_no,
        quality_status,
        supplies(
          doc_no,
          suppliers(name)
        )
      )
    `)
    .order('id', { ascending: false })

  if (lotRunId) {
    lotRunQuery.eq('id', lotRunId)
  }

  const { data: lotRunsData, error: lotRunsError } = await lotRunQuery
  if (lotRunsError) throw lotRunsError

  const lotContexts: LotWasteContext[] = ((lotRunsData ?? []) as any[]).map((row) => ({
    lot_run_id: row.id,
    lot_no: row.supply_batches?.lot_no ?? null,
    qa_status: row.supply_batches?.quality_status ?? null,
    supplier_name: row.supply_batches?.supplies?.suppliers?.name ?? null,
    supply_doc_no: row.supply_batches?.supplies?.doc_no ?? null,
    process_status: row.status ?? null,
    started_at: row.started_at ?? null,
    completed_at: row.completed_at ?? null,
  }))

  if (lotContexts.length === 0) return EMPTY_RESULT

  const validLotRunIds = lotContexts.map((row) => row.lot_run_id)
  const lotContextById = new Map(validLotRunIds.map((id, idx) => [id, lotContexts[idx]]))

  const stepRunQuery = supabase
    .from('process_step_runs')
    .select('id, process_lot_run_id')
    .in('process_lot_run_id', validLotRunIds)

  const { data: stepRunsData, error: stepRunsError } = await stepRunQuery
  if (stepRunsError) throw stepRunsError

  const stepRuns = (stepRunsData ?? []) as Array<{ id: number; process_lot_run_id: number }>
  const stepRunIds = stepRuns.map((row) => row.id)
  const stepRunToLotRun = new Map(stepRuns.map((row) => [row.id, row.process_lot_run_id]))
  if (stepRunIds.length === 0) {
    return { records: [], summaries: [], lotContexts }
  }

  const [washingRunsRes, dryingRunsRes, sortingOutputsRes, packagingRunsRes, metalSessionsRes] = await Promise.all([
    supabase.from('process_washing_runs').select('id, process_step_run_id').in('process_step_run_id', stepRunIds),
    supabase.from('process_drying_runs').select('id, process_step_run_id').in('process_step_run_id', stepRunIds),
    supabase.from('process_sorting_outputs').select('id, process_step_run_id').in('process_step_run_id', stepRunIds),
    supabase.from('process_packaging_runs').select('id, process_step_run_id').in('process_step_run_id', stepRunIds),
    supabase.from('process_metal_detector').select('id, process_step_run_id').in('process_step_run_id', stepRunIds),
  ])

  if (washingRunsRes.error) throw washingRunsRes.error
  if (dryingRunsRes.error) throw dryingRunsRes.error
  if (sortingOutputsRes.error) throw sortingOutputsRes.error
  if (packagingRunsRes.error) throw packagingRunsRes.error
  if (metalSessionsRes.error) throw metalSessionsRes.error

  const washingRuns = (washingRunsRes.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>
  const dryingRuns = (dryingRunsRes.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>
  const sortingOutputs = (sortingOutputsRes.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>
  const packagingRuns = (packagingRunsRes.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>
  const metalSessions = (metalSessionsRes.data ?? []) as Array<{ id: number; process_step_run_id: number | null }>

  const washingRunToStepRun = new Map(washingRuns.map((row) => [row.id, row.process_step_run_id ?? null]))
  const dryingRunToStepRun = new Map(dryingRuns.map((row) => [row.id, row.process_step_run_id ?? null]))
  const sortingOutputToStepRun = new Map(sortingOutputs.map((row) => [row.id, row.process_step_run_id ?? null]))
  const packagingRunToStepRun = new Map(packagingRuns.map((row) => [row.id, row.process_step_run_id ?? null]))
  const metalSessionToStepRun = new Map(metalSessions.map((row) => [row.id, row.process_step_run_id ?? null]))

  const washingRunIds = washingRuns.map((row) => row.id)
  const dryingRunIds = dryingRuns.map((row) => row.id)
  const sortingOutputIds = sortingOutputs.map((row) => row.id)
  const packagingRunIds = packagingRuns.map((row) => row.id)
  const metalSessionIds = metalSessions.map((row) => row.id)

  const [
    washingWasteRes,
    dryingWasteRes,
    sortingWasteRes,
    packagingWasteRes,
    metalWasteRes,
    metalFoRes,
    packagingChecksRes,
  ] = await Promise.all([
    washingRunIds.length
      ? supabase.from('process_washing_waste').select('id, washing_run_id, waste_type, quantity_kg, remarks, created_at').in('washing_run_id', washingRunIds)
      : Promise.resolve({ data: [], error: null } as const),
    dryingRunIds.length
      ? supabase.from('process_drying_waste').select('id, drying_run_id, waste_type, quantity_kg, remarks, created_at').in('drying_run_id', dryingRunIds)
      : Promise.resolve({ data: [], error: null } as const),
    sortingOutputIds.length
      ? supabase.from('process_sorting_waste').select('id, sorting_run_id, waste_type, quantity_kg, created_at').in('sorting_run_id', sortingOutputIds)
      : Promise.resolve({ data: [], error: null } as const),
    packagingRunIds.length
      ? supabase.from('process_packaging_waste').select('id, packaging_run_id, waste_type, quantity_kg, created_at').in('packaging_run_id', packagingRunIds)
      : Promise.resolve({ data: [], error: null } as const),
    supabase.from('process_metal_detector_waste').select('id, process_step_run_id, waste_type, quantity_kg, remarks, created_at').in('process_step_run_id', stepRunIds),
    metalSessionIds.length
      ? supabase.from('process_foreign_object_rejections').select('id, session_id, object_type, weight, corrective_action, rejection_time').in('session_id', metalSessionIds)
      : Promise.resolve({ data: [], error: null } as const),
    packagingRunIds.length
      ? supabase.from('process_packaging_metal_checks').select('id, packaging_run_id').in('packaging_run_id', packagingRunIds)
      : Promise.resolve({ data: [], error: null } as const),
  ])

  if (washingWasteRes.error) throw washingWasteRes.error
  if (dryingWasteRes.error) throw dryingWasteRes.error
  if (sortingWasteRes.error) throw sortingWasteRes.error
  if (packagingWasteRes.error) throw packagingWasteRes.error
  if (metalWasteRes.error) throw metalWasteRes.error
  if (metalFoRes.error) throw metalFoRes.error
  if (packagingChecksRes.error) throw packagingChecksRes.error

  const packagingChecks = (packagingChecksRes.data ?? []) as Array<{ id: number; packaging_run_id: number }>
  const checkToPackagingRun = new Map(packagingChecks.map((row) => [row.id, row.packaging_run_id]))
  const packagingCheckIds = packagingChecks.map((row) => row.id)

  const packagingFoRes = packagingCheckIds.length
    ? await supabase
        .from('process_packaging_metal_check_rejections')
        .select('id, metal_check_id, object_type, weight_kg, corrective_action, created_at')
        .in('metal_check_id', packagingCheckIds)
    : ({ data: [], error: null } as const)
  if (packagingFoRes.error) throw packagingFoRes.error

  const records: WasteRecord[] = []

  ;((washingWasteRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = washingRunToStepRun.get(row.washing_run_id) ?? null
    const resolvedLotRunId = findLotRunId('process_washing_waste', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `washing-waste-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'WASHING_WASTE',
      waste_type_or_object: row.waste_type ?? 'Unknown',
      quantity_kg: toNum(row.quantity_kg),
      recorded_at: row.created_at ?? null,
      remarks: row.remarks ?? null,
      step_run_id: stepRunId,
    })
  })

  ;((dryingWasteRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = dryingRunToStepRun.get(row.drying_run_id) ?? null
    const resolvedLotRunId = findLotRunId('process_drying_waste', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `drying-waste-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'DRYING_WASTE',
      waste_type_or_object: row.waste_type ?? 'Unknown',
      quantity_kg: toNum(row.quantity_kg),
      recorded_at: row.created_at ?? null,
      remarks: row.remarks ?? null,
      step_run_id: stepRunId,
    })
  })

  ;((sortingWasteRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = sortingOutputToStepRun.get(row.sorting_run_id) ?? null
    const resolvedLotRunId = findLotRunId('process_sorting_waste', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `sorting-waste-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'SORTING_WASTE',
      waste_type_or_object: row.waste_type ?? 'Unknown',
      quantity_kg: toNum(row.quantity_kg),
      recorded_at: row.created_at ?? null,
      remarks: null,
      step_run_id: stepRunId,
    })
  })

  ;((packagingWasteRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = packagingRunToStepRun.get(row.packaging_run_id) ?? null
    const resolvedLotRunId = findLotRunId('process_packaging_waste', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `packaging-waste-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'PACKAGING_WASTE',
      waste_type_or_object: row.waste_type ?? 'Unknown',
      quantity_kg: toNum(row.quantity_kg),
      recorded_at: row.created_at ?? null,
      remarks: null,
      step_run_id: stepRunId,
    })
  })

  ;((metalWasteRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = row.process_step_run_id ?? null
    const resolvedLotRunId = findLotRunId('process_metal_detector_waste', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `metal-waste-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'METAL_DETECTOR_WASTE',
      waste_type_or_object: row.waste_type ?? 'Unknown',
      quantity_kg: toNum(row.quantity_kg),
      recorded_at: row.created_at ?? null,
      remarks: row.remarks ?? null,
      step_run_id: stepRunId,
    })
  })

  ;((metalFoRes.data ?? []) as any[]).forEach((row) => {
    const stepRunId = metalSessionToStepRun.get(row.session_id) ?? null
    const resolvedLotRunId = findLotRunId('process_foreign_object_rejections', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `metal-fo-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'METAL_DETECTOR_FOREIGN_OBJECT',
      waste_type_or_object: row.object_type ?? 'Unknown object',
      quantity_kg: toNum(row.weight),
      recorded_at: row.rejection_time ?? null,
      remarks: row.corrective_action ?? null,
      step_run_id: stepRunId,
    })
  })

  ;((packagingFoRes.data ?? []) as any[]).forEach((row) => {
    const packagingRunId = checkToPackagingRun.get(row.metal_check_id) ?? null
    const stepRunId = packagingRunId ? packagingRunToStepRun.get(packagingRunId) ?? null : null
    const resolvedLotRunId = findLotRunId('process_packaging_metal_check_rejections', row.id, stepRunId, stepRunToLotRun)
    if (!resolvedLotRunId) return
    records.push({
      id: `packaging-fo-${row.id}`,
      lot_run_id: resolvedLotRunId,
      source: 'PACKAGING_FOREIGN_OBJECT',
      waste_type_or_object: row.object_type ?? 'Unknown object',
      quantity_kg: toNum(row.weight_kg),
      recorded_at: row.created_at ?? null,
      remarks: row.corrective_action ?? null,
      step_run_id: stepRunId,
    })
  })

  const summaryByLot = new Map<number, LotWasteSummary>()
  records.forEach((record) => {
    const context = lotContextById.get(record.lot_run_id)
    if (!context) return
    const existing = summaryByLot.get(record.lot_run_id) ?? {
      lot_run_id: record.lot_run_id,
      lot_no: context.lot_no,
      qa_status: context.qa_status,
      supplier_name: context.supplier_name,
      supply_doc_no: context.supply_doc_no,
      waste_kg: 0,
      foreign_object_kg: 0,
      lost_kg: 0,
      records_count: 0,
      last_recorded_at: null,
    }

    if (record.source.endsWith('_WASTE')) {
      existing.waste_kg += record.quantity_kg
    } else {
      existing.foreign_object_kg += record.quantity_kg
    }
    existing.lost_kg = existing.waste_kg + existing.foreign_object_kg
    existing.records_count += 1
    if (!existing.last_recorded_at || (record.recorded_at && new Date(record.recorded_at) > new Date(existing.last_recorded_at))) {
      existing.last_recorded_at = record.recorded_at
    }
    summaryByLot.set(record.lot_run_id, existing)
  })

  const summaries = Array.from(summaryByLot.values()).sort((a, b) => {
    const aTime = a.last_recorded_at ? new Date(a.last_recorded_at).getTime() : 0
    const bTime = b.last_recorded_at ? new Date(b.last_recorded_at).getTime() : 0
    return bTime - aTime
  })

  return {
    records,
    summaries,
    lotContexts,
  }
}
