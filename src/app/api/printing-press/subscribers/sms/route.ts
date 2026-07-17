import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import {
  deleteSmsSubscriberWithData,
  findSmsSubscriberById,
  listSmsSubscribers,
} from '@/lib/db/queries/sms-subscribers'

const PAGE_SIZE = 50
const MAX_SEARCH_LENGTH = 32

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function normalizedPhoneSearch(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > MAX_SEARCH_LENGTH || !/^[+\d\s().-]+$/.test(trimmed)) {
    return null
  }
  return trimmed.replace(/[\s().-]/g, '')
}

export async function GET(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) return privateJson({ error: 'Forbidden' }, 403)

  const params = request.nextUrl.searchParams
  const search = normalizedPhoneSearch(params.get('q') ?? '')
  if (search === null) {
    return privateJson({ error: 'Invalid phone search' }, 400)
  }

  const rawOffset = params.get('offset') ?? '0'
  const offset = Number(rawOffset)
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return privateJson({ error: 'Invalid offset' }, 400)
  }

  try {
    const result = await listSmsSubscribers({
      search: search || undefined,
      offset,
      limit: PAGE_SIZE,
    })
    return privateJson({ ...result, offset, limit: PAGE_SIZE })
  } catch (error) {
    console.error('Could not list SMS subscribers', error)
    return privateJson({ error: 'Could not list SMS subscribers' }, 500)
  }
}

export async function DELETE(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) return privateJson({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => null)
  if (!body) return privateJson({ error: 'Invalid request body' }, 400)

  const { id } = body
  if (!Number.isSafeInteger(id) || id <= 0) {
    return privateJson({ error: 'A valid id is required' }, 400)
  }

  try {
    const subscriber = await findSmsSubscriberById(id)
    if (!subscriber) return privateJson({ error: 'Not found' }, 404)
    if (!subscriber.confirmedAt) {
      return privateJson(
        {
          error:
            'Unsubscribed numbers keep their STOP record and cannot be deleted here.',
        },
        409
      )
    }

    const deleted = await deleteSmsSubscriberWithData(id)
    if (!deleted) {
      const current = await findSmsSubscriberById(id)
      return current
        ? privateJson(
            { error: 'This subscriber changed and was not deleted.' },
            409
          )
        : privateJson({ error: 'Not found' }, 404)
    }
    return privateJson({ ok: true })
  } catch (error) {
    console.error('Could not delete SMS subscriber', error)
    return privateJson({ error: 'Could not delete SMS subscriber' }, 500)
  }
}
