import { type NextRequest, NextResponse } from 'next/server'

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSV_IMPORT_PATH = '/api/printing-press/subscribers/import'

function mediaType(request: NextRequest): string {
  return (request.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase()
}

function error(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/**
 * CSRF boundary for routes whose browser credentials can change account or
 * Printing press state. Provider webhooks, cron Bearer routes, public signup,
 * and token-unsubscribe live outside the matcher and keep their purpose-built
 * authentication.
 */
export function proxy(request: NextRequest): NextResponse {
  if (!MUTATION_METHODS.has(request.method)) return NextResponse.next()

  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) {
    return error('Cross-site request denied', 403)
  }

  if (request.headers.get('sec-fetch-site') !== 'same-origin') {
    return error('Cross-site request denied', 403)
  }

  const expectedType =
    request.nextUrl.pathname === CSV_IMPORT_PATH
      ? 'text/csv'
      : 'application/json'
  if (mediaType(request) !== expectedType) {
    return error(`Content-Type must be ${expectedType}`, 415)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/auth/:path*', '/api/printing-press/:path*'],
}
