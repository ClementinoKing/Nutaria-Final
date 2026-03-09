import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

type StorageAction =
  | 'createUploadUrl'
  | 'createDownloadUrl'
  | 'createDownloadUrls'
  | 'deleteObject'

interface StorageRequestBody {
  action?: StorageAction
  path?: string
  paths?: string[]
  contentType?: string
  expiresIn?: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const encodeRfc3986 = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

const normalizePath = (value: string): string => value.replace(/^\/+/, '').trim()

const readRequiredEnv = (name: string): string => {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new Error(`${name} is not configured.`)
  }
  return value
}

const formatAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  }
}

const buildCanonicalQueryString = (params: Record<string, string>): string =>
  Object.entries(params)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&')

const buildCanonicalUri = (bucket: string, objectPath: string): string =>
  ['' , bucket, ...normalizePath(objectPath).split('/').filter(Boolean)]
    .map((segment, index) => (index === 0 ? '' : encodeRfc3986(segment)))
    .join('/')

const hmacSha256 = async (key: Uint8Array | string, message: string): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return new Uint8Array(signature)
}

const sha256Hex = async (message: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(message))
  return toHex(digest)
}

const getSigningKey = async (secretKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> => {
  const kDate = await hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

const createPresignedUrl = async (
  method: 'GET' | 'PUT' | 'DELETE',
  objectPath: string,
  expiresInSeconds: number
): Promise<string> => {
  const accessKeyId = readRequiredEnv('CLOUDFLARE_R2_ACCESS_KEY_ID')
  const secretAccessKey = readRequiredEnv('CLOUDFLARE_R2_SECRET_ACCESS_KEY')
  const endpoint = readRequiredEnv('CLOUDFLARE_R2_ENDPOINT')
  const bucket = readRequiredEnv('CLOUDFLARE_R2_BUCKET')
  const region = Deno.env.get('CLOUDFLARE_R2_REGION')?.trim() || 'auto'

  const endpointUrl = new URL(endpoint)
  const host = endpointUrl.host
  const now = new Date()
  const { amzDate, dateStamp } = formatAmzDate(now)
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const canonicalUri = buildCanonicalUri(bucket, objectPath)

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  }

  const canonicalQueryString = buildCanonicalQueryString(queryParams)
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, 's3')
  const signature = toHex((await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    encoder.encode(stringToSign)
  )))

  const url = new URL(endpoint)
  url.pathname = canonicalUri
  url.search = `${canonicalQueryString}&X-Amz-Signature=${signature}`
  return url.toString()
}

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as StorageRequestBody
    const action = body.action
    const expiresIn = Math.min(Math.max(body.expiresIn ?? 3600, 60), 60 * 60 * 24)

    if (!action) {
      return jsonResponse(400, { error: 'Missing action.' })
    }

    if (action === 'createUploadUrl') {
      if (!body.path) {
        return jsonResponse(400, { error: 'Missing path.' })
      }
      const uploadUrl = await createPresignedUrl('PUT', body.path, expiresIn)
      return jsonResponse(200, {
        uploadUrl,
        path: normalizePath(body.path),
      })
    }

    if (action === 'createDownloadUrl') {
      if (!body.path) {
        return jsonResponse(400, { error: 'Missing path.' })
      }
      const signedUrl = await createPresignedUrl('GET', body.path, expiresIn)
      return jsonResponse(200, {
        signedUrl,
        path: normalizePath(body.path),
      })
    }

    if (action === 'createDownloadUrls') {
      const paths = Array.isArray(body.paths) ? body.paths.map(normalizePath).filter(Boolean) : []
      if (paths.length === 0) {
        return jsonResponse(400, { error: 'Missing paths.' })
      }

      const entries = await Promise.all(
        paths.map(async (path) => ({
          path,
          signedUrl: await createPresignedUrl('GET', path, expiresIn),
        }))
      )

      return jsonResponse(200, { entries })
    }

    if (action === 'deleteObject') {
      if (!body.path) {
        return jsonResponse(400, { error: 'Missing path.' })
      }

      const deleteUrl = await createPresignedUrl('DELETE', body.path, 300)
      const deleteResponse = await fetch(deleteUrl, { method: 'DELETE' })
      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        return jsonResponse(deleteResponse.status, {
          error: errorText || 'Failed to delete object from Cloudflare R2.',
        })
      }

      return jsonResponse(200, {
        deleted: true,
        path: normalizePath(body.path),
      })
    }

    return jsonResponse(400, { error: `Unsupported action: ${action}` })
  } catch (error) {
    console.error('r2-storage error', error)
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unexpected Cloudflare R2 error.',
    })
  }
})
