import MiniSearch from 'minisearch'
import type { CorpusPost } from '@/lib/search/corpus'
import { buildCorpus } from '@/lib/search/corpus'

/**
 * BM25 keyword search over searchable content via MiniSearch. One document per
 * post or page (not per chunk): title, description, concatenated body text,
 * and cover alt, with title boosted hard so a page titled "Foo" always
 * outranks an entry that merely mentions "foo" in the body. Powers the BM25
 * side of shared hybrid search for both typeahead and the agent.
 */

export interface LexicalResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  score: number
  /** Matched index terms (prefix/fuzzy expansions included) */
  terms: string[]
}

export interface LexicalImageResult {
  id: string
  slug: string
  title: string
  url: string
  newsletter: string
  imageSrc: string
  imageAlt: string
  score: number
  /** Matched index terms (prefix/fuzzy expansions included) */
  terms: string[]
}

export interface LexicalIndex {
  search(query: string, limit?: number): LexicalResult[]
  searchImages(query: string, limit?: number): LexicalImageResult[]
  extractExcerpts(slug: string, terms: string[], maxExcerpts?: number): string[]
}

const FIELD_BOOSTS = {
  title: 6,
  description: 2,
  body: 2,
  coverAlt: 1,
  imageText: 2,
  location: 1.5,
  photoMetadata: 1,
}
const IMAGE_FIELD_BOOSTS = { alt: 5, title: 2, heading: 2, text: 1 }
const EXCERPT_CHARS = 120

