export type SmsCommand = 'subscribe' | 'unsubscribe'

const SUBSCRIBE_COMMANDS = new Set(['SUBSCRIBE', 'START', 'JOIN'])
const UNSUBSCRIBE_COMMANDS = new Set([
  'STOP',
  'STOPALL',
  'UNSUBSCRIBE',
  'CANCEL',
  'END',
  'QUIT',
])

export function smsCommandForBody(body: string): SmsCommand | null {
  const normalized = body
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/g, '')
  if (SUBSCRIBE_COMMANDS.has(normalized)) return 'subscribe'
  if (UNSUBSCRIBE_COMMANDS.has(normalized)) return 'unsubscribe'
  return null
}
