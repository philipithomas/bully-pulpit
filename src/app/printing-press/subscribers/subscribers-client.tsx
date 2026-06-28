'use client'

import {
  Check,
  Copy,
  Download,
  MailCheck,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import type { SubscriberListItem } from '@/lib/db/queries/subscribers'
import { newsletterAccentDots, newsletterList } from '@/lib/newsletters'
import { suppressionSentence } from '@/lib/printing-press'
import { cn } from '@/lib/utils'

type NewsletterFilter = Newsletter | ''

const NEWSLETTERS = newsletterList.map((newsletter) => ({
  slug: newsletter,
  key: `subscribed${newsletter[0].toUpperCase()}${newsletter.slice(1)}` as keyof SubscriberListItem,
  name: siteConfig.newsletters[newsletter].name,
  dot: newsletterAccentDots[newsletter],
}))

function isNewsletterFilter(value: string): value is NewsletterFilter {
  return value === '' || newsletterList.includes(value as Newsletter)
}

function joinedLabel(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function subscribersUrl({
  query,
  newsletter,
  offset,
}: {
  query: string
  newsletter: NewsletterFilter
  offset?: number
}): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (newsletter) params.set('newsletter', newsletter)
  if (offset) params.set('offset', String(offset))
  const qs = params.toString()
  return qs
    ? `/api/printing-press/subscribers?${qs}`
    : '/api/printing-press/subscribers'
}

function subscriberCountLabel({
  total,
  query,
  newsletter,
}: {
  total: number
  query: string
  newsletter: NewsletterFilter
}): string {
  const noun = total === 1 ? 'subscriber' : 'subscribers'
  const scope = newsletter
    ? `${siteConfig.newsletters[newsletter].name} ${noun}`
    : noun
  return query ? `${total} matching ${scope}` : `${total} ${scope}`
}

function emptyLabel(query: string, newsletter: NewsletterFilter): string {
  if (query && newsletter) {
    return `No ${siteConfig.newsletters[newsletter].name} subscribers match “${query}”.`
  }
  if (query) return `No subscribers match “${query}”.`
  if (newsletter) {
    return `No ${siteConfig.newsletters[newsletter].name} subscribers.`
  }
  return 'No subscribers yet.'
}

export function SubscribersClient({
  initialRows,
  initialTotal,
}: {
  initialRows: SubscriberListItem[]
  initialTotal: number
}) {
  const [rows, setRows] = useState(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [query, setQuery] = useState('')
  const [newsletterFilter, setNewsletterFilter] = useState<NewsletterFilter>('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SubscriberListItem | null>(
    null
  )
  const [deleting, setDeleting] = useState(false)
  const [clearTarget, setClearTarget] = useState<SubscriberListItem | null>(
    null
  )
  const [clearing, setClearing] = useState(false)
  const [importing, setImporting] = useState(false)

  const reqId = useRef(0)
  const firstRender = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(
    async (q: string, newsletter: NewsletterFilter) => {
      const id = ++reqId.current
      setLoading(true)
      try {
        const res = await fetch(subscribersUrl({ query: q, newsletter }))
        const data = await res.json().catch(() => null)
        if (id !== reqId.current) return // a newer search superseded this one
        if (res.ok && data) {
          setRows(data.rows)
          setTotal(data.total)
        } else {
          // Definitive server rejection (e.g. session expired) — don't present
          // the stale list as results for the new query.
          toast.error(data?.error ?? 'Search failed')
        }
      } catch {
        // transient network blip; leave the current list in place
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    },
    []
  )

  // Debounced search whenever the query changes (skips the initial SSR list).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => void runSearch(query, newsletterFilter), 300)
    return () => clearTimeout(t)
  }, [newsletterFilter, query, runSearch])

  const loadMore = useCallback(async () => {
    const id = reqId.current // don't bump: only a newer search invalidates this
    setLoadingMore(true)
    try {
      const res = await fetch(
        subscribersUrl({
          query,
          newsletter: newsletterFilter,
          offset: rows.length,
        })
      )
      const data = await res.json().catch(() => null)
      if (id !== reqId.current) return // a newer search replaced the list
      if (res.ok && data) {
        // Dedupe on append: a signup landing between page fetches shifts
        // offsets, so the next page can repeat the previous page's last row.
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.uuid))
          return [
            ...prev,
            ...(data.rows as SubscriberListItem[]).filter(
              (r) => !seen.has(r.uuid)
            ),
          ]
        })
        setTotal(data.total)
      } else {
        toast.error(data?.error ?? 'Could not load more')
      }
    } catch {
      toast.error('Could not load more')
    } finally {
      setLoadingMore(false)
    }
  }, [newsletterFilter, query, rows.length])

  const onNewsletterFilterChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value
      if (isNewsletterFilter(next)) setNewsletterFilter(next)
    },
    []
  )

  const copyEmail = useCallback(async (email: string, uuid: string) => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(uuid)
      toast.success('Email copied')
      setTimeout(() => setCopied((c) => (c === uuid ? null : c)), 1500)
    } catch {
      toast.error('Could not copy')
    }
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch('/api/printing-press/subscribers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: deleteTarget.uuid }),
      })
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.uuid !== deleteTarget.uuid))
        setTotal((t) => Math.max(0, t - 1))
        toast.success('Subscriber deleted')
        setDeleteTarget(null)
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Could not delete')
      }
    } catch {
      toast.error('Could not delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget])

  const confirmClear = useCallback(async () => {
    if (!clearTarget) return
    setClearing(true)
    try {
      const res = await fetch('/api/printing-press/suppressions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clearTarget.email }),
      })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.uuid === clearTarget.uuid
              ? { ...r, suppressedAt: null, suppressionReason: null }
              : r
          )
        )
        toast.success('Suppression cleared')
        setClearTarget(null)
      } else {
        const data = await res.json().catch(() => null)
        toast.error(data?.error ?? 'Could not clear the suppression')
      }
    } catch {
      toast.error('Could not clear the suppression')
    } finally {
      setClearing(false)
    }
  }, [clearTarget])

  const onImportFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // allow re-selecting the same file later
      if (!file) return
      setImporting(true)
      let text: string
      try {
        text = await file.text()
      } catch {
        toast.error('Could not read the file')
        setImporting(false)
        return
      }
      try {
        const res = await fetch('/api/printing-press/subscribers/import', {
          method: 'POST',
          headers: { 'Content-Type': 'text/csv' },
          body: text,
        })
        const data = await res.json().catch(() => null)
        if (res.ok && data) {
          toast.success(
            `Imported ${data.created} new, ${data.updated} updated${
              data.skipped ? `, ${data.skipped} skipped` : ''
            }`
          )
          await runSearch(query, newsletterFilter) // refresh list + total
        } else {
          // data is null for non-JSON platform errors (e.g. a 413 body-size cap).
          toast.error(data?.error ?? `Import failed (${res.status})`)
        }
      } catch {
        toast.error('Import failed. Check your connection.')
      } finally {
        setImporting(false)
      }
    },
    [newsletterFilter, query, runSearch]
  )

  return (
    <div>
      {/* Toolbar: search + CSV export/import */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email…"
              aria-label="Search subscribers by email"
              className="h-10 w-full border border-gray-200 bg-white pr-9 pl-9 text-sm text-gray-900 placeholder:text-gray-400"
            />
            {loading && (
              <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 h-4 w-4 text-gray-400" />
            )}
          </div>
          <select
            value={newsletterFilter}
            onChange={onNewsletterFilterChange}
            aria-label="Filter subscribers by newsletter"
            className="h-10 w-full border border-gray-200 bg-white px-3 text-sm text-gray-900 sm:w-44"
          >
            <option value="">All subscribers</option>
            {NEWSLETTERS.map((newsletter) => (
              <option key={newsletter.slug} value={newsletter.slug}>
                {newsletter.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/printing-press/subscribers/export"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'cursor-pointer'
            )}
          >
            <Download className="h-4 w-4 text-gray-400" />
            Export
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            title="CSV columns: email, name, postcard, contraption, workshop, tsundoku, confirmed, source"
          >
            {importing ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4 text-gray-400" />
            )}
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onImportFile}
          />
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        {subscriberCountLabel({ total, query, newsletter: newsletterFilter })}
      </p>

      {/* List */}
      {rows.length === 0 ? (
        <div className="border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          {emptyLabel(query, newsletterFilter)}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
          {rows.map((s) => (
            <li
              key={s.uuid}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-050"
            >
              <Avatar email={s.email} name={s.name} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {s.email}
                  </span>
                  {!s.confirmedAt && (
                    <Badge variant="warning">unconfirmed</Badge>
                  )}
                  {s.suppressedAt && (
                    <Badge variant="destructive">suppressed</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  {s.name && <span className="text-gray-500">{s.name}</span>}
                  {NEWSLETTERS.filter((nl) => s[nl.key]).map((nl) => (
                    <span
                      key={nl.key}
                      className="inline-flex items-center gap-1"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${nl.dot}`} />
                      {nl.name}
                    </span>
                  ))}
                  <span>joined {joinedLabel(s.createdAt)}</span>
                  {s.source && (
                    <span className="max-w-56 truncate" title={s.source}>
                      via {s.source}
                    </span>
                  )}
                </div>
                {s.suppressedAt && s.suppressionReason && (
                  <p className="mt-1 text-red-deep text-xs">
                    {suppressionSentence(s.suppressionReason, s.suppressedAt)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {s.suppressedAt && (
                  <button
                    type="button"
                    onClick={() => setClearTarget(s)}
                    aria-label="Clear suppression"
                    title="Clear suppression"
                    className="p-2.5 text-gray-400 transition-colors hover:bg-red/10 hover:text-red"
                  >
                    <MailCheck className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => copyEmail(s.email, s.uuid)}
                  aria-label="Copy email"
                  title="Copy email"
                  className="p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {copied === s.uuid ? (
                    <Check className="h-4 w-4 text-forest" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(s)}
                  aria-label="Delete subscriber"
                  title="Delete subscriber"
                  className="p-2.5 text-gray-400 transition-colors hover:bg-red/10 hover:text-red"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length < total && (
        <div className="mt-5 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Spinner className="h-4 w-4" /> : 'Load more'}
          </Button>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subscriber?</DialogTitle>
            <DialogDescription>
              This permanently deletes{' '}
              <span className="font-medium text-gray-700">
                {deleteTarget?.email}
              </span>{' '}
              and all of their data (subscription, email + sign-in history).
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Spinner className="h-4 w-4" /> : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clearTarget !== null}
        onOpenChange={(o) => !o && setClearTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear suppression?</DialogTitle>
            <DialogDescription>
              This removes the suppression for{' '}
              <span className="font-medium text-gray-700">
                {clearTarget?.email}
              </span>{' '}
              from the SES account-level list and from this site, so future
              sends deliver to the address again. Clear it only when you know
              the address works: another bounce or complaint damages sender
              reputation.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmClear}
              disabled={clearing}
            >
              {clearing ? <Spinner className="h-4 w-4" /> : 'Clear suppression'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
