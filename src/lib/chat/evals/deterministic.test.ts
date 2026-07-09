import { describe, expect, it } from 'vitest'
import { BELL_EVAL_CATEGORIES } from '@/lib/chat/evals/cases'
import { runDeterministicBellEvals } from '@/lib/chat/evals/deterministic'

describe('deterministic Bell evaluations', () => {
  it('passes one credential-free contract case per required category', async () => {
    const results = await runDeterministicBellEvals()
    expect(results.map((result) => result.category)).toEqual(
      BELL_EVAL_CATEGORIES
    )
    expect(results.filter((result) => !result.passed)).toEqual([])
  })
})
