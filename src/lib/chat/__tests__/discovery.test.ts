import { describe, expect, it } from 'vitest'
import {
  nextBellDiscoveryPageView,
  shouldNudgeBellDiscovery,
} from '@/lib/chat/discovery'

describe('Bell discovery nudge', () => {
  it('counts page views defensively and caps the stored value', () => {
    expect(nextBellDiscoveryPageView(null)).toBe(1)
    expect(nextBellDiscoveryPageView('1')).toBe(2)
    expect(nextBellDiscoveryPageView('2')).toBe(3)
    expect(nextBellDiscoveryPageView('99')).toBe(3)
    expect(nextBellDiscoveryPageView('not-a-number')).toBe(1)
  })

  it('nudges only on the second view before Bell has been opened', () => {
    expect(shouldNudgeBellDiscovery(1, false)).toBe(false)
    expect(shouldNudgeBellDiscovery(2, false)).toBe(true)
    expect(shouldNudgeBellDiscovery(2, true)).toBe(false)
    expect(shouldNudgeBellDiscovery(3, false)).toBe(false)
  })
})
