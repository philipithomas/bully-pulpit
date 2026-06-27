import {
  PublicApiInputError,
  PublicApiNotFoundError,
} from '@/lib/public-api/posts'

export const PUBLIC_API_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control':
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
}

export const OPENAPI_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control':
    'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
}

export function publicJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      ...PUBLIC_API_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  })
}

export function openApiJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      ...OPENAPI_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  })
}

export function publicOptions(headers = PUBLIC_API_HEADERS): Response {
  return new Response(null, { status: 204, headers })
}

export function publicError(error: unknown): Response {
  if (error instanceof PublicApiInputError) {
    return publicJson(
      { error: { code: 'invalid_request', message: error.message } },
      { status: 400 }
    )
  }

  if (error instanceof PublicApiNotFoundError) {
    return publicJson(
      { error: { code: 'not_found', message: error.message } },
      { status: 404 }
    )
  }

  console.error('Public API request failed:', error)
  return publicJson(
    { error: { code: 'internal_error', message: 'Internal error' } },
    { status: 500 }
  )
}
