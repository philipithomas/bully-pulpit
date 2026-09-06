import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { twimlResponse, voicemailTwiml } from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

/** Fixed destination for an authenticated live-call voicemail handoff. */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  return twimlResponse(
    voicemailTwiml(
      voicemailCallbackUrls({
        from,
        to,
        metadata: twilioWebhookMetadataFromForm(form, from),
      })
    )
  )
}
