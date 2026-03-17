import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json(
      { error: 'Request blocked. Please try again from the website.' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { email, name, newsletters } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
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
        }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      return NextResponse.json(
        { error: data.error ?? 'Subscription failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()

    // Update newsletter preferences if specified
    if (newsletters && subscriber.uuid) {
      await fetch(
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
    }

    return NextResponse.json({ subscriber })
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
