export const BELL_SMS_PREFIX = '[Bell AI]'

/** Builds a short fixed Bell reply with the same prefix as AI output. */
export function fixedBellSmsBody(content: string): string {
  return `${BELL_SMS_PREFIX} ${content.trim()}`
}
