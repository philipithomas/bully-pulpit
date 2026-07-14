import { describe, expect, it } from 'vitest'
import { BELL_EVAL_CATEGORIES } from '@/lib/chat/evals/cases'
import { runDeterministicBellEvals } from '@/lib/chat/evals/deterministic'

describe('deterministic Bell evaluations', () => {
  it('passes credential-free contract cases covering every category', async () => {
    const results = await runDeterministicBellEvals()
    const categories = new Set(results.map((result) => result.category))
    for (const category of BELL_EVAL_CATEGORIES) {
      expect(categories.has(category)).toBe(true)
    }
    expect(results.filter((result) => !result.passed)).toEqual([])
  })
})
