import { NextResponse } from 'next/server'
import type {
  BellConversationStatus,
  BellIdentity,
  BellSurface,
} from '@/app/printing-press/bell/types'

export const BELL_PAGE_SIZE = 25

/** Conversation transcripts and participant identifiers must never be cached. */
export function bellPrivateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

const SURFACES = new Set<BellSurface>(['web', 'sms'])
const IDENTITIES = new Set<BellIdentity>(['signed_in', 'phone', 'anonymous'])
const STATUSES = new Set<BellConversationStatus>([
  'active',
  'completed',
  'error',
])
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ParsedBellFilters = {
  surface?: BellSurface
  identity?: BellIdentity
  status?: BellConversationStatus
  dateFrom?: Date
  dateTo?: Date
  search?: string
  cursor?: string
  limit: number
}

type ParseResult =
  | { input: ParsedBellFilters; error?: never }
  | { input?: never; error: string }

function parseDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10) === value ? date : null
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 || code === 127) return true
  }
  return false
}

export function parseBellFilters(params: URLSearchParams): ParseResult {
  const surface = params.get('surface')?.trim() ?? ''
  const identity = params.get('identity')?.trim() ?? ''
  const status = params.get('status')?.trim() ?? ''
  const fromValue = params.get('from')?.trim() ?? ''
  const toValue = params.get('to')?.trim() ?? ''
  const search = params.get('q')?.trim() ?? ''
  const cursor = params.get('cursor')?.trim() ?? ''

  if (surface && !SURFACES.has(surface as BellSurface)) {
    return { error: 'Invalid surface filter' }
  }
  if (identity && !IDENTITIES.has(identity as BellIdentity)) {
    return { error: 'Invalid identity filter' }
  }
  if (status && !STATUSES.has(status as BellConversationStatus)) {
    return { error: 'Invalid status filter' }
  }
  if (search.length > 100 || hasControlCharacters(search)) {
    return { error: 'Invalid search filter' }
  }
  if (cursor.length > 500 || hasControlCharacters(cursor)) {
    return { error: 'Invalid cursor' }
  }

  const dateFrom = fromValue ? parseDate(fromValue) : null
  if (fromValue && !dateFrom) return { error: 'Invalid start date' }

  const inclusiveDateTo = toValue ? parseDate(toValue) : null
  if (toValue && !inclusiveDateTo) return { error: 'Invalid end date' }

  // The query contract uses an exclusive upper bound. The date input in the
  // interface is inclusive, so advance it to the following UTC midnight.
  const dateTo = inclusiveDateTo
    ? new Date(inclusiveDateTo.getTime() + 24 * 60 * 60 * 1000)
    : null
  if (dateFrom && dateTo && dateFrom >= dateTo) {
    return { error: 'Start date must be on or before end date' }
  }

  return {
    input: {
      surface: surface ? (surface as BellSurface) : undefined,
      identity: identity ? (identity as BellIdentity) : undefined,
      status: status ? (status as BellConversationStatus) : undefined,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
      search: search || undefined,
      cursor: cursor || undefined,
      limit: BELL_PAGE_SIZE,
    },
  }
}

export function isBellConversationId(value: string): boolean {
  return UUID_PATTERN.test(value)
}
