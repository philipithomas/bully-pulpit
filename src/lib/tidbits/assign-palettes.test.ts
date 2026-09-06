import { describe, expect, it } from 'vitest'
import { getPhotoPosts } from '@/lib/content/photo-navigation'
import {
  assignTidbitsPalettes,
  validateTidbitsPaletteAssignments,
} from '@/lib/tidbits/assign-palettes'
import {
  TIDBITS_PALETTE_ASSIGNMENTS,
  TIDBITS_PALETTES,
  tidbitsPaletteForPost,
} from '@/lib/tidbits/palette'

describe('saved Tidbits palette assignments', () => {
  it('covers the published archive, including the circular boundary', () => {
    const slugs = getPhotoPosts('tidbits').map((post) => post.slug)
    expect(
      validateTidbitsPaletteAssignments(slugs, TIDBITS_PALETTE_ASSIGNMENTS)
    ).toEqual([])
    for (const slug of slugs) {
      expect(tidbitsPaletteForPost(slug).id).toBe(
        TIDBITS_PALETTE_ASSIGNMENTS[slug]
      )
    }
  })

  it('migrates five issues and preserves every other original archive color', () => {
    // The original equal-color runs require two changes around Cycling
    // (including SFMOMA), two among the four verdigris issues, and one in the
    // Swivel/Borscht pair. These five changes are the minimum with Cycling fixed.
    const unchanged = {
      cycling: 'aubergine',
      greenhouse: 'aubergine',
      lamps: 'ochre',
      'copenhagen-sunset': 'cobalt',
      kaffe: 'verdigris',
      'third-times-the-charm': 'verdigris',
      'morning-fog': 'aubergine',
      jackknife: 'persimmon',
      swivel: 'aubergine',
      swing: 'persimmon',
      'cable-car': 'aubergine',
      'sunrise-in-chinatown': 'ochre',
    }
    const changed = {
      copenhill: 'cobalt',
      subway: 'ochre',
      'last-evening-in-sf': 'persimmon',
      borscht: 'verdigris',
      sfmoma: 'cobalt',
    }
    expect(TIDBITS_PALETTE_ASSIGNMENTS).toMatchObject({
      ...unchanged,
      ...changed,
    })
  })

  it('allows empty and single-photo collections without self-conflicts', () => {
    expect(validateTidbitsPaletteAssignments([], {})).toEqual([])
    expect(assignTidbitsPalettes([], {})).toEqual({})
    const one = assignTidbitsPalettes(['only'], {})
    expect(one).toEqual({ only: 'verdigris' })
    expect(validateTidbitsPaletteAssignments(['only'], one)).toEqual([])
  })

  it('uses distinct colors for two photos and reports a repeated pair only once', () => {
    const slugs = ['newer', 'older']
    const assigned = assignTidbitsPalettes(slugs, {})
    expect(assigned.newer).not.toBe(assigned.older)
    expect(validateTidbitsPaletteAssignments(slugs, assigned)).toEqual([])
    expect(
      validateTidbitsPaletteAssignments(slugs, {
        newer: 'cobalt',
        older: 'cobalt',
      })
    ).toEqual([expect.stringContaining('newer and older')])
  })

  it('reports absent assignments and invalid IDs, including retained old entries', () => {
    expect(
      validateTidbitsPaletteAssignments(['new', 'broken'], {
        broken: 'ultraviolet',
        removed: 'plaid',
      })
    ).toEqual([
      expect.stringContaining('broken: invalid Tidbits palette ultraviolet'),
      expect.stringContaining('removed: invalid Tidbits palette plaid'),
      expect.stringContaining('new: no saved Tidbits palette'),
    ])
    expect(() => assignTidbitsPalettes([], { removed: 'plaid' })).toThrow(
      'invalid Tidbits palette plaid'
    )
  })

  it('detects the oldest-to-newest repetition', () => {
    expect(
      validateTidbitsPaletteAssignments(['a', 'b', 'c'], {
        a: 'cobalt',
        b: 'ochre',
        c: 'cobalt',
      })
    ).toEqual([expect.stringContaining('c and a')])
  })

  it('assigns a backdated insertion around both saved neighbors', () => {
    const existing = { newest: 'verdigris', oldest: 'ochre' }
    const slugs = ['newest', 'inserted', 'oldest']
    const assigned = assignTidbitsPalettes(slugs, existing)
    expect(assigned).toEqual({ ...existing, inserted: 'cobalt' })
    expect(existing).toEqual({ newest: 'verdigris', oldest: 'ochre' })
    expect(validateTidbitsPaletteAssignments(slugs, assigned)).toEqual([])
  })

  it('keeps assignments stable when adding newer issues and rerunning', () => {
    const initial = assignTidbitsPalettes(['a', 'b', 'c'], {})
    const slugs = ['new-a', 'new-b', 'a', 'b', 'c']
    const assigned = assignTidbitsPalettes(slugs, initial)
    expect(assigned).toMatchObject(initial)
    expect(assigned['new-a']).not.toBe(initial.c)
    expect(validateTidbitsPaletteAssignments(slugs, assigned)).toEqual([])
    expect(assignTidbitsPalettes(slugs, assigned)).toEqual(assigned)
  })

  it('handles consecutive and separated gaps in a single deterministic batch', () => {
    const slugs = ['new-1', 'new-2', 'a', 'new-3', 'new-4', 'b', 'new-5']
    const existing = { a: 'cobalt', b: 'cobalt' }
    const assigned = assignTidbitsPalettes(slugs, existing)
    expect(assigned).toMatchObject(existing)
    expect(validateTidbitsPaletteAssignments(slugs, assigned)).toEqual([])
    expect(assignTidbitsPalettes(slugs, existing)).toEqual(assigned)
  })

  it('spreads a fresh batch across all five palettes', () => {
    const slugs = Array.from({ length: 30 }, (_, index) => `issue-${index}`)
    const assigned = assignTidbitsPalettes(slugs, {})
    expect(validateTidbitsPaletteAssignments(slugs, assigned)).toEqual([])
    for (const { id } of TIDBITS_PALETTES) {
      expect(
        Object.values(assigned).filter((value) => value === id)
      ).toHaveLength(6)
    }
  })

  it('retains removed assignments without counting them in the current balance', () => {
    const existing = { removed: 'verdigris' }
    expect(assignTidbitsPalettes(['new'], existing)).toEqual({
      removed: 'verdigris',
      new: 'verdigris',
    })
  })

  it('requires an explicit correction when deletion or reordering creates a conflict', () => {
    const existing = { a: 'cobalt', b: 'ochre', c: 'cobalt', d: 'persimmon' }
    expect(
      validateTidbitsPaletteAssignments(['a', 'b', 'c', 'd'], existing)
    ).toEqual([])
    for (const slugs of [
      ['a', 'c', 'd'],
      ['a', 'c', 'b', 'd'],
    ]) {
      expect(() => assignTidbitsPalettes(slugs, existing)).toThrow(
        'a and c: adjacent Tidbits photos share cobalt'
      )
      expect(existing.a).toBe('cobalt')
      expect(existing.c).toBe('cobalt')
    }
  })
})
