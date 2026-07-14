import type { UIMessage } from 'ai'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  useCallback,
  useState,
} from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Spinner } from '@/components/ui/spinner'
import {
  type AnalyticsNewsletter,
  analyticsPageType,
  parseAnalyticsNewsletter,
  summarizeNewsletters,
  type TurnBucket,
  trackClientEvent,
} from '@/lib/analytics/events'
import { scrubLeakedToolJson } from '@/lib/chat/scrub-leaked-tool-json'
import {
  type BellSource,
  bellSourcesFromMessage,
} from '@/lib/chat/source-results'
import { cn } from '@/lib/utils'
import { isScriptedChatMessage, useChatSidebar } from '@/stores/chat-store'

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
  newsletter?: string
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
  onCitationClick,
}: {
  output: unknown
  onCitationClick?: (newsletter: AnalyticsNewsletter) => void
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
        newsletter: parseAnalyticsNewsletter(result.newsletter),
      }))
    })
    .filter((image) => image.src)
    .filter(
      (image, index, all) =>
        all.findIndex((candidate) => candidate.src === image.src) === index
    )
    .slice(0, 4)

  const handleCitationClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onCitationClick?.(
        parseAnalyticsNewsletter(event.currentTarget.dataset.citationNewsletter)
      )
    },
    [onCitationClick]
  )

  if (cards.length === 0) return null

  return (
    <div className="my-2 grid grid-cols-2 gap-2 font-sans">
      {cards.map((image) => (
        <Link
          key={image.src}
          href={image.url}
          data-citation-newsletter={image.newsletter}
          onClick={handleCitationClick}
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

type SourceCitationClick = (
  destinationType: 'post' | 'page' | 'image' | 'external',
  newsletter: AnalyticsNewsletter
) => void

function sourceNewsletterLabel(newsletter: string | undefined): string | null {
  if (!newsletter || newsletter === 'page') return null
  if (
    newsletter !== 'contraption' &&
    newsletter !== 'workshop' &&
    newsletter !== 'postcard' &&
    newsletter !== 'tsundoku'
  ) {
    return null
  }
  return `${newsletter.charAt(0).toUpperCase()}${newsletter.slice(1)}`
}

function sourceTitle(source: BellSource): string {
  return [
    source.title,
    source.publishedAt,
    sourceNewsletterLabel(source.newsletter),
    source.section ? `Section: ${source.section}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function SourceChips({
  sources,
  onCitationClick,
}: {
  sources: BellSource[]
  onCitationClick: SourceCitationClick
}) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const sourceType = event.currentTarget.dataset.sourceType
      const destinationType =
        sourceType === 'page' ||
        sourceType === 'image' ||
        sourceType === 'external'
          ? sourceType
          : 'post'
      onCitationClick(
        destinationType,
        parseAnalyticsNewsletter(event.currentTarget.dataset.sourceNewsletter)
      )
    },
    [onCitationClick]
  )

  if (sources.length === 0) return null

  return (
    <div className="mt-3 border-gray-100 border-t pt-2.5 font-sans">
      <p className="mb-1.5 text-[11px] text-gray-400">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => {
          const newsletter = sourceNewsletterLabel(source.newsletter)
          const content = (
            <>
              <span className="truncate font-medium">{source.title}</span>
              {source.publishedAt ? (
                <time className="shrink-0 text-gray-400">
                  {source.publishedAt}
                </time>
              ) : null}
              {newsletter ? (
                <span className="shrink-0 text-gray-400">{newsletter}</span>
              ) : null}
              {source.section ? (
                <span className="max-w-28 shrink truncate text-gray-400">
                  § {source.section}
                </span>
              ) : null}
            </>
          )
          const props = {
            title: sourceTitle(source),
            'data-source-type': source.type,
            'data-source-newsletter': source.newsletter,
            onClick: handleClick,
            className:
              'group inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-100 px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:border-gray-200 hover:text-gray-950',
          }
          return source.type === 'external' ? (
            <a
              key={`${source.url}-${source.title}`}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {content}
            </a>
          ) : (
            <Link
              key={`${source.url}-${source.title}`}
              href={source.url}
              {...props}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

type FeedbackRating = 'helpful' | 'not_helpful'

function BellFeedback({
  turn,
  hadSources,
}: {
  turn: TurnBucket
  hadSources: boolean
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(null)

  const chooseRating = useCallback(
    (nextRating: FeedbackRating) => {
      if (rating) return
      setRating(nextRating)
      trackClientEvent('Bell feedback submitted', {
        surface: 'web',
        rating: nextRating,
        turn,
        had_sources: hadSources,
      })
    },
    [hadSources, rating, turn]
  )
  const chooseHelpful = useCallback(
    () => chooseRating('helpful'),
    [chooseRating]
  )
  const chooseNotHelpful = useCallback(
    () => chooseRating('not_helpful'),
    [chooseRating]
  )

  return (
    <div className="mt-2 flex items-center gap-1 font-sans text-[11px] text-gray-400">
      <span className="mr-0.5">Helpful?</span>
      <button
        type="button"
        aria-label="Helpful"
        aria-pressed={rating === 'helpful'}
        disabled={rating !== null}
        onClick={chooseHelpful}
        className={cn(
          'p-1 transition-colors hover:text-gray-700 disabled:cursor-default',
          rating === 'helpful' && 'text-gray-700'
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        aria-pressed={rating === 'not_helpful'}
        disabled={rating !== null}
        onClick={chooseNotHelpful}
        className={cn(
          'p-1 transition-colors hover:text-gray-700 disabled:cursor-default',
          rating === 'not_helpful' && 'text-gray-700'
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {rating ? <span className="ml-1">Thank you.</span> : null}
    </div>
  )
}

const linkClass =
  'underline decoration-gray-300 underline-offset-2 transition-colors hover:decoration-current'

type MarkdownCitationClick = (
  destinationType: 'post' | 'page' | 'external' | 'unknown',
  newsletter: AnalyticsNewsletter
) => void

function TrackedMarkdownLink({
  href,
  children,
  onCitationClick,
}: {
  href?: string
  children: React.ReactNode
  onCitationClick?: MarkdownCitationClick
}) {
  const normalized = (href ?? '')
    .replace(/^https?:\/\/(www\.)?philipithomas\.com/, '')
    .replace(/^$/, '/')
  const isLocal = normalized.startsWith('/')
  const pageType = analyticsPageType(normalized.split(/[?#]/)[0])
  const destinationType =
    pageType === 'post' ? ('post' as const) : ('page' as const)
  const firstSegment = normalized.split('/').filter(Boolean)[0]
  const newsletter = firstSegment
    ? summarizeNewsletters([firstSegment])
    : 'unknown'
  const handleLocalClick = useCallback(() => {
    onCitationClick?.(destinationType, newsletter)
  }, [destinationType, newsletter, onCitationClick])
  const handleExternalClick = useCallback(() => {
    onCitationClick?.('external', 'unknown')
  }, [onCitationClick])

  if (isLocal) {
    return (
      <Link href={normalized} className={linkClass} onClick={handleLocalClick}>
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
      onClick={handleExternalClick}
    >
      {children}
    </a>
  )
}

function ChatMarkdown({
  text,
  onCitationClick,
}: {
  text: string
  onCitationClick?: MarkdownCitationClick
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
        a: ({ href, children }) => (
          <TrackedMarkdownLink href={href} onCitationClick={onCitationClick}>
            {children}
          </TrackedMarkdownLink>
        ),
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
  turn,
}: {
  message: UIMessage
  isStreaming: boolean
  turn: TurnBucket
}) {
  const isUser = message.role === 'user'
  const isScripted = !isUser && isScriptedChatMessage(message)
  const sources = isUser || isScripted ? [] : bellSourcesFromMessage(message)
  const hasAssistantText =
    !isUser &&
    message.parts.some(
      (part) => part.type === 'text' && part.text.trim().length > 0
    )

  const handleCitationClick = useCallback(
    (
      destinationType: 'post' | 'page' | 'image' | 'external' | 'unknown',
      newsletter: AnalyticsNewsletter
    ) => {
      if (window.innerWidth >= 1024) {
        useChatSidebar.getState().setPinned(true)
      }
      trackClientEvent('Bell citation selected', {
        surface: 'web',
        destination_type: destinationType,
        newsletter,
      })
    },
    []
  )

  const handleImageCitationClick = useCallback(
    (newsletter: AnalyticsNewsletter) => {
      handleCitationClick('image', newsletter)
    },
    [handleCitationClick]
  )

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
                  onCitationClick={isUser ? undefined : handleCitationClick}
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

            if (part.type === 'tool-listPosts') {
              return (
                <ToolStatus
                  key={key}
                  done={done}
                  label={done ? 'Listed posts' : 'Listing posts…'}
                />
              )
            }

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
                      onCitationClick={handleImageCitationClick}
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

            if (part.type === 'tool-fetchPublicUrl') {
              let hostname: string | null = null
              try {
                hostname = input?.url ? new URL(input.url).hostname : null
              } catch {
                hostname = input?.url?.slice(0, 40) ?? null
              }
              return (
                <ToolStatus
                  key={key}
                  done={done}
                  label={
                    hostname
                      ? `${done ? 'Read' : 'Reading'} ${hostname}`
                      : done
                        ? 'Read public page'
                        : 'Reading public page…'
                  }
                />
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
                    onCitationClick={handleImageCitationClick}
                  />
                )}
              </div>
            )
          }

          return null
        })}
        {!isUser && !isScripted && (
          <SourceChips
            sources={sources}
            onCitationClick={handleCitationClick}
          />
        )}
        {hasAssistantText && !isStreaming && !isScripted && (
          <BellFeedback turn={turn} hadSources={sources.length > 0} />
        )}
      </div>
    </div>
  )
}
