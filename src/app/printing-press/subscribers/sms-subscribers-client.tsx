'use client'

import { Check, Copy, MessageSquare, Phone, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import type { SmsSubscriberListItem } from '@/lib/db/queries/sms-subscribers'
import { newsletterAccentDots, newsletterList } from '@/lib/newsletters'
import { formatPhoneNumberForDisplay } from '@/lib/phone/config'

type NewsletterFilter = Newsletter | ''

const NEWSLETTERS = newsletterList.map((newsletter) => ({
  slug: newsletter,
  key: `subscribed${newsletter[0].toUpperCase()}${newsletter.slice(1)}` as keyof SmsSubscriberListItem,
  name: siteConfig.newsletters[newsletter].name,
  dot: newsletterAccentDots[newsletter],
}))

function isNewsletterFilter(value: string): value is NewsletterFilter {
  return value === '' || newsletterList.includes(value as Newsletter)
}

function joinedLabel(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function smsSubscribersUrl({
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
  const queryString = params.toString()
  return queryString
    ? `/api/printing-press/subscribers/sms?${queryString}`
    : '/api/printing-press/subscribers/sms'
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
  const noun = total === 1 ? 'SMS subscriber' : 'SMS subscribers'
  const scope = newsletter
    ? `${siteConfig.newsletters[newsletter].name} ${noun}`
    : noun
  return query ? `${total} matching ${scope}` : `${total} ${scope}`
}

function emptyLabel(query: string, newsletter: NewsletterFilter): string {
  if (query && newsletter) {
    return `No ${siteConfig.newsletters[newsletter].name} SMS subscribers match “${query}”.`
  }
  if (query) return `No SMS subscribers match “${query}”.`
  if (newsletter) {
    return `No ${siteConfig.newsletters[newsletter].name} SMS subscribers.`
  }
  return 'No SMS subscribers yet.'
}

export function SmsSubscribersClient({
  initialRows,
  initialTotal,
}: {
  initialRows: SmsSubscriberListItem[]
  initialTotal: number
}) {
  const [rows, setRows] = useState(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [query, setQuery] = useState('')
  const [newsletterFilter, setNewsletterFilter] = useState<NewsletterFilter>('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [appliedNewsletterFilter, setAppliedNewsletterFilter] =
    useState<NewsletterFilter>('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<SmsSubscriberListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const requestId = useRef(0)
  const firstRender = useRef(true)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(
    async (nextQuery: string, newsletter: NewsletterFilter) => {
      const id = ++requestId.current
      setLoading(true)
      try {
        const response = await fetch(
          smsSubscribersUrl({ query: nextQuery, newsletter })
        )
        const data = await response.json().catch(() => null)
        if (id !== requestId.current) return
        if (response.ok && data) {
          setRows(data.rows)
          setTotal(data.total)
          setAppliedQuery(nextQuery)
          setAppliedNewsletterFilter(newsletter)
        } else {
          setRows([])
          setTotal(0)
          setAppliedQuery(nextQuery)
          setAppliedNewsletterFilter(newsletter)
          toast.error(data?.error ?? 'Search failed')
        }
      } catch {
        toast.error('Search failed. Check your connection.')
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timeout = setTimeout(
      () => void runSearch(query, newsletterFilter),
      300
    )
    return () => clearTimeout(timeout)
  }, [newsletterFilter, query, runSearch])

  const loadMore = useCallback(async () => {
    const id = requestId.current
    setLoadingMore(true)
    try {
      const response = await fetch(
        smsSubscribersUrl({
          query: appliedQuery,
          newsletter: appliedNewsletterFilter,
          offset: rows.length,
        })
      )
      const data = await response.json().catch(() => null)
      if (id !== requestId.current) return
      if (response.ok && data) {
        setRows((previous) => {
          const seen = new Set(previous.map((row) => row.id))
          return [
            ...previous,
            ...(data.rows as SmsSubscriberListItem[]).filter(
              (row) => !seen.has(row.id)
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
  }, [appliedNewsletterFilter, appliedQuery, rows.length])

  const onNewsletterFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const next = event.target.value
      if (isNewsletterFilter(next)) setNewsletterFilter(next)
    },
    []
  )

  const onQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }, [])

  const onCopyPhoneNumber = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      const phoneNumber = event.currentTarget.value
      const id = Number(event.currentTarget.dataset.subscriberId)
      try {
        await navigator.clipboard.writeText(phoneNumber)
        setCopied(id)
        toast.success('Phone number copied')
        if (copyTimeout.current) clearTimeout(copyTimeout.current)
        copyTimeout.current = setTimeout(
          () => setCopied((current) => (current === id ? null : current)),
          1500
        )
      } catch {
        toast.error('Could not copy')
      }
    },
    []
  )

  useEffect(
    () => () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
    },
    []
  )

  const onDeleteSubscriber = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const id = Number(event.currentTarget.value)
      setDeleteTarget(rows.find((row) => row.id === id) ?? null)
    },
    [rows]
  )

  const onDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setDeleteTarget(null)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const response = await fetch('/api/printing-press/subscribers/sms', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      if (response.ok) {
        setRows((previous) =>
          previous.filter((row) => row.id !== deleteTarget.id)
        )
        setTotal((current) => Math.max(0, current - 1))
        toast.success('SMS subscriber deleted')
        setDeleteTarget(null)
      } else {
        const data = await response.json().catch(() => null)
        toast.error(data?.error ?? 'Could not delete')
      }
    } catch {
      toast.error('Could not delete')
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget])

  return (
    <div>
      <div className="mb-5 flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={onQueryChange}
            placeholder="Search by phone number…"
            aria-label="Search SMS subscribers by phone number"
            className="h-10 w-full border border-gray-200 bg-white pr-9 pl-9 text-sm text-gray-900 placeholder:text-gray-400"
          />
          {loading ? (
            <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 h-4 w-4 text-gray-400" />
          ) : null}
        </div>
        <select
          value={newsletterFilter}
          onChange={onNewsletterFilterChange}
          aria-label="Filter SMS subscribers by newsletter"
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

      <p className="mb-3 text-xs text-gray-500">
        {subscriberCountLabel({
          total,
          query: appliedQuery,
          newsletter: appliedNewsletterFilter,
        })}
      </p>

      {rows.length === 0 ? (
        <div className="border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          {emptyLabel(appliedQuery, appliedNewsletterFilter)}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
          {rows.map((subscriber) => (
            <li
              key={subscriber.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-050"
            >
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <Phone className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/printing-press/phone?number=${encodeURIComponent(subscriber.phoneNumber)}`}
                    className="truncate text-sm font-medium text-gray-900 hover:underline"
                  >
                    {formatPhoneNumberForDisplay(subscriber.phoneNumber)}
                  </Link>
                  {!subscriber.confirmedAt && (
                    <Badge variant="warning">unsubscribed</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  {NEWSLETTERS.filter(
                    (newsletter) => subscriber[newsletter.key]
                  ).map((newsletter) => (
                    <span
                      key={newsletter.key}
                      className="inline-flex items-center gap-1"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${newsletter.dot}`}
                      />
                      {newsletter.name}
                    </span>
                  ))}
                  <span>
                    {subscriber.confirmedAt ? 'joined' : 'recorded'}{' '}
                    {joinedLabel(subscriber.createdAt)}
                  </span>
                  {subscriber.source ? (
                    <span
                      className="max-w-56 truncate"
                      title={subscriber.source}
                    >
                      via {subscriber.source}
                    </span>
                  ) : null}
                  {!subscriber.confirmedAt && (
                    <span title="The local STOP record prevents accidental reactivation.">
                      STOP record kept
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Link
                  href={`/printing-press/phone?number=${encodeURIComponent(subscriber.phoneNumber)}`}
                  aria-label={`Open conversation with ${formatPhoneNumberForDisplay(subscriber.phoneNumber)}`}
                  title="Open conversation"
                  className="p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <MessageSquare className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  value={subscriber.phoneNumber}
                  data-subscriber-id={subscriber.id}
                  onClick={onCopyPhoneNumber}
                  aria-label={`Copy ${formatPhoneNumberForDisplay(subscriber.phoneNumber)}`}
                  title="Copy phone number"
                  className="p-2.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  {copied === subscriber.id ? (
                    <Check className="h-4 w-4 text-forest" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                {subscriber.confirmedAt ? (
                  <button
                    type="button"
                    value={subscriber.id}
                    onClick={onDeleteSubscriber}
                    aria-label={`Delete SMS subscriber ${formatPhoneNumberForDisplay(subscriber.phoneNumber)}`}
                    title="Delete SMS subscriber"
                    className="p-2.5 text-gray-400 transition-colors hover:bg-red/10 hover:text-red"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length < total && (
        <div className="mt-5 flex justify-center">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loadingMore || loading}
          >
            {loadingMore ? <Spinner className="h-4 w-4" /> : 'Load more'}
          </Button>
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={onDeleteDialogOpenChange}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete SMS subscriber?</DialogTitle>
            <DialogDescription>
              This permanently deletes{' '}
              <span className="font-medium text-gray-700">
                {deleteTarget
                  ? formatPhoneNumberForDisplay(deleteTarget.phoneNumber)
                  : null}
              </span>{' '}
              and its subscription and newsletter send history. Message history
              in Phone and Bell remains. This cannot be undone.
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
    </div>
  )
}
