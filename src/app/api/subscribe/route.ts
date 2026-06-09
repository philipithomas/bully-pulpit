import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import {
  createOrRetrieve,
  InvalidEmailError,
  SuppressedEmailError,
} from '@/lib/auth/subscriber-service'
import {
  serializeSubscriber,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, source, newsletters } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Rate limit: 3 subscribe requests per email per 15 minutes
  const emailKey = `email:${email.toLowerCase()}`
  if (!(await checkRateLimit('subscribe', emailKey, request))) {
    console.warn(`[subscribe] Rate limited: ${emailKey}`)
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const { subscriber } = await createOrRetrieve({
      email,
      name,
      source: source || undefined,
    })

    // Update newsletter preferences if explicitly specified
    if (Array.isArray(newsletters)) {
      const updated = await updateSubscriber(subscriber.uuid, {
        subscribedContraption: newsletters.includes('contraption'),
        subscribedWorkshop: newsletters.includes('workshop'),
        subscribedPostcard: newsletters.includes('postcard'),
      })
      return NextResponse.json({
        subscriber: serializeSubscriber(updated ?? subscriber),
      })
    }

    return NextResponse.json({ subscriber: serializeSubscriber(subscriber) })
  } catch (err) {
    if (err instanceof InvalidEmailError) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }
    if (err instanceof SuppressedEmailError) {
      return NextResponse.json(
        {
          error:
            "We can't deliver email to this address — contact mail@philipithomas.com.",
        },
        { status: 422 }
      )
    }
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: 'Subscription failed' }, { status: 500 })
  }
}
