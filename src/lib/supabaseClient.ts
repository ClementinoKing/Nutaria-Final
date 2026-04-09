import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase environment variables are missing. Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are defined.'
  )
}

const authProjectRef = new URL(supabaseUrl).hostname.split('.')[0]

export const supabaseAuthStorageKey = `sb-${authProjectRef}-auth-token`

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})
