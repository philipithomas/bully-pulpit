'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { track } from '@vercel/analytics'
import { Search } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

interface SearchMatch {
  document: string
  score: number
  type: string
}

interface SearchResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  matches: SearchMatch[]
}

const NEWSLETTER_COLORS: Record<string, string> = {
  contraption: 'bg-forest',
  workshop: 'bg-walnut',
  postcard: 'bg-indigo',
  page: 'bg-gray-400',
}

function getSessionId() {
  const key = 'search_session_id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
  }
  return id
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

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim()
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
  const searchIdRef = useRef<string | null>(null)

  // Focus input and load recent posts when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSearchError(null)
      setActiveIndex(0)
      searchIdRef.current = null
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
                  matches: [],
                })
              )
            )
          })
          .catch(() => {})
      }
    } else {
      // The dialog stays mounted after first open (lazy chunk), so cancel
      // pending work on close — a debounced fetch for a dismissed query
      // would log analytics and clobber state behind the closed dialog.
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
      setLoading(false)
    }
  }, [open, recentPosts.length])

  const abortRef = useRef<AbortController>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const fetchResults = useCallback(async (q: string) => {
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const sid = getSessionId()
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&sid=${sid}`,
        { signal: controller.signal }
      )
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
        searchIdRef.current = data.searchId ?? null
        track('Search', { query: q, results: (data.results ?? []).length })
      } else {
        // Surface definitive rejections (e.g. the 429 rate limit) instead of
        // leaving the previous query's results on screen with no feedback.
        const data = await res.json().catch(() => null)
        setResults([])
        searchIdRef.current = null
        setSearchError(data?.error ?? 'Search failed. Try again.')
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setResults([])
      setSearchError('Search failed. Try again.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value)
      setActiveIndex(0)
      setSearchError(null)
      // Abort + reflect state synchronously: a stale in-flight response must
      // never paint over a newer query, and showing the spinner through the
      // debounce keeps the "No results found" state from flashing.
      abortRef.current?.abort()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (value.length < 2) {
        setResults([])
        setLoading(false)
        searchIdRef.current = null
        return
      }
      setLoading(true)
      debounceRef.current = setTimeout(() => fetchResults(value), 200)
    },
    [fetchResults]
  )

  const navigate = useCallback(
    (slug: string, url: string) => {
      // Log selection — fire and forget
      if (searchIdRef.current) {
        fetch('/api/search/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchId: searchIdRef.current,
            selectedSlug: slug,
            selectedUrl: url,
          }),
        }).catch(() => {})
      }

      onOpenChange(false)
      router.push(`/${slug}`)
    },
    [router, onOpenChange]
  )

  const handleAskAI = useCallback(() => {
    useChatSidebar.getState().openSidebar(query)
    onOpenChange(false)
  }, [query, onOpenChange])

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
          const r = displayResults[activeIndex]
          navigate(r.slug, r.url)
        }
      }
    },
    [displayResults, activeIndex, navigate, maxIndex, showAskAI, handleAskAI]
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenChange(false)
          }}
        >
          <div className="w-[calc(100%-2rem)] max-w-lg bg-card shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
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
                placeholder="Search posts…"
                aria-label="Search posts"
                role="combobox"
                aria-expanded={expanded}
                aria-controls={expanded ? listboxId : undefined}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                className="flex-1 bg-transparent px-3 py-3 font-sans text-sm text-gray-950 placeholder:text-gray-400"
              />
              {loading && <Spinner className="h-4 w-4 text-gray-400" />}
            </div>

            {(() => {
              const isRecent = query.length < 2

              if (displayResults.length > 0) {
                return (
                  <>
                    {isRecent && (
                      <p className="px-4 pt-3 pb-1 font-mono text-[10px] font-semibold tracking-[0.15em] uppercase text-gray-400">
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
                        const titleLower = result.title.toLowerCase().trim()
                        const snippet = result.matches.find(
                          (m) =>
                            m.type === 'content' &&
                            !m.document
                              .toLowerCase()
                              .trim()
                              .startsWith(titleLower)
                        )
                        return (
                          <li key={result.slug} role="presentation">
                            <button
                              type="button"
                              role="option"
                              id={`${baseId}-option-${i}`}
                              aria-selected={i === activeIndex}
                              tabIndex={-1}
                              onClick={() => navigate(result.slug, result.url)}
                              onMouseEnter={() => setActiveIndex(i)}
                              className={cn(
                                'flex w-full gap-3 px-3 py-2.5 text-left transition-colors',
                                snippet ? 'items-start' : 'items-center',
                                i === activeIndex
                                  ? 'bg-gray-050'
                                  : 'hover:bg-gray-050'
                              )}
                            >
                              {result.coverImage ? (
                                <Image
                                  src={result.coverImage}
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
                                    {highlightQuery(
                                      stripMarkdown(snippet.document),
                                      query
                                    )}
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
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
