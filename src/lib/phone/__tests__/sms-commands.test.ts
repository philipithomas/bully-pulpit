import { describe, expect, it } from 'vitest'
import {
  isTwilioReactivationCommand,
  smsCommandForBody,
} from '@/lib/phone/sms-commands'

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

  it.each([
    'START',
    ' unstop ',
    'yes',
  ])('treats exact Twilio keyword %s as reactivation proof', (body) => {
    expect(isTwilioReactivationCommand(body)).toBe(true)
  })

  it('uses Twilio metadata as authoritative reactivation proof', () => {
    expect(isTwilioReactivationCommand('custom keyword', 'START')).toBe(true)
  })

  it.each([
    'SUBSCRIBE',
    'JOIN',
    'START!',
    'YES.',
  ])('does not treat %s as carrier reactivation proof', (body) => {
    expect(isTwilioReactivationCommand(body)).toBe(false)
  })
})
