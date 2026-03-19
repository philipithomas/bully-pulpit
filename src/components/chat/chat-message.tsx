import type { UIMessage } from 'ai'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

function renderInlineMarkdown(text: string, onLocalLinkClick?: () => void) {
  // Split into segments: links, bold, italic, inline code
  const parts: ReactNode[] = []
  // Match: [text](url), **bold**, *italic*, `code`
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while (true) {
    match = regex.exec(text)
    if (!match) break

    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const key = `${match.index}`
    if (match[1] && match[2]) {
      // Normalize site URLs to relative paths for client-side navigation
      const href = match[2]
        .replace(/^https?:\/\/(www\.)?philipithomas\.com/, '')
        .replace(/^$/, '/')
      const isLocal = href.startsWith('/')
      parts.push(
        isLocal ? (
          <Link
            key={key}
            href={href}
            className="underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-current"
            onClick={onLocalLinkClick}
          >
            {match[1]}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-current"
          >
            {match[1]}
          </a>
        )
      )
    } else if (match[3]) {
      // Bold
      parts.push(<strong key={key}>{match[3]}</strong>)
    } else if (match[4]) {
      // Italic
      parts.push(<em key={key}>{match[4]}</em>)
    } else if (match[5]) {
      // Inline code
      parts.push(
        <code
          key={key}
          className="rounded bg-gray-050 px-1 py-0.5 font-mono text-[0.875em]"
        >
          {match[5]}
        </code>
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

function renderMarkdownBlock(text: string, onLocalLinkClick?: () => void) {
  const lines = text.split('\n')
  const elements: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines
    if (line.trim() === '') {
      i++
      continue
    }

    // Collect paragraph lines (non-empty, non-list, non-heading)
    if (
      !line.startsWith('- ') &&
      !line.startsWith('* ') &&
      !line.startsWith('#')
    ) {
      const paraLines: string[] = []
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].startsWith('- ') &&
        !lines[i].startsWith('* ') &&
        !lines[i].startsWith('#')
      ) {
        paraLines.push(lines[i])
        i++
      }
      elements.push(
        <p key={i} className="mb-3 last:mb-0">
          {renderInlineMarkdown(paraLines.join(' '), onLocalLinkClick)}
        </p>
      )
      continue
    }

    // List items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (
        i < lines.length &&
        (lines[i].startsWith('- ') || lines[i].startsWith('* '))
      ) {
        items.push(lines[i].slice(2))
        i++
      }
      elements.push(
        <ul key={i} className="mb-3 list-disc pl-5 last:mb-0">
          {items.map((item) => (
            <li key={item} className="mb-1">
              {renderInlineMarkdown(item, onLocalLinkClick)}
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Headings (just make them bold)
    if (line.startsWith('#')) {
      const heading = line.replace(/^#{1,6}\s+/, '')
      elements.push(
        <p key={i} className="mb-2 font-sans font-semibold">
          {renderInlineMarkdown(heading, onLocalLinkClick)}
        </p>
      )
      i++
      continue
    }

    i++
  }

  return elements
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="h-1 w-1 animate-pulse rounded-full bg-gray-300" />
      <span
        className="h-1 w-1 animate-pulse rounded-full bg-gray-300"
        style={{ animationDelay: '200ms' }}
      />
      <span
        className="h-1 w-1 animate-pulse rounded-full bg-gray-300"
        style={{ animationDelay: '400ms' }}
      />
    </span>
  )
}

function ToolStatus({ label, done }: { label: string; done?: boolean }) {
  return (
    <div className="my-1.5 flex items-center gap-2 font-sans text-xs text-gray-400">
      {done ? (
        <span className="inline-flex h-2.5 w-2.5 items-center justify-center text-[8px] text-gray-300">
          ✓
        </span>
      ) : (
        <PulsingDots />
      )}
      {label}
    </div>
  )
}

function BellAvatar() {
  return (
    <Image
      src="/images/bell.jpg"
      alt="Bell"
      width={24}
      height={24}
      className="mt-2.5 shrink-0 rounded-full"
    />
  )
}

export function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-2.5">
      <BellAvatar />
      <div className="rounded-lg px-1 py-2.5">
        <PulsingDots />
      </div>
    </div>
  )
}

export function ChatMessage({
  message,
  isStreaming,
}: {
  message: UIMessage
  isStreaming: boolean
}) {
  const isUser = message.role === 'user'

  const handleLocalLinkClick = () => {
    if (window.innerWidth >= 1024) {
      useChatSidebar.getState().setPinned(true)
    }
  }

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'items-start gap-2.5')}>
      {!isUser && <BellAvatar />}
      <div
        className={cn(
          'min-w-0 max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-gray-050 font-sans text-gray-950'
            : 'font-serif text-gray-950'
        )}
      >
        {message.parts.map((part, i) => {
          const key = `${message.id}-${i}`

          if (part.type === 'text') {
            return (
              <div key={key}>
                {renderMarkdownBlock(part.text, handleLocalLinkClick)}
                {isStreaming &&
                  !isUser &&
                  i === message.parts.length - 1 &&
                  part.state === 'streaming' && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-full bg-gray-400" />
                  )}
              </div>
            )
          }

          // Tool invocation — show status for every state
          if ('state' in part && part.type.startsWith('tool-')) {
            const state = (part as { state: string }).state
            const done = state === 'output-available'

            if (state === 'output-error') {
              const errorText =
                'errorText' in part ? (part.errorText as string) : null
              return (
                <p key={key} className="my-1.5 font-sans text-xs text-red-400">
                  {errorText || 'Something went wrong with this step.'}
                </p>
              )
            }

            // Get tool input for descriptive labels
            const input =
              'input' in part
                ? (part.input as Record<string, string> | undefined)
                : undefined

            if (part.type === 'tool-fetchPost') {
              return (
                <ToolStatus
                  key={key}
                  done={done}
                  label={
                    input?.slug
                      ? `${done ? 'Read' : 'Reading'} ${input.slug}`
                      : done
                        ? 'Read post'
                        : 'Reading post...'
                  }
                />
              )
            }

            // searchPosts (default)
            const query = input?.query
            const truncated =
              query && query.length > 40 ? `${query.slice(0, 40)}...` : query
            return (
              <ToolStatus
                key={key}
                done={done}
                label={
                  truncated
                    ? `${done ? 'Searched' : 'Searching'} "${truncated}"`
                    : done
                      ? 'Searched posts'
                      : 'Searching...'
                }
              />
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
