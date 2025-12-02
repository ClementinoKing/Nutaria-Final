import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface CustomerContact {
  [key: string]: unknown
}

export interface Customer {
  [key: string]: unknown
  customer_contacts?: CustomerContact[]
  contacts?: CustomerContact[]
}

interface UseCustomersReturn {
  customers: Customer[]
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: Customer[] }>
}

export function useCustomers(): UseCustomersReturn {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('customers')
      .select('*, customer_contacts(*)')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError)
      setLoading(false)
      return { error: fetchError }
    }

    const normalized = (data ?? []).map((customer) => ({
      ...customer,
      contacts: customer.customer_contacts ?? []
    }))

    setCustomers(normalized)
    setLoading(false)
    return { data: normalized }
  }, [])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  return {
    customers,
    setCustomers,
    loading,
    error,
    refresh: fetchCustomers
  }
}

