import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import {
  createOrRetrieve,
  InvalidEmailError,
  SuppressedEmailError,
  UndeliverableEmailError,
} from '@/lib/auth/subscriber-service'
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
    // For a new email this creates the row (applying name, source, and the
    // requested newsletters) and sends a confirmation code. For an existing
    // subscriber it is a pure sign-in: the caller is unauthenticated, so the
    // stored name, source, and newsletter preferences stay untouched.
    await createOrRetrieve({
      email,
      name,
      source: source || undefined,
      newsletters: Array.isArray(newsletters) ? newsletters : undefined,
    })

    // Same minimal body whether the email was new or already subscribed: the
    // response must not leak subscriber data or act as an enumeration oracle.
    return NextResponse.json({ ok: true })
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
