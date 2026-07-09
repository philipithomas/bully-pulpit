import type { z } from 'zod/v4'

export const PUBLIC_JSON_BODY_MAX_BYTES = 16 * 1024

type JsonBodyError = {
  ok: false
  status: 400 | 413 | 415
  error: string
}

type JsonBodySuccess<T> = {
  ok: true
  data: T
}

export type JsonBodyResult<T> = JsonBodySuccess<T> | JsonBodyError

const invalidBody = (): JsonBodyError => ({
  ok: false,
  status: 400,
  error: 'Invalid request body',
})

const bodyTooLarge = (): JsonBodyError => ({
  ok: false,
  status: 413,
  error: 'Request body is too large',
})

/**
 * Reads and validates a public JSON request without ever buffering more than
 * `maxBytes`. Content-Length is only an early rejection hint: streamed bytes
 * remain the authoritative limit because callers can omit or forge the header.
 */
export async function readJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = PUBLIC_JSON_BODY_MAX_BYTES
): Promise<JsonBodyResult<T>> {
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (contentType !== 'application/json') {
    return {
      ok: false,
      status: 415,
      error: 'Content-Type must be application/json',
    }
  }

  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return invalidBody()
    const declaredBytes = Number(contentLength)
    if (!Number.isSafeInteger(declaredBytes)) return invalidBody()
    if (declaredBytes > maxBytes) return bodyTooLarge()
  }

  if (!request.body) return invalidBody()

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = request.body.getReader()
  } catch {
    return invalidBody()
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return bodyTooLarge()
      }
      chunks.push(value)
    }
  } catch {
    return invalidBody()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  let parsed: unknown
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    parsed = JSON.parse(text)
  } catch {
    return invalidBody()
  }

  const result = schema.safeParse(parsed)
  if (!result.success) return invalidBody()
  return { ok: true, data: result.data }
}
