import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export interface SupplierType {
  code: string
  name: string
}

interface UseSupplierTypesReturn {
  supplierTypes: SupplierType[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: SupplierType[] }>
}

export function useSupplierTypes(): UseSupplierTypesReturn {
  const [supplierTypes, setSupplierTypes] = useState<SupplierType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchSupplierTypes = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('supplier_types')
      .select('code, name')
      .order('code')

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const list = (data ?? []) as SupplierType[]
    setSupplierTypes(list)
    setLoading(false)
    return { data: list }
  }, [])

  useEffect(() => {
    fetchSupplierTypes()
  }, [fetchSupplierTypes])

  return {
    supplierTypes,
    loading,
    error,
    refresh: fetchSupplierTypes
  }
}
