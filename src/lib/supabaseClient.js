import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://xbisrwxildgmbvtsktdh.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiaXNyd3hpbGRnbWJ2dHNrdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4ODY4NDgsImV4cCI6MjA3NzQ2Mjg0OH0.x8udrz1SWog3RZO7Q544E86WYTra_kWQEiQeOqHLqhQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


