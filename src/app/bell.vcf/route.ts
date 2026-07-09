import { renderBellContactCard } from '@/lib/bell-contact-card'
import { sitePhoneNumber } from '@/lib/phone/config'

export const dynamic = 'force-dynamic'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
  Expires: '0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

function downloadHeaders(body: string): Headers {
  return new Headers({
    ...NO_CACHE_HEADERS,
    'Content-Disposition': 'attachment; filename="Bell.vcf"',
    'Content-Length': String(new TextEncoder().encode(body).byteLength),
    'Content-Type': 'text/vcard; charset=utf-8',
  })
}

function unavailableResponse(includeBody: boolean): Response {
  const body = 'Bell contact card is unavailable.'
  return new Response(includeBody ? body : null, {
    status: 503,
    headers: {
      ...NO_CACHE_HEADERS,
      'Content-Length': String(new TextEncoder().encode(body).byteLength),
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

function contactResponse(includeBody: boolean): Response {
  const phoneNumber = sitePhoneNumber()
  if (!phoneNumber) return unavailableResponse(includeBody)

  const body = renderBellContactCard(phoneNumber)
  return new Response(includeBody ? body : null, {
    headers: downloadHeaders(body),
  })
}

export function GET(): Response {
  return contactResponse(true)
}

export function HEAD(): Response {
  return contactResponse(false)
}
