import { supabase } from '@/lib/supabaseClient'
import { getClientStorageConfigError, isCloudflareR2Enabled } from '@/lib/storageConfig'

type R2InvokeResponse =
  | { uploadUrl: string; path: string }
  | { signedUrl: string; path: string }
  | { entries: Array<{ path: string; signedUrl: string }> }
  | { deleted: boolean; path: string }

const sanitizePathSegment = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file'

const ensureClientStorageReady = () => {
  const configError = getClientStorageConfigError()
  if (configError) {
    throw new Error(configError)
  }
}

const invokeR2Action = async <T extends R2InvokeResponse>(body: Record<string, unknown>): Promise<T> => {
  ensureClientStorageReady()
  const { data, error } = await supabase.functions.invoke('r2-storage', { body })
  if (error) {
    throw new Error(error.message || 'Cloudflare storage request failed.')
  }
  if (!data) {
    throw new Error('Cloudflare storage request returned no data.')
  }
  if (typeof data === 'object' && data !== null && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data as T
}

export const buildStorageObjectPath = (prefix: string, fileName: string): string => {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '')
  const cleanName = sanitizePathSegment(fileName)
  return `${cleanPrefix}/${Date.now()}_${cleanName}`
}

export const uploadStoredFile = async (path: string, file: File): Promise<string> => {
  const normalizedPath = path.replace(/^\/+/, '')

  if (!isCloudflareR2Enabled) {
    const { error } = await supabase.storage.from('documents').upload(normalizedPath, file, { upsert: false })
    if (error) {
      throw error
    }
    return normalizedPath
  }

  const { uploadUrl } = await invokeR2Action<{ uploadUrl: string; path: string }>({
    action: 'createUploadUrl',
    path: normalizedPath,
    contentType: file.type || 'application/octet-stream',
  })

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: file.type ? { 'Content-Type': file.type } : undefined,
    body: file,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to upload file to Cloudflare R2.')
  }

  return normalizedPath
}

export const getStoredFileUrl = async (path: string, expiresIn = 3600): Promise<string> => {
  const normalizedPath = path.replace(/^\/+/, '')

  if (!isCloudflareR2Enabled) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(normalizedPath, expiresIn)
    if (error || !data?.signedUrl) {
      throw error ?? new Error('Failed to create file URL.')
    }
    return data.signedUrl
  }

  const { signedUrl } = await invokeR2Action<{ signedUrl: string; path: string }>({
    action: 'createDownloadUrl',
    path: normalizedPath,
    expiresIn,
  })
  return signedUrl
}

export const getStoredFileUrls = async (paths: string[], expiresIn = 3600): Promise<Record<string, string>> => {
  const normalizedPaths = paths.map((path) => path.replace(/^\/+/, '')).filter(Boolean)

  if (normalizedPaths.length === 0) {
    return {}
  }

  if (!isCloudflareR2Enabled) {
    const entries = await Promise.all(
      normalizedPaths.map(async (path) => {
        const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, expiresIn)
        if (error || !data?.signedUrl) {
          return [path, ''] as const
        }
        return [path, data.signedUrl] as const
      })
    )
    return Object.fromEntries(entries)
  }

  const { entries } = await invokeR2Action<{ entries: Array<{ path: string; signedUrl: string }> }>({
    action: 'createDownloadUrls',
    paths: normalizedPaths,
    expiresIn,
  })
  return Object.fromEntries(entries.map((entry) => [entry.path, entry.signedUrl]))
}

export const deleteStoredFile = async (path: string): Promise<void> => {
  const normalizedPath = path.replace(/^\/+/, '')

  if (!isCloudflareR2Enabled) {
    const { error } = await supabase.storage.from('documents').remove([normalizedPath])
    if (error) {
      throw error
    }
    return
  }

  await invokeR2Action<{ deleted: boolean; path: string }>({
    action: 'deleteObject',
    path: normalizedPath,
  })
}
