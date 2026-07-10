import {
  CSP_REPORT_MAX_BYTES,
  normalizeCspReportPayload,
} from '@/lib/security/csp-report'

const SUPPORTED_MEDIA_TYPES = new Set([
  'application/csp-report',
  'application/reports+json',
])

function emptyResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function isSameOriginReport(request: Request, requestOrigin: string): boolean {
  const origin = request.headers.get('origin')
  if (origin && origin !== requestOrigin) return false
  const fetchSite = request.headers.get('sec-fetch-site')
  return !fetchSite || fetchSite === 'same-origin'
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get('content-length')
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > CSP_REPORT_MAX_BYTES
  ) {
    return null
  }
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > CSP_REPORT_MAX_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export async function POST(request: Request): Promise<Response> {
  const requestOrigin = new URL(request.url).origin
  if (!isSameOriginReport(request, requestOrigin)) return emptyResponse(403)

  const mediaType =
    request.headers
      .get('content-type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() ?? ''
  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) return emptyResponse(415)

  const rawBody = await readBoundedBody(request)
  if (rawBody === null) return emptyResponse(413)

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return emptyResponse(400)
  }
  const reports = normalizeCspReportPayload(payload, mediaType, requestOrigin)
  if (!reports) return emptyResponse(400)

  for (const report of reports) {
    // These are the only report fields allowed into logs. CSP payloads are
    // attacker-controlled and can contain full URLs, source files, and samples.
    console.info('[security/csp-report]', report)
  }
  return emptyResponse(204)
}
