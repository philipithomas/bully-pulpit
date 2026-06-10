import { describe, expect, it } from 'vitest'
import { suppressionsFromSesEvent } from '@/lib/email/ses-events'

function bounceEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventType: 'Bounce',
    bounce: {
      bounceType: 'Permanent',
      bounceSubType: 'General',
      bouncedRecipients: [
        {
          emailAddress: 'gone@example.com',
          diagnosticCode: 'smtp; 550 5.1.1 user unknown',
        },
      ],
      timestamp: '2026-06-10T00:00:00.000Z',
      ...overrides,
    },
    mail: { destination: ['gone@example.com'] },
  }
}

describe('suppressionsFromSesEvent', () => {
  it('composes a permanent bounce reason from subtype and diagnostic code', () => {
    expect(suppressionsFromSesEvent(bounceEvent())).toEqual([
      {
        email: 'gone@example.com',
        reason: 'Permanent bounce (General): smtp; 550 5.1.1 user unknown',
      },
    ])
  })

  it('omits the diagnostic when the recipient has none', () => {
    const event = bounceEvent({
      bounceSubType: 'Suppressed',
      bouncedRecipients: [{ emailAddress: 'gone@example.com' }],
    })
    expect(suppressionsFromSesEvent(event)).toEqual([
      { email: 'gone@example.com', reason: 'Permanent bounce (Suppressed)' },
    ])
  })

  it('returns one entry per bounced recipient', () => {
    const event = bounceEvent({
      bouncedRecipients: [
        { emailAddress: 'a@example.com', diagnosticCode: 'smtp; 550 a' },
        { emailAddress: 'b@example.com', diagnosticCode: 'smtp; 550 b' },
      ],
    })
    expect(suppressionsFromSesEvent(event)).toEqual([
      {
        email: 'a@example.com',
        reason: 'Permanent bounce (General): smtp; 550 a',
      },
      {
        email: 'b@example.com',
        reason: 'Permanent bounce (General): smtp; 550 b',
      },
    ])
  })

  it('collapses whitespace and truncates very long diagnostics', () => {
    const event = bounceEvent({
      bouncedRecipients: [
        {
          emailAddress: 'gone@example.com',
          diagnosticCode: `smtp;\n550   ${'x'.repeat(500)}`,
        },
      ],
    })
    const [result] = suppressionsFromSesEvent(event)
    expect(
      result.reason.startsWith('Permanent bounce (General): smtp; 550 x')
    ).toBe(true)
    expect(result.reason.length).toBeLessThanOrEqual(
      'Permanent bounce (General): '.length + 300
    )
  })

  it('ignores transient and undetermined bounces', () => {
    expect(
      suppressionsFromSesEvent(bounceEvent({ bounceType: 'Transient' }))
    ).toEqual([])
    expect(
      suppressionsFromSesEvent(bounceEvent({ bounceType: 'Undetermined' }))
    ).toEqual([])
  })

  it('composes a complaint reason from the feedback type', () => {
    const event = {
      eventType: 'Complaint',
      complaint: {
        complainedRecipients: [{ emailAddress: 'angry@example.com' }],
        complaintFeedbackType: 'abuse',
      },
    }
    expect(suppressionsFromSesEvent(event)).toEqual([
      { email: 'angry@example.com', reason: 'Complaint (abuse)' },
    ])
  })

  it('falls back to a bare Complaint reason without a feedback type', () => {
    const event = {
      eventType: 'Complaint',
      complaint: {
        complainedRecipients: [{ emailAddress: 'angry@example.com' }],
      },
    }
    expect(suppressionsFromSesEvent(event)).toEqual([
      { email: 'angry@example.com', reason: 'Complaint' },
    ])
  })

  it('accepts the identity-notification shape (notificationType)', () => {
    const event = { ...bounceEvent() } as Record<string, unknown>
    delete event.eventType
    event.notificationType = 'Bounce'
    expect(suppressionsFromSesEvent(event)).toHaveLength(1)
  })

  it('ignores deliveries, sends, and unknown event types', () => {
    expect(suppressionsFromSesEvent({ eventType: 'Delivery' })).toEqual([])
    expect(suppressionsFromSesEvent({ eventType: 'Send' })).toEqual([])
    expect(suppressionsFromSesEvent({ eventType: 'Open' })).toEqual([])
  })

  it('returns [] for malformed input', () => {
    expect(suppressionsFromSesEvent(null)).toEqual([])
    expect(suppressionsFromSesEvent('Bounce')).toEqual([])
    expect(suppressionsFromSesEvent([])).toEqual([])
    expect(suppressionsFromSesEvent({ eventType: 'Bounce' })).toEqual([])
    expect(
      suppressionsFromSesEvent({
        eventType: 'Bounce',
        bounce: { bounceType: 'Permanent', bouncedRecipients: [{}, 'x'] },
      })
    ).toEqual([])
  })
})
