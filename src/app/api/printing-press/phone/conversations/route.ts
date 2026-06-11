import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import {
  conversationWith,
  listConversations,
} from '@/lib/db/queries/text-messages'

/**
 * Without `number`: every conversation with its latest message. With
 * `number`: the full thread with that external number, oldest first.
 */
export async function GET(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const number = request.nextUrl.searchParams.get('number')
  if (number) {
    return NextResponse.json({ messages: await conversationWith(number) })
  }
  return NextResponse.json({ conversations: await listConversations() })
}
