import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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


