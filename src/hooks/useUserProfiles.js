import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export function useUserProfiles(pollIntervalMs) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError)
      setLoading(false)
      return { error: queryError }
    }

    setProfiles(data ?? [])
    setLoading(false)
    return { data }
  }, [])

  useEffect(() => {
    let ignore = false
    let timerId

    const load = async () => {
      const response = await fetchProfiles()
      if (!ignore && response?.error && !loading) {
        setError(response.error)
      }
    }

    load()

    if (pollIntervalMs) {
      timerId = setInterval(load, pollIntervalMs)
    }

    return () => {
      ignore = true
      if (timerId) {
        clearInterval(timerId)
      }
    }
  }, [fetchProfiles, pollIntervalMs])

  return {
    profiles,
    loading,
    error,
    refresh: fetchProfiles,
    setProfiles
  }
}


