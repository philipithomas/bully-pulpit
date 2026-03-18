import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    console.warn('[subscribe] Bot blocked')
    return NextResponse.json(
      { error: 'Request blocked. Please try again from the website.' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { email, name, source, newsletters } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Rate limit: 3 subscribe requests per email per 15 minutes
  const emailKey = `subscribe:${email.toLowerCase()}`
  if (!checkRateLimit(emailKey, 3, 15 * 60 * 1000)) {
    console.warn(`[subscribe] Rate limited: ${emailKey}`)
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify({
          email,
          name,
          source: source || undefined,
        }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(`[subscribe] Backend error: ${res.status} ${data.error}`)
      const safeErrors: Record<number, string> = {
        400: 'Invalid email address',
        409: 'Subscription already exists',
      }
      return NextResponse.json(
        { error: safeErrors[res.status] ?? 'Subscription failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()

    // Update newsletter preferences if specified
    if (newsletters && subscriber.uuid) {
      const prefRes = await fetch(
        `${siteConfig.printingPressUrl}/api/v1/subscribers/${subscriber.uuid}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': siteConfig.m2mApiKey,
          },
          body: JSON.stringify({
            subscribed_contraption: newsletters.includes('contraption'),
            subscribed_workshop: newsletters.includes('workshop'),
            subscribed_postcard: newsletters.includes('postcard'),
          }),
          cache: 'no-store',
        }
      )
      if (!prefRes.ok) {
        console.error(
          `[subscribe] Failed to update preferences: ${prefRes.status}`
        )
      }
    }

    return NextResponse.json({ subscriber })
  } catch (err) {
    console.error('[subscribe] Network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
