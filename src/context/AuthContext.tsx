import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

interface UserProfile {
  full_name: string | null
  email: string | null
  role: string | null
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  login: (email: string, password: string) => Promise<{ error?: Error; user?: User }>
  logout: () => Promise<{ error?: Error }>
  loading: boolean
  profileLoading: boolean
  authenticating: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)

  useEffect(() => {
    let ignore = false

    const syncSession = async () => {
      setLoading(true)
      const {
        data: { session },
        error
      } = await supabase.auth.getSession()

      if (!ignore) {
        if (error) {
          console.error('Error loading session', error.message)
        }
        setUser(session?.user ?? null)
        setLoading(false)
      }
    }

    syncSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ignore) {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    return () => {
      ignore = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let ignore = false

    const loadProfile = async (authUserId: string) => {
      setProfileLoading(true)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('full_name, email, role')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (!ignore) {
        if (error) {
          console.warn('Error loading user profile', error.message)
          setProfile(null)
        } else {
          setProfile(data ?? null)
        }
        setProfileLoading(false)
      }
    }

    if (user?.id) {
      loadProfile(user.id)
    } else {
      setProfile(null)
      setProfileLoading(false)
    }

    return () => {
      ignore = true
    }
  }, [user?.id])

  const login = useCallback(async (email: string, password: string) => {
    setAuthenticating(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    setAuthenticating(false)

    if (error) {
      return { error }
    }

    setUser(data.user)
    return { user: data.user }
  }, [])

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out', error.message)
      return { error }
    }
    setUser(null)
    return {}
  }, [])

  const value: AuthContextType = useMemo(
    () => ({
      user,
      profile,
      login,
      logout,
      loading,
      profileLoading,
      authenticating
    }),
    [user, profile, login, logout, loading, profileLoading, authenticating]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

