import {
  bellPrivateJson,
  isBellConversationId,
} from '@/app/api/printing-press/bell/route-utils'
import { serializeBellDetail } from '@/app/printing-press/bell/serialize'
import { guardAdmin } from '@/lib/auth/admin'
import {
  deleteBellConversation,
  getBellConversationDetail,
} from '@/lib/db/queries/bell-conversations'

type RouteContext = { params: Promise<{ id: string }> }

async function authorizedId(context: RouteContext) {
  const session = await guardAdmin()
  if (!session) return { error: 'forbidden' as const }

  const { id } = await context.params
  if (!isBellConversationId(id)) return { error: 'invalid' as const }
  return { id }
}

export async function GET(_request: Request, context: RouteContext) {
  const authorized = await authorizedId(context)
  if ('error' in authorized) {
    if (authorized.error === 'forbidden') {
      return bellPrivateJson({ error: 'Forbidden' }, 403)
    }
    return bellPrivateJson({ error: 'Invalid conversation id' }, 400)
  }

  try {
    const detail = await getBellConversationDetail(authorized.id)
    if (!detail) {
      return bellPrivateJson({ error: 'Not found' }, 404)
    }
    return bellPrivateJson(serializeBellDetail(detail))
  } catch (error) {
    console.error('[printing-press/bell] detail failed:', error)
    return bellPrivateJson(
      { error: 'Could not load the Bell conversation' },
      500
    )
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authorized = await authorizedId(context)
  if ('error' in authorized) {
    if (authorized.error === 'forbidden') {
      return bellPrivateJson({ error: 'Forbidden' }, 403)
    }
    return bellPrivateJson({ error: 'Invalid conversation id' }, 400)
  }

  try {
    const deleted = await deleteBellConversation(authorized.id)
    if (!deleted) {
      return bellPrivateJson({ error: 'Not found' }, 404)
    }
    return bellPrivateJson({ ok: true })
  } catch (error) {
    console.error('[printing-press/bell] delete failed:', error)
    return bellPrivateJson(
      { error: 'Could not delete the Bell conversation' },
      500
    )
  }
}
