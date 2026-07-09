import {
  bellPrivateJson,
  isBellConversationId,
} from '@/app/api/printing-press/bell/route-utils'
import { guardAdmin } from '@/lib/auth/admin'
import { redactBellConversation } from '@/lib/db/queries/bell-conversations'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const session = await guardAdmin()
  if (!session) {
    return bellPrivateJson({ error: 'Forbidden' }, 403)
  }

  const { id } = await context.params
  if (!isBellConversationId(id)) {
    return bellPrivateJson({ error: 'Invalid conversation id' }, 400)
  }

  try {
    const redacted = await redactBellConversation(id)
    if (!redacted) {
      return bellPrivateJson({ error: 'Not found' }, 404)
    }
    return bellPrivateJson({ ok: true })
  } catch (error) {
    console.error('[printing-press/bell] redact failed:', error)
    return bellPrivateJson(
      { error: 'Could not redact the Bell conversation' },
      500
    )
  }
}
