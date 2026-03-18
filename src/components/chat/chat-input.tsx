'use client'

import { ArrowUp, Square } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  focus,
}: {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  focus?: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focus) textareaRef.current?.focus()
  }, [focus])

  const handleSubmit = useCallback(() => {
    const value = textareaRef.current?.value.trim()
    if (!value || isStreaming) return
    onSend(value)
    if (textareaRef.current) {
      textareaRef.current.value = ''
      textareaRef.current.style.height = 'auto'
    }
  }, [onSend, isStreaming])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // Max 4 lines (~80px)
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`
  }, [])

  return (
    <div className="flex items-end gap-2 border-t border-gray-100 p-3">
      <textarea
        ref={textareaRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask a question..."
        rows={1}
        disabled={isStreaming}
        className="flex-1 resize-none bg-transparent py-1 font-sans text-sm leading-tight text-gray-950 outline-none placeholder:text-gray-400 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={isStreaming ? onStop : handleSubmit}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
          isStreaming
            ? 'bg-gray-950 text-white'
            : 'bg-gray-950 text-white hover:bg-gray-800'
        )}
        aria-label={isStreaming ? 'Stop' : 'Send'}
      >
        {isStreaming ? (
          <Square className="h-3 w-3" />
        ) : (
          <ArrowUp className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
