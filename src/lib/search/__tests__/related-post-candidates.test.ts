import { describe, expect, it } from 'vitest'
import type { Newsletter } from '@/lib/content/types'
import { eligibleRelatedPostCandidates } from '@/lib/search/related-post-candidates'

interface Candidate {
  slug: string
  newsletter: Newsletter
}

const candidates: Candidate[] = [
  { slug: 'writing-source', newsletter: 'contraption' },
  { slug: 'writing-peer', newsletter: 'workshop' },
  { slug: 'photo-source', newsletter: 'tsundoku' },
  { slug: 'photo-peer', newsletter: 'tsundoku' },
]

describe('eligibleRelatedPostCandidates', () => {
  it('excludes photo-newsletter posts from writing recommendations', () => {
    expect(
      eligibleRelatedPostCandidates(candidates[0], candidates).map(
        (candidate) => candidate.slug
      )
    ).toEqual(['writing-peer'])
  })

  it('keeps the full archive eligible for photo-post recommendations', () => {
    expect(
      eligibleRelatedPostCandidates(candidates[2], candidates).map(
        (candidate) => candidate.slug
      )
    ).toEqual(['writing-source', 'writing-peer', 'photo-peer'])
  })
})
