'use client'

import { useChat } from '@ai-sdk/react'
import { RotateCcw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { ChatInput } from '@/components/chat/chat-input'
import { ChatMessage, ThinkingIndicator } from '@/components/chat/chat-message'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

export function ChatSidebar() {
  const { open, initialQuery, closeSidebar } = useChatSidebar()
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
    error,
    regenerate,
  } = useChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const hasSentInitialRef = useRef(false)
  const lastInitialQueryRef = useRef('')

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

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!open) return
    const isMobile = window.innerWidth < 640
    if (!isMobile) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const handleNewConversation = useCallback(() => {
    setMessages([])
    lastInitialQueryRef.current = ''
  }, [setMessages])

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
      {/* Mobile backdrop */}
      {open && (
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
          'fixed top-0 right-0 z-50 flex h-full w-full flex-col bg-white shadow-xl transition-transform duration-300 sm:w-[420px]',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gray-400" />
            <span className="font-sans text-sm font-semibold text-gray-950">
              Ask AI
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
        />
      </div>
    </>
  )
}
