import type { UIMessage } from 'ai'
import Link from 'next/link'
import type { ComponentPropsWithoutRef } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Spinner } from '@/components/ui/spinner'
import { scrubLeakedToolJson } from '@/lib/chat/scrub-leaked-tool-json'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

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
        <Spinner className="h-2.5 w-2.5 text-gray-400" />
      )}
      {label}
    </div>
  )
}

const linkClass =
  'underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-current'

function ChatMarkdown({
  text,
  onLocalLinkClick,
}: {
  text: string
  onLocalLinkClick?: () => void
}) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc pl-5 last:mb-0 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal pl-5 last:mb-0 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="mb-1 [&>p]:mb-1 [&>p:last-child]:mb-0">{children}</li>
        ),
        // Real headings, demoted two levels so chat replies do not collide
        // with the page outline. Preflight resets heading font and margin,
        // so these render identically to the styled paragraphs they replace.
        h1: ({ children }) => (
          <h3 className="mb-2 font-sans font-semibold">{children}</h3>
        ),
        h2: ({ children }) => (
          <h4 className="mb-2 font-sans font-semibold">{children}</h4>
        ),
        h3: ({ children }) => (
          <h5 className="mb-2 font-sans font-semibold">{children}</h5>
        ),
        h4: ({ children }) => (
          <h6 className="mb-2 font-sans font-semibold">{children}</h6>
        ),
        h5: ({ children }) => (
          <h6 className="mb-2 font-sans font-semibold">{children}</h6>
        ),
        h6: ({ children }) => (
          <h6 className="mb-2 font-sans font-semibold">{children}</h6>
        ),
        strong: ({ children }) => <strong>{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        // Inline code only — code inside a fence is unstyled here and the
        // styled <pre> wrapper below takes over (className-based detection
        // misses fences without a language tag).
        code: (props: ComponentPropsWithoutRef<'code'>) => (
          <code className="rounded bg-gray-050 px-1 py-0.5 font-mono text-[0.875em]">
            {props.children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded bg-gray-050 p-3 font-mono text-[0.8125em] last:mb-0 [&_code]:block [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-gray-200 border-l-2 pl-3 text-gray-600 italic last:mb-0">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-gray-200" />,
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto last:mb-0">
            <table className="w-full border-collapse font-sans text-xs">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-gray-200 border-b px-2 py-1.5 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-gray-100 border-b px-2 py-1.5 align-top">
            {children}
          </td>
        ),
        input: (props: ComponentPropsWithoutRef<'input'>) =>
          props.type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={props.checked}
              readOnly
              className="mr-1.5 align-middle accent-gray-700"
            />
          ) : null,
        a: ({ href, children }) => {
          const normalized = (href ?? '')
            .replace(/^https?:\/\/(www\.)?philipithomas\.com/, '')
            .replace(/^$/, '/')
          const isLocal = normalized.startsWith('/')
          if (isLocal) {
            return (
              <Link
                href={normalized}
                className={linkClass}
                onClick={onLocalLinkClick}
              >
                {children}
              </Link>
            )
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {children}
            </a>
          )
        },
      }}
    >
      {text}
    </Markdown>
  )
}

export function ThinkingIndicator() {
  return (
    <div className="flex items-start">
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
    <div className={cn('flex', isUser ? 'justify-end' : '')}>
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
                <ChatMarkdown
                  text={isUser ? part.text : scrubLeakedToolJson(part.text)}
                  onLocalLinkClick={handleLocalLinkClick}
                />
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
                <p key={key} className="my-1.5 font-sans text-xs text-red">
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
                        : 'Reading post…'
                  }
                />
              )
            }

            // searchPosts (default)
            const query = input?.query
            const truncated =
              query && query.length > 40 ? `${query.slice(0, 40)}…` : query
            return (
              <ToolStatus
                key={key}
                done={done}
                label={
                  truncated
                    ? `${done ? 'Searched' : 'Searching'} "${truncated}"`
                    : done
                      ? 'Searched posts'
                      : 'Searching…'
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
