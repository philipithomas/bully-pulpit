'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Search } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  mergeTypeaheadResults,
  TYPEAHEAD_RESULT_LIMIT,
  typeaheadResultUrl,
} from '@/components/search/typeahead-results'
import { Spinner } from '@/components/ui/spinner'
import {
  bucketDuration,
  bucketQueryLength,
  bucketResultCount,
  parseAnalyticsNewsletter,
  trackClientEvent,
} from '@/lib/analytics/events'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

interface SearchResult {
  type?: 'post' | 'page' | 'image'
  id?: string
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: string[]
  images?: {
    id: string
    src: string
    alt: string
    url: string
    description: string
  }[]
  image?: {
    id: string
    src: string
    alt: string
    url: string
    description: string
  }
}

interface SearchResponse {
  results: SearchResult[]
  mode?: 'hybrid' | 'lexical'
  error?: string
}

type SearchMode = 'hybrid' | 'lexical' | 'unknown'

const NEWSLETTER_COLORS: Record<string, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  umami: 'bg-umami',
  tsundoku: 'bg-sun',
  page: 'bg-gray-400',
}

function responseMode(mode: SearchResponse['mode']): SearchMode {
  return mode === 'hybrid' || mode === 'lexical' ? mode : 'unknown'
}

async function requestSearchPhase(
  query: string,
  phase: 'lexical' | 'hybrid',
  signal: AbortSignal
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: query,
    source: 'typeahead',
    phase,
  })
  const response = await fetch(`/api/search?${params}`, { signal })
  const data = (await response
    .json()
    .catch(() => null)) as SearchResponse | null

  if (!response.ok) {
    throw new Error(data?.error ?? 'Search failed. Try again.')
  }

  return data ?? { results: [] }
}

