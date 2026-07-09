import { validateRequest } from 'twilio/lib/webhooks/webhooks'
import { twilioSecret } from '@/lib/phone/config'

type TwilioParams = Record<string, string | string[]>

function publicRequestUrl(request: Request): string {
  if (!process.env.VERCEL) return request.url

  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProtocol = request.headers.get('x-forwarded-proto')
  if (
    !forwardedHost ||
    (forwardedProtocol !== 'http' && forwardedProtocol !== 'https')
  ) {
    return request.url
  }

  const internalUrl = new URL(request.url)
  return `${forwardedProtocol}://${forwardedHost}${internalUrl.pathname}${internalUrl.search}`
}

function twilioParams(form: FormData): TwilioParams | null {
  const params: TwilioParams = {}

  for (const [name, value] of form.entries()) {
    if (typeof value !== 'string') return null

    const existing = params[name]
    params[name] =
      existing === undefined
        ? value
        : Array.isArray(existing)
          ? [...existing, value]
          : [existing, value]
  }

  return params
}

/**
 * Verifies Twilio's signature over the public request URL and every form
 * parameter using the account auth token. Returns the parsed form so callers
 * process the same body that was authenticated. Fails closed on missing or
 * malformed configuration, headers, or form data.
 */
export async function validatedPhoneWebhookForm(
  request: Request
): Promise<FormData | null> {
  const token = twilioSecret()
  const signature = request.headers.get('x-twilio-signature')
  const contentType = request.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase()

  if (
    !token ||
    !signature ||
    contentType !== 'application/x-www-form-urlencoded'
  ) {
    return null
  }

  try {
    const form = await request.formData()
    const params = twilioParams(form)
    if (!params) return null

    return validateRequest(token, signature, publicRequestUrl(request), params)
      ? form
      : null
  } catch {
    return null
  }
}
