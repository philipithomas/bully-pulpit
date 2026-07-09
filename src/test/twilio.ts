import { getExpectedTwilioSignature } from 'twilio/lib/webhooks/webhooks'

type TwilioForm = Record<string, string | string[]>

export function twilioPostRequest(
  url: string,
  form: TwilioForm,
  authToken: string,
  options: {
    signature?: string
    signatureUrl?: string
    headers?: HeadersInit
  } = {}
): Request {
  const body = new URLSearchParams()
  for (const [name, rawValue] of Object.entries(form)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    for (const value of values) body.append(name, value)
  }

  const signature =
    options.signature ??
    getExpectedTwilioSignature(authToken, options.signatureUrl ?? url, form)
  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Twilio-Signature': signature,
  })
  for (const [name, value] of new Headers(options.headers).entries()) {
    headers.set(name, value)
  }

  return new Request(url, {
    method: 'POST',
    headers,
    body: body.toString(),
  })
}
