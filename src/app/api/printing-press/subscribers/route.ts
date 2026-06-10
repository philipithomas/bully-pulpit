import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import {
  deleteWithData,
  findByUuid,
  listSubscribers,
} from '@/lib/db/queries/subscribers'

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const search = params.get('q') ?? undefined
  const offset = Math.max(
    Number.parseInt(params.get('offset') ?? '0', 10) || 0,
    0
  )

  const { rows, total } = await listSubscribers({
    search,
    offset,
    limit: PAGE_SIZE,
  })
  return NextResponse.json({ rows, total, offset, limit: PAGE_SIZE })
}

export async function DELETE(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { uuid } = body
  if (!uuid || typeof uuid !== 'string') {
    return NextResponse.json({ error: 'uuid is required' }, { status: 400 })
  }

  const subscriber = await findByUuid(uuid)
  if (!subscriber) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Hard delete: removes the subscriber plus their email_sends and logins rows.
  await deleteWithData(subscriber.id)
  return NextResponse.json({ ok: true })
}
