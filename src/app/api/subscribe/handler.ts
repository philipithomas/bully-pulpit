import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import {
  parseAnalyticsPlacement,
  summarizeNewsletters,
} from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import {
  createOrRetrieve,
  InvalidEmailError,
  SuppressedEmailError,
  UndeliverableEmailError,
} from '@/lib/auth/subscriber-service'
import { checkRateLimit } from '@/lib/rate-limit'

type SubscribeOptions = {
  newsletters?: string[]
  allowExistingSubscriberOptIn?: boolean
}

export async function handleSubscribeRequest(
  request: Request,
  options: SubscribeOptions = {}
) {
  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json()
  const { email, name, source, newsletters, analytics_placement } = body
  const requestedNewsletters =
    options.newsletters ??
    (Array.isArray(newsletters) ? newsletters : undefined)

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
    // For a new email this creates the row (applying name, source, and the
    // default public newsletter set) and sends a confirmation code. Existing
    // confirmed subscribers sign in by default. Email-only opt-in is limited to
    // server-owned endpoints that constrain the target newsletter.
    const result = await createOrRetrieve({
      email,
      name,
      source: source || undefined,
      newsletters: requestedNewsletters,
      allowExistingSubscriberOptIn:
        options.allowExistingSubscriberOptIn === true,
    })

    const placement = parseAnalyticsPlacement(analytics_placement)
    const newsletter = summarizeNewsletters(requestedNewsletters)
    if (result.nextStep === 'verification_sent') {
      await trackServerEvent(request, 'Newsletter verification sent', {
        method: 'email',
        placement,
        newsletter,
        new_subscriber: result.isNew,
      })
    } else if (options.allowExistingSubscriberOptIn) {
      await Promise.all(
        result.changedNewsletters.map((requested) =>
          trackServerEvent(request, 'Newsletter preference changed', {
            placement,
            newsletter: requested,
            subscribed: true,
          })
        )
      )
    }

    return NextResponse.json({ ok: true, status: result.nextStep })
  } catch (err) {
    if (err instanceof InvalidEmailError) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      )
    }
    if (err instanceof UndeliverableEmailError) {
      return NextResponse.json(
        {
          error:
            'That email domain cannot receive mail. Check the address and try again.',
        },
        { status: 400 }
      )
    }
    if (err instanceof SuppressedEmailError) {
      return NextResponse.json(
        {
          error:
            'We cannot deliver email to this address. Contact mail@philipithomas.com.',
        },
        { status: 422 }
      )
    }
    console.error('[subscribe] error:', err)
    return NextResponse.json({ error: 'Subscription failed' }, { status: 500 })
  }
}
