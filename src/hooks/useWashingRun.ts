import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessWashingRun, ProcessWashingWaste } from '@/types/processExecution'

interface UseWashingRunOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseWashingRunReturn {
  washingRun: ProcessWashingRun | null
  waste: ProcessWashingWaste[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  saveWashingRun: (data: {
    washing_water_litres?: number | null
    oxy_acid_ml?: number | null
    moisture_percent?: number | null
    remarks?: string | null
  }) => Promise<void>
  addWaste: (waste: { waste_type: string; quantity_kg: number; remarks?: string | null }) => Promise<void>
  deleteWaste: (wasteId: number) => Promise<void>
}

export function useWashingRun(options: UseWashingRunOptions): UseWashingRunReturn {
  const { stepRunId, enabled = true } = options
  const [washingRun, setWashingRun] = useState<ProcessWashingRun | null>(null)
  const [waste, setWaste] = useState<ProcessWashingWaste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch washing run
    const { data: runData, error: runError } = await supabase
      .from('process_washing_runs')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (runError && runError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is OK
      setError(runError)
      setWashingRun(null)
    } else {
      setWashingRun((runData as ProcessWashingRun) || null)
    }

    // Fetch waste if washing run exists
    if (runData) {
      const { data: wasteData, error: wasteError } = await supabase
        .from('process_washing_waste')
        .select('*')
        .eq('washing_run_id', runData.id)
        .order('created_at', { ascending: false })

      if (wasteError) {
        setError(wasteError)
        setWaste([])
      } else {
        setWaste((wasteData as ProcessWashingWaste[]) || [])
      }
    } else {
      setWaste([])
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const saveWashingRun = useCallback(
    async (data: {
      washing_water_litres?: number | null
      oxy_acid_ml?: number | null
      moisture_percent?: number | null
      remarks?: string | null
    }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      let runId = washingRun?.id
      if (!runId) {
        const { data: existingRun } = await supabase
          .from('process_washing_runs')
          .select('id')
          .eq('process_step_run_id', stepRunId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        runId = existingRun?.id ?? null
      }

      const { error } = runId
        ? await supabase
            .from('process_washing_runs')
            .update(data)
            .eq('id', runId)
        : await supabase
            .from('process_washing_runs')
            .insert({ process_step_run_id: stepRunId, ...data })

      if (error) {
        throw error
      }

      await fetchData()
    },
    [stepRunId, washingRun, fetchData]
  )

  const addWaste = useCallback(
    async (wasteData: { waste_type: string; quantity_kg: number; remarks?: string | null }) => {
      if (!washingRun) {
        throw new Error('Washing run must be created before adding waste')
      }

      const { error: insertError } = await supabase
        .from('process_washing_waste')
        .insert({
          washing_run_id: washingRun.id,
          ...wasteData,
        })

      if (insertError) {
        throw insertError
      }

      await fetchData()
    },
    [washingRun, fetchData]
  )

  const deleteWaste = useCallback(
    async (wasteId: number) => {
      const { error: deleteError } = await supabase
        .from('process_washing_waste')
        .delete()
        .eq('id', wasteId)

      if (deleteError) {
        throw deleteError
      }

      await fetchData()
    },
    [fetchData]
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    washingRun,
    waste,
    loading,
    error,
    refresh: fetchData,
    saveWashingRun,
    addWaste,
    deleteWaste,
  }
}
