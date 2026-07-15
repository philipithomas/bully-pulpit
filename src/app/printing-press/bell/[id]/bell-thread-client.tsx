'use client'

import {
  ArrowLeft,
  ExternalLink,
  MessageSquareText,
  MoreHorizontal,
  ShieldX,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  type MouseEvent,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import {
  bellCostLabel,
  bellLatencyLabel,
  bellPhoneThreadHref,
  bellTimestampLabel,
  bellTokenLabel,
} from '@/app/printing-press/bell/format'
import type {
  BellConversationDetailWire,
  BellGenerationWire,
  BellMessageWire,
} from '@/app/printing-press/bell/types'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Confirmation = 'redact' | 'delete' | null

function statusVariant(status: string) {
  if (status === 'completed' || status === 'complete' || status === 'success') {
    return 'success' as const
  }
  if (status === 'error' || status === 'failed') return 'destructive' as const
  return 'warning' as const
}

function statusLabel(status: string): string {
  return status
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}

function authorLabel(author: BellMessageWire['authorKind']): string {
  if (author === 'bell') return 'Bell'
  if (author === 'admin') return 'Admin'
  if (author === 'system') return 'System'
  return 'Visitor'
}

function GenerationMetadata({
  generation,
}: {
  generation: BellGenerationWire
}) {
  const identifiers = [
    ['Gateway', generation.gatewayGenerationId],
    ['Call', generation.callId],
    ['Trace', generation.traceId],
    ['Workflow', generation.workflowRunId],
  ].filter((item): item is [string, string] => Boolean(item[1]))

  return (
    <div className="mt-3 border-gray-200 border-l pl-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant(generation.status)}>
          {statusLabel(generation.status)}
        </Badge>
        <span className="font-medium text-gray-700">
          {generation.model ?? 'Model unavailable'}
        </span>
        {generation.provider ? (
          <span className="text-gray-500">via {generation.provider}</span>
        ) : null}
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
        {generation.totalTokens !== null ? (
          <div className="flex gap-1">
            <dt>Tokens</dt>
            <dd className="text-gray-700">
              {bellTokenLabel(generation.totalTokens)}
            </dd>
          </div>
        ) : null}
        {generation.inputTokens !== null ? (
          <div className="flex gap-1">
            <dt>Input</dt>
            <dd className="text-gray-700">
              {bellTokenLabel(generation.inputTokens)}
            </dd>
          </div>
        ) : null}
        {generation.outputTokens !== null ? (
          <div className="flex gap-1">
            <dt>Output</dt>
            <dd className="text-gray-700">
              {bellTokenLabel(generation.outputTokens)}
            </dd>
          </div>
        ) : null}
        {generation.cachedInputTokens !== null ? (
          <div className="flex gap-1">
            <dt>Cached</dt>
            <dd className="text-gray-700">
              {bellTokenLabel(generation.cachedInputTokens)}
            </dd>
          </div>
        ) : null}
        {generation.reasoningTokens !== null ? (
          <div className="flex gap-1">
            <dt>Reasoning</dt>
            <dd className="text-gray-700">
              {bellTokenLabel(generation.reasoningTokens)}
            </dd>
          </div>
        ) : null}
        {generation.costUsd !== null ? (
          <div className="flex gap-1">
            <dt>Cost</dt>
            <dd className="text-gray-700">
              {bellCostLabel(generation.costUsd)}
            </dd>
          </div>
        ) : null}
        {generation.latencyMs !== null ? (
          <div className="flex gap-1">
            <dt>Latency</dt>
            <dd className="text-gray-700">
              {bellLatencyLabel(generation.latencyMs)}
            </dd>
          </div>
        ) : null}
        {generation.finishReason ? (
          <div className="flex gap-1">
            <dt>Finish</dt>
            <dd className="text-gray-700">{generation.finishReason}</dd>
          </div>
        ) : null}
      </dl>

      {generation.tools.length > 0 ? (
        <details className="mt-2 text-gray-600">
          <summary className="cursor-pointer font-medium">
            Tools used ({generation.tools.length})
          </summary>
          <ul className="mt-1 space-y-1 border-gray-200 border-l pl-3">
            {generation.tools.map((tool) => (
              <li key={`${tool.name}-${tool.status ?? 'unknown'}`}>
                {tool.name}
                {tool.status ? `: ${statusLabel(tool.status)}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {generation.errorMessage ? (
        <p className="mt-2 border border-red/20 bg-red/5 px-2 py-1.5 text-red-deep">
          {generation.errorCode ? `${generation.errorCode}: ` : ''}
          {generation.errorMessage}
        </p>
      ) : null}

      {identifiers.length > 0 ? (
        <details className="mt-2 text-gray-500">
          <summary className="cursor-pointer">Trace identifiers</summary>
          <dl className="mt-1 space-y-1 border-gray-200 border-l pl-3">
            {identifiers.map(([label, value]) => (
              <div key={label}>
                <dt className="inline">{label}: </dt>
                <dd className="inline break-all font-mono text-gray-700">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  )
}

function Message({
  message,
  generation,
}: {
  message: BellMessageWire
  generation?: BellGenerationWire
}) {
  return (
    <li
      className={cn(
        'px-4 py-4 sm:px-5',
        message.authorKind === 'bell'
          ? 'bg-forest/5'
          : message.authorKind === 'admin'
            ? 'bg-indigo/5'
            : message.authorKind === 'system'
              ? 'bg-brass/5'
              : 'bg-white/70'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">
            {authorLabel(message.authorKind)}
          </span>
          <Badge variant={statusVariant(message.status)}>
            {statusLabel(message.status)}
          </Badge>
        </span>
        <time
          dateTime={message.createdAt}
          className="font-mono text-gray-500 text-xs"
        >
          {bellTimestampLabel(message.createdAt)}
        </time>
      </div>
      <p
        className={cn(
          'mt-2 whitespace-pre-wrap break-words text-gray-800 text-sm leading-relaxed',
          message.redactedAt && 'italic text-gray-500'
        )}
      >
        {message.redactedAt
          ? 'Message redacted.'
          : message.content || '(No text)'}
      </p>
      {generation ? (
        <details className="mt-4 text-gray-600 text-xs">
          <summary className="cursor-pointer font-medium">
            Generation details
          </summary>
          <GenerationMetadata generation={generation} />
        </details>
      ) : null}
    </li>
  )
}

function UnlinkedGeneration({
  generation,
}: {
  generation: BellGenerationWire
}) {
  return (
    <li className="bg-gray-050 px-4 py-4 sm:px-5">
      <p className="font-medium text-gray-800 text-sm">Generation attempt</p>
      <GenerationMetadata generation={generation} />
    </li>
  )
}

export function BellThreadClient({
  initialDetail,
}: {
  initialDetail: BellConversationDetailWire
}) {
  const router = useRouter()
  const [detail, setDetail] = useState(initialDetail)
  const [confirmation, setConfirmation] = useState<Confirmation>(null)
  const [mutating, setMutating] = useState(false)
  const threadHeadingId = useId()
  const generationsHeadingId = useId()
  const manageTriggerRef = useRef<HTMLButtonElement>(null)
  const conversation = detail.conversation

  const generationByMessage = useMemo(() => {
    const map = new Map<string, BellGenerationWire>()
    for (const generation of detail.generations) {
      if (generation.assistantMessageId) {
        map.set(generation.assistantMessageId, generation)
      }
    }
    return map
  }, [detail.generations])

  const unlinkedGenerations = useMemo(
    () =>
      detail.generations.filter(
        (generation) =>
          !generation.assistantMessageId ||
          !detail.messages.some(
            (message) => message.id === generation.assistantMessageId
          )
      ),
    [detail.generations, detail.messages]
  )

  const canRedact = detail.messages.some((message) => !message.redactedAt)

  const openRedactConfirmation = useCallback(() => {
    setConfirmation('redact')
  }, [])

  const openDeleteConfirmation = useCallback(() => {
    setConfirmation('delete')
  }, [])

  const rememberManageTrigger = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      manageTriggerRef.current = event.currentTarget
    },
    []
  )

  const handleConfirmationOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !mutating) setConfirmation(null)
    },
    [mutating]
  )

  const redact = useCallback(async () => {
    setMutating(true)
    try {
      const response = await fetch(
        `/api/printing-press/bell/${conversation.id}/redact`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      )
      const result = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) {
        throw new Error(result?.error ?? 'Could not redact the conversation')
      }

      const refreshed = await fetch(
        `/api/printing-press/bell/${conversation.id}`,
        { cache: 'no-store' }
      )
      const refreshedDetail = (await refreshed.json().catch(() => null)) as
        | (BellConversationDetailWire & { error?: string })
        | null
      if (!refreshed.ok || !refreshedDetail) {
        throw new Error(
          refreshedDetail?.error ?? 'Could not reload the conversation'
        )
      }
      setDetail(refreshedDetail)
      setConfirmation(null)
      toast.success('Bell conversation redacted')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not redact the conversation'
      )
    } finally {
      setMutating(false)
    }
  }, [conversation.id, router])

  const remove = useCallback(async () => {
    setMutating(true)
    try {
      const response = await fetch(
        `/api/printing-press/bell/${conversation.id}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      )
      const result = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      if (!response.ok) {
        throw new Error(result?.error ?? 'Could not delete the conversation')
      }
      toast.success('Bell conversation deleted')
      router.push('/printing-press/bell')
      router.refresh()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not delete the conversation'
      )
      setMutating(false)
    }
  }, [conversation.id, router])

  const pageLabel =
    conversation.firstPageTitle ?? conversation.firstPagePath ?? null
  const linkedPagePath = conversation.firstPagePath?.startsWith('/')
    ? conversation.firstPagePath
    : null

  return (
    <div>
      <Link
        href="/printing-press/bell"
        className="mb-6 inline-flex items-center gap-1.5 text-gray-500 text-sm transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Bell conversations
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words font-sans font-semibold text-3xl tracking-tight text-gray-950">
            {conversation.participantLabel}
          </h1>
          {conversation.participantDetail ? (
            <p className="mt-1 break-words text-gray-500 text-sm">
              {conversation.participantDetail}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">
              {conversation.surface === 'sms' ? 'SMS' : 'Web'}
            </Badge>
            <Badge variant={statusVariant(conversation.status)}>
              {statusLabel(conversation.status)}
            </Badge>
            <Badge variant="secondary">
              {conversation.messageCount.toLocaleString('en-US')}{' '}
              {conversation.messageCount === 1 ? 'message' : 'messages'}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={rememberManageTrigger}
            >
              <MoreHorizontal className="size-4" />
              <span className="hidden sm:inline">Manage conversation</span>
              <span className="sm:hidden">Manage</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Manage conversation</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!canRedact}
              onClick={openRedactConfirmation}
            >
              <ShieldX />
              Redact messages
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={openDeleteConfirmation}
            >
              <Trash2 />
              Delete forever
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="mt-8 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-gray-500 text-xs">First activity</dt>
          <dd className="mt-0.5 text-gray-800">
            <time dateTime={conversation.firstActivityAt}>
              {bellTimestampLabel(conversation.firstActivityAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Last activity</dt>
          <dd className="mt-0.5 text-gray-800">
            <time dateTime={conversation.lastActivityAt}>
              {bellTimestampLabel(conversation.lastActivityAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Initial page</dt>
          <dd className="mt-0.5 min-w-0 text-gray-800">
            {linkedPagePath && pageLabel ? (
              <Link
                href={linkedPagePath}
                className="inline-flex max-w-full items-center gap-1 hover:underline"
              >
                <span className="truncate">{pageLabel}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </Link>
            ) : (
              'No page context'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 text-xs">Retained through</dt>
          <dd className="mt-0.5 text-gray-800">
            {conversation.expiresAt ? (
              <time dateTime={conversation.expiresAt}>
                {bellTimestampLabel(conversation.expiresAt)}
              </time>
            ) : (
              'Until deleted'
            )}
          </dd>
        </div>
      </dl>

      {conversation.surface === 'sms' && conversation.phoneNumber ? (
        <Link
          href={bellPhoneThreadHref(conversation.phoneNumber)}
          className="mt-4 inline-flex items-center gap-2 text-gray-600 text-sm transition-colors hover:text-gray-950 hover:underline"
        >
          <MessageSquareText className="h-4 w-4" />
          Open the SMS thread in Phone
        </Link>
      ) : null}

      <section className="mt-10" aria-labelledby={threadHeadingId}>
        <h2
          id={threadHeadingId}
          className="font-sans font-semibold text-xl text-gray-950"
        >
          Conversation
        </h2>
        {detail.messages.length === 0 ? (
          <div className="mt-3 bg-white/70 px-4 py-10 text-center text-gray-500 text-sm">
            This conversation has no stored messages.
          </div>
        ) : (
          <ol className="mt-3 space-y-3">
            {detail.messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                generation={generationByMessage.get(message.id)}
              />
            ))}
          </ol>
        )}
      </section>

      {unlinkedGenerations.length > 0 ? (
        <section className="mt-8" aria-labelledby={generationsHeadingId}>
          <h2
            id={generationsHeadingId}
            className="font-sans font-semibold text-xl text-gray-950"
          >
            Unattached generation attempts
          </h2>
          <p className="mt-1 text-gray-500 text-sm">
            These runs ended before Bell stored an assistant message.
          </p>
          <ul className="mt-3 space-y-3">
            {unlinkedGenerations.map((generation) => (
              <UnlinkedGeneration key={generation.id} generation={generation} />
            ))}
          </ul>
        </section>
      ) : null}

      <AlertDialog
        open={confirmation === 'redact'}
        onOpenChange={handleConfirmationOpenChange}
      >
        <AlertDialogContent finalFocus={manageTriggerRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Redact this conversation</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces every message body and tool payload stored by Bell
              with a redacted placeholder.{' '}
              {conversation.surface === 'sms'
                ? 'Linked SMS messages remain in Phone. '
                : ''}
              Attribution and aggregate generation metadata remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              loading={mutating}
              loadingLabel="Redacting"
              onClick={redact}
            >
              Redact messages
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmation === 'delete'}
        onOpenChange={handleConfirmationOpenChange}
      >
        <AlertDialogContent finalFocus={manageTriggerRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the Bell conversation, messages, and
              generation records.{' '}
              {conversation.surface === 'sms'
                ? 'Linked SMS messages remain in Phone.'
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              loading={mutating}
              loadingLabel="Deleting"
              onClick={remove}
            >
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
