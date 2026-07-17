'use client'

import {
  Check,
  Copy,
  MoreHorizontal,
  Phone,
  Search,
  Trash2,
} from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Spinner } from '@/components/ui/spinner'
import type { SmsSubscriberListItem } from '@/lib/db/queries/sms-subscribers'
import { formatPhoneNumberForDisplay } from '@/lib/phone/config'

function joinedLabel(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function smsSubscribersUrl({
  query,
  offset,
}: {
  query: string
  offset?: number
}): string {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (offset) params.set('offset', String(offset))
  const queryString = params.toString()
  return queryString
    ? `/api/printing-press/subscribers/sms?${queryString}`
    : '/api/printing-press/subscribers/sms'
}

function subscriberCountLabel({
  total,
  query,
}: {
  total: number
  query: string
}): string {
  const noun = total === 1 ? 'SMS subscriber' : 'SMS subscribers'
  return query ? `${total} matching ${noun}` : `${total} ${noun}`
}

function emptyLabel(query: string): string {
  if (query) return `No SMS subscribers match “${query}”.`
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
  const [appliedQuery, setAppliedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<SmsSubscriberListItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const requestId = useRef(0)
  const firstRender = useRef(true)
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionTriggerRef = useRef<HTMLButtonElement>(null)

  const runSearch = useCallback(async (nextQuery: string) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const response = await fetch(smsSubscribersUrl({ query: nextQuery }))
      const data = await response.json().catch(() => null)
      if (id !== requestId.current) return
      if (response.ok && data) {
        setRows(data.rows)
        setTotal(data.total)
        setAppliedQuery(nextQuery)
      } else {
        setRows([])
        setTotal(0)
        setAppliedQuery(nextQuery)
        toast.error(data?.error ?? 'Search failed')
      }
    } catch {
      toast.error('Search failed. Check your connection.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timeout = setTimeout(() => void runSearch(query), 300)
    return () => clearTimeout(timeout)
  }, [query, runSearch])

  const loadMore = useCallback(async () => {
    const id = requestId.current
    setLoadingMore(true)
    try {
      const response = await fetch(
        smsSubscribersUrl({
          query: appliedQuery,
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
  }, [appliedQuery, rows.length])

  const onQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }, [])

  const onCopyPhoneNumber = useCallback(
    async (event: MouseEvent<HTMLElement>) => {
      const phoneNumber = event.currentTarget.dataset.phoneNumber
      const id = Number(event.currentTarget.dataset.subscriberId)
      if (!phoneNumber || !Number.isSafeInteger(id)) return
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

  const onChooseDeleteTarget = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const id = Number(event.currentTarget.dataset.subscriberId)
      setDeleteTarget(rows.find((row) => row.id === id) ?? null)
    },
    [rows]
  )

  const rememberActionTrigger = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      actionTriggerRef.current = event.currentTarget
    },
    []
  )

  useEffect(
    () => () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current)
    },
    []
  )

  const onDeleteDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !deleting) setDeleteTarget(null)
    },
    [deleting]
  )

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
      <div className="mb-5 w-full sm:max-w-xl">
        <div className="relative">
          <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={onQueryChange}
            placeholder="Search by phone number…"
            aria-label="Search SMS subscribers by phone number"
            className="pr-9 pl-9"
          />
          {loading ? (
            <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-muted-foreground" />
          ) : null}
        </div>
      </div>

      <p className="mb-3 font-mono text-muted-foreground text-xs">
        {subscriberCountLabel({
          total,
          query: appliedQuery,
        })}
      </p>

      {rows.length === 0 ? (
        <div className="bg-card px-4 py-12 text-center text-muted-foreground text-sm">
          {emptyLabel(appliedQuery)}
        </div>
      ) : (
        <ul className="space-y-1 bg-card p-1">
          {rows.map((subscriber) => (
            <li
              key={subscriber.id}
              className="flex min-h-16 items-center gap-3 bg-background px-3 py-3 transition-colors hover:bg-accent/40 sm:px-4"
            >
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Phone className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/printing-press/phone?number=${encodeURIComponent(subscriber.phoneNumber)}`}
                    className="truncate font-medium text-foreground text-sm hover:underline"
                  >
                    {formatPhoneNumberForDisplay(subscriber.phoneNumber)}
                  </Link>
                  {!subscriber.confirmedAt && (
                    <Badge variant="warning">unsubscribed</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-muted-foreground text-xs">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`Manage ${formatPhoneNumberForDisplay(subscriber.phoneNumber)}`}
                    onClick={rememberActionTrigger}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    data-phone-number={subscriber.phoneNumber}
                    data-subscriber-id={subscriber.id}
                    onClick={onCopyPhoneNumber}
                  >
                    {copied === subscriber.id ? <Check /> : <Copy />}
                    {copied === subscriber.id ? 'Copied' : 'Copy number'}
                  </DropdownMenuItem>
                  {subscriber.confirmedAt ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        data-subscriber-id={subscriber.id}
                        onClick={onChooseDeleteTarget}
                      >
                        <Trash2 />
                        Delete subscriber
                      </DropdownMenuItem>
                    </>
                  ) : null}
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
            disabled={loading}
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
            <AlertDialogTitle>Delete this SMS subscriber</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{' '}
              <span className="font-medium text-foreground">
                {deleteTarget
                  ? formatPhoneNumberForDisplay(deleteTarget.phoneNumber)
                  : null}
              </span>{' '}
              and its subscription and newsletter send history. Message history
              in Phone and Bell remains. This cannot be undone.
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
    </div>
  )
}
