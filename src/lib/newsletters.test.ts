import { describe, expect, it } from 'vitest'
import { NEWSLETTERS } from '@/lib/content/types'
import {
  defaultSignupNewsletters,
  newsletterPreferenceKeys,
  newsletterRows,
} from '@/lib/newsletters'

describe('newsletter metadata', () => {
  it('keeps account rows in sync with the newsletter registry', () => {
    expect(newsletterRows().map((row) => row.slug)).toEqual([...NEWSLETTERS])
    expect(newsletterRows().map((row) => row.key)).toEqual(
      NEWSLETTERS.map((newsletter) => newsletterPreferenceKeys[newsletter])
    )
  })

  it('subscribes new public signups to every newsletter by default', () => {
    expect(defaultSignupNewsletters).toEqual([...NEWSLETTERS])
  })
})
