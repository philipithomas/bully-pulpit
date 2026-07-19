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
  { slug: 'tidbits-source', newsletter: 'tidbits' },
  { slug: 'tidbits-peer', newsletter: 'tidbits' },
  { slug: 'tsundoku-peer', newsletter: 'tsundoku' },
]

describe('eligibleRelatedPostCandidates', () => {
  it('excludes photo-newsletter posts from writing recommendations', () => {
    expect(
      eligibleRelatedPostCandidates(candidates[0], candidates).map(
        (candidate) => candidate.slug
      )
    ).toEqual(['writing-peer'])
  })

  it('specifically keeps Tidbits out of non-photo recommendations', () => {
    const recommendations = eligibleRelatedPostCandidates(
      candidates[0],
      candidates
    )

    expect(
      recommendations.some((candidate) => candidate.newsletter === 'tidbits')
    ).toBe(false)
  })

  it('keeps the full archive eligible for photo-post recommendations', () => {
    expect(
      eligibleRelatedPostCandidates(candidates[2], candidates).map(
        (candidate) => candidate.slug
      )
    ).toEqual([
      'writing-source',
      'writing-peer',
      'tidbits-peer',
      'tsundoku-peer',
    ])
  })
})
