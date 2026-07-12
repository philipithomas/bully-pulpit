export const BELL_SMS_PREFIX = '[Bell AI]'
export const BELL_SMS_COMPLIANCE_FOOTER =
  'philipithomas.com: Reply STOP to end.'

/** Builds a short fixed Bell reply with the same transport copy as AI output. */
export function fixedBellSmsBody(content: string): string {
  return `${BELL_SMS_PREFIX} ${content.trim()} ${BELL_SMS_COMPLIANCE_FOOTER}`
}
