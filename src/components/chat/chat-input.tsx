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
    // items-end keeps the field and the square button bottom-aligned as the
    // textarea grows. The field is wrapped in a bordered box that shares the
    // button's 40px height (min-h-10) at a single line, so the two controls
    // read as one row instead of a short borderless textarea floating above a
    // taller button. Square corners and warm tokens, matching the search input.
    <div className="flex items-end gap-2 border-t border-gray-100 p-3">
      <div className="flex min-h-10 flex-1 items-center border border-gray-200 bg-card px-3">
        <textarea
          ref={textareaRef}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask a question…"
          aria-label="Ask Bell a question"
          rows={1}
          disabled={isStreaming}
          className="w-full resize-none bg-transparent py-2 font-sans text-sm leading-tight text-gray-950 placeholder:text-gray-400 disabled:opacity-50"
        />
      </div>
      <button
        type="button"
        onClick={isStreaming ? onStop : handleSubmit}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center transition-colors',
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
