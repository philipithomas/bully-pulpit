import type { UIMessage } from 'ai'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

function renderInlineMarkdown(text: string) {
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
      // Link — use Next Link for local URLs
      const isLocal = match[2].startsWith('/')
      parts.push(
        isLocal ? (
          <Link
            key={key}
            href={match[2]}
            className="editorial-link hover:bg-[length:100%_1px]"
          >
            {match[1]}
          </Link>
        ) : (
          <a
            key={key}
            href={match[2]}
            className="editorial-link hover:bg-[length:100%_1px]"
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

function renderMarkdownBlock(text: string) {
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
          {renderInlineMarkdown(paraLines.join(' '))}
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
              {renderInlineMarkdown(item)}
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
          {renderInlineMarkdown(heading)}
        </p>
      )
      i++
      continue
    }

    i++
  }

  return elements
}

export function ChatMessage({
  message,
  isStreaming,
}: {
  message: UIMessage
  isStreaming: boolean
}) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
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
                {renderMarkdownBlock(part.text)}
                {isStreaming &&
                  !isUser &&
                  i === message.parts.length - 1 &&
                  part.state === 'streaming' && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-full bg-gray-400" />
                  )}
              </div>
            )
          }

          // Tool invocation - show searching indicator while pending
          if ('state' in part && part.type.startsWith('tool-')) {
            const { state } = part
            if (state === 'input-available' || state === 'input-streaming') {
              return (
                <p key={key} className="my-2 font-sans text-xs text-gray-400">
                  Searching...
                </p>
              )
            }
            // Hide tool result once output is available
            return null
          }

          return null
        })}
      </div>
    </div>
  )
}
