import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface QualityParameter {
  id: number
  code: string
  name: string
  specification: string | null
  created_at: string | null
  updated_at: string | null
}

interface UseQualityParametersReturn {
  qualityParameters: QualityParameter[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: QualityParameter[] }>
}

export function useQualityParameters(): UseQualityParametersReturn {
  const [qualityParameters, setQualityParameters] = useState<QualityParameter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchQualityParameters = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('quality_parameters')
      .select('id, code, name, specification, created_at, updated_at')
      .order('code')

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const list = (data ?? []) as QualityParameter[]
    setQualityParameters(list)
    setLoading(false)
    return { data: list }
  }, [])

  useEffect(() => {
    fetchQualityParameters()
  }, [fetchQualityParameters])

  return {
    qualityParameters,
    loading,
    error,
    refresh: fetchQualityParameters
  }
}
