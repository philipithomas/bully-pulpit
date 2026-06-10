import { describe, expect, it } from 'vitest'
import {
  decodeVector,
  EMBEDDING_DIMS,
  encodeVector,
  truncateAndNormalize,
} from '@/lib/search/embedding'

describe('truncateAndNormalize', () => {
  it('truncates to the requested dims', () => {
    const input = Array.from({ length: 1536 }, (_, i) => i + 1)
    const out = truncateAndNormalize(input, 256)
    expect(out).toHaveLength(256)
  })

  it('L2-normalizes to unit length', () => {
    const out = truncateAndNormalize([3, 4], 2)
    expect(out[0]).toBeCloseTo(0.6, 10)
    expect(out[1]).toBeCloseTo(0.8, 10)
    const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 10)
  })

  it('preserves direction after truncation', () => {
    const input = [2, 0, 0, 99, 99] // dims beyond 3 are dropped
    const out = truncateAndNormalize(input, 3)
    expect(out).toEqual([1, 0, 0])
  })

  it('returns a zero vector unchanged instead of dividing by zero', () => {
    expect(truncateAndNormalize([0, 0, 0], 3)).toEqual([0, 0, 0])
  })

  it('defaults to the index dims constant', () => {
    const input = Array.from({ length: 1536 }, () => 1)
    expect(truncateAndNormalize(input)).toHaveLength(EMBEDDING_DIMS)
  })
})

describe('encodeVector / decodeVector', () => {
  it('round-trips float32 values through base64', () => {
    const vector = [0.1, -0.25, 1, 0, -1, 3.5e-5]
    const decoded = decodeVector(encodeVector(vector))
    expect(decoded).toHaveLength(vector.length)
    for (let i = 0; i < vector.length; i++) {
      expect(decoded[i]).toBeCloseTo(vector[i], 6)
    }
  })

  it('encodes little-endian float32', () => {
    // 1.0 as little-endian float32 is 00 00 80 3f
    expect(Buffer.from(encodeVector([1]), 'base64').toString('hex')).toBe(
      '0000803f'
    )
  })
})
