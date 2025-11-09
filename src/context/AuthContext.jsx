import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
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

  const login = useCallback(async (email, password) => {
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

  const value = {
    user,
    login,
    logout,
    loading,
    authenticating
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

