/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DASHBOARD_LOW_STOCK_THRESHOLD?: string
  readonly VITE_SUPABASE_INVENTORY_SOURCES?: string
  // Add more env variables as needed
  [key: string]: any
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

