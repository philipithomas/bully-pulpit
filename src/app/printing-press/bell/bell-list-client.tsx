'use client'

import { Search, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useId,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

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

function refinementCount(filters: BellListFilters): number {
  return [
    filters.surface,
    filters.identity,
    filters.status,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length
}

function clearRefinements(filters: BellListFilters): BellListFilters {
  return {
    ...EMPTY_BELL_FILTERS,
    search: filters.search,
  }
}

function RefinementFields({
  value,
  onChange,
}: {
  value: BellListFilters
  onChange: (next: BellListFilters) => void
}) {
  const idPrefix = useId()
  const surfaceId = `${idPrefix}-surface`
  const identityId = `${idPrefix}-identity`
  const statusId = `${idPrefix}-status`
  const dateFromId = `${idPrefix}-date-from`
  const dateToId = `${idPrefix}-date-to`
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

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor={surfaceId}>Surface</Label>
        <NativeSelect
          id={surfaceId}
          value={value.surface}
          onChange={handleSurfaceChange}
        >
          <NativeSelectOption value="">All surfaces</NativeSelectOption>
          <NativeSelectOption value="web">Web</NativeSelectOption>
          <NativeSelectOption value="sms">SMS</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={identityId}>Identity</Label>
        <NativeSelect
          id={identityId}
          value={value.identity}
          onChange={handleIdentityChange}
        >
          <NativeSelectOption value="">All identities</NativeSelectOption>
          <NativeSelectOption value="signed_in">Signed in</NativeSelectOption>
          <NativeSelectOption value="phone">Phone</NativeSelectOption>
          <NativeSelectOption value="anonymous">Anonymous</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={statusId}>Status</Label>
        <NativeSelect
          id={statusId}
          value={value.status}
          onChange={handleStatusChange}
        >
          <NativeSelectOption value="">All statuses</NativeSelectOption>
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="completed">Completed</NativeSelectOption>
          <NativeSelectOption value="error">Error</NativeSelectOption>
        </NativeSelect>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
        <div className="grid gap-2">
          <Label htmlFor={dateFromId}>From</Label>
          <Input
            id={dateFromId}
            type="date"
            value={value.dateFrom}
            onChange={handleDateFromChange}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={dateToId}>Through</Label>
          <Input
            id={dateToId}
            type="date"
            value={value.dateTo}
            min={value.dateFrom || undefined}
            onChange={handleDateToChange}
          />
        </div>
      </div>
    </div>
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
        className="group -mx-3 block px-3 py-5 transition-colors hover:bg-white/70 focus-visible:bg-white/70 sm:-mx-4 sm:px-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-950 text-sm">
              {conversation.participantLabel}
            </p>
            {conversation.participantDetail ? (
              <p className="mt-0.5 truncate text-gray-500 text-xs">
                {conversation.participantDetail}
              </p>
            ) : null}
          </div>
          <Badge
            variant={statusVariant(conversation.status)}
            className="shrink-0"
          >
            {statusLabel(conversation.status)}
          </Badge>
        </div>

        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-500 text-xs">
          <span>{surfaceLabel(conversation.surface)}</span>
          <span aria-hidden="true">·</span>
          <span>{identityLabel(conversation.identity)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {conversation.messageCount.toLocaleString('en-US')}{' '}
            {conversation.messageCount === 1 ? 'message' : 'messages'}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={conversation.lastActivityAt} className="font-mono">
            {timestampLabel(conversation.lastActivityAt)}
          </time>
        </p>
        <p className="mt-1 truncate text-gray-500 text-xs" title={pageLabel}>
          Began on <span className="text-gray-700">{pageLabel}</span>
        </p>
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
  const [loadingAction, setLoadingAction] = useState<
    'replace' | 'append' | null
  >(null)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestNumber = useRef(0)
  const participantSearchId = useId()

  const load = useCallback(
    async (nextFilters: BellListFilters, cursor?: string, append = false) => {
      const thisRequest = ++requestNumber.current
      setLoadingAction(append ? 'append' : 'replace')
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
        if (thisRequest === requestNumber.current) setLoadingAction(null)
      }
    },
    []
  )

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const nextFilters = {
        ...appliedFilters,
        search: filters.search,
      }
      setAppliedFilters(nextFilters)
      setFilters(nextFilters)
      void load(nextFilters)
    },
    [appliedFilters, filters.search, load]
  )

  const applyRefinements = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setAppliedFilters(filters)
      setFilterSheetOpen(false)
      void load(filters)
    },
    [filters, load]
  )

  const resetRefinements = useCallback(() => {
    setFilters((current) => clearRefinements(current))
  }, [])

  const handleFilterSheetOpenChange = useCallback(
    (open: boolean) => {
      setFilterSheetOpen(open)
      if (!open) {
        setFilters((current) => ({
          ...appliedFilters,
          search: current.search,
        }))
      }
    },
    [appliedFilters]
  )

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFilters((current) => ({
        ...current,
        search: event.target.value,
      }))
    },
    []
  )

  const retry = useCallback(() => {
    void load(appliedFilters)
  }, [appliedFilters, load])

  const loadMore = useCallback(() => {
    if (nextCursor) void load(appliedFilters, nextCursor, true)
  }, [appliedFilters, load, nextCursor])

  const appliedRefinementCount = refinementCount(appliedFilters)

  return (
    <div>
      <div className="mb-7 flex flex-col gap-3 sm:flex-row">
        <form className="min-w-0 flex-1" onSubmit={submitSearch}>
          <Label htmlFor={participantSearchId} className="sr-only">
            Search participants
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
            />
            <Input
              id={participantSearchId}
              type="search"
              value={filters.search}
              maxLength={100}
              placeholder="Name, email, phone, or network"
              className="pl-9 pr-24"
              onChange={handleSearchChange}
            />
            <Button
              type="submit"
              size="sm"
              loading={loadingAction === 'replace'}
              loadingLabel={<span className="sr-only">Searching</span>}
              className="absolute right-0.5 top-0.5 h-9"
            >
              Search
            </Button>
          </div>
          <p className="mt-1.5 text-gray-500 text-xs">
            Participant details only. Message text stays private from search.
          </p>
        </form>

        <Sheet
          open={filterSheetOpen}
          onOpenChange={handleFilterSheetOpenChange}
        >
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 self-start"
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {appliedRefinementCount > 0 ? (
                <span className="font-mono text-xs">
                  {appliedRefinementCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            title={null}
            className="w-full max-w-md p-6 sm:w-[26rem]"
          >
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={applyRefinements}
            >
              <SheetHeader className="pr-8">
                <SheetTitle>Filter conversations</SheetTitle>
                <SheetDescription>
                  Narrow the archive without searching message text.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-8 flex-1 overflow-y-auto">
                <RefinementFields value={filters} onChange={setFilters} />
              </div>
              <SheetFooter className="mt-8 flex-row-reverse sm:justify-start">
                <Button
                  type="submit"
                  loading={loadingAction === 'replace'}
                  loadingLabel={<span className="sr-only">Applying</span>}
                >
                  Apply filters
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={refinementCount(filters) === 0}
                  onClick={resetRefinements}
                >
                  Clear filters
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-5">
          <AlertTitle>Bell lost the thread</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3"
              loading={loadingAction === 'replace'}
              loadingLabel={<span className="sr-only">Retrying</span>}
              onClick={retry}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {loadingAction === 'replace'
          ? 'Loading conversations'
          : `${conversations.length} conversations shown`}
      </p>
      <div aria-busy={loadingAction === 'replace'}>
        {conversations.length === 0 && loadingAction === null ? (
          <div className="px-4 py-14 text-center">
            <p className="font-medium text-gray-800 text-sm">
              Bell is quiet here.
            </p>
            <p className="mt-1 text-gray-500 text-sm">
              No conversations match this view.
            </p>
          </div>
        ) : (
          <ul>
            {conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
              />
            ))}
          </ul>
        )}
      </div>

      {nextCursor ? (
        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            loading={loadingAction === 'append'}
            loadingLabel="Loading"
            onClick={loadMore}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
