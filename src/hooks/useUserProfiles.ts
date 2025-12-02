import { useCallback, useEffect, useState } from 'react'
import { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface UserProfile {
  [key: string]: unknown
}

interface UseUserProfilesReturn {
  profiles: UserProfile[]
  loading: boolean
  error: PostgrestError | null
  refresh: () => Promise<{ error?: PostgrestError; data?: UserProfile[] }>
  setProfiles: React.Dispatch<React.SetStateAction<UserProfile[]>>
}

export function useUserProfiles(pollIntervalMs?: number): UseUserProfilesReturn {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<PostgrestError | null>(null)

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
    let timerId: NodeJS.Timeout | undefined

    const load = async () => {
      const response = await fetchProfiles()
      if (!ignore && response?.error) {
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

