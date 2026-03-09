export type StorageProvider = 'supabase' | 'cloudflare-r2'

export interface ClientStorageConfig {
  provider: StorageProvider
  cloudflareR2Endpoint: string | null
  cloudflareR2PublicBaseUrl: string | null
  cloudflareR2Bucket: string | null
}

const normalizeEnvValue = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const rawProvider = normalizeEnvValue(import.meta.env.VITE_STORAGE_PROVIDER)

const provider: StorageProvider =
  rawProvider === 'cloudflare-r2' || rawProvider === 'supabase' ? rawProvider : 'supabase'

export const clientStorageConfig: ClientStorageConfig = {
  provider,
  cloudflareR2Endpoint: normalizeEnvValue(import.meta.env.VITE_CLOUDFLARE_R2_ENDPOINT),
  cloudflareR2PublicBaseUrl: normalizeEnvValue(import.meta.env.VITE_CLOUDFLARE_R2_PUBLIC_BASE_URL),
  cloudflareR2Bucket: normalizeEnvValue(import.meta.env.VITE_CLOUDFLARE_R2_BUCKET),
}

export const isCloudflareR2Enabled = clientStorageConfig.provider === 'cloudflare-r2'

export const getClientStorageConfigError = (): string | null => {
  if (!isCloudflareR2Enabled) {
    return null
  }

  if (!clientStorageConfig.cloudflareR2Endpoint) {
    return 'Cloudflare R2 is enabled but VITE_CLOUDFLARE_R2_ENDPOINT is missing.'
  }

  return null
}
