'use client'

import { ArrowLeft, MessageSquarePlus, Phone, RefreshCw } from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { isE164 } from '@/lib/phone/config'
import type { SerializedMessage } from '@/lib/phone/serialize'
import { cn } from '@/lib/utils'

type Conversation = {
  number: string
  lastMessage: SerializedMessage
}

function timestampLabel(iso: string): string {
  return `${iso.slice(0, 16)}Z`
}

type Tab = 'messages' | 'call'

export function PhoneClient({
  initialConversations,
  initialSelectedNumber,
  phoneNumber,
  phoneDisplayNumber,
}: {
  initialConversations: Conversation[]
  initialSelectedNumber: string | null
  phoneNumber: string | null
  phoneDisplayNumber: string | null
}) {
  const [tab, setTab] = useState<Tab>('messages')
  const handleTabChange = useCallback((nextTab: string | number | null) => {
    if (nextTab === 'messages' || nextTab === 'call') setTab(nextTab)
  }, [])

  return (
    <Tabs value={tab} onValueChange={handleTabChange} className="min-w-0 gap-5">
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="messages" className="min-h-11 sm:min-h-9">
          Messages
        </TabsTrigger>
        <TabsTrigger value="call" className="min-h-11 sm:min-h-9">
          Connect a call
        </TabsTrigger>
      </TabsList>
      <TabsContent value="messages">
        <Messages
          initialConversations={initialConversations}
          initialSelectedNumber={initialSelectedNumber}
          phoneDisplayNumber={phoneDisplayNumber}
          phoneNumber={phoneNumber}
        />
      </TabsContent>
      <TabsContent value="call">
        <ConnectCall
          phoneDisplayNumber={phoneDisplayNumber}
          phoneNumber={phoneNumber}
        />
      </TabsContent>
    </Tabs>
  )
}

