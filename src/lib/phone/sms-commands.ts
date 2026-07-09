export type SmsCommand = 'subscribe' | 'unsubscribe' | 'help'

const SUBSCRIBE_COMMANDS = new Set([
  'SUBSCRIBE',
  'START',
  'JOIN',
  'UNSTOP',
  'YES',
])
const TWILIO_REACTIVATION_COMMANDS = new Set(['START', 'UNSTOP', 'YES'])
const UNSUBSCRIBE_COMMANDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
  'REVOKE',
  'OPTOUT',
])
const HELP_COMMANDS = new Set(['HELP', 'INFO'])

export function smsCommandForBody(
  body: string,
  optOutType?: string
): SmsCommand | null {
  const normalizedOptOutType = optOutType?.trim().toUpperCase()
  if (normalizedOptOutType === 'START') return 'subscribe'
  if (normalizedOptOutType === 'STOP') return 'unsubscribe'
  if (normalizedOptOutType === 'HELP') return 'help'

  const normalized = body
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/g, '')
  if (SUBSCRIBE_COMMANDS.has(normalized)) return 'subscribe'
  if (UNSUBSCRIBE_COMMANDS.has(normalized)) return 'unsubscribe'
  if (HELP_COMMANDS.has(normalized)) return 'help'
  return null
}

/**
 * Returns true only when Twilio has classified the message as an opt-in or the
 * handset sent one of Twilio's exact standard reactivation keywords. App-only
 * signup words must not clear local STOP state while Twilio still blocks sends.
 */
export function isTwilioReactivationCommand(
  body: string,
  optOutType?: string
): boolean {
  if (optOutType?.trim().toUpperCase() === 'START') return true
  return TWILIO_REACTIVATION_COMMANDS.has(body.trim().toUpperCase())
}
