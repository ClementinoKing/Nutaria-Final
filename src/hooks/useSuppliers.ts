import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface Supplier {
  [key: string]: unknown
}

interface UseSuppliersReturn {
  suppliers: Supplier[]
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: Supplier[] }>
}

export function useSuppliers(): UseSuppliersReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    setSuppliers(data ?? [])
    setLoading(false)
    return { data }
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  return {
    suppliers,
    setSuppliers,
    loading,
    error,
    refresh: fetchSuppliers
  }
}