function highlightQuery(text: string, query: string) {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  const parts = text.split(regex)
  return parts.map((part, i) => {
    const key = `${i}`
    return regex.test(part) ? (
      <mark key={key} className="bg-yellow/40 text-gray-950">
        {part}
      </mark>
    ) : (
      <span key={key}>{part}</span>
    )
  })
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [recentPosts, setRecentPosts] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searchMode, setSearchMode] = useState<SearchMode>('unknown')
  // Client-side cache keyed by query so back-typing repaints instantly
  const cacheRef = useRef(
    new Map<string, { results: SearchResult[]; mode: SearchMode }>()
  )

  // Focus input and load recent posts when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSearchError(null)
      setActiveIndex(0)
      setSearchMode('unknown')
      setTimeout(() => inputRef.current?.focus(), 50)

      if (recentPosts.length === 0) {
        fetch('/api/posts/recent')
          .then((r) => r.json())
          .then((data) => {
            setRecentPosts(
              (data.posts ?? []).map(
                (p: {
                  slug: string
                  title: string
                  newsletter: string
                  coverImage: string
                }) => ({
                  slug: p.slug,
                  title: p.title,
                  url: `/${p.slug}`,
                  newsletter: p.newsletter,
                  coverImage: p.coverImage,
                  excerpts: [],
                })
              )
            )
          })
          .catch(() => {})
      }
    } else {
      // The dialog stays mounted after first open (lazy chunk), so cancel the
      // in-flight request on close — a fetch for a dismissed query would
      // clobber state behind the closed dialog.
      abortRef.current?.abort()
      setLoading(false)
    }
  }, [open, recentPosts.length])

  const abortRef = useRef<AbortController>(null)

  const fetchResults = useCallback(async (q: string) => {
    const controller = new AbortController()
    abortRef.current = controller
    const started = performance.now()

    const settleResults = (
      settledResults: SearchResult[],
      mode: SearchMode
    ) => {
      setResults(settledResults)
      setSearchMode(mode)
      if (cacheRef.current.size > 100) cacheRef.current.clear()
      cacheRef.current.set(q, { results: settledResults, mode })
      trackClientEvent('Search completed', {
        surface: 'site_search',
        query_length: bucketQueryLength(q.length),
        result_count: bucketResultCount(settledResults.length),
        search_mode: mode,
        duration: bucketDuration(performance.now() - started),
      })
    }

    try {
      const lexical = await requestSearchPhase(q, 'lexical', controller.signal)
      const lexicalResults = lexical.results ?? []

      if (lexicalResults.length >= TYPEAHEAD_RESULT_LIMIT) {
        settleResults(
          lexicalResults.slice(0, TYPEAHEAD_RESULT_LIMIT),
          responseMode(lexical.mode)
        )
        return
      }

      // Paint cheap BM25 matches as soon as they arrive. Keep the spinner up
      // while the slower embedding request fills only the unused slots.
      setResults(lexicalResults)
      setSearchMode(responseMode(lexical.mode))

      try {
        const hybrid = await requestSearchPhase(q, 'hybrid', controller.signal)
        settleResults(
          mergeTypeaheadResults(lexicalResults, hybrid.results ?? []),
          responseMode(hybrid.mode)
        )
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Enrichment is opportunistic. A provider or network failure must not
        // erase the lexical results that already painted successfully.
        settleResults(lexicalResults, responseMode(lexical.mode))
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setResults([])
      setSearchError(
        error instanceof Error ? error.message : 'Search failed. Try again.'
      )
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value)
      setActiveIndex(0)
      setSearchError(null)
      // Abort the previous in-flight request synchronously so a stale response
      // can never paint over a newer query. There is no debounce: the first
      // pass runs fast BM25 locally, and this abort + per-query cache keep the
      // latest query authoritative through both search phases.
      abortRef.current?.abort()
      if (value.length < 2) {
        setResults([])
        setLoading(false)
        return
      }
      const cached = cacheRef.current.get(value)
      if (cached) {
        setResults(cached.results)
        setSearchMode(cached.mode)
        setLoading(false)
        return
      }
      setSearchMode('unknown')
      setLoading(true)
      fetchResults(value)
    },
    [fetchResults]
  )

  const navigate = useCallback(
    (result: SearchResult, index: number) => {
      if (query.length >= 2) {
        trackClientEvent('Search result selected', {
          surface: 'site_search',
          rank: index + 1,
          result_type: result.type ?? 'unknown',
          newsletter: parseAnalyticsNewsletter(result.newsletter),
        })
      }
      onOpenChange(false)
      const url = typeaheadResultUrl(result)
      router.push(url.startsWith('/') ? url : `/${url}`)
    },
    [query.length, router, onOpenChange]
  )

  const handleAskAI = useCallback(() => {
    trackClientEvent('Search asked Bell', {
      had_results: results.length > 0,
      search_mode: searchMode,
    })
    useChatSidebar.getState().openSidebar(query)
    onOpenChange(false)
  }, [query, results.length, searchMode, onOpenChange])

  const showAskAI = query.length >= 2
  const displayResults = query.length < 2 ? recentPosts : results
  const maxIndex = showAskAI ? displayResults.length : displayResults.length - 1
  // Combobox wiring: the input keeps DOM focus while aria-activedescendant
  // tracks the highlighted option. Exactly one element carries the listbox
  // id at a time: the results list when it renders, otherwise the
  // "Ask Bell" row container (so its option is never orphaned).
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const askOptionId = `${baseId}-option-ask`
  const expanded = displayResults.length > 0 || showAskAI
  const activeOptionId =
    showAskAI && activeIndex === displayResults.length
      ? askOptionId
      : displayResults[activeIndex]
        ? `${baseId}-option-${activeIndex}`
        : undefined

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, maxIndex))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (showAskAI && activeIndex === displayResults.length) {
          handleAskAI()
        } else if (displayResults[activeIndex]) {
          navigate(displayResults[activeIndex], activeIndex)
        }
      }
    },
    [displayResults, activeIndex, navigate, maxIndex, showAskAI, handleAskAI]
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup className="fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 bg-card shadow-xl outline-none transition-[opacity,transform] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
          <DialogPrimitive.Title className="sr-only">
            Search
          </DialogPrimitive.Title>
          <div className="flex items-center border-b border-gray-100 px-4">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search site…"
              aria-label="Search site"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={expanded ? listboxId : undefined}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              // No focus affordance on the input itself: the global focus
              // contract in globals.css excludes text-entry controls from
              // the site ring, and this field is borderless so the
              // border-darkening tier paints nothing. The dialog autofocuses
              // it on open; the blinking cursor, placeholder, and distinct
              // dialog frame signal focus.
              className="flex-1 bg-transparent px-3 py-3 font-sans text-sm pointer-coarse:text-base text-gray-950 placeholder:text-gray-400"
            />
            {loading && <Spinner className="h-4 w-4 text-gray-400" />}
          </div>

          {(() => {
            const isRecent = query.length < 2

            if (displayResults.length > 0) {
              return (
                <>
                  {isRecent && (
                    <p className="px-4 pt-3 pb-1 font-sans text-xs text-gray-500">
                      Recent
                    </p>
                  )}
                  <ul
                    role="listbox"
                    id={listboxId}
                    aria-label={isRecent ? 'Recent posts' : 'Search results'}
                    aria-owns={showAskAI ? askOptionId : undefined}
                    className="max-h-80 overflow-y-auto p-2"
                  >
                    {displayResults.map((result, i) => {
                      const matchedImage = result.image ?? result.images?.[0]
                      const snippet =
                        matchedImage?.description ?? result.excerpts[0]
                      const thumbnail = matchedImage?.src ?? result.coverImage
                      return (
                        <li key={result.id ?? result.slug} role="presentation">
                          <button
                            type="button"
                            role="option"
                            id={`${baseId}-option-${i}`}
                            aria-selected={i === activeIndex}
                            tabIndex={-1}
                            onClick={() => navigate(result, i)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={cn(
                              'flex w-full gap-3 px-3 py-2.5 text-left transition-colors',
                              snippet ? 'items-start' : 'items-center',
                              i === activeIndex
                                ? 'bg-gray-050'
                                : 'hover:bg-gray-050'
                            )}
                          >
                            {thumbnail ? (
                              <Image
                                src={thumbnail}
                                alt=""
                                width={40}
                                height={27}
                                className={cn(
                                  'h-[27px] w-10 shrink-0 rounded-sm object-cover',
                                  snippet && 'mt-0.5'
                                )}
                              />
                            ) : (
                              <span
                                className={cn(
                                  'h-[27px] w-10 shrink-0 rounded-sm',
                                  snippet && 'mt-0.5',
                                  NEWSLETTER_COLORS[result.newsletter] ??
                                    'bg-gray-300'
                                )}
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-sans text-sm font-semibold text-gray-950">
                                {highlightQuery(result.title, query)}
                              </p>
                              {snippet && (
                                <p className="mt-0.5 line-clamp-2 font-serif text-xs text-gray-500">
                                  {highlightQuery(snippet, query)}
                                </p>
                              )}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )
            }

            if (query.length >= 2 && !loading) {
              return (
                <div
                  role="status"
                  className="px-4 py-8 text-center font-sans text-sm text-gray-400"
                >
                  {searchError ?? 'No results found'}
                </div>
              )
            }

            return null
          })()}

          {showAskAI && (
            <div
              className="border-t border-gray-100 p-2"
              {...(displayResults.length === 0
                ? {
                    role: 'listbox',
                    id: listboxId,
                    'aria-label': 'Search results',
                  }
                : {})}
            >
              <button
                type="button"
                role="option"
                id={askOptionId}
                aria-selected={activeIndex === displayResults.length}
                tabIndex={-1}
                onClick={handleAskAI}
                onMouseEnter={() => setActiveIndex(displayResults.length)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans text-sm transition-colors',
                  activeIndex === displayResults.length
                    ? 'bg-gray-050'
                    : 'hover:bg-gray-050'
                )}
              >
                <Image
                  src="/images/bell.svg"
                  alt="Bell"
                  width={18}
                  height={18}
                  className="shrink-0"
                />
                <span className="text-gray-950">Ask Bell: {query}</span>
              </button>
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
