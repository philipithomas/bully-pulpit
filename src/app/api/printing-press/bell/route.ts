import type { NextRequest } from 'next/server'
import {
  bellPrivateJson,
  parseBellFilters,
} from '@/app/api/printing-press/bell/route-utils'
import { serializeBellSummary } from '@/app/printing-press/bell/serialize'
import { guardAdmin } from '@/lib/auth/admin'
import { listBellConversations } from '@/lib/db/queries/bell-conversations'

export async function GET(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return bellPrivateJson({ error: 'Forbidden' }, 403)
  }

  const parsed = parseBellFilters(request.nextUrl.searchParams)
  if (parsed.error) {
    return bellPrivateJson({ error: parsed.error }, 400)
  }

  try {
    const result = await listBellConversations(parsed.input)
    return bellPrivateJson({
      conversations: result.conversations.map(serializeBellSummary),
      nextCursor: result.nextCursor,
    })
  } catch (error) {
    console.error('[printing-press/bell] list failed:', error)
    return bellPrivateJson({ error: 'Could not load Bell conversations' }, 500)
  }
}
