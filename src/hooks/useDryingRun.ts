import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessDryingRun } from '@/types/processExecution'

interface UseDryingRunOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseDryingRunReturn {
  dryingRun: ProcessDryingRun | null
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  saveDryingRun: (data: {
    dryer_temperature_c?: number | null
    time_in?: string | null
    time_out?: string | null
    moisture_in?: number | null
    moisture_out?: number | null
    crates_clean?: 'Yes' | 'No' | 'NA' | null
    insect_infestation?: 'Yes' | 'No' | 'NA' | null
    dryer_hygiene_clean?: 'Yes' | 'No' | 'NA' | null
    remarks?: string | null
  }) => Promise<void>
}

export function useDryingRun(options: UseDryingRunOptions): UseDryingRunReturn {
  const { stepRunId, enabled = true } = options
  const [dryingRun, setDryingRun] = useState<ProcessDryingRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_drying_runs')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .maybeSingle()

    if (fetchError && fetchError.code !== 'PGRST116') {
      setError(fetchError)
      setDryingRun(null)
    } else {
      setDryingRun((data as ProcessDryingRun) || null)
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const saveDryingRun = useCallback(
    async (data: {
      dryer_temperature_c?: number | null
      time_in?: string | null
      time_out?: string | null
      moisture_in?: number | null
      moisture_out?: number | null
      crates_clean?: 'Yes' | 'No' | 'NA' | null
      insect_infestation?: 'Yes' | 'No' | 'NA' | null
      dryer_hygiene_clean?: 'Yes' | 'No' | 'NA' | null
      remarks?: string | null
    }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      if (dryingRun) {
        // Update existing
        const { error: updateError } = await supabase
          .from('process_drying_runs')
          .update(data)
          .eq('id', dryingRun.id)

        if (updateError) {
          throw updateError
        }
      } else {
        // Create new
        const { error: insertError } = await supabase
          .from('process_drying_runs')
          .insert({
            process_step_run_id: stepRunId,
            ...data,
          })

        if (insertError) {
          throw insertError
        }
      }

      await fetchData()
    },
    [stepRunId, dryingRun, fetchData]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    dryingRun,
    loading,
    error,
    refresh: fetchData,
    saveDryingRun,
  }
}
