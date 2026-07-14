import { describe, expect, it } from 'vitest'
import { smsCommandForBody } from '@/lib/phone/sms-commands'

describe('smsCommandForBody', () => {
  it.each([
    'SUBSCRIBE',
    'start',
    'Join.',
    'unstop',
    'Yes!',
  ])('%s subscribes', (body) => {
    expect(smsCommandForBody(body)).toBe('subscribe')
  })

  it.each(['STOP', 'unsubscribe', 'OptOut!'])('%s unsubscribes', (body) => {
    expect(smsCommandForBody(body)).toBe('unsubscribe')
  })

  it.each(['HELP', 'info?'])('%s requests help', (body) => {
    expect(smsCommandForBody(body)).toBe('help')
  })

  it('prefers Twilio Advanced Opt-Out metadata', () => {
    expect(smsCommandForBody('anything', 'START')).toBe('subscribe')
    expect(smsCommandForBody('anything', 'STOP')).toBe('unsubscribe')
    expect(smsCommandForBody('anything', 'HELP')).toBe('help')
  })

  it('leaves ordinary messages alone', () => {
    expect(smsCommandForBody('Can you call me?')).toBeNull()
  })
})
