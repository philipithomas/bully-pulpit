import { describe, expect, it } from 'vitest'
import { formatMemberCount } from '@/lib/format-member-count'

describe('formatMemberCount', () => {
  it('returns exact count for <= 50', () => {
    expect(formatMemberCount(0)).toBe('0')
    expect(formatMemberCount(1)).toBe('1')
    expect(formatMemberCount(30)).toBe('30')
    expect(formatMemberCount(50)).toBe('50')
  })

  it('rounds down to 10 for 51-100', () => {
    expect(formatMemberCount(55)).toBe('50+')
    expect(formatMemberCount(99)).toBe('90+')
    expect(formatMemberCount(100)).toBe('100+')
  })

  it('rounds down to 50 for 101-1000', () => {
    expect(formatMemberCount(101)).toBe('100+')
    expect(formatMemberCount(580)).toBe('550+')
    expect(formatMemberCount(999)).toBe('950+')
    expect(formatMemberCount(1_000)).toBe('1,000+')
  })

  it('rounds down to 100 for 1001-10000', () => {
    expect(formatMemberCount(1_001)).toBe('1,000+')
    expect(formatMemberCount(5_555)).toBe('5,500+')
    expect(formatMemberCount(10_000)).toBe('10,000+')
  })

  it('rounds down to 1000 for 10001-100000', () => {
    expect(formatMemberCount(10_001)).toBe('10,000+')
    expect(formatMemberCount(55_555)).toBe('55,000+')
    expect(formatMemberCount(100_000)).toBe('100,000+')
  })

  it('rounds down to 10000 and formats as k for 100001-1000000', () => {
    expect(formatMemberCount(100_001)).toBe('100k+')
    expect(formatMemberCount(555_555)).toBe('550k+')
    expect(formatMemberCount(1_000_000)).toBe('1,000k+')
  })

  it('rounds down to 100000 and formats as m for > 1000000', () => {
    expect(formatMemberCount(1_000_001)).toBe('1m+')
    expect(formatMemberCount(5_555_555)).toBe('5.5m+')
  })
})
