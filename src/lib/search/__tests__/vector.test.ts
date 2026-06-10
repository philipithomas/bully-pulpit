import { describe, expect, it } from 'vitest'
import { dot, rrfFuse, topKBySimilarity } from '@/lib/search/vector'

describe('dot', () => {
  it('computes the dot product', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32)
    expect(dot(new Float32Array([1, 0]), [0, 1])).toBe(0)
  })
})

describe('topKBySimilarity', () => {
  const items = [
    { id: 'x-axis', vector: [1, 0, 0] },
    { id: 'y-axis', vector: [0, 1, 0] },
    { id: 'diagonal', vector: [Math.SQRT1_2, Math.SQRT1_2, 0] },
    { id: 'opposite', vector: [-1, 0, 0] },
  ]

  it('returns the k nearest items in similarity order', () => {
    const top = topKBySimilarity([1, 0, 0], items, (i) => i.vector, 2)
    expect(top.map((t) => t.item.id)).toEqual(['x-axis', 'diagonal'])
    expect(top[0].score).toBeCloseTo(1, 10)
    expect(top[1].score).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('ranks opposite vectors last', () => {
    const all = topKBySimilarity([1, 0, 0], items, (i) => i.vector, 4)
    expect(all[all.length - 1].item.id).toBe('opposite')
    expect(all[all.length - 1].score).toBeCloseTo(-1, 10)
  })

  it('handles k larger than the item count', () => {
    expect(
      topKBySimilarity([1, 0, 0], items, (i) => i.vector, 99)
    ).toHaveLength(4)
  })
})

describe('rrfFuse', () => {
  it('ranks an id appearing high in both lists first', () => {
    const fused = rrfFuse([
      ['a', 'b', 'c'],
      ['b', 'a', 'd'],
    ])
    // a: 1/61 + 1/62, b: 1/62 + 1/61 — tie; both beat c and d
    const ids = fused.map((f) => f.id)
    expect(ids.slice(0, 2).sort()).toEqual(['a', 'b'])
    expect(ids).toContain('c')
    expect(ids).toContain('d')
  })

  it('prefers consensus over a single first place', () => {
    const fused = rrfFuse([
      ['only-first', 'both', 'x'],
      ['both', 'y', 'z'],
    ])
    expect(fused[0].id).toBe('both')
  })

  it('computes the textbook score with k=60', () => {
    const fused = rrfFuse([['a'], ['a']])
    expect(fused[0].score).toBeCloseTo(2 / 61, 10)
  })

  it('handles empty rankings', () => {
    expect(rrfFuse([[], []])).toEqual([])
    expect(rrfFuse([['a'], []])[0].id).toBe('a')
  })
})
