import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { ProcessMetalDetector, ProcessForeignObjectRejection } from '@/types/processExecution'

interface UseMetalDetectionOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseMetalDetectionReturn {
  session: ProcessMetalDetector | null
  rejections: ProcessForeignObjectRejection[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<void>
  saveSession: (data: { start_time: string; end_time?: string | null }) => Promise<void>
  addRejection: (rejection: {
    rejection_time: string
    object_type: string
    weight?: number | null
    corrective_action?: string | null
  }) => Promise<void>
  deleteRejection: (rejectionId: number) => Promise<void>
}

export function useMetalDetection(options: UseMetalDetectionOptions): UseMetalDetectionReturn {
  const { stepRunId, enabled = true } = options
  const [session, setSession] = useState<ProcessMetalDetector | null>(null)
  const [rejections, setRejections] = useState<ProcessForeignObjectRejection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Fetch session
    const { data: sessionData, error: sessionError } = await supabase
      .from('process_metal_detector')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .maybeSingle()

    if (sessionError && sessionError.code !== 'PGRST116') {
      setError(sessionError)
      setSession(null)
    } else {
      setSession((sessionData as ProcessMetalDetector) || null)

      // Fetch rejections if session exists
      if (sessionData) {
        const { data: rejectionsData, error: rejectionsError } = await supabase
          .from('process_foreign_object_rejections')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('rejection_time', { ascending: false })

        if (rejectionsError) {
          setError(rejectionsError)
          setRejections([])
        } else {
          setRejections((rejectionsData as ProcessForeignObjectRejection[]) || [])
        }
      } else {
        setRejections([])
      }
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const saveSession = useCallback(
    async (data: { start_time: string; end_time?: string | null }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      if (session) {
        // Update existing
        const { error: updateError } = await supabase
          .from('process_metal_detector')
          .update(data)
          .eq('id', session.id)

        if (updateError) {
          throw updateError
        }
      } else {
        // Create new
        const { error: insertError } = await supabase
          .from('process_metal_detector')
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
    [stepRunId, session, fetchData]
  )

  const addRejection = useCallback(
    async (rejection: {
      rejection_time: string
      object_type: string
      weight?: number | null
      corrective_action?: string | null
    }) => {
      if (!session) {
        throw new Error('Metal detection session must be created before adding rejections')
      }

      const { error: insertError } = await supabase
        .from('process_foreign_object_rejections')
        .insert({
          session_id: session.id,
          ...rejection,
        })

      if (insertError) {
        throw insertError
      }

      await fetchData()
    },
    [session, fetchData]
  )

  const deleteRejection = useCallback(
    async (rejectionId: number) => {
      const { error: deleteError } = await supabase
        .from('process_foreign_object_rejections')
        .delete()
        .eq('id', rejectionId)

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
    session,
    rejections,
    loading,
    error,
    refresh: fetchData,
    saveSession,
    addRejection,
    deleteRejection,
  }
}
