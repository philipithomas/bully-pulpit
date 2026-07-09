'use client'

import Link from 'next/link'
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import type {
  BellConversationListWire,
  BellConversationStatus,
  BellConversationSummaryWire,
  BellListFilters,
} from '@/app/printing-press/bell/types'
import { EMPTY_BELL_FILTERS } from '@/app/printing-press/bell/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

function timestampLabel(iso: string): string {
  return `${iso.slice(0, 16)}Z`
}

function statusLabel(status: BellConversationStatus): string {
  if (status === 'completed') return 'Completed'
  if (status === 'error') return 'Error'
  return 'Active'
}

function surfaceLabel(surface: 'web' | 'sms'): string {
  return surface === 'sms' ? 'SMS' : 'Web'
}

function identityLabel(identity: BellConversationSummaryWire['identity']) {
  if (identity === 'signed_in') return 'Signed in'
  if (identity === 'phone') return 'Phone'
  return 'Anonymous'
}

function statusVariant(status: BellConversationStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'error') return 'destructive' as const
  return 'warning' as const
}

function queryFor(filters: BellListFilters, cursor?: string): string {
  const params = new URLSearchParams()
  if (filters.surface) params.set('surface', filters.surface)
  if (filters.identity) params.set('identity', filters.identity)
  if (filters.status) params.set('status', filters.status)
  if (filters.dateFrom) params.set('from', filters.dateFrom)
  if (filters.dateTo) params.set('to', filters.dateTo)
  if (filters.search.trim()) params.set('q', filters.search.trim())
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

function filterIsEmpty(filters: BellListFilters): boolean {
  return Object.values(filters).every((value) => value === '')
}

function Filters({
  value,
  loading,
  onChange,
  onApply,
  onClear,
}: {
  value: BellListFilters
  loading: boolean
  onChange: (next: BellListFilters) => void
  onApply: () => void
  onClear: () => void
}) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onApply()
    },
    [onApply]
  )
  const handleSurfaceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...value,
        surface: event.target.value as BellListFilters['surface'],
      })
    },
    [onChange, value]
  )
  const handleIdentityChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...value,
        identity: event.target.value as BellListFilters['identity'],
      })
    },
    [onChange, value]
  )
  const handleStatusChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange({
        ...value,
        status: event.target.value as BellListFilters['status'],
      })
    },
    [onChange, value]
  )
  const handleDateFromChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, dateFrom: event.target.value })
    },
    [onChange, value]
  )
  const handleDateToChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, dateTo: event.target.value })
    },
    [onChange, value]
  )
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, search: event.target.value })
    },
    [onChange, value]
  )

  return (
    <form
      className="mb-5 border border-gray-200 bg-white p-4"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">Surface</span>
          <select
            value={value.surface}
            onChange={handleSurfaceChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900"
          >
            <option value="">All surfaces</option>
            <option value="web">Web</option>
            <option value="sms">SMS</option>
          </select>
        </label>

        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">Identity</span>
          <select
            value={value.identity}
            onChange={handleIdentityChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900"
          >
            <option value="">All identities</option>
            <option value="signed_in">Signed in</option>
            <option value="phone">Phone</option>
            <option value="anonymous">Anonymous</option>
          </select>
        </label>

        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">Status</span>
          <select
            value={value.status}
            onChange={handleStatusChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="error">Error</option>
          </select>
        </label>

        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">From</span>
          <input
            type="date"
            value={value.dateFrom}
            onChange={handleDateFromChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900"
          />
        </label>

        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">Through</span>
          <input
            type="date"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={handleDateToChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900"
          />
        </label>

        <label className="space-y-1 text-gray-700 text-sm">
          <span className="block font-medium">Participant</span>
          <input
            type="search"
            value={value.search}
            maxLength={100}
            placeholder="Name, email, phone, or network"
            onChange={handleSearchChange}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900 placeholder:text-gray-400"
          />
        </label>
      </div>

      <p className="mt-3 text-gray-500 text-xs">
        Participant search does not inspect message text.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? <Spinner className="h-4 w-4" /> : null}
          Apply filters
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || filterIsEmpty(value)}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </form>
  )
}

function ConversationRow({
  conversation,
}: {
  conversation: BellConversationSummaryWire
}) {
  const pageLabel =
    conversation.firstPageTitle ??
    conversation.firstPagePath ??
    'No page context'

  return (
    <li>
      <Link
        href={`/printing-press/bell/${conversation.id}`}
        className="block px-4 py-4 transition-colors hover:bg-gray-050"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-950 text-sm">
              {conversation.participantLabel}
            </p>
            {conversation.participantDetail ? (
              <p className="mt-0.5 truncate text-gray-500 text-xs">
                {conversation.participantDetail}
              </p>
            ) : null}
          </div>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              {surfaceLabel(conversation.surface)}
            </Badge>
            <Badge variant="secondary">
              {identityLabel(conversation.identity)}
            </Badge>
            <Badge variant={statusVariant(conversation.status)}>
              {statusLabel(conversation.status)}
            </Badge>
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-gray-400">Messages</dt>
            <dd className="mt-0.5 text-gray-700">
              {conversation.messageCount.toLocaleString('en-US')}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">First activity</dt>
            <dd className="mt-0.5 text-gray-700">
              <time dateTime={conversation.firstActivityAt}>
                {timestampLabel(conversation.firstActivityAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Last activity</dt>
            <dd className="mt-0.5 text-gray-700">
              <time dateTime={conversation.lastActivityAt}>
                {timestampLabel(conversation.lastActivityAt)}
              </time>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-gray-400">Initial page</dt>
            <dd className="mt-0.5 truncate text-gray-700" title={pageLabel}>
              {pageLabel}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  )
}

export function BellListClient({
  initialData,
}: {
  initialData: BellConversationListWire
}) {
  const [filters, setFilters] = useState<BellListFilters>(EMPTY_BELL_FILTERS)
  const [appliedFilters, setAppliedFilters] =
    useState<BellListFilters>(EMPTY_BELL_FILTERS)
  const [conversations, setConversations] = useState(initialData.conversations)
  const [nextCursor, setNextCursor] = useState(initialData.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestNumber = useRef(0)

  const load = useCallback(
    async (nextFilters: BellListFilters, cursor?: string, append = false) => {
      const thisRequest = ++requestNumber.current
      setLoading(true)
      setError(null)
      try {
        const query = queryFor(nextFilters, cursor)
        const response = await fetch(
          `/api/printing-press/bell${query ? `?${query}` : ''}`,
          { cache: 'no-store' }
        )
        const data = (await response.json().catch(() => null)) as
          | (BellConversationListWire & { error?: string })
          | null
        if (!response.ok || !data) {
          throw new Error(data?.error ?? 'Could not load Bell conversations')
        }
        if (thisRequest !== requestNumber.current) return
        setConversations((current) =>
          append ? [...current, ...data.conversations] : data.conversations
        )
        setNextCursor(data.nextCursor)
      } catch (loadError) {
        if (thisRequest !== requestNumber.current) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load Bell conversations'
        )
      } finally {
        if (thisRequest === requestNumber.current) setLoading(false)
      }
    },
    []
  )

  const applyFilters = useCallback(() => {
    setAppliedFilters(filters)
    void load(filters)
  }, [filters, load])

  const clearFilters = useCallback(() => {
    const empty = { ...EMPTY_BELL_FILTERS }
    setFilters(empty)
    setAppliedFilters(empty)
    void load(empty)
  }, [load])

  const retry = useCallback(() => {
    void load(appliedFilters)
  }, [appliedFilters, load])

  const loadMore = useCallback(() => {
    if (nextCursor) void load(appliedFilters, nextCursor, true)
  }, [appliedFilters, load, nextCursor])

  return (
    <div>
      <Filters
        value={filters}
        loading={loading}
        onChange={setFilters}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {error ? (
        <div
          role="alert"
          className="mb-4 border border-red/30 bg-red/5 px-4 py-3 text-red-deep text-sm"
        >
          <p>{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={retry}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {conversations.length === 0 && !loading ? (
        <div className="border border-gray-200 bg-white px-4 py-12 text-center">
          <p className="font-medium text-gray-800 text-sm">
            Bell is quiet here.
          </p>
          <p className="mt-1 text-gray-500 text-sm">
            No conversations match this view.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
            />
          ))}
        </ul>
      )}

      {nextCursor ? (
        <div className="mt-5 flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={loadMore}
          >
            {loading ? <Spinner className="h-4 w-4" /> : null}
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
