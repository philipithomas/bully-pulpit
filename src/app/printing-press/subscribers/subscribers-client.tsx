'use client'

import {
  Check,
  ChevronDown,
  Copy,
  Download,
  MailCheck,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import type { SubscriberListItem } from '@/lib/db/queries/subscribers'
import { newsletterAccentDots, newsletterList } from '@/lib/newsletters'
import { suppressionSentence } from '@/lib/printing-press'

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
  const actionTriggerRef = useRef<HTMLButtonElement>(null)

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

  const onQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }, [])

  const openFilePicker = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const rememberActionTrigger = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      actionTriggerRef.current = event.currentTarget
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

  const onCopyEmail = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { email, uuid } = event.currentTarget.dataset
      if (email && uuid) void copyEmail(email, uuid)
    },
    [copyEmail]
  )

  const onChooseClearTarget = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const uuid = event.currentTarget.dataset.uuid
      setClearTarget(rows.find((row) => row.uuid === uuid) ?? null)
    },
    [rows]
  )

  const onChooseDeleteTarget = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const uuid = event.currentTarget.dataset.uuid
      setDeleteTarget(rows.find((row) => row.uuid === uuid) ?? null)
    },
    [rows]
  )

  const onDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !deleting) setDeleteTarget(null)
    },
    [deleting]
  )

  const onClearDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !clearing) setClearTarget(null)
    },
    [clearing]
  )

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
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={onQueryChange}
              placeholder="Search by email…"
              aria-label="Search subscribers by email"
              className="pr-9 pl-9"
            />
            {loading ? (
              <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-muted-foreground" />
            ) : null}
          </div>
          <div className="w-full sm:w-44 sm:shrink-0">
            <NativeSelect
              value={newsletterFilter}
              onChange={onNewsletterFilterChange}
              aria-label="Filter subscribers by newsletter"
            >
              <option value="">All subscribers</option>
              {NEWSLETTERS.map((newsletter) => (
                <option
                  key={newsletter.slug}
                  value={newsletter.slug}
                  className="italic"
                >
                  {newsletter.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              loading={importing}
              loadingLabel="Importing"
              className="w-full sm:w-auto"
            >
              Subscriber files
              <ChevronDown className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <a href="/api/printing-press/subscribers/export">
                <Download />
                Export CSV
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openFilePicker}>
              <Upload />
              Import CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={onImportFile}
        />
      </div>

      <p className="mb-3 font-mono text-muted-foreground text-xs">
        {subscriberCountLabel({ total, query, newsletter: newsletterFilter })}
      </p>

      {rows.length === 0 ? (
        <div className="bg-card px-4 py-12 text-center text-muted-foreground text-sm">
          {emptyLabel(query, newsletterFilter)}
        </div>
      ) : (
        <ul className="space-y-1 bg-card p-1">
          {rows.map((s) => (
            <li
              key={s.uuid}
              className="flex min-h-16 items-center gap-3 bg-background px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4"
            >
              <Avatar email={s.email} name={s.name} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-medium text-foreground text-sm">
                    {s.email}
                  </span>
                  {!s.confirmedAt && (
                    <Badge variant="warning">unconfirmed</Badge>
                  )}
                  {s.suppressedAt ? (
                    <Badge variant="destructive">suppressed</Badge>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-muted-foreground text-xs">
                  {s.name ? <span>{s.name}</span> : null}
                  {NEWSLETTERS.filter((nl) => s[nl.key]).map((nl) => (
                    <cite
                      key={nl.key}
                      className="inline-flex items-center gap-1 font-serif"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${nl.dot}`} />
                      {nl.name}
                    </cite>
                  ))}
                  <span>joined {joinedLabel(s.createdAt)}</span>
                  {s.source ? (
                    <span className="max-w-56 truncate" title={s.source}>
                      via {s.source}
                    </span>
                  ) : null}
                </div>
                {s.suppressedAt && s.suppressionReason ? (
                  <p className="mt-1 text-red-deep text-xs">
                    {suppressionSentence(s.suppressionReason, s.suppressedAt)}
                  </p>
                ) : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`Manage ${s.email}`}
                    onClick={rememberActionTrigger}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    data-email={s.email}
                    data-uuid={s.uuid}
                    onClick={onCopyEmail}
                  >
                    {copied === s.uuid ? <Check /> : <Copy />}
                    {copied === s.uuid ? 'Copied' : 'Copy email'}
                  </DropdownMenuItem>
                  {s.suppressedAt ? (
                    <DropdownMenuItem
                      data-uuid={s.uuid}
                      onClick={onChooseClearTarget}
                    >
                      <MailCheck />
                      Clear suppression
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    data-uuid={s.uuid}
                    onClick={onChooseDeleteTarget}
                  >
                    <Trash2 />
                    Delete subscriber
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {rows.length < total && (
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            loading={loadingMore}
            loadingLabel="Loading"
          >
            Load more
          </Button>
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={onDeleteDialogOpenChange}
      >
        <AlertDialogContent finalFocus={actionTriggerRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subscriber</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.email}
              </span>{' '}
              along with subscription, email-send, and sign-in records. You
              cannot undo this. Bell conversations and email suppression records
              remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Keep subscriber
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              loading={deleting}
              loadingLabel="Deleting"
            >
              Delete subscriber
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearTarget !== null}
        onOpenChange={onClearDialogOpenChange}
      >
        <AlertDialogContent finalFocus={actionTriggerRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Let this address receive mail again
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the suppression for{' '}
              <span className="font-medium text-foreground">
                {clearTarget?.email}
              </span>{' '}
              from the SES account-level list and from this site, so future
              sends deliver to the address again. Clear it only when you know
              the address works: another bounce or complaint damages sender
              reputation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>
              Keep suppressed
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmClear}
              loading={clearing}
              loadingLabel="Clearing"
            >
              Clear suppression
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
