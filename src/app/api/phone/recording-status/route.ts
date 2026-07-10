import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { twilioRecordingMp3Url } from '@/lib/phone/voicemail'
import {
  twilioWebhookMetadataFromForm,
  twilioWebhookMetadataFromSearchParams,
} from '@/lib/phone/webhook-metadata'
import { processVoicemailWorkflow } from '@/workflows/process-voicemail'

/**
 * Twilio recordingStatusCallback. When a recording completes, hands the
 * download-transcribe-notify pipeline to a durable workflow (the Vercel
 * equivalent of junk-drawer's ProcessVoicemailJob) and acknowledges
 * immediately; Twilio ignores the response body and does not retry status
 * callbacks, so durability has to live on this side.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (String(form.get('RecordingStatus')) !== 'completed') {
    return NextResponse.json({ status: 'ignored' }, { status: 202 })
  }

  const recordingUrl = form.get('RecordingUrl')
  const recordingSid = form.get('RecordingSid')
  if (typeof recordingUrl !== 'string' || typeof recordingSid !== 'string') {
    return NextResponse.json({ error: 'Missing recording' }, { status: 400 })
  }
  if (!twilioRecordingMp3Url(recordingUrl, recordingSid)) {
    return NextResponse.json({ error: 'Invalid recording' }, { status: 400 })
  }

  const webhookEvent = await findOrCreatePhoneWebhookEvent({
    eventKey: `recording:${recordingSid}`,
    eventType: 'recording-status',
  })
  if (webhookEvent.event.processedAt) {
    return NextResponse.json({ status: 'duplicate' }, { status: 202 })
  }
  const lease = await claimPhoneWebhookEvent(webhookEvent.event.id)
  if (!lease) {
    return NextResponse.json({ status: 'duplicate' }, { status: 202 })
  }

  const params = new URL(request.url).searchParams
  const from = params.get('caller') ?? 'Unknown'
  const forwardedMetadata = twilioWebhookMetadataFromSearchParams(params, from)
  const callbackMetadata = twilioWebhookMetadataFromForm(form, from)
  try {
    await start(processVoicemailWorkflow, [
      {
        recordingUrl,
        recordingSid,
        from,
        to: params.get('called') ?? 'Unknown',
        durationSeconds: String(form.get('RecordingDuration') ?? '0'),
        metadata: {
          ...forwardedMetadata,
          callSid: callbackMetadata.callSid ?? forwardedMetadata.callSid,
        },
      },
    ])
    const marked = await markPhoneWebhookEventProcessed(
      webhookEvent.event.id,
      lease
    )
    if (!marked) {
      throw new Error('Could not complete recording webhook claim')
    }
  } catch (error) {
    await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
    console.error('[phone/recording-status] enqueue failed:', error)
    return NextResponse.json(
      { error: 'Could not queue recording' },
      { status: 503 }
    )
  }

  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}
