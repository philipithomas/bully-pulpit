/**
 * The chat transport surfaces a non-OK response by throwing the raw body as
 * the error message, so a rate-limited visitor would otherwise see literal
 * JSON like {"error":"Too many messages. Please try again later."} in the
 * error bubble. The API's rejection shape is { error: string } (429 rate
 * limit, 403 bot check, 400 bad request): parse it and show the server's
 * message. Anything else (provider internals, stream errors, empty bodies)
 * falls back to the generic message so raw text never reaches a visitor.
 */
const GENERIC_CHAT_ERROR = 'Something went wrong. Please try again.'

export function chatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (!message) return GENERIC_CHAT_ERROR
  try {
    const parsed: unknown = JSON.parse(message)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof parsed.error === 'string' &&
      parsed.error.trim() !== ''
    ) {
      return parsed.error
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return GENERIC_CHAT_ERROR
}
