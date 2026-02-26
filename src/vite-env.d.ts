/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DASHBOARD_LOW_STOCK_THRESHOLD?: string
  readonly VITE_SUPABASE_INVENTORY_SOURCES?: string
  readonly VITE_FEATURE_INVENTORY_ADJUSTMENTS?: string
  readonly VITE_FEATURE_CYCLE_COUNTS?: string
  readonly VITE_FEATURE_CARRIERS?: string
  readonly VITE_FEATURE_ACTIVITY_TIMELINES?: string
  readonly VITE_FEATURE_SHIPMENT_LOT_ALLOCATIONS?: string
  readonly VITE_FEATURE_PROCESSING_PRODUCT_WIZARD?: string
  // Add more env variables as needed
  [key: string]: any
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
