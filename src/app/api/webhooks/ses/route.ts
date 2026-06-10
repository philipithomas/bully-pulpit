import { NextResponse } from 'next/server'
import {
  SES_WEBHOOK_SOURCE,
  upsertSuppression,
} from '@/lib/db/queries/suppressions'
import { suppressionsFromSesEvent } from '@/lib/email/ses-events'
import {
  isTrustedSnsUrl,
  type SnsMessage,
  verifySnsSignature,
} from '@/lib/email/sns-verify'
import { requireEnv } from '@/lib/env'

/**
 * Real-time SES deliverability events, delivered by SNS. Permanent bounces
 * and complaints become email_suppressions rows the moment they happen; the
 * hourly suppression-sync cron stays on as reconciliation against the SES
 * account-level suppression list, catching anything this webhook misses.
 *
 * The endpoint is public by design: authentication is the SNS message
 * signature plus pinning TopicArn to SES_SNS_TOPIC_ARN. The subscription
 * must use the default JSON delivery (not raw message delivery), or the
 * signature fields are absent and every message is rejected.
 */
export async function POST(request: Request) {
  let message: SnsMessage
  try {
    message = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (
    typeof message?.Type !== 'string' ||
    typeof message?.Signature !== 'string'
  ) {
    return NextResponse.json({ error: 'Not an SNS message' }, { status: 400 })
  }

  // Cheap rejection before any crypto or cert fetch. TopicArn is also part of
  // the signed payload, so a forged value would fail verification anyway.
  if (message.TopicArn !== requireEnv('SES_SNS_TOPIC_ARN')) {
    console.warn('[webhooks/ses] rejected unknown topic:', message.TopicArn)
    return NextResponse.json({ error: 'Unknown topic' }, { status: 403 })
  }

  if (!(await verifySnsSignature(message))) {
    console.warn(
      '[webhooks/ses] signature verification failed for message',
      message.MessageId
    )
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  if (message.Type === 'SubscriptionConfirmation') {
    // SubscribeURL is covered by the signature, but never fetch a non-SNS URL.
    if (!message.SubscribeURL || !isTrustedSnsUrl(message.SubscribeURL)) {
      return NextResponse.json(
        { error: 'Invalid SubscribeURL' },
        { status: 400 }
      )
    }
    await fetch(message.SubscribeURL)
    return NextResponse.json({ ok: true })
  }

  if (message.Type === 'Notification') {
    let event: unknown
    try {
      event = JSON.parse(message.Message)
    } catch {
      // Authentic but not a SES event payload; acknowledge so SNS does not
      // redeliver something we will never be able to parse.
      console.warn('[webhooks/ses] non-JSON notification ignored')
      return NextResponse.json({ ok: true })
    }
    // SNS delivery is at-least-once and the upsert is idempotent, so a
    // database failure may safely bubble to a 500 and trigger redelivery.
    for (const { email, reason } of suppressionsFromSesEvent(event)) {
      await upsertSuppression(email, reason, SES_WEBHOOK_SOURCE)
    }
    return NextResponse.json({ ok: true })
  }

  // UnsubscribeConfirmation and anything else: acknowledged, no action.
  return NextResponse.json({ ok: true })
}
