import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface ProcessStepName {
  id: number
  code: string
  name: string
  description: string | null
  created_at: string | null
  updated_at: string | null
}

interface UseProcessStepNamesReturn {
  processStepNames: ProcessStepName[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: ProcessStepName[] }>
  create: (name: string, description?: string) => Promise<{ error?: PostgrestError; data?: ProcessStepName }>
  update: (id: number, name: string, description?: string) => Promise<{ error?: PostgrestError; data?: ProcessStepName }>
  delete: (id: number) => Promise<{ error?: PostgrestError }>
}

// Simple code generation: uppercase first 3-4 letters of name, remove spaces/special chars
const generateCode = (name: string): string => {
  const cleaned = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (cleaned.length === 0) return 'STEP'
  if (cleaned.length <= 4) return cleaned
  return cleaned.slice(0, 4)
}

export function useProcessStepNames(): UseProcessStepNamesReturn {
  const [processStepNames, setProcessStepNames] = useState<ProcessStepName[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchProcessStepNames = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('process_step_names')
      .select('id, code, name, description, created_at, updated_at')
      .order('name')

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const list = (data ?? []) as ProcessStepName[]
    setProcessStepNames(list)
    setLoading(false)
    return { data: list }
  }, [])

  const create = useCallback(async (name: string, description?: string) => {
    const code = generateCode(name)
    
    const { data, error: createError } = await supabase
      .from('process_step_names')
      .insert({
        code,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .select('id, code, name, description, created_at, updated_at')
      .single()

    if (createError) {
      return { error: createError }
    }

    await fetchProcessStepNames()
    return { data: data as ProcessStepName }
  }, [fetchProcessStepNames])

  const update = useCallback(async (id: number, name: string, description?: string) => {
    const code = generateCode(name)
    
    const { data, error: updateError } = await supabase
      .from('process_step_names')
      .update({
        code,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .eq('id', id)
      .select('id, code, name, description, created_at, updated_at')
      .single()

    if (updateError) {
      return { error: updateError }
    }

    await fetchProcessStepNames()
    return { data: data as ProcessStepName }
  }, [fetchProcessStepNames])

  const deleteStepName = useCallback(async (id: number) => {
    const { error: deleteError } = await supabase
      .from('process_step_names')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return { error: deleteError }
    }

    await fetchProcessStepNames()
    return {}
  }, [fetchProcessStepNames])

  useEffect(() => {
    fetchProcessStepNames()
  }, [fetchProcessStepNames])

  return {
    processStepNames,
    loading,
    error,
    refresh: fetchProcessStepNames,
    create,
    update,
    delete: deleteStepName,
  }
}
