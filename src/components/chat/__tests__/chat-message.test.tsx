import type { UIMessage } from 'ai'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatMessage } from '@/components/chat/chat-message'
import { SUBSCRIBER_WELCOME_METADATA } from '@/stores/chat-store'

const CURRENT_PAGE_SOURCE = {
  currentPageSource: {
    type: 'page',
    title: 'Contact',
    url: '/contact',
    publishedAt: null,
    newsletter: 'page',
  },
}

function renderMessage(message: UIMessage): string {
  return renderToStaticMarkup(
    <ChatMessage message={message} isStreaming={false} turn="1" />
  )
}

function renderToolPart(part: unknown): string {
  return renderMessage({
    id: 'tool-answer',
    role: 'assistant',
    parts: [part, { type: 'text', text: 'The latest post.' }],
  } as unknown as UIMessage)
}

describe('ChatMessage Bell tool rendering', () => {
  it('renders chronological listing as a distinct nonvisual tool state', () => {
    const html = renderToolPart({
      type: 'tool-listPosts',
      toolCallId: 'list-posts',
      state: 'output-available',
      input: {
        limit: 1,
        offset: 0,
        filter: { mode: 'only', newsletter: 'workshop' },
      },
      output: JSON.stringify({
        posts: [
          {
            type: 'post',
            title: 'Spring cleaning',
            url: '/spring-cleaning',
            newsletter: 'workshop',
            publishedAt: '2026-06-25',
          },
        ],
        pagination: {
          offset: 0,
          limit: 1,
          total: 1,
          hasMore: false,
          nextOffset: null,
        },
      }),
    })

    expect(html).toContain('Listed posts')
    expect(html).not.toContain('Searched posts')
    expect(html).not.toContain('<img')
    expect(html).toContain('href="/spring-cleaning"')
  })

  it('renders a public URL read and its external source safely', () => {
    const html = renderToolPart({
      type: 'tool-fetchPublicUrl',
      toolCallId: 'fetch-public-url',
      state: 'output-available',
      input: { url: 'https://example.com/public-page' },
      output: JSON.stringify({
        type: 'external',
        title: 'Public page',
        url: 'https://example.com/public-page',
        content: 'Source text',
      }),
    })

    expect(html).toContain('Read example.com')
    expect(html).toContain('href="https://example.com/public-page"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Public page')
  })
})

describe('ChatMessage feedback', () => {
  it('does not ask for feedback on a scripted local welcome', () => {
    const html = renderMessage({
      id: 'local-welcome',
      role: 'assistant',
      metadata: SUBSCRIBER_WELCOME_METADATA,
      parts: [{ type: 'text', text: 'Welcome to Bell.' }],
    })

    expect(html).toContain('Welcome to Bell.')
    expect(html).not.toContain('Helpful?')
  })

  it('asks for feedback on a completed generated answer', () => {
    const html = renderMessage({
      id: 'generated-answer',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Here is an answer.' }],
    })

    expect(html).toContain('Helpful?')
  })

  it('renders the server-attached source for a no-tool answer', () => {
    const html = renderMessage({
      id: 'current-page-answer',
      role: 'assistant',
      metadata: CURRENT_PAGE_SOURCE,
      parts: [{ type: 'text', text: 'Here is the page summary.' }],
    })

    expect(html).toContain('Sources')
    expect(html).toContain('href="/contact"')
    expect(html).toContain('Contact')
  })

  it('keeps scripted messages free of fallback sources', () => {
    const html = renderMessage({
      id: 'local-welcome-with-source',
      role: 'assistant',
      metadata: {
        ...SUBSCRIBER_WELCOME_METADATA,
        ...CURRENT_PAGE_SOURCE,
      },
      parts: [{ type: 'text', text: 'Welcome to Bell.' }],
    })

    expect(html).not.toContain('Sources')
    expect(html).not.toContain('href="/contact"')
  })
})
