import type { Newsletter } from '@/lib/content/types'
import { isPhotoNewsletter } from '@/lib/newsletters'

export interface RelatedPostCandidate {
  slug: string
  newsletter: Newsletter
}

/**
 * Photo newsletters are a distinct recommendation destination: writing posts
 * do not recommend them. Photo posts keep the full archive as candidates.
 */
export function eligibleRelatedPostCandidates<
  Candidate extends RelatedPostCandidate,
>(source: RelatedPostCandidate, candidates: readonly Candidate[]): Candidate[] {
  const sourceIsPhoto = isPhotoNewsletter(source.newsletter)

  return candidates.filter(
    (candidate) =>
      candidate.slug !== source.slug &&
      (sourceIsPhoto || !isPhotoNewsletter(candidate.newsletter))
  )
}
