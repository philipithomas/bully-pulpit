'use client'

import { Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  bucketDuration,
  bucketQueryLength,
  bucketResultCount,
  parseAnalyticsNewsletter,
  trackClientEvent,
} from '@/lib/analytics/events'

interface ImageSearchResult {
  id: string
  title: string
  url: string
  newsletter: string
  image?: {
    id: string
    src: string
    alt: string
    url: string
    description: string
  }
}

interface ImageSearchResponse {
  results?: ImageSearchResult[]
  mode?: 'hybrid' | 'lexical'
  error?: string
}

const MIN_QUERY_LENGTH = 2

export function PhotographyImageSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ImageSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController>(null)
  const cacheRef = useRef(new Map<string, ImageSearchResult[]>())

  const handleResultClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      trackClientEvent('Search result selected', {
        surface: 'photography',
        rank: Number(event.currentTarget.dataset.searchRank) || 1,
        result_type: 'image',
        newsletter: parseAnalyticsNewsletter(
          event.currentTarget.dataset.searchNewsletter
        ),
      })
    },
    []
  )

  const runSearch = useCallback(async (value: string) => {
    const cached = cacheRef.current.get(value)
    if (cached) {
      setResults(cached)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    const started = performance.now()

    try {
      const params = new URLSearchParams({ q: value, scope: 'images' })
      const response = await fetch(`/api/search?${params}`, {
        signal: controller.signal,
      })
      const data = (await response
        .json()
        .catch(() => null)) as ImageSearchResponse | null

      if (!response.ok) {
        setResults([])
        setError(data?.error ?? 'Search failed. Try again.')
        return
      }

      const nextResults = data?.results ?? []
      setResults(nextResults)
      if (cacheRef.current.size > 50) cacheRef.current.clear()
      cacheRef.current.set(value, nextResults)
      trackClientEvent('Search completed', {
        surface: 'photography',
        query_length: bucketQueryLength(value.length),
        result_count: bucketResultCount(nextResults.length),
        search_mode:
          data?.mode === 'hybrid' || data?.mode === 'lexical'
            ? data.mode
            : 'unknown',
        duration: bucketDuration(performance.now() - started),
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setResults([])
      setError('Search failed. Try again.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value)
    },
    []
  )

  useEffect(() => {
    abortRef.current?.abort()
    setError(null)

    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timeout = window.setTimeout(() => {
      runSearch(trimmed)
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      abortRef.current?.abort()
    }
  }, [query, runSearch])

  const showEmpty =
    query.trim().length >= MIN_QUERY_LENGTH && !loading && results.length === 0

  return (
    <section className="mb-10 md:mb-12" aria-label="Search photos">
      <div className="mx-auto max-w-xl">
        <label className="flex h-11 items-center border border-gray-300 bg-white px-3">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search coffee, temples, trains"
            aria-label="Search photos"
            className="min-w-0 flex-1 bg-transparent px-3 font-sans text-sm text-gray-950 placeholder:text-gray-400 pointer-coarse:text-base"
          />
          {loading ? (
            <span className="font-sans text-xs text-gray-400">Searching</span>
          ) : null}
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center font-sans text-sm text-red">
          {error}
        </p>
      ) : null}

      {showEmpty ? (
        <p className="mt-4 text-center font-sans text-sm text-gray-500">
          No matching photos.
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((result, index) => {
            const image = result.image
            if (!image) return null
            return (
              <Link
                key={result.id}
                href={image.url}
                data-search-rank={index + 1}
                data-search-newsletter={result.newsletter}
                onClick={handleResultClick}
                className="group block min-w-0"
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-gray-100">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 304px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                </span>
                <span className="mt-2 block truncate font-sans text-sm font-semibold text-gray-950">
                  {result.title}
                </span>
                <span className="mt-0.5 block line-clamp-2 font-serif text-xs text-gray-500">
                  {image.description}
                </span>
              </Link>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
