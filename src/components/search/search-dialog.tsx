'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

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
      // biome-ignore lint/suspicious/noArrayIndexKey: stable split output
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
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const searchIdRef = useRef<string | null>(null)

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setActiveIndex(0)
      searchIdRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const abortRef = useRef<AbortController>(null)

  const fetchResults = useCallback(async (q: string) => {
    abortRef.current?.abort()

    if (q.length < 2) {
      setResults([])
      setLoading(false)
      searchIdRef.current = null
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
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
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value)
      setActiveIndex(0)
      fetchResults(value)
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault()
        const r = results[activeIndex]
        navigate(r.slug, r.url)
      }
    },
    [results, activeIndex, navigate]
  )

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onPointerDownOutside={() => onOpenChange(false)}
        >
          <div className="w-full max-w-lg bg-white shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
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
                placeholder="Search posts..."
                className="flex-1 bg-transparent px-3 py-3 font-sans text-sm text-gray-950 outline-none placeholder:text-gray-400"
              />
              {loading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-500" />
              )}
            </div>

            {results.length > 0 && (
              <ul className="max-h-80 overflow-y-auto p-2">
                {results.map((result, i) => {
                  const snippet = result.matches.find(
                    (m) => m.type === 'content'
                  )
                  return (
                    <li key={result.slug}>
                      <button
                        type="button"
                        onClick={() => navigate(result.slug, result.url)}
                        onMouseEnter={() => setActiveIndex(i)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded px-3 py-2.5 text-left transition-colors',
                          i === activeIndex
                            ? 'bg-gray-050'
                            : 'hover:bg-gray-050'
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                            NEWSLETTER_COLORS[result.newsletter] ??
                              'bg-gray-300'
                          )}
                        />
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
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <div className="px-4 py-8 text-center font-sans text-sm text-gray-400">
                No results found
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