export function buildLexicalIndex(corpus: CorpusPost[]): LexicalIndex {
  const mini = new MiniSearch({
    fields: [
      'title',
      'description',
      'body',
      'coverAlt',
      'imageText',
      'location',
      'photoMetadata',
    ],
    storeFields: ['slug', 'title', 'url', 'newsletter', 'coverImage'],
    idField: 'slug',
  })
  const imageMini = new MiniSearch({
    fields: ['title', 'alt', 'heading', 'text'],
    storeFields: [
      'id',
      'slug',
      'title',
      'url',
      'newsletter',
      'imageSrc',
      'imageAlt',
    ],
    idField: 'id',
  })

  mini.addAll(
    corpus.map((post) => ({
      slug: post.slug,
      title: post.title,
      description: post.searchDescription ?? post.description,
      body: post.chunks
        .filter((c) => c.kind === 'body')
        .map((c) => c.text)
        .join('\n'),
      coverAlt:
        post.coverAlt ||
        post.images.find((image) => image.kind === 'cover-image')?.alt ||
        '',
      location: post.location?.name ?? '',
      photoMetadata: post.chunks
        .filter((chunk) => chunk.kind === 'photo-metadata')
        .map((chunk) => chunk.text)
        .join('\n'),
      // The multimodal embedding context repeats the post title, description,
      // and cover metadata for each asset. Index each in its own field here so
      // adding camera/location context cannot multiply their keyword weight.
      imageText: post.images
        .filter((image) => image.kind === 'body-image')
        .map((image) =>
          [image.alt, image.heading?.text].filter(Boolean).join('\n')
        )
        .join('\n'),
      url: post.url,
      newsletter: post.newsletter,
      coverImage: post.coverImage,
    }))
  )
  imageMini.addAll(
    corpus.flatMap((post) =>
      post.images.map((image) => ({
        id: `${post.slug}#${image.id}`,
        slug: post.slug,
        title: post.title,
        alt: image.alt,
        heading: image.heading?.text ?? '',
        text: image.text,
        url: post.url,
        newsletter: post.newsletter,
        imageSrc: image.src,
        imageAlt: image.alt,
      }))
    )
  )

  const bySlug = new Map(corpus.map((post) => [post.slug, post]))

  const runSearch = (
    query: string,
    combineWith: 'AND' | 'OR',
    prefix: boolean
  ) =>
    mini.search(query, {
      boost: FIELD_BOOSTS,
      // Typeahead: the final token is usually mid-word, so prefix-match it
      prefix: prefix ? (_term, i, terms) => i === terms.length - 1 : false,
      fuzzy: prefix ? 0.15 : false,
      combineWith,
    })

  return {
    search(query, limit = 10) {
      // Prefer complete named subjects (Noma) over unrelated prefix matches
      // (Nomad). Prefix expansion still supports an unfinished typeahead word.
      let hits = runSearch(query, 'AND', false)
      if (hits.length === 0) hits = runSearch(query, 'AND', true)
      if (hits.length === 0) hits = runSearch(query, 'OR', false)
      if (hits.length === 0) hits = runSearch(query, 'OR', true)
      return hits.slice(0, limit).map((hit) => ({
        slug: hit.slug as string,
        title: hit.title as string,
        url: hit.url as string,
        newsletter: hit.newsletter as string,
        coverImage: (hit.coverImage as string) ?? '',
        score: hit.score,
        terms: hit.terms,
      }))
    },

    searchImages(query, limit = 10) {
      let hits = imageMini.search(query, {
        boost: IMAGE_FIELD_BOOSTS,
        prefix: (_term, i, terms) => i === terms.length - 1,
        fuzzy: 0.15,
        combineWith: 'AND',
      })
      if (hits.length === 0) {
        hits = imageMini.search(query, {
          boost: IMAGE_FIELD_BOOSTS,
          prefix: (_term, i, terms) => i === terms.length - 1,
          fuzzy: 0.15,
          combineWith: 'OR',
        })
      }
      return hits.slice(0, limit).map((hit) => ({
        id: hit.id as string,
        slug: hit.slug as string,
        title: hit.title as string,
        url: hit.url as string,
        newsletter: hit.newsletter as string,
        imageSrc: hit.imageSrc as string,
        imageAlt: hit.imageAlt as string,
        score: hit.score,
        terms: hit.terms,
      }))
    },

    extractExcerpts(slug, terms, maxExcerpts = 3) {
      const post = bySlug.get(slug)
      if (!post || terms.length === 0) return []
      const needles = terms.map((t) => t.toLowerCase()).filter(Boolean)
      if (needles.length === 0) return []

      // Titles and image descriptions are metadata, not post excerpts.
      const chunks = post.chunks.filter((c) => c.kind === 'body')

      const excerpts: string[] = []
      const usedRanges = new Map<number, [number, number][]>()

      const addExcerpt = (chunkIndex: number, text: string, at: number) => {
        const start = Math.max(0, at - Math.floor(EXCERPT_CHARS / 3))
        const end = Math.min(text.length, start + EXCERPT_CHARS)
        const ranges = usedRanges.get(chunkIndex) ?? []
        if (ranges.some(([s, e]) => at >= s && at < e)) return false
        ranges.push([start, end])
        usedRanges.set(chunkIndex, ranges)

        // Snap to word boundaries
        let snippet = text.slice(start, end)
        if (start > 0) {
          const firstSpace = snippet.indexOf(' ')
          if (firstSpace > 0 && firstSpace < 20) {
            snippet = snippet.slice(firstSpace + 1)
          }
          snippet = `…${snippet}`
        }
        if (end < text.length) {
          const lastSpace = snippet.lastIndexOf(' ')
          if (lastSpace > snippet.length - 20 && lastSpace > 0) {
            snippet = snippet.slice(0, lastSpace)
          }
          snippet = `${snippet}…`
        }
        excerpts.push(snippet)
        return true
      }

      const findIn = (text: string, from: number): number => {
        const lower = text.toLowerCase()
        let best = -1
        for (const needle of needles) {
          const at = lower.indexOf(needle, from)
          if (at !== -1 && (best === -1 || at < best)) best = at
        }
        return best
      }

      // First pass: one excerpt per chunk (prefer distinct chunks)
      for (let i = 0; i < chunks.length; i++) {
        if (excerpts.length >= maxExcerpts) break
        const at = findIn(chunks[i].text, 0)
        if (at !== -1) addExcerpt(i, chunks[i].text, at)
      }

      // Second pass: additional occurrences within already-matched chunks
      if (excerpts.length < maxExcerpts) {
        for (let i = 0; i < chunks.length; i++) {
          if (excerpts.length >= maxExcerpts) break
          let from = 0
          while (excerpts.length < maxExcerpts) {
            const at = findIn(chunks[i].text, from)
            if (at === -1) break
            addExcerpt(i, chunks[i].text, at)
            from = at + 1
          }
        }
      }

      return excerpts
    },
  }
}

// Lazy module-level index over the real corpus. Building it costs ~100ms at
// cold start; the promise is cached so warm requests reuse it.
let indexPromise: Promise<LexicalIndex> | null = null

export function getLexicalIndex(): Promise<LexicalIndex> {
  if (!indexPromise) {
    indexPromise = Promise.resolve().then(() =>
      buildLexicalIndex(buildCorpus())
    )
  }
  return indexPromise
}
