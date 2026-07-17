import { type NextRequest, NextResponse } from 'next/server'
import { trackServerEvent } from '@/lib/analytics/server'
import {
  clearMagicLinkCompletionCookie,
  MAGIC_LINK_COMPLETION_COOKIE,
  verifyMagicLinkCompletionCookie,
} from '@/lib/auth/magic-link-completion'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const marker = request.cookies.get(MAGIC_LINK_COMPLETION_COOKIE)?.value
  const completion = marker
    ? await verifyMagicLinkCompletionCookie(marker)
    : null
  const destination = new URL(
    completion?.destination === 'account' ? '/account' : '/',
    request.url
  )

  if (completion) {
    try {
      await trackServerEvent(request, 'Newsletter signup completed', {
        method: 'email_link',
        placement: 'unknown',
        newsletter: completion.newsletter,
        new_subscriber: completion.newSubscriber,
      })
    } catch {
      console.error('[auth/complete] Could not record signup completion')
    }
    destination.searchParams.set('signed-in', '1')
  }

  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'private, no-store')
  clearMagicLinkCompletionCookie(response)
  return response
}
