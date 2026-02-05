import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessDryingRun, ProcessDryingWaste } from '@/types/processExecution'

interface UseDryingRunOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseDryingRunReturn {
  dryingRun: ProcessDryingRun | null
  waste: ProcessDryingWaste[]
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
  addWaste: (wasteData: { waste_type: string; quantity_kg: number; remarks?: string | null }) => Promise<void>
  deleteWaste: (wasteId: number) => Promise<void>
}

export function useDryingRun(options: UseDryingRunOptions): UseDryingRunReturn {
  const { stepRunId, enabled = true } = options
  const [dryingRun, setDryingRun] = useState<ProcessDryingRun | null>(null)
  const [waste, setWaste] = useState<ProcessDryingWaste[]>([])
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
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError && fetchError.code !== 'PGRST116') {
      setError(fetchError)
      setDryingRun(null)
      setWaste([])
    } else {
      setDryingRun((data as ProcessDryingRun) || null)
      if (data) {
        const { data: wasteData, error: wasteError } = await supabase
          .from('process_drying_waste')
          .select('*')
          .eq('drying_run_id', data.id)
          .order('created_at', { ascending: false })
        if (!wasteError) {
          setWaste((wasteData as ProcessDryingWaste[]) || [])
        } else {
          setWaste([])
        }
      } else {
        setWaste([])
      }
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

      let runId = dryingRun?.id
      if (!runId) {
        const { data: existingRun } = await supabase
          .from('process_drying_runs')
          .select('id')
          .eq('process_step_run_id', stepRunId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        runId = existingRun?.id ?? null
      }

      const { error } = runId
        ? await supabase
            .from('process_drying_runs')
            .update(data)
            .eq('id', runId)
        : await supabase
            .from('process_drying_runs')
            .insert({ process_step_run_id: stepRunId, ...data })

      if (error) {
        throw error
      }

      await fetchData()
    },
    [stepRunId, dryingRun, fetchData]
  )

  const addWaste = useCallback(
    async (wasteData: { waste_type: string; quantity_kg: number; remarks?: string | null }) => {
      if (!dryingRun) {
        throw new Error('Drying run must be created before adding waste')
      }
      const { error: insertError } = await supabase.from('process_drying_waste').insert({
        drying_run_id: dryingRun.id,
        ...wasteData,
      })
      if (insertError) throw insertError
      await fetchData()
    },
    [dryingRun, fetchData]
  )

  const deleteWaste = useCallback(
    async (wasteId: number) => {
      const { error: deleteError } = await supabase
        .from('process_drying_waste')
        .delete()
        .eq('id', wasteId)
      if (deleteError) throw deleteError
      await fetchData()
    },
    [fetchData]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    dryingRun,
    waste,
    loading,
    error,
    refresh: fetchData,
    saveDryingRun,
    addWaste,
    deleteWaste,
  }
}
