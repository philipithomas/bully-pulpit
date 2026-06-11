import { NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { processVoicemailWorkflow } from '@/workflows/process-voicemail'

/**
 * Twilio recordingStatusCallback. When a recording completes, hands the
 * download-transcribe-notify pipeline to a durable workflow (the Vercel
 * equivalent of junk-drawer's ProcessVoicemailJob) and acknowledges
 * immediately; Twilio ignores the response body and does not retry status
 * callbacks, so durability has to live on this side.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  if (String(form.get('RecordingStatus')) !== 'completed') {
    return NextResponse.json({ status: 'ignored' }, { status: 202 })
  }

  const recordingUrl = form.get('RecordingUrl')
  const recordingSid = form.get('RecordingSid')
  if (typeof recordingUrl !== 'string' || typeof recordingSid !== 'string') {
    return NextResponse.json({ error: 'Missing recording' }, { status: 400 })
  }

  const params = new URL(request.url).searchParams
  await start(processVoicemailWorkflow, [
    {
      recordingUrl,
      recordingSid,
      from: params.get('caller') ?? 'Unknown',
      to: params.get('called') ?? 'Unknown',
      durationSeconds: String(form.get('RecordingDuration') ?? '0'),
    },
  ])

  return NextResponse.json({ status: 'accepted' }, { status: 202 })
}
