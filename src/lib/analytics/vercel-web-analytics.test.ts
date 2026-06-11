import { describe, expect, it } from 'vitest'
import { parseTimeseries } from '@/lib/analytics/vercel-web-analytics'

describe('parseTimeseries', () => {
  it('parses the current grouped shape', () => {
    expect(
      parseTimeseries({
        data: {
          groupCount: 1,
          groups: {
            all: [
              { key: '2026-06-04', total: 123, devices: 45, bounceRate: 61 },
              { key: '2026-06-05', total: 98, devices: 40, bounceRate: 55 },
            ],
          },
        },
      })
    ).toEqual([
      { date: '2026-06-04', views: 123 },
      { date: '2026-06-05', views: 98 },
    ])
  })

  it('parses the legacy flat shape', () => {
    expect(
      parseTimeseries({
        data: [
          { key: '2026-06-04', total: 7 },
          { key: '2026-06-05', total: 0 },
        ],
      })
    ).toEqual([
      { date: '2026-06-04', views: 7 },
      { date: '2026-06-05', views: 0 },
    ])
  })

  it('truncates timestamp keys to the day', () => {
    expect(
      parseTimeseries({
        data: [{ key: '2026-06-04T00:00:00.000Z', total: 3 }],
      })
    ).toEqual([{ date: '2026-06-04', views: 3 }])
  })

  it('returns an empty series for an empty day list', () => {
    expect(parseTimeseries({ data: [] })).toEqual([])
    expect(
      parseTimeseries({ data: { groupCount: 0, groups: { all: [] } } })
    ).toEqual([])
  })

  it('rejects garbage input', () => {
    expect(parseTimeseries('not even an object')).toBeNull()
    expect(parseTimeseries(null)).toBeNull()
    expect(parseTimeseries(undefined)).toBeNull()
    expect(parseTimeseries(42)).toBeNull()
    expect(parseTimeseries([])).toBeNull()
    expect(parseTimeseries({})).toBeNull()
  })

  it('rejects wrong nesting', () => {
    expect(parseTimeseries({ data: 'nope' })).toBeNull()
    expect(parseTimeseries({ data: { groups: null } })).toBeNull()
    expect(parseTimeseries({ data: { groups: { all: 'nope' } } })).toBeNull()
    expect(parseTimeseries({ data: { groups: {} } })).toBeNull()
  })

  it('rejects malformed rows', () => {
    expect(parseTimeseries({ data: [null] })).toBeNull()
    expect(parseTimeseries({ data: ['2026-06-04'] })).toBeNull()
    expect(parseTimeseries({ data: [{ key: '2026-06-04' }] })).toBeNull()
    expect(
      parseTimeseries({ data: [{ key: '2026-06-04', total: '123' }] })
    ).toBeNull()
    expect(
      parseTimeseries({
        data: [{ key: '2026-06-04', total: Number.POSITIVE_INFINITY }],
      })
    ).toBeNull()
  })
})
