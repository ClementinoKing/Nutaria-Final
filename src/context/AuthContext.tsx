import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, supabaseAuthStorageKey } from '@/lib/supabaseClient'
import { classifyIdentifier, phoneToUsernameEmail, usernameToAuthEmail } from '@/lib/authIdentifier'
import type { AccessContext } from '@/lib/rbac'

interface UserProfile {
  full_name: string | null
  email: string | null
  role: string | null
  deleted_at: string | null
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  accessContext: AccessContext | null
  login: (identifier: string, password: string) => Promise<{ error?: Error; user?: User }>
  logout: () => Promise<{ error?: Error }>
  loading: boolean
  profileLoading: boolean
  accessLoading: boolean
  authenticating: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [accessContext, setAccessContext] = useState<AccessContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [accessLoading, setAccessLoading] = useState(true)
  const [authenticating, setAuthenticating] = useState(false)

  const clearAuthState = useCallback(() => {
    setUser(null)
    setProfile(null)
    setAccessContext(null)
  }, [])

  const clearSupabaseBrowserSession = useCallback(() => {
    if (typeof window === 'undefined') return

    const storageKeys = [
      supabaseAuthStorageKey,
      `${supabaseAuthStorageKey}-code-verifier`,
      `${supabaseAuthStorageKey}-user`,
    ]

    for (const key of storageKeys) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  }, [])

  const signOutLocally = useCallback(async () => {
    clearSupabaseBrowserSession()
    clearAuthState()
    return {}
  }, [clearAuthState, clearSupabaseBrowserSession])

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
        .select('full_name, email, role, deleted_at')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (!ignore) {
        if (error) {
          console.warn('Error loading user profile', error.message)
          setProfile(null)
        } else if (data?.deleted_at) {
          setProfile(null)
          await signOutLocally()
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
  }, [signOutLocally, user?.id])

  useEffect(() => {
    let ignore = false

    const loadAccessContext = async () => {
      if (!user?.id) {
        setAccessContext(null)
        setAccessLoading(false)
        return
      }

      setAccessLoading(true)
      const { data, error } = await supabase.rpc('my_access_context')

      if (!ignore) {
        if (error) {
          console.warn('Error loading access context', error.message)
          setAccessContext(null)
        } else {
          setAccessContext((data as AccessContext | null) ?? null)
        }
        setAccessLoading(false)
      }
    }

    loadAccessContext()

    return () => {
      ignore = true
    }
  }, [user?.id])

  const login = useCallback(async (identifier: string, password: string) => {
    const classified = classifyIdentifier(identifier)
    if (!classified) {
      return {
        error: new Error('Enter valid phone (e.g. +265...) or email.')
      }
    }

    setAuthenticating(true)
    const authEmail =
      classified.type === 'email'
        ? classified.value
        : classified.type === 'phone'
          ? phoneToUsernameEmail(classified.value)
          : usernameToAuthEmail(classified.value)

    if (!authEmail) {
      setAuthenticating(false)
      return {
        error: new Error('Enter a valid email, phone number, or username.')
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password
    })
    setAuthenticating(false)

    if (error) {
      return { error }
    }

    if (data.user?.id) {
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('deleted_at')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()

      if (profileError) {
        await signOutLocally()
        return { error: new Error(profileError.message ?? 'Unable to load user profile'), user: data.user }
      }

      if (profileData?.deleted_at) {
        await signOutLocally()
        return { error: new Error('This account has been deactivated. Contact an administrator.') }
      }
    }

    setUser(data.user)
    return { user: data.user }
  }, [signOutLocally])

  const logout = useCallback(async () => {
    const { error } = await signOutLocally()
    if (error) {
      console.error('Error signing out', error.message)
      return { error }
    }
    return {}
  }, [signOutLocally])

  const value: AuthContextType = useMemo(
    () => ({
      user,
      profile,
      accessContext,
      login,
      logout,
      loading,
      profileLoading,
      accessLoading,
      authenticating
    }),
    [user, profile, accessContext, login, logout, loading, profileLoading, accessLoading, authenticating]
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
