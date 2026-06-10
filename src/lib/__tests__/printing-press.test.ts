import { describe, expect, it } from 'vitest'
import { suppressionSentence } from '@/lib/printing-press'

describe('suppressionSentence', () => {
  it('renders a rich webhook bounce reason as one prose sentence', () => {
    expect(
      suppressionSentence(
        'Permanent bounce (General): smtp; 550 5.1.1 user unknown',
        '2026-06-10T14:03:00.000Z'
      )
    ).toBe(
      'Deliverability off since 2026-06-10: permanent bounce (General), smtp; 550 5.1.1 user unknown.'
    )
  })

  it('renders a complaint reason', () => {
    expect(
      suppressionSentence('Complaint (abuse)', '2026-01-02T00:00:00.000Z')
    ).toBe('Deliverability off since 2026-01-02: complaint (abuse).')
  })

  it('lowercases the terse SES suppression-list enum reasons', () => {
    expect(suppressionSentence('BOUNCE', '2025-12-31T23:59:59.000Z')).toBe(
      'Deliverability off since 2025-12-31: bounce.'
    )
    expect(suppressionSentence('COMPLAINT', '2026-06-10T00:00:00.000Z')).toBe(
      'Deliverability off since 2026-06-10: complaint.'
    )
  })

  it('does not double the final period', () => {
    expect(
      suppressionSentence(
        'Permanent bounce (General): mailbox does not exist.',
        '2026-06-10T00:00:00.000Z'
      )
    ).toBe(
      'Deliverability off since 2026-06-10: permanent bounce (General), mailbox does not exist.'
    )
  })
})
