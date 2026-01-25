import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessNonConformance } from '@/types/processExecution'

interface UseNonConformancesOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseNonConformancesReturn {
  nonConformances: ProcessNonConformance[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  addNonConformance: (nc: Omit<ProcessNonConformance, 'id' | 'process_step_run_id' | 'resolved' | 'resolved_at'>) => Promise<void>
  resolveNonConformance: (ncId: number) => Promise<void>
}

export function useNonConformances(options: UseNonConformancesOptions): UseNonConformancesReturn {
  const { stepRunId, enabled = true } = options
  const [nonConformances, setNonConformances] = useState<ProcessNonConformance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchNonConformances = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_non_conformances')
      .select('id, process_step_run_id, nc_type, description, severity, corrective_action, resolved, resolved_at')
      .eq('process_step_run_id', stepRunId)
      .order('id', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setNonConformances([])
    } else {
      setNonConformances((data as ProcessNonConformance[]) || [])
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const addNonConformance = useCallback(
    async (nc: Omit<ProcessNonConformance, 'id' | 'process_step_run_id' | 'resolved' | 'resolved_at'>) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      const { error: insertError } = await supabase
        .from('process_non_conformances')
        .insert({
          process_step_run_id: stepRunId,
          nc_type: nc.nc_type,
          description: nc.description,
          severity: nc.severity,
          corrective_action: nc.corrective_action || null,
          resolved: false,
        })

      if (insertError) {
        throw insertError
      }

      await fetchNonConformances()
    },
    [stepRunId, fetchNonConformances]
  )

  const resolveNonConformance = useCallback(
    async (ncId: number) => {
      const { error: updateError } = await supabase
        .from('process_non_conformances')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', ncId)

      if (updateError) {
        throw updateError
      }

      await fetchNonConformances()
    },
    [fetchNonConformances]
  )

  useEffect(() => {
    fetchNonConformances()
  }, [fetchNonConformances])

  return {
    nonConformances,
    loading,
    error,
    refresh: fetchNonConformances,
    addNonConformance,
    resolveNonConformance,
  }
}
