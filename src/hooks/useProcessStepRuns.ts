import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessStepRun } from '@/types/processExecution'

interface UseProcessStepRunsOptions {
  lotRunId: number | null
  enabled?: boolean
}

interface UseProcessStepRunsReturn {
  stepRuns: ProcessStepRun[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  updateStepRun: (stepRunId: number, updates: Partial<ProcessStepRun>) => Promise<void>
}

export function useProcessStepRuns(options: UseProcessStepRunsOptions): UseProcessStepRunsReturn {
  const { lotRunId, enabled = true } = options
  const [stepRuns, setStepRuns] = useState<ProcessStepRun[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchStepRuns = useCallback(async () => {
    if (!lotRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // First, try with joins - if that fails, fall back to separate queries
    let data: any[] | null = null
    let fetchError: PostgrestError | null = null

    const { data: stepRunsData, error: stepRunsError } = await supabase
      .from('process_step_runs')
      .select(`
        id,
        process_lot_run_id,
        process_step_id,
        status,
        started_at,
        completed_at,
        performed_by,
        location_id,
        notes
      `)
      .eq('process_lot_run_id', lotRunId)

    if (stepRunsError) {
      fetchError = stepRunsError
    } else if (stepRunsData && stepRunsData.length > 0) {
      // Fetch related data separately
      const stepIds = stepRunsData.map((sr) => sr.process_step_id).filter(Boolean)
      const locationIds = stepRunsData.map((sr) => sr.location_id).filter(Boolean)

      const [processStepsResult, warehousesResult] = await Promise.all([
        stepIds.length > 0
          ? supabase
              .from('process_steps')
              .select('id, process_id, seq, step_code, step_name, description, requires_qc, default_location_id, estimated_duration')
              .in('id', stepIds)
          : Promise.resolve({ data: [], error: null }),
        locationIds.length > 0
          ? supabase
              .from('warehouses')
              .select('id, name')
              .in('id', locationIds)
          : Promise.resolve({ data: [], error: null }),
      ])

      // Combine the data
      const processStepsMap = new Map(
        (processStepsResult.data || []).map((ps: any) => [ps.id, ps])
      )
      const warehousesMap = new Map(
        (warehousesResult.data || []).map((wh: any) => [wh.id, wh])
      )

      data = stepRunsData.map((sr: any) => ({
        ...sr,
        process_step: processStepsMap.get(sr.process_step_id) || null,
        location: sr.location_id ? warehousesMap.get(sr.location_id) || null : null,
      }))
    } else {
      data = stepRunsData || []
    }

    // Sort by seq from joined process_step
    if (!fetchError && data) {
      data.sort((a: any, b: any) => {
        const seqA = a.process_step?.seq ?? 0
        const seqB = b.process_step?.seq ?? 0
        return seqA - seqB
      })
    }

    if (fetchError) {
      setError(fetchError)
      setStepRuns([])
    } else {
      setStepRuns((data as ProcessStepRun[]) || [])
    }

    setLoading(false)
  }, [lotRunId, enabled])

  const updateStepRun = useCallback(
    async (stepRunId: number, updates: Partial<ProcessStepRun>) => {
      const { error: updateError } = await supabase
        .from('process_step_runs')
        .update(updates)
        .eq('id', stepRunId)

      if (updateError) {
        throw updateError
      }

      await fetchStepRuns()
    },
    [fetchStepRuns]
  )

  useEffect(() => {
    fetchStepRuns()
  }, [fetchStepRuns])

  return {
    stepRuns,
    loading,
    error,
    refresh: fetchStepRuns,
    updateStepRun,
  }
}
