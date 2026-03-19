'use client'

import { useChat } from '@ai-sdk/react'
import { PanelRight, PanelRightClose, RotateCcw, X } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useRef } from 'react'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatMessage, ThinkingIndicator } from '@/components/chat/chat-message'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

export function ChatSidebar() {
  const {
    open,
    pinned,
    initialQuery,
    savedMessages,
    chatId,
    closeSidebar,
    togglePin,
    saveMessages,
    clearMessages,
  } = useChatSidebar()
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
    experimental_throttle: 50,
    onFinish: () => {
      // Save after each complete response — read latest from useChat
      saveMessagesFromRef()
    },
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasSentInitialRef = useRef(false)
  const lastInitialQueryRef = useRef('')
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const saveMessagesFromRef = useCallback(() => {
    if (messagesRef.current.length > 0) {
      saveMessages(messagesRef.current)
    }
  }, [saveMessages])

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

  // Send initial query when sidebar opens with a query
  useEffect(() => {
    if (open && initialQuery && initialQuery !== lastInitialQueryRef.current) {
      lastInitialQueryRef.current = initialQuery
      if (!hasSentInitialRef.current) {
        hasSentInitialRef.current = true
        setMessages([])
        // Delay to ensure clean state
        setTimeout(() => {
          sendMessage({ text: initialQuery })
        }, 50)
      }
    }
    if (!open) {
      hasSentInitialRef.current = false
    }
  }, [open, initialQuery, sendMessage, setMessages])

  // Auto-scroll when messages update or status changes
  useEffect(() => {
    if (messages.length > 0 || status === 'submitted') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  // Lock body scroll on mobile when open (not pinned)
  useEffect(() => {
    if (!open || pinned) return
    const isMobile = window.innerWidth < 640
    if (!isMobile) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
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
    clearMessages()
    setMessages([])
    lastInitialQueryRef.current = ''
  }, [clearMessages, setMessages])

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text })
    },
    [sendMessage]
  )

  const handleRetry = useCallback(() => {
    regenerate()
  }, [regenerate])

  const isStreaming = status === 'streaming'
  const isSubmitted = status === 'submitted'
  const isError = status === 'error'

  return (
    <>
      {/* Mobile backdrop — hidden when pinned */}
      {open && !pinned && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={closeSidebar}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') closeSidebar()
          }}
          role="button"
          tabIndex={0}
          aria-label="Close chat"
        />
      )}

      {/* Sidebar panel */}
      <div
        className={cn(
          'fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-offwhite-light transition-[transform,box-shadow] duration-300 sm:w-[420px]',
          open ? 'translate-x-0' : 'translate-x-full',
          pinned ? 'shadow-md' : 'shadow-xl'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/images/bell-icon.svg"
              alt="Bell"
              width={20}
              height={20}
            />
            <span className="font-sans text-sm font-semibold text-gray-950">
              Bell
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewConversation}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600"
              aria-label="New conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePin}
              className="hidden rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600 lg:block"
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
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-050 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
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
            {isError && error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-3.5 py-2.5 font-sans text-sm text-red-500">
                  <p className="mb-2">
                    {error.message || 'Something went wrong. Please try again.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="text-xs text-red-400 underline underline-offset-2 transition-colors hover:text-red-600"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={stop}
          isStreaming={isStreaming || isSubmitted}
          focus={open}
        />
      </div>
    </>
  )
}
