import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type {
  ProcessMetalDetector,
  ProcessForeignObjectRejection,
  ProcessMetalDetectorWaste,
} from '@/types/processExecution'

interface UseMetalDetectionOptions {
  stepRunId: number | null
  enabled?: boolean
}

interface UseMetalDetectionReturn {
  session: ProcessMetalDetector | null
  rejections: ProcessForeignObjectRejection[]
  waste: ProcessMetalDetectorWaste[]
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
  addWaste: (wasteData: { waste_type: string; quantity_kg: number; remarks?: string | null }) => Promise<void>
  deleteWaste: (wasteId: number) => Promise<void>
}

export function useMetalDetection(options: UseMetalDetectionOptions): UseMetalDetectionReturn {
  const { stepRunId, enabled = true } = options
  const [session, setSession] = useState<ProcessMetalDetector | null>(null)
  const [rejections, setRejections] = useState<ProcessForeignObjectRejection[]>([])
  const [waste, setWaste] = useState<ProcessMetalDetectorWaste[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchData = useCallback(async () => {
    if (!stepRunId || !enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: sessionData, error: sessionError } = await supabase
      .from('process_metal_detector')
      .select('*')
      .eq('process_step_run_id', stepRunId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError && sessionError.code !== 'PGRST116') {
      setError(sessionError)
      setSession(null)
      setRejections([])
      setWaste([])
    } else {
      setSession((sessionData as ProcessMetalDetector) || null)

      if (sessionData) {
        const [rejectionsRes, wasteRes] = await Promise.all([
          supabase
            .from('process_foreign_object_rejections')
            .select('*')
            .eq('session_id', sessionData.id)
            .order('rejection_time', { ascending: false }),
          supabase
            .from('process_metal_detector_waste')
            .select('*')
            .eq('process_step_run_id', stepRunId)
            .order('created_at', { ascending: false }),
        ])
        setRejections((rejectionsRes.data as ProcessForeignObjectRejection[]) || [])
        setWaste((wasteRes.data as ProcessMetalDetectorWaste[]) || [])
      } else {
        setRejections([])
        const { data: wasteData } = await supabase
          .from('process_metal_detector_waste')
          .select('*')
          .eq('process_step_run_id', stepRunId)
          .order('created_at', { ascending: false })
        setWaste((wasteData as ProcessMetalDetectorWaste[]) || [])
      }
    }

    setLoading(false)
  }, [stepRunId, enabled])

  const saveSession = useCallback(
    async (data: { start_time: string; end_time?: string | null }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }

      let sessionId = session?.id
      if (!sessionId) {
        const { data: existingSession } = await supabase
          .from('process_metal_detector')
          .select('id')
          .eq('process_step_run_id', stepRunId)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        sessionId = existingSession?.id ?? null
      }

      const { error } = sessionId
        ? await supabase
            .from('process_metal_detector')
            .update(data)
            .eq('id', sessionId)
        : await supabase
            .from('process_metal_detector')
            .insert({ process_step_run_id: stepRunId, ...data })

      if (error) {
        throw error
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

  const addWaste = useCallback(
    async (wasteData: { waste_type: string; quantity_kg: number; remarks?: string | null }) => {
      if (!stepRunId) {
        throw new Error('Step run ID is required')
      }
      const { error: insertError } = await supabase.from('process_metal_detector_waste').insert({
        process_step_run_id: stepRunId,
        ...wasteData,
      })
      if (insertError) throw insertError
      await fetchData()
    },
    [stepRunId, fetchData]
  )

  const deleteWaste = useCallback(
    async (wasteId: number) => {
      const { error: deleteError } = await supabase
        .from('process_metal_detector_waste')
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
    session,
    rejections,
    waste,
    loading,
    error,
    refresh: fetchData,
    saveSession,
    addRejection,
    deleteRejection,
    addWaste,
    deleteWaste,
  }
}
