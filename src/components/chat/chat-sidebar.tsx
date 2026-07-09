'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { PanelRight, PanelRightClose, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatMessage, ThinkingIndicator } from '@/components/chat/chat-message'
import {
  analyticsPageType,
  bucketTurn,
  trackClientEvent,
} from '@/lib/analytics/events'
import { chatErrorMessage } from '@/lib/chat/chat-error-message'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

function messageText(message: { parts: UIMessage['parts'] }) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim()
}

function WelcomeScreen({
  userName,
  onSuggestionSelect,
}: {
  userName?: string | null
  onSuggestionSelect: (suggestion: string) => void
}) {
  const handleSuggestionClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onSuggestionSelect(event.currentTarget.value)
    },
    [onSuggestionSelect]
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <Image src="/images/bell.svg" alt="Bell" width={48} height={48} />
      <div>
        <p className="font-sans text-sm font-semibold text-gray-950">
          {userName ? `Hey ${userName}, this is Bell.` : 'Hey, this is Bell.'}
        </p>
        <p className="mt-1 font-serif text-sm text-gray-500">
          I can search Philip&apos;s writing and photos, then answer questions
          about his essays and projects.
        </p>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {[
          'Summarize this page',
          'Photos of coffee',
          'All mentions of craft-focused books',
        ].map((q) => (
          <button
            key={q}
            type="button"
            value={q}
            onClick={handleSuggestionClick}
            className="rounded-full border border-gray-100 px-3 py-1.5 font-sans text-xs text-gray-600 transition-colors hover:border-gray-200 hover:text-gray-950"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatSidebar() {
  const {
    open,
    pinned,
    initialQuery,
    entrySource,
    savedMessages,
    pendingLocalMessage,
    chatId,
    closeSidebar,
    togglePin,
    setActiveChatStop,
    saveMessages,
    clearMessages,
    consumePendingLocalMessage,
    consumeInitialQuery,
    syncConversationIdentity,
  } = useChatSidebar()
  const { user, loading: authLoading } = useAuthContext()
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          pageContext: {
            path: window.location.pathname,
            title: document.title,
          },
        }),
        prepareSendMessagesRequest: ({
          id,
          messages: requestMessages,
          trigger,
          messageId,
          body,
        }) => ({
          body: {
            ...body,
            id,
            messages: requestMessages,
            trigger,
            messageId,
            // One generation attempt per transport request. The server uses
            // this UUID as an idempotency key without trusting the browser's
            // conversation or message IDs as an attempt identity.
            requestId: crypto.randomUUID(),
          },
        }),
      }),
    []
  )

  // Screen reader announcement for the latest completed reply. Set once per
  // finished message (not per streamed token) so the live region announces
  // each reply exactly once instead of re-reading partial text on every chunk.
  const [announcement, setAnnouncement] = useState('')

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    regenerate,
  } = useChat({
    id: chatId,
    transport,
    experimental_throttle: 50,
    onFinish: ({ message, isAbort, isError }) => {
      saveMessagesFromRef()
      if (isAbort || isError || message.role !== 'assistant') return
      const text = messageText(message)
      if (text) setAnnouncement(text)
    },
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const lastHandoffChatIdRef = useRef('')
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const userRef = useRef(user)
  userRef.current = user

  // Keep the current AI SDK Chat instance stoppable from store actions that
  // rotate chatId. Calling stop after the rotation would target the new empty
  // instance and leave the superseded request streaming.
  useEffect(() => {
    setActiveChatStop(stop)
    return () => setActiveChatStop(null)
  }, [setActiveChatStop, stop])

  // A durable browser conversation belongs to exactly one resolved auth
  // identity. Initial auth hydration adopts the existing identity marker;
  // subsequent sign-outs and account switches stop the old chat, rotate its
  // ID, and clear its transcript before another message can be sent.
  useEffect(() => {
    if (authLoading) return
    const identity = user ? `subscriber:${user.uuid}` : 'anonymous'
    if (!syncConversationIdentity(identity)) return
    stop()
    setMessages([])
  }, [authLoading, setMessages, stop, syncConversationIdentity, user])

  // Count an open once per visible session. Search handoffs and the header
  // share the same panel but represent meaningfully different entry points.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      trackClientEvent('Bell opened', {
        entry_source: entrySource,
        signed_in: Boolean(user),
        page_type: analyticsPageType(window.location.pathname),
      })
    }
    wasOpenRef.current = open
  }, [entrySource, open, user])

  const saveMessagesFromRef = useCallback(() => {
    if (messagesRef.current.length > 0) {
      saveMessages(chatId, messagesRef.current)
    }
  }, [chatId, saveMessages])

  // Hydrate useChat from sessionStorage on mount (once).
  // Uses refs so the effect deps stay empty without lying to the linter.
  const savedMessagesRef = useRef(savedMessages)
  const setMessagesRef = useRef(setMessages)
  const hasHydratedRef = useRef(false)
  useEffect(() => {
    if (hasHydratedRef.current) return
    hasHydratedRef.current = true
    if (savedMessagesRef.current.length > 0) {
      setMessagesRef.current(savedMessagesRef.current)
    }
  }, [])

  // Local system-owned welcomes render directly without sending a prompt to
  // the model. The store stopped the superseded Chat before rotating chatId;
  // this effect installs the welcome into the new instance. This also handles
  // Bell already being mounted but closed.
  useEffect(() => {
    if (!open || !pendingLocalMessage) return
    setMessages([pendingLocalMessage])
    const text = messageText(pendingLocalMessage)
    if (text) setAnnouncement(text)
    consumePendingLocalMessage(chatId)
  }, [
    chatId,
    consumePendingLocalMessage,
    open,
    pendingLocalMessage,
    setMessages,
  ])

  // Send an initial search query once for the fresh chat ID created by the
  // handoff. Mark it consumed only when the timer fires: auth hydration can
  // otherwise cancel the effect between clearing the old transcript and
  // sending the query, leaving Bell open with an empty thread.
  useEffect(() => {
    if (!open || !initialQuery || lastHandoffChatIdRef.current === chatId) {
      return
    }
    setMessages([])
    const timeout = window.setTimeout(() => {
      const state = useChatSidebar.getState()
      if (
        !state.open ||
        state.chatId !== chatId ||
        state.initialQuery !== initialQuery
      ) {
        return
      }
      lastHandoffChatIdRef.current = chatId
      sendMessage({ text: initialQuery })
      consumeInitialQuery(chatId)
      trackClientEvent('Bell message submitted', {
        surface: 'web',
        source: 'search_handoff',
        signed_in: Boolean(userRef.current),
        turn: '1',
      })
    }, 50)
    return () => window.clearTimeout(timeout)
  }, [
    chatId,
    consumeInitialQuery,
    initialQuery,
    open,
    sendMessage,
    setMessages,
  ])

  // Auto-scroll when messages update or status changes. The CSS
  // reduced-motion kill switch cannot reach JS-initiated smooth scrolls, so
  // gate the behavior here too.
  useEffect(() => {
    if (messages.length > 0 || status === 'submitted') {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches
      messagesEndRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    }
  }, [messages, status])

  // Escape key closes sidebar
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, closeSidebar])

  // Lock body scroll on mobile when open (not pinned), and make the page
  // behind the modal inert so focus and screen readers stay inside the
  // dialog. The sidebar renders as a direct child of <header> (a plain
  // `header > div` selector would catch the panel itself), so inert the page
  // regions around it: the skip link, the header container, main, and footer.
  useEffect(() => {
    if (!open || pinned) return
    const isMobile = window.innerWidth < 640
    if (!isMobile) return
    document.body.style.overflow = 'hidden'
    const pageBehind = document.querySelectorAll<HTMLElement>(
      'body > a[href="#content"], header > div.container, main, footer'
    )
    for (const el of pageBehind) {
      el.setAttribute('inert', '')
    }
    return () => {
      document.body.style.overflow = ''
      for (const el of pageBehind) {
        el.removeAttribute('inert')
      }
    }
  }, [open, pinned])

  // Set/remove data-chat-pinned on body
  useEffect(() => {
    if (open && pinned) {
      document.body.dataset.chatPinned = ''
    } else {
      delete document.body.dataset.chatPinned
    }
    return () => {
      delete document.body.dataset.chatPinned
    }
  }, [open, pinned])

  // Auto-unpin when viewport shrinks below lg
  useEffect(() => {
    if (!pinned) return
    const mql = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) {
        useChatSidebar.getState().setPinned(false)
      }
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [pinned])

  const handleNewConversation = useCallback(() => {
    const previousTurns = messagesRef.current.filter(
      (message) => message.role === 'user'
    ).length
    if (previousTurns > 0) {
      trackClientEvent('Bell new conversation', {
        surface: 'web',
        previous_turns: bucketTurn(previousTurns),
      })
    }
    clearMessages()
    setMessages([])
    lastHandoffChatIdRef.current = ''
  }, [clearMessages, setMessages])

  const submitMessage = useCallback(
    (text: string, source: 'composer' | 'suggestion') => {
      const depth =
        messagesRef.current.filter((m) => m.role === 'user').length + 1
      sendMessage({ text })
      trackClientEvent('Bell message submitted', {
        surface: 'web',
        source,
        signed_in: Boolean(user),
        turn: bucketTurn(depth),
      })
    },
    [sendMessage, user]
  )

  const handleSend = useCallback(
    (text: string) => submitMessage(text, 'composer'),
    [submitMessage]
  )

  const handleStop = useCallback(() => {
    const turns = messagesRef.current.filter(
      (message) => message.role === 'user'
    ).length
    trackClientEvent('Bell stopped', {
      surface: 'web',
      turn: bucketTurn(turns),
    })
    stop()
  }, [stop])

  const handleRetry = useCallback(() => {
    const turns = messagesRef.current.filter(
      (message) => message.role === 'user'
    ).length
    trackClientEvent('Bell regenerated', {
      surface: 'web',
      turn: bucketTurn(turns),
    })
    regenerate()
  }, [regenerate])

  const handleBackdropKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') closeSidebar()
    },
    [closeSidebar]
  )

  const isStreaming = status === 'streaming'
  const isSubmitted = status === 'submitted'
  const isError = status === 'error'
  const showWelcome = messages.length === 0 && !isSubmitted

  const handleSuggestionSelect = useCallback(
    (suggestion: string) => submitMessage(suggestion, 'suggestion'),
    [submitMessage]
  )

  return (
    <>
      {/* Mobile backdrop — hidden when pinned */}
      {open && !pinned && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={closeSidebar}
          onKeyDown={handleBackdropKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Close chat"
        />
      )}

      {/* Sidebar panel — inert removes the off-screen panel from the tab
          order and accessibility tree when closed */}
      <div
        inert={!open}
        role="dialog"
        aria-label="Bell chat"
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-offwhite-light transition-[transform,box-shadow] duration-300 sm:w-[420px]',
          // entered paints the first frame closed: the component lazy-mounts
          // already open, and a transition needs a state change to animate.
          open && entered ? 'translate-x-0' : 'translate-x-full',
          pinned ? 'shadow-md' : 'shadow-xl'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/images/bell.svg" alt="Bell" width={20} height={20} />
            <span className="font-sans text-sm font-semibold text-gray-950">
              Bell
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewConversation}
              className="-m-1 p-3 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600"
              aria-label="New conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePin}
              className="-m-1 hidden p-3 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600 lg:block"
              aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            >
              {pinned ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRight className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={closeSidebar}
              className="-m-1 p-3 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-4">
          {showWelcome ? (
            <WelcomeScreen
              userName={user?.name}
              onSuggestionSelect={handleSuggestionSelect}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    isStreaming &&
                    message === messages[messages.length - 1] &&
                    message.role === 'assistant'
                  }
                />
              ))}

              {/* Thinking indicator before streaming starts */}
              {isSubmitted && <ThinkingIndicator />}

              {/* Error message */}
              {isError && Boolean(error) && (
                <div className="flex justify-start">
                  <div className="min-w-0 max-w-[85%] wrap-anywhere rounded-lg px-3.5 py-2.5 font-sans text-sm text-red">
                    <p className="mb-2">{chatErrorMessage(error)}</p>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="text-xs text-red underline underline-offset-2 transition-colors hover:text-red/80"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Polite live region: announces each completed reply once. Wiring
            aria-live to the streaming message list would re-announce the
            growing text on every token. */}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming || isSubmitted}
          focus={open}
        />
      </div>
    </>
  )
}
