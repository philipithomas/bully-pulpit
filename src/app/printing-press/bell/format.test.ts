import { describe, expect, it } from 'vitest'
import {
  bellCostLabel,
  bellLatencyLabel,
  bellPhoneThreadHref,
  bellTimestampLabel,
  bellTokenLabel,
} from '@/app/printing-press/bell/format'

describe('Bell admin formatting', () => {
  it('uses compact ISO-8601 UTC timestamps', () => {
    expect(bellTimestampLabel('2026-07-09T18:42:31.000Z')).toBe(
      '2026-07-09T18:42Z'
    )
  })

  it('formats usage, cost, and latency without hiding small values', () => {
    expect(bellTokenLabel(12345)).toBe('12,345')
    expect(bellCostLabel(0)).toBe('$0.00')
    expect(bellCostLabel(0.00063)).toBe('$0.0006')
    expect(bellCostLabel(0.42)).toBe('$0.42')
    expect(bellLatencyLabel(842)).toBe('842 ms')
    expect(bellLatencyLabel(1540)).toBe('1.5 s')
  })

  it('builds an encoded link to the matching Phone thread', () => {
    expect(bellPhoneThreadHref('+1 212 555 0100')).toBe(
      '/printing-press/phone?number=%2B1%20212%20555%200100'
    )
  })
})
