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
