import type { UIMessage } from 'ai'
import Image from 'next/image'
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

interface ToolImage {
  id?: string
  src: string
  alt?: string
  url?: string
  description?: string
}

interface ToolResultWithImages {
  title?: string
  url?: string
  coverImage?: string
  image?: ToolImage
  images?: ToolImage[]
}

function parseToolOutput(output: unknown): ToolResultWithImages[] {
  const parsed =
    typeof output === 'string'
      ? (() => {
          try {
            return JSON.parse(output) as unknown
          } catch {
            return null
          }
        })()
      : output
  if (Array.isArray(parsed)) return parsed as ToolResultWithImages[]
  if (parsed && typeof parsed === 'object')
    return [parsed as ToolResultWithImages]
  return []
}

function ToolImageResults({
  output,
  onLocalLinkClick,
}: {
  output: unknown
  onLocalLinkClick?: () => void
}) {
  const cards = parseToolOutput(output)
    .flatMap((result) => {
      const images =
        result.image !== undefined
          ? [result.image]
          : result.images && result.images.length > 0
            ? result.images
            : result.coverImage
              ? [
                  {
                    src: result.coverImage,
                    alt: result.title,
                    url: result.url,
                    description: result.title,
                  },
                ]
              : []
      return images.map((image) => ({
        src: image.src,
        alt: image.alt || result.title || 'Search result image',
        url: image.url || result.url || '/',
        label: image.description || image.alt || result.title || 'Image',
      }))
    })
    .filter((image) => image.src)
    .filter(
      (image, index, all) =>
        all.findIndex((candidate) => candidate.src === image.src) === index
    )
    .slice(0, 4)

  if (cards.length === 0) return null

  return (
    <div className="my-2 grid grid-cols-2 gap-2 font-sans">
      {cards.map((image) => (
        <Link
          key={image.src}
          href={image.url}
          onClick={onLocalLinkClick}
          className="group min-w-0"
        >
          <Image
            src={image.src}
            alt={image.alt}
            width={160}
            height={120}
            sizes="(max-width: 640px) 40vw, 160px"
            className="aspect-[4/3] w-full rounded-sm object-cover"
          />
          <span className="mt-1 block truncate text-xs text-gray-500 transition-colors group-hover:text-gray-950">
            {image.label}
          </span>
        </Link>
      ))}
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
        // misses fences without a language tag). gray-100/gray-075 instead
        // of gray-050, which disappears against the offwhite panel.
        code: (props: ComponentPropsWithoutRef<'code'>) => (
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.875em]">
            {props.children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded bg-gray-075 p-3 font-mono text-[0.8125em] last:mb-0 [&_code]:block [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]">
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
          'min-w-0 max-w-[85%] wrap-anywhere rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
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
              const output = 'output' in part ? part.output : undefined
              return (
                <div key={key}>
                  <ToolStatus
                    done={done}
                    label={
                      input?.slug
                        ? `${done ? 'Read' : 'Reading'} ${input.slug}`
                        : done
                          ? 'Read post'
                          : 'Reading post…'
                    }
                  />
                  {done && (
                    <ToolImageResults
                      output={output}
                      onLocalLinkClick={handleLocalLinkClick}
                    />
                  )}
                </div>
              )
            }

            if (part.type === 'tool-fetchPage') {
              return (
                <div key={key}>
                  <ToolStatus
                    done={done}
                    label={
                      input?.path
                        ? `${done ? 'Read' : 'Reading'} ${input.path}`
                        : done
                          ? 'Read page'
                          : 'Reading page…'
                    }
                  />
                </div>
              )
            }

            // searchPosts (default)
            const query = input?.query
            const truncated =
              query && query.length > 40 ? `${query.slice(0, 40)}…` : query
            const output = 'output' in part ? part.output : undefined
            return (
              <div key={key}>
                <ToolStatus
                  done={done}
                  label={
                    truncated
                      ? `${done ? 'Searched' : 'Searching'} "${truncated}"`
                      : done
                        ? 'Searched posts'
                        : 'Searching…'
                  }
                />
                {done && (
                  <ToolImageResults
                    output={output}
                    onLocalLinkClick={handleLocalLinkClick}
                  />
                )}
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
