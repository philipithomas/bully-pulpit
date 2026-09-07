import { describe, expect, it, vi } from 'vitest'
import { phoneBellInitialGreeting } from '@/lib/phone/bell-live-greeting'

describe('phoneBellInitialGreeting', () => {
  it.each([
    ['2026-02-02T09:59:59Z', 'Good evening'],
    ['2026-02-02T10:00:00Z', 'Good morning'],
    ['2026-02-02T16:59:59Z', 'Good morning'],
    ['2026-02-02T17:00:00Z', 'Good afternoon'],
    ['2026-02-02T21:59:59Z', 'Good afternoon'],
    ['2026-02-02T22:00:00Z', 'Good evening'],
    ['2026-06-02T08:59:59Z', 'Good evening'],
    ['2026-06-02T09:00:00Z', 'Good morning'],
    ['2026-06-02T16:00:00Z', 'Good afternoon'],
    ['2026-06-02T21:00:00Z', 'Good evening'],
  ])('uses NYC time at %s', (instant, opening) => {
    expect(phoneBellInitialGreeting(new Date(instant))).toBe(
      `${opening}. You've reached Philip Eelitch Thomas and the Contraption Company. This is Bell AI. You can ask me a question, leave a voicemail, or subscribe to new-post texts. Press star for keypad options.`
    )
  })

  it.each([
    '2026-03-08T06:59:59Z',
    '2026-03-08T07:00:00Z',
    '2026-11-01T05:59:59Z',
    '2026-11-01T06:00:00Z',
  ])('keeps the local overnight greeting across a DST transition at %s', (instant) => {
    expect(phoneBellInitialGreeting(new Date(instant))).toMatch(
      /^Good evening\./
    )
  })

  it.each([
    ['2026-09-07T03:59:59Z', 'Good evening'],
    ['2026-09-07T04:00:00Z', 'Happy Labor Day'],
    ['2026-09-08T03:59:59Z', 'Happy Labor Day'],
    ['2026-09-08T04:00:00Z', 'Good evening'],
    ['2027-09-06T12:00:00Z', 'Happy Labor Day'],
    ['2027-09-07T12:00:00Z', 'Good morning'],
    ['2031-09-01T12:00:00Z', 'Happy Labor Day'],
    ['2031-09-08T12:00:00Z', 'Good morning'],
    ['2026-01-01T04:59:59Z', 'Good evening'],
    ['2026-01-01T05:00:00Z', 'Happy New Year'],
    ['2026-07-03T12:00:00Z', 'Good morning'],
    ['2026-07-04T12:00:00Z', 'Happy Independence Day'],
    ['2026-11-26T12:00:00Z', 'Happy Thanksgiving'],
    ['2026-11-19T12:00:00Z', 'Good morning'],
  ])('uses actual NYC holiday dates at %s', (instant, opening) => {
    expect(phoneBellInitialGreeting(new Date(instant))).toMatch(
      new RegExp(`^${opening}\\.`)
    )
  })

  it('uses the current instant by default', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-07T15:00:00Z'))
      expect(phoneBellInitialGreeting()).toMatch(/^Happy Labor Day\./)
    } finally {
      vi.useRealTimers()
    }
  })
})
