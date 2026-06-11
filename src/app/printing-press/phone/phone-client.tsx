'use client'

import { ArrowLeft, MessageSquarePlus, Phone, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { isE164, phoneNumbers } from '@/lib/phone/config'
import type { SerializedMessage } from '@/lib/phone/serialize'
import { cn } from '@/lib/utils'

type Conversation = {
  number: string
  lastMessage: SerializedMessage
}

// The 212 NYC line is the primary number; list it first.
const FROM_OPTIONS = Object.entries(phoneNumbers) // [label, number]

function timestampLabel(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`
}

type Tab = 'messages' | 'call'

export function PhoneClient({
  initialConversations,
}: {
  initialConversations: Conversation[]
}) {
  const [tab, setTab] = useState<Tab>('messages')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-gray-200 border-b">
        <button
          type="button"
          onClick={() => setTab('messages')}
          className={cn(
            'border-b-2 px-3 py-2 font-medium text-sm transition-colors',
            tab === 'messages'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Messages
        </button>
        <button
          type="button"
          onClick={() => setTab('call')}
          className={cn(
            'border-b-2 px-3 py-2 font-medium text-sm transition-colors',
            tab === 'call'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          Connect a call
        </button>
      </div>

      {tab === 'messages' ? (
        <Messages initialConversations={initialConversations} />
      ) : (
        <ConnectCall />
      )}
    </div>
  )
}

function Messages({
  initialConversations,
}: {
  initialConversations: Conversation[]
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selected, setSelected] = useState<string | null>(null)
  const [composingNew, setComposingNew] = useState(false)
  const [newTo, setNewTo] = useState('')
  const [messages, setMessages] = useState<SerializedMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [from, setFrom] = useState(FROM_OPTIONS[0][1])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const threadEnd = useRef<HTMLDivElement>(null)

  const loadThread = useCallback(async (number: string) => {
    setLoadingThread(true)
    try {
      const res = await fetch(
        `/api/printing-press/phone/conversations?number=${encodeURIComponent(number)}`
      )
      const data = await res.json().catch(() => null)
      if (res.ok && data) {
        setMessages(data.messages)
      } else {
        toast.error(data?.error ?? 'Could not load the conversation')
      }
    } catch {
      toast.error('Could not load the conversation')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  const openConversation = useCallback(
    (number: string) => {
      setComposingNew(false)
      setSelected(number)
      setMessages([])
      void loadThread(number)
    },
    [loadThread]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const send = useCallback(async () => {
    const to = composingNew ? newTo.trim() : selected
    const text = body.trim()
    if (!to || !text) return
    setSending(true)
    try {
      const res = await fetch('/api/printing-press/phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, body: text }),
      })
      const data = await res.json().catch(() => null)
      if (data?.message) {
        // Success or recorded failure: both belong in the thread.
        if (composingNew) {
          setComposingNew(false)
          setSelected(to)
          setMessages([data.message])
        } else {
          setMessages((prev) => [...prev, data.message])
        }
        setConversations((prev) => [
          { number: to, lastMessage: data.message },
          ...prev.filter((c) => c.number !== to),
        ])
        if (res.ok) {
          setBody('')
        } else {
          toast.error(data?.error ?? 'Twilio rejected the message')
        }
      } else {
        toast.error(data?.error ?? 'Could not send the message')
      }
    } catch {
      toast.error('Could not send the message')
    } finally {
      setSending(false)
    }
  }, [body, composingNew, from, newTo, selected])

  const threadOpen = selected !== null || composingNew

  return (
    <div className="flex min-h-[420px] border border-gray-200 bg-white">
      {/* Conversation list */}
      <div
        className={cn(
          'w-full flex-col border-gray-200 sm:flex sm:w-64 sm:shrink-0 sm:border-r',
          threadOpen ? 'hidden' : 'flex'
        )}
      >
        <div className="flex items-center justify-between border-gray-100 border-b px-3 py-2">
          <span className="font-mono text-[11px] text-gray-400 uppercase tracking-[0.14em]">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => {
              setComposingNew(true)
              setSelected(null)
              setMessages([])
              setNewTo('')
            }}
            aria-label="New message"
            title="New message"
            className="p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-gray-500 text-sm">
            No conversations yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.number}>
                <button
                  type="button"
                  onClick={() => openConversation(c.number)}
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition-colors hover:bg-gray-050',
                    selected === c.number && 'bg-gray-075'
                  )}
                >
                  <span className="block font-medium text-gray-900 text-sm">
                    {c.number}
                  </span>
                  <span className="mt-0.5 block truncate text-gray-500 text-xs">
                    {c.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                    {c.lastMessage.body || '(no text)'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Thread */}
      <div
        className={cn(
          'min-w-0 flex-1 flex-col sm:flex',
          threadOpen ? 'flex' : 'hidden'
        )}
      >
        {threadOpen ? (
          <>
            <div className="flex items-center gap-2 border-gray-100 border-b px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setComposingNew(false)
                }}
                aria-label="Back to conversations"
                className="p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 sm:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              {composingNew ? (
                <input
                  type="tel"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="+15551234567"
                  aria-label="Recipient phone number"
                  className="h-8 w-44 border border-gray-200 bg-white px-2 text-gray-900 text-sm placeholder:text-gray-400 focus:border-gray-400"
                />
              ) : (
                <span className="font-medium text-gray-900 text-sm">
                  {selected}
                </span>
              )}
              {selected && (
                <button
                  type="button"
                  onClick={() => void loadThread(selected)}
                  aria-label="Refresh conversation"
                  title="Refresh"
                  className="ml-auto p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
              {loadingThread ? (
                <div className="flex justify-center py-8">
                  <Spinner className="h-5 w-5 text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-gray-500 text-sm">
                  {composingNew
                    ? 'Enter a number and write a message.'
                    : 'No messages in this conversation.'}
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'flex',
                      m.direction === 'outbound'
                        ? 'justify-end'
                        : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] px-3 py-2 sm:max-w-[70%]',
                        m.direction === 'outbound'
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-075 text-gray-900'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {m.body || '(no text)'}
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-[10px]',
                          m.direction === 'outbound'
                            ? 'text-gray-400'
                            : 'text-gray-500'
                        )}
                      >
                        {timestampLabel(m.createdAt)}
                        {m.status === 'failed' && ' · failed'}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={threadEnd} />
            </div>

            <form
              className="flex items-end gap-2 border-gray-100 border-t px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Send from number"
                className="h-9 border border-gray-200 bg-white px-2 text-gray-700 text-sm focus:border-gray-400"
              >
                {FROM_OPTIONS.map(([label, number]) => (
                  <option key={number} value={number}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={1}
                placeholder="Write a message…"
                aria-label="Message body"
                className="max-h-32 min-h-9 flex-1 resize-y border border-gray-200 bg-white px-2 py-2 text-gray-900 text-sm placeholder:text-gray-400 focus:border-gray-400"
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  sending || !body.trim() || (composingNew && !newTo.trim())
                }
              >
                {sending ? <Spinner className="h-4 w-4" /> : 'Send'}
              </Button>
            </form>
          </>
        ) : (
          <div className="hidden flex-1 items-center justify-center sm:flex">
            <p className="text-gray-400 text-sm">
              Select a conversation or start a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectCall() {
  const callerIdId = useId()
  const targetId = useId()
  const [callerId, setCallerId] = useState(FROM_OPTIONS[0][1])
  const [target, setTarget] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [placing, setPlacing] = useState(false)

  const trimmed = target.trim()
  const validTarget = isE164(trimmed)

  const place = useCallback(async () => {
    setPlacing(true)
    try {
      const res = await fetch('/api/printing-press/phone/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: trimmed, callerId }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        toast.success('Calling your phone. Pick up to connect.')
        setConfirming(false)
        setTarget('')
      } else {
        toast.error(data?.error ?? 'Could not place the call')
      }
    } catch {
      toast.error('Could not place the call')
    } finally {
      setPlacing(false)
    }
  }, [callerId, trimmed])

  return (
    <div className="max-w-md border border-gray-200 bg-white p-4">
      <p className="text-gray-600 text-sm">
        Your phone rings first. When you pick up, Twilio dials the destination
        and bridges the two of you, presenting the selected Twilio number as
        caller id.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (validTarget) setConfirming(true)
        }}
      >
        <div className="space-y-1">
          <label
            htmlFor={callerIdId}
            className="block font-medium text-gray-700 text-sm"
          >
            Caller id
          </label>
          <select
            id={callerIdId}
            value={callerId}
            onChange={(e) => setCallerId(e.target.value)}
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900 text-sm focus:border-gray-400"
          >
            {FROM_OPTIONS.map(([label, number]) => (
              <option key={number} value={number}>
                {label} ({number})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label
            htmlFor={targetId}
            className="block font-medium text-gray-700 text-sm"
          >
            Destination
          </label>
          <input
            id={targetId}
            type="tel"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="+15551234567"
            className="h-9 w-full border border-gray-200 bg-white px-2 text-gray-900 text-sm placeholder:text-gray-400 focus:border-gray-400"
          />
          {trimmed && !validTarget && (
            <p className="text-red text-xs">
              Enter an E.164 number, for example +15551234567.
            </p>
          )}
        </div>
        <Button type="submit" disabled={!validTarget}>
          <Phone className="h-4 w-4" />
          Connect a call
        </Button>
      </form>

      <Dialog
        open={confirming}
        onOpenChange={(o) => !o && setConfirming(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ring your phone?</DialogTitle>
            <DialogDescription>
              This calls your phone immediately. When you answer, it dials{' '}
              <span className="font-medium text-gray-700">{trimmed}</span> and
              connects you, showing {callerId} as the caller id.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={place} disabled={placing}>
              {placing ? <Spinner className="h-4 w-4" /> : 'Call me'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