function Messages({
  initialConversations,
  initialSelectedNumber,
  phoneNumber,
  phoneDisplayNumber,
}: {
  initialConversations: Conversation[]
  initialSelectedNumber: string | null
  phoneNumber: string | null
  phoneDisplayNumber: string | null
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selected, setSelected] = useState<string | null>(initialSelectedNumber)
  const [composingNew, setComposingNew] = useState(false)
  const [newTo, setNewTo] = useState('')
  const [messages, setMessages] = useState<SerializedMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const threadEnd = useRef<HTMLDivElement>(null)
  const threadAbort = useRef<AbortController | null>(null)
  const threadRequest = useRef(0)
  const displayNumber = phoneDisplayNumber ?? phoneNumber

  const loadThread = useCallback(async (number: string) => {
    threadAbort.current?.abort()
    const controller = new AbortController()
    threadAbort.current = controller
    const requestId = ++threadRequest.current
    setLoadingThread(true)
    try {
      const res = await fetch(
        `/api/printing-press/phone/conversations?number=${encodeURIComponent(number)}`,
        { signal: controller.signal }
      )
      const data = await res.json().catch(() => null)
      if (threadRequest.current !== requestId) return
      if (res.ok && data) {
        setMessages(data.messages)
      } else {
        toast.error(data?.error ?? 'Could not load the conversation')
      }
    } catch {
      if (threadRequest.current === requestId) {
        toast.error('Could not load the conversation')
      }
    } finally {
      if (threadRequest.current === requestId) {
        threadAbort.current = null
        setLoadingThread(false)
      }
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

  const handleConversationClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const number = event.currentTarget.dataset.number
      if (number) openConversation(number)
    },
    [openConversation]
  )

  useEffect(() => {
    if (initialSelectedNumber) void loadThread(initialSelectedNumber)
  }, [initialSelectedNumber, loadThread])

  useEffect(
    () => () => {
      threadRequest.current += 1
      threadAbort.current?.abort()
    },
    []
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
        body: JSON.stringify({ to, body: text }),
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
  }, [body, composingNew, newTo, selected])

  const startNewMessage = useCallback(() => {
    threadRequest.current += 1
    threadAbort.current?.abort()
    threadAbort.current = null
    setLoadingThread(false)
    setComposingNew(true)
    setSelected(null)
    setMessages([])
    setNewTo('')
  }, [])

  const closeThread = useCallback(() => {
    threadRequest.current += 1
    threadAbort.current?.abort()
    threadAbort.current = null
    setLoadingThread(false)
    setSelected(null)
    setComposingNew(false)
  }, [])

  const refreshThread = useCallback(() => {
    if (selected) void loadThread(selected)
  }, [loadThread, selected])

  const handleRecipientChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setNewTo(event.target.value),
    []
  )

  const handleBodyChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => setBody(event.target.value),
    []
  )

  const handleSendSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void send()
    },
    [send]
  )

  const threadOpen = selected !== null || composingNew

  return (
    <div className="flex h-[70dvh] min-h-[400px] max-h-[700px] overflow-hidden border border-border bg-card">
      {/* Conversation list */}
      <div
        className={cn(
          'w-full flex-col sm:flex sm:w-64 sm:shrink-0',
          threadOpen ? 'hidden' : 'flex'
        )}
      >
        <div className="flex min-h-12 items-center justify-between bg-background px-3 py-2">
          <span className="font-medium text-gray-600 text-sm">
            Conversations
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={startNewMessage}
            aria-label="New message"
            title="New message"
            className="size-11 text-gray-500 sm:size-10"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>
        {conversations.length === 0 ? (
          <p className="px-3 py-8 text-center text-gray-500 text-sm">
            No conversations yet.
          </p>
        ) : (
          <ul className="space-y-1 overflow-y-auto p-2">
            {conversations.map((c) => (
              <li key={c.number}>
                <button
                  type="button"
                  data-number={c.number}
                  onClick={handleConversationClick}
                  aria-current={selected === c.number ? 'true' : undefined}
                  className={cn(
                    'min-h-16 w-full px-3 py-3 text-left transition-colors hover:bg-background',
                    selected === c.number && 'bg-background'
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
            <div className="flex min-h-12 items-center gap-2 bg-background px-2 py-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={closeThread}
                aria-label="Back to conversations"
                className="size-11 text-gray-500 sm:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              {composingNew ? (
                <Input
                  type="tel"
                  value={newTo}
                  onChange={handleRecipientChange}
                  placeholder="+15551234567"
                  aria-label="Recipient phone number"
                  className="h-10 min-w-0 flex-1 bg-background sm:max-w-56"
                />
              ) : (
                <span className="font-medium text-gray-900 text-sm">
                  {selected}
                </span>
              )}
              {selected ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={refreshThread}
                  aria-label="Refresh conversation"
                  title="Refresh"
                  className="ml-auto size-11 text-gray-500 sm:size-10"
                  loading={loadingThread}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <div
              className="relative flex-1 space-y-2 overflow-y-auto bg-card px-3 py-4 sm:px-5"
              aria-busy={loadingThread}
            >
              {loadingThread && messages.length === 0 ? (
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
              {loadingThread && messages.length > 0 ? (
                <div className="pointer-events-none sticky bottom-2 ml-auto flex w-fit items-center gap-2 border border-border bg-background px-3 py-2 text-gray-500 text-xs">
                  <Spinner className="h-3 w-3" />
                  Refreshing
                </div>
              ) : null}
              <div ref={threadEnd} />
            </div>

            <form
              className="sticky bottom-0 z-10 flex items-end gap-2 bg-background px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3"
              onSubmit={handleSendSubmit}
            >
              {displayNumber ? (
                <span className="hidden h-9 shrink-0 items-center border border-gray-200 bg-gray-050 px-2 text-gray-600 text-xs sm:flex">
                  {displayNumber}
                </span>
              ) : null}
              <Textarea
                value={body}
                onChange={handleBodyChange}
                rows={1}
                placeholder="Write a message…"
                aria-label="Message body"
                className="max-h-32 min-h-11 flex-1 resize-y bg-background"
              />
              <Button
                type="submit"
                size="sm"
                className="h-11 shrink-0 px-3 sm:h-9"
                loading={sending}
                loadingLabel={<span className="sr-only">Sending</span>}
                disabled={
                  sending ||
                  !phoneNumber ||
                  !body.trim() ||
                  (composingNew && !newTo.trim())
                }
              >
                Send
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

function ConnectCall({
  phoneNumber,
  phoneDisplayNumber,
}: {
  phoneNumber: string | null
  phoneDisplayNumber: string | null
}) {
  const targetId = useId()
  const [target, setTarget] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [placing, setPlacing] = useState(false)
  const displayNumber = phoneDisplayNumber ?? phoneNumber
  const targetErrorId = `${targetId}-error`

  const trimmed = target.trim()
  const validTarget = isE164(trimmed)

  const place = useCallback(async () => {
    setPlacing(true)
    try {
      const res = await fetch('/api/printing-press/phone/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: trimmed }),
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
  }, [trimmed])

  const handleTargetChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setTarget(event.target.value),
    []
  )

  const handleCallSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (validTarget && phoneNumber) setConfirming(true)
    },
    [phoneNumber, validTarget]
  )

  const handleConfirmingChange = useCallback(
    (open: boolean) => {
      if (!open && !placing) setConfirming(false)
    },
    [placing]
  )

  return (
    <section className="max-w-xl border border-border bg-card p-5 sm:p-7">
      <div className="max-w-md space-y-2">
        <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight">
          Call from the desk
        </h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Your phone rings first. Pick up and Twilio dials the destination, then
          bridges the two calls.
        </p>
      </div>
      <form className="mt-6 max-w-md space-y-5" onSubmit={handleCallSubmit}>
        {displayNumber ? (
          <p className="bg-background px-3 py-2.5 text-gray-600 text-sm">
            Caller ID{' '}
            <span className="font-mono text-gray-950">{displayNumber}</span>
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={targetId}>Destination number</Label>
          <Input
            id={targetId}
            type="tel"
            value={target}
            onChange={handleTargetChange}
            placeholder="+15551234567"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={trimmed && !validTarget ? true : undefined}
            aria-describedby={
              trimmed && !validTarget ? targetErrorId : undefined
            }
            className="h-11 bg-background sm:h-10"
          />
          {trimmed && !validTarget && (
            <p id={targetErrorId} className="text-red text-xs">
              Enter an E.164 number, for example +15551234567.
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={!validTarget || !phoneNumber}
          className="h-11 w-full sm:w-auto"
        >
          <Phone className="h-4 w-4" />
          Connect a call
        </Button>
      </form>

      <AlertDialog open={confirming} onOpenChange={handleConfirmingChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Place this call</AlertDialogTitle>
            <AlertDialogDescription>
              This starts a real phone call immediately. Twilio calls your phone
              first; when you answer, it dials {trimmed} and connects the two of
              you. The destination sees {displayNumber} as the caller ID.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={placing}>Stay here</AlertDialogCancel>
            <Button
              type="button"
              onClick={place}
              loading={placing}
              loadingLabel="Calling"
            >
              Call my phone
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
