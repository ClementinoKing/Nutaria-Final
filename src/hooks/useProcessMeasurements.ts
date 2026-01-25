import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessMeasurement } from '@/types/processExecution'

interface UseProcessMeasurementsOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseProcessMeasurementsReturn {
  measurements: ProcessMeasurement[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  addMeasurement: (measurement: Omit<ProcessMeasurement, 'id' | 'process_step_run_id' | 'recorded_at'>) => Promise<void>
  deleteMeasurement: (measurementId: number) => Promise<void>
}

export function useProcessMeasurements(options: UseProcessMeasurementsOptions): UseProcessMeasurementsReturn {
  const { stepRunId, enabled = true } = options
  const [measurements, setMeasurements] = useState<ProcessMeasurement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchMeasurements = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_measurements')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .order('recorded_at', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setMeasurements([])
    } else {
      setMeasurements((data as ProcessMeasurement[]) || [])
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const addMeasurement = useCallback(
    async (measurement: Omit<ProcessMeasurement, 'id' | 'process_step_run_id' | 'recorded_at'>) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      const { error: insertError } = await supabase
        .from('process_measurements')
        .insert({
          process_step_run_id: stepRunId,
          metric: measurement.metric,
          value: measurement.value,
          unit: measurement.unit,
          recorded_at: new Date().toISOString(),
        })

      if (insertError) {
        throw insertError
      }

      await fetchMeasurements()
    },
    [stepRunId, fetchMeasurements]
  )

  const deleteMeasurement = useCallback(
    async (measurementId: number) => {
      const { error: deleteError } = await supabase
        .from('process_measurements')
        .delete()
        .eq('id', measurementId)

      if (deleteError) {
        throw deleteError
      }

      await fetchMeasurements()
    },
    [fetchMeasurements]
  )

  useEffect(() => {
    fetchMeasurements()
  }, [fetchMeasurements])

  return {
    measurements,
    loading,
    error,
    refresh: fetchMeasurements,
    addMeasurement,
    deleteMeasurement,
  }
}
