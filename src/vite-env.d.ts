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
  readonly VITE_STORAGE_PROVIDER?: string
  readonly VITE_CLOUDFLARE_R2_ENDPOINT?: string
  readonly VITE_CLOUDFLARE_R2_PUBLIC_BASE_URL?: string
  readonly VITE_CLOUDFLARE_R2_BUCKET?: string
  // Add more env variables as needed
  [key: string]: any
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
