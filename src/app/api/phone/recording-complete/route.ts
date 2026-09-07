import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import {
  goodbyeTwiml,
  playAndHangupTwiml,
  twimlResponse,
} from '@/lib/phone/twiml'
import { twilioRecordingMp3Url } from '@/lib/phone/voicemail'

function hasRecordedVoicemail(form: FormData): boolean {
  const duration = form.get('RecordingDuration')
  const recordingUrl = form.get('RecordingUrl')
  const status = form.get('RecordingStatus')
  if (
    typeof duration !== 'string' ||
    !/^\d+$/.test(duration) ||
    !Number.isSafeInteger(Number(duration)) ||
    Number(duration) <= 0 ||
    typeof recordingUrl !== 'string' ||
    (status !== null && status !== 'completed')
  ) {
    return false
  }

  // <Record action> supplies the URL and duration, but does not promise a
  // RecordingSid or the later recording-status callback's completion fields.
  try {
    const recordingSid = new URL(recordingUrl).pathname
      .split('/')
      .filter(Boolean)
      .at(-1)
    return Boolean(
      recordingSid && twilioRecordingMp3Url(recordingUrl, recordingSid)
    )
  } catch {
    return false
  }
}

/** Twilio <Record action> target: confirms capture, then hangs up. */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return twimlResponse(
    hasRecordedVoicemail(form)
      ? playAndHangupTwiml('voicemailRecorded')
      : goodbyeTwiml()
  )
}
