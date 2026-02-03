import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface Supplier {
  [key: string]: unknown
}

interface UseSuppliersOptions {
  searchQuery?: string
  filterType?: string
  filterCountry?: string
  page?: number
  pageSize?: number
}

interface UseSuppliersReturn {
  suppliers: Supplier[]
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>
  loading: boolean
  error: PostgrestError | null
  totalCount: number
  refresh: (override?: UseSuppliersOptions) => Promise<{ error?: PostgrestError; data?: Supplier[] }>
}

export function useSuppliers(options: UseSuppliersOptions = {}): UseSuppliersReturn {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  const fetchSuppliers = useCallback(async (override: UseSuppliersOptions = {}) => {
    const merged = { ...options, ...override }
    const searchQuery = merged.searchQuery?.trim() || null
    const filterType = merged.filterType?.trim() || null
    const filterCountry = merged.filterCountry?.trim() || null
    const page = Math.max(1, merged.page ?? 1)
    const pageSize = Math.max(1, merged.pageSize ?? 10)
    const offset = (page - 1) * pageSize

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase.rpc('get_suppliers_list', {
      p_search: searchQuery,
      p_type: filterType,
      p_country: filterCountry,
      p_limit: pageSize,
      p_offset: offset,
    })

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const rows = Array.isArray(data) ? data : []
    const rawTotal = rows.length > 0 ? rows[0]?.total_count : null
    const nextTotal =
      typeof rawTotal === 'number'
        ? rawTotal
        : rawTotal
        ? Number(rawTotal)
        : 0
    const cleaned = rows.map(({ total_count: _totalCount, ...rest }) => rest)

    setSuppliers(cleaned)
    setTotalCount((prev) => (rows.length === 0 && offset > 0 ? prev : nextTotal))
    setLoading(false)
    return { data: cleaned }
  }, [options])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  return {
    suppliers,
    setSuppliers,
    loading,
    error,
    totalCount,
    refresh: fetchSuppliers
  }
}
