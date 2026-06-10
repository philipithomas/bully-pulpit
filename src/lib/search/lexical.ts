import MiniSearch from 'minisearch'
import type { CorpusPost } from '@/lib/search/corpus'
import { buildCorpus } from '@/lib/search/corpus'

/**
 * BM25 keyword search over posts via MiniSearch. One document per post (not
 * per chunk): title, description, concatenated body text, and cover alt, with
 * title boosted hard so a post titled "Foo" always outranks a post that
 * merely mentions "foo" in the body. Powers the typeahead on its own and the
 * keyword half of the agent's hybrid search.
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

export interface LexicalIndex {
  search(query: string, limit?: number): LexicalResult[]
  extractExcerpts(slug: string, terms: string[], maxExcerpts?: number): string[]
}

const FIELD_BOOSTS = { title: 6, description: 2, body: 1, coverAlt: 1.5 }
const EXCERPT_CHARS = 120

export function buildLexicalIndex(corpus: CorpusPost[]): LexicalIndex {
  const mini = new MiniSearch({
    fields: ['title', 'description', 'body', 'coverAlt'],
    storeFields: ['slug', 'title', 'url', 'newsletter', 'coverImage'],
    idField: 'slug',
  })

  mini.addAll(
    corpus.map((post) => ({
      slug: post.slug,
      title: post.title,
      description: post.description,
      body: post.chunks
        .filter((c) => c.kind === 'body')
        .map((c) => c.text)
        .join('\n'),
      coverAlt: post.coverAlt,
      url: post.url,
      newsletter: post.newsletter,
      coverImage: post.coverImage,
    }))
  )

  const bySlug = new Map(corpus.map((post) => [post.slug, post]))

  const runSearch = (query: string, combineWith: 'AND' | 'OR') =>
    mini.search(query, {
      boost: FIELD_BOOSTS,
      // Typeahead: the final token is usually mid-word, so prefix-match it
      prefix: (_term, i, terms) => i === terms.length - 1,
      fuzzy: 0.15,
      combineWith,
    })

  return {
    search(query, limit = 10) {
      let hits = runSearch(query, 'AND')
      if (hits.length === 0) hits = runSearch(query, 'OR')
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

    extractExcerpts(slug, terms, maxExcerpts = 3) {
      const post = bySlug.get(slug)
      if (!post || terms.length === 0) return []
      const needles = terms.map((t) => t.toLowerCase()).filter(Boolean)
      if (needles.length === 0) return []

      // Title is rendered separately in every consumer; excerpt from prose
      const chunks = post.chunks.filter((c) => c.kind !== 'title')

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
