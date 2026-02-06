import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface MetalDetectorHourlyCheckRecord {
  id: number
  check_date: string
  check_hour: string
  fe_1_5mm: 'Yes' | 'No'
  non_fe_1_5mm: 'Yes' | 'No'
  ss_1_5mm: 'Yes' | 'No'
  remarks: string | null
  corrective_action: string | null
  created_by: string | null
  checked_by: string | null
  checked_at: string | null
  created_at: string
  updated_at: string
}

interface UseMetalDetectorChecksReturn {
  checks: MetalDetectorHourlyCheckRecord[]
  loading: boolean
  saving: boolean
  error: PostgrestError | null
  refresh: (checkDate: string) => Promise<void>
  saveCheck: (
    payload: {
      check_date: string
      check_hour: string
      fe_1_5mm: 'Yes' | 'No'
      non_fe_1_5mm: 'Yes' | 'No'
      ss_1_5mm: 'Yes' | 'No'
      remarks?: string | null
      corrective_action?: string | null
    }
  ) => Promise<void>
}

export function useMetalDetectorChecks(): UseMetalDetectorChecksReturn {
  const [checks, setChecks] = useState<MetalDetectorHourlyCheckRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<PostgrestError | null>(null)

  const refresh = useCallback(async (checkDate: string) => {
    if (!checkDate) {
      setChecks([])
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('metal_detector_hourly_checks')
      .select('*')
      .eq('check_date', checkDate)
      .order('check_hour', { ascending: true })

    if (fetchError) {
      setError(fetchError)
      setChecks([])
    } else {
      setChecks((data as MetalDetectorHourlyCheckRecord[]) || [])
    }

    setLoading(false)
  }, [])

  const saveCheck = useCallback(
    async (payload: {
      check_date: string
      check_hour: string
      fe_1_5mm: 'Yes' | 'No'
      non_fe_1_5mm: 'Yes' | 'No'
      ss_1_5mm: 'Yes' | 'No'
      remarks?: string | null
      corrective_action?: string | null
    }) => {
      setSaving(true)
      setError(null)

      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id ?? null

      const { error: upsertError } = await supabase
        .from('metal_detector_hourly_checks')
        .upsert(
          {
            ...payload,
            remarks: payload.remarks || null,
            corrective_action: payload.corrective_action || null,
            created_by: userId,
            checked_by: userId,
            checked_at: new Date().toISOString(),
          },
          { onConflict: 'check_date,check_hour' }
        )

      if (upsertError) {
        setSaving(false)
        throw upsertError
      }

      await refresh(payload.check_date)
      setSaving(false)
    },
    [refresh]
  )

  useEffect(() => {
    setError(null)
  }, [])

  return {
    checks,
    loading,
    saving,
    error,
    refresh,
    saveCheck,
  }
}
