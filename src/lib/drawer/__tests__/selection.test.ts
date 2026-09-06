import { describe, expect, it } from 'vitest'
import {
  drawerHref,
  isDrawerDate,
  resolveDrawerDate,
  selectDrawer,
  shiftDrawerDate,
  surpriseDrawerDate,
  utcIsoDate,
} from '@/lib/drawer/selection'
import type {
  DrawerCatalog,
  DrawerCategory,
  DrawerCollections,
  DrawerItem,
} from '@/lib/drawer/types'

function item(
  category: DrawerCategory,
  id: string,
  overrides: Partial<DrawerItem> = {}
): DrawerItem {
  return {
    id: `${category}:${id}`,
    category,
    title: `${category} ${id}`,
    description: `Description for ${id}`,
    href: `/${category}-${id}`,
    ...overrides,
  }
}

function collections(): DrawerCollections {
  return {
    writing: [item('writing', 'alpha'), item('writing', 'beta')],
    photograph: [item('photograph', 'alpha'), item('photograph', 'beta')],
    diction: [item('diction', 'alpha'), item('diction', 'beta')],
    contraption: [item('contraption', 'alpha'), item('contraption', 'beta')],
    blogroll: [item('blogroll', 'alpha'), item('blogroll', 'beta')],
  }
}

describe('drawer dates', () => {
  it('accepts only real ISO calendar dates', () => {
    expect(isDrawerDate('2026-09-06')).toBe(true)
    expect(isDrawerDate('2026-02-29')).toBe(false)
    expect(isDrawerDate('0000-01-01')).toBe(false)
    expect(isDrawerDate('09/06/2026')).toBe(false)
    expect(isDrawerDate(null)).toBe(false)
  })

  it('uses UTC for formatting and day shifts across daylight-saving changes', () => {
    expect(utcIsoDate(new Date('2026-03-08T23:30:00-07:00'))).toBe('2026-03-09')
    expect(shiftDrawerDate('2026-03-08', 1)).toBe('2026-03-09')
    expect(shiftDrawerDate('2024-02-28', 1)).toBe('2024-02-29')
    expect(() => shiftDrawerDate('0001-01-01', -1)).toThrow(
      'outside the supported range'
    )
    expect(() => shiftDrawerDate('9999-12-31', 1)).toThrow(
      'outside the supported range'
    )
    expect(drawerHref('2026-09-06')).toBe('/drawer?date=2026-09-06')
  })

  it('normalizes invalid and future requests to today', () => {
    expect(resolveDrawerDate('2026-09-05', '2026-09-06')).toBe('2026-09-05')
    expect(resolveDrawerDate('2026-09-07', '2026-09-06')).toBe('2026-09-06')
    expect(resolveDrawerDate('not-a-date', '2026-09-06')).toBe('2026-09-06')
  })

  it('clamps requests to the known archive window', () => {
    expect(resolveDrawerDate('2019-12-31', '2026-09-06', '2020-06-07')).toBe(
      '2020-06-07'
    )
    expect(resolveDrawerDate('2020-06-07', '2026-09-06', '2020-06-07')).toBe(
      '2020-06-07'
    )
  })
})

describe('selectDrawer', () => {
  it('returns the same selection regardless of catalog order', () => {
    const original = collections()
    const reversed = Object.fromEntries(
      Object.entries(original).map(([category, items]) => [
        category,
        [...items].reverse(),
      ])
    ) as unknown as DrawerCollections
    const first = selectDrawer(
      { collections: original, earliestDate: '2020-01-01' },
      '2026-09-06'
    )
    const second = selectDrawer(
      { collections: reversed, earliestDate: '2020-01-01' },
      '2026-09-06'
    )

    expect(first).toEqual(second)
    expect(first.items).toHaveLength(5)
    expect(first.items.map((candidate) => candidate.id)).toEqual([
      'writing:alpha',
      'photograph:alpha',
      'diction:beta',
      'contraption:beta',
      'blogroll:beta',
    ])
  })

  it('never repeats a title or destination across compartments', () => {
    const duplicate = item('photograph', 'duplicate', {
      title: 'Shared item',
      href: '/shared',
    })
    const catalog: DrawerCatalog = {
      earliestDate: '2020-01-01',
      collections: {
        writing: [
          item('writing', 'duplicate', {
            title: 'Shared item',
            href: '/shared',
          }),
        ],
        photograph: [duplicate],
        diction: [item('diction', 'one')],
        contraption: [item('contraption', 'one')],
        blogroll: [item('blogroll', 'one')],
      },
    }
    const selected = selectDrawer(catalog, '2026-09-06')
    const realItems = selected.items.filter((candidate) => !candidate.fallback)

    expect(new Set(realItems.map((candidate) => candidate.title)).size).toBe(
      realItems.length
    )
    expect(new Set(realItems.map((candidate) => candidate.href)).size).toBe(
      realItems.length
    )
    expect(
      selected.items.find((candidate) => candidate.category === 'photograph')
    ).toMatchObject({ fallback: true })
  })

  it('uses fixed deterministic fallbacks for empty collections', () => {
    const empty: DrawerCatalog = {
      earliestDate: null,
      collections: {
        writing: [],
        photograph: [],
        diction: [],
        contraption: [],
        blogroll: [],
      },
    }

    const first = selectDrawer(empty, '2026-09-06')
    const second = selectDrawer(empty, '2026-09-06')
    expect(first).toEqual(second)
    expect(first.items).toHaveLength(5)
    expect(first.items.every((candidate) => candidate.fallback)).toBe(true)
  })

  it('excludes Stargazing even if a malformed catalog includes it', () => {
    const base = collections()
    base.writing = [
      item('writing', 'stargazing', {
        title: 'Stargazing',
        href: '/stargazing',
      }),
    ]
    const selected = selectDrawer(
      { collections: base, earliestDate: '2020-01-01' },
      '2026-09-06'
    )

    expect(
      selected.items.some((candidate) => candidate.href === '/stargazing')
    ).toBe(false)
    expect(selected.items[0]).toMatchObject({ fallback: true })
  })
})

describe('surpriseDrawerDate', () => {
  it('is reproducible, bounded, and different when another date exists', () => {
    const first = surpriseDrawerDate('2026-09-06', '2026-09-06', '2020-06-07')
    const second = surpriseDrawerDate('2026-09-06', '2026-09-06', '2020-06-07')

    expect(first).toBe(second)
    expect(first >= '2020-06-07' && first <= '2026-09-06').toBe(true)
    expect(first).not.toBe('2026-09-06')
  })
})
