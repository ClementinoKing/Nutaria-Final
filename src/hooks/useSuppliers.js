import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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


