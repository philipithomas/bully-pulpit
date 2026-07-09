// TwiML builders for the Twilio voice and SMS webhooks. Ported from
// junk-drawer's controllers, with two changes: all interpolated values are
// XML-escaped (the Rails version interpolated raw strings), and the greeting
// uses Twilio's <Say> with an Amazon Polly neural voice instead of a separate
// OpenAI TTS endpoint. That removes the greeting-audio route and its cache
// token handoff, which has no good equivalent on serverless.

/** Escapes a string for use in XML text content or attribute values. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const SAY_VOICE = 'Polly.Matthew-Neural'

/** Greets the caller and records a voicemail with status callbacks. */
export function voicemailTwiml(input: {
  greeting: string
  recordingStatusUrl: string
  recordingCompleteUrl: string
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${SAY_VOICE}">${escapeXml(input.greeting)}</Say>
  <Record maxLength="120" recordingStatusCallback="${escapeXml(input.recordingStatusUrl)}" recordingStatusCallbackMethod="POST" action="${escapeXml(input.recordingCompleteUrl)}" method="POST" />
</Response>`
}

/** Greets the caller and asks whether to leave voicemail or subscribe by SMS. */
export function voiceMenuTwiml(input: {
  greeting: string
  menuActionUrl: string
  recordingStatusUrl: string
  recordingCompleteUrl: string
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${SAY_VOICE}">${escapeXml(input.greeting)}</Say>
  <Gather action="${escapeXml(input.menuActionUrl)}" method="POST" input="dtmf" numDigits="1" timeout="6">
    <Say voice="${SAY_VOICE}">Press 1 to leave a voicemail. Press 2 to subscribe to text message updates.</Say>
  </Gather>
  <Say voice="${SAY_VOICE}">Leave a message after the tone.</Say>
  <Record maxLength="120" recordingStatusCallback="${escapeXml(input.recordingStatusUrl)}" recordingStatusCallbackMethod="POST" action="${escapeXml(input.recordingCompleteUrl)}" method="POST" />
</Response>`
}

/** Played after the caller finishes recording. */
export function goodbyeTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${SAY_VOICE}">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`
}

export function sayAndHangupTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${SAY_VOICE}">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`
}

/** Acknowledges an inbound SMS without replying. */
export function emptyTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
}

/** Replies to an inbound SMS with a short message. */
export function messageTwiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(body)}</Message>
</Response>`
}

/**
 * Bridges a click-to-call: spoken once the owner's phone answers, it dials the
 * destination presenting `callerId` (an owned Twilio number). Ported from
 * junk-drawer's TwilioCallsController#connect, with both interpolated values
 * XML-escaped (the Rails version interpolated raw strings).
 */
export function connectCallTwiml(input: {
  target: string
  callerId: string
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${escapeXml(input.callerId)}">${escapeXml(input.target)}</Dial>
</Response>`
}

/**
 * Wraps TwiML in a Response with no-store cache headers so neither Vercel's
 * CDN nor any intermediary caches a per-call document.
 */
export function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}
