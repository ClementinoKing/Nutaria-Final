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

    // First, try a single joined query for speed. If it fails, fall back to separate queries.
    let data: any[] | null = null
    let fetchError: PostgrestError | null = null

    const { data: joinedData, error: joinedError } = await supabase
      .from('process_step_runs')
      .select(
        `
        id,
        process_lot_run_id,
        process_step_id,
        status,
        started_at,
        completed_at,
        performed_by,
        location_id,
        process_step:process_steps (
          id,
          process_id,
          seq,
          step_name_id,
          description,
          requires_qc,
          default_location_id,
          estimated_duration,
          step_name:process_step_names ( id, code, name )
        ),
        location:warehouses ( id, name )
      `
      )
      .eq('process_lot_run_id', lotRunId)

    if (!joinedError) {
      data = (joinedData || []).map((sr: any) => {
        const stepName = sr.process_step?.step_name
        return {
          ...sr,
          process_step: sr.process_step
            ? {
                ...sr.process_step,
                step_name: stepName?.name ?? null,
                step_code: stepName?.code ?? sr.process_step.step_code ?? null,
              }
            : null,
          location: sr.location ?? null,
        }
      })
    } else {
      // Fallback to multi-query if joins aren't available
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
          location_id
        `)
        .eq('process_lot_run_id', lotRunId)

      if (stepRunsError) {
        fetchError = stepRunsError
      } else if (stepRunsData && stepRunsData.length > 0) {
        const stepIds = stepRunsData
          .map((sr) => sr.process_step_id)
          .filter((id): id is number => id !== null && id !== undefined && typeof id === 'number')

        const locationIds = stepRunsData
          .map((sr) => sr.location_id)
          .filter((id): id is number => id !== null && id !== undefined && typeof id === 'number')

        let processStepsResult = { data: [] as any[], error: null as any }
        let stepNamesResult = { data: [] as any[], error: null as any }
        let warehousesResult = { data: [] as any[], error: null as any }

        if (stepIds.length > 0) {
          try {
            processStepsResult = await supabase
              .from('process_steps')
              .select('id, process_id, seq, step_name_id, description, requires_qc, default_location_id, estimated_duration')
              .in('id', stepIds)

            if (processStepsResult.error) {
              console.warn('Error with .in() query, trying individual queries:', processStepsResult.error)
              const individualResults = await Promise.all(
                stepIds.map((id) =>
                  supabase
                    .from('process_steps')
                    .select('id, process_id, seq, step_name_id, description, requires_qc, default_location_id, estimated_duration')
                    .eq('id', id)
                    .maybeSingle()
                )
              )
              processStepsResult.data = individualResults
                .map((r) => r.data)
                .filter((d): d is any => d !== null)
              processStepsResult.error = null
            }
          } catch (err) {
            console.error('Exception fetching process_steps:', err)
            processStepsResult = { data: [], error: err as any }
          }
        }

        const stepNameIds = (processStepsResult.data || [])
          .map((ps: any) => ps.step_name_id)
          .filter((id: any): id is number => id !== null && id !== undefined && typeof id === 'number')

        if (stepNameIds.length > 0) {
          try {
            stepNamesResult = await supabase
              .from('process_step_names')
              .select('id, code, name')
              .in('id', stepNameIds)

            if (stepNamesResult.error) {
              console.warn('Error fetching process_step_names:', stepNamesResult.error)
              stepNamesResult.data = []
            }
          } catch (err) {
            console.error('Exception fetching process_step_names:', err)
            stepNamesResult = { data: [], error: err as any }
          }
        }

        if (locationIds.length > 0) {
          try {
            warehousesResult = await supabase
              .from('warehouses')
              .select('id, name')
              .in('id', locationIds)

            if (warehousesResult.error) {
              console.warn('Error fetching warehouses:', warehousesResult.error)
              warehousesResult.data = []
            }
          } catch (err) {
            console.error('Exception fetching warehouses:', err)
            warehousesResult = { data: [], error: err as any }
          }
        }

        const stepNamesMap = new Map((stepNamesResult.data || []).map((sn: any) => [sn.id, sn]))
        const warehousesMap = new Map((warehousesResult.data || []).map((wh: any) => [wh.id, wh]))

        const processStepsMap = new Map(
          (processStepsResult.data || []).map((ps: any) => {
            const stepName = ps.step_name_id ? stepNamesMap.get(ps.step_name_id) : null
            return [
              ps.id,
              {
                ...ps,
                step_name: stepName?.name || null,
                step_code: stepName?.code || ps.step_code || null,
              },
            ]
          })
        )

        data = stepRunsData.map((sr: any) => ({
          ...sr,
          process_step: processStepsMap.get(sr.process_step_id) || null,
          location: sr.location_id ? warehousesMap.get(sr.location_id) || null : null,
        }))
      } else {
        data = stepRunsData || []
      }
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
