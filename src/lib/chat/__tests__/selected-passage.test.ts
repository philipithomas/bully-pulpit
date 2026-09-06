import { describe, expect, it } from 'vitest'
import {
  isPassageSelectableContent,
  normalizeSelectedPassage,
  selectedPassageRequestOptions,
  selectedPassageUserMessage,
} from '@/lib/chat/selected-passage'

describe('selected passage request', () => {
  it('normalizes whitespace and enforces the inclusive 20-1200 range', () => {
    expect(normalizeSelectedPassage(` ${'a'.repeat(20)}\n`)).toBe(
      'a'.repeat(20)
    )
    expect(normalizeSelectedPassage('a'.repeat(19))).toBeNull()
    expect(normalizeSelectedPassage('a'.repeat(1_200))).toBe('a'.repeat(1_200))
    expect(normalizeSelectedPassage('a'.repeat(1_201))).toBeNull()
    expect(normalizeSelectedPassage('twenty   useful\ncharacters')).toBe(
      'twenty useful characters'
    )
  })

  it('turns each explicit action into a visible user message', () => {
    const quote = 'A selected passage long enough to send.'
    expect(selectedPassageUserMessage('explain', quote)).toBe(
      `Explain this selected passage.\n\n> ${quote}`
    )
    expect(selectedPassageUserMessage('connect', quote)).toContain(
      "Connect this selected passage to Philip's other writing."
    )
    expect(selectedPassageUserMessage('context', quote)).toContain(
      'Give me the surrounding context'
    )
  })

  it('preserves the complete side channel for initial sends and retries', () => {
    const request = {
      action: 'explain' as const,
      text: 'A selected passage long enough to send to Bell.',
      path: '/colophon',
      pageTitle: 'Colophon | Philip Ilic Thomas',
      headingId: 'technical',
    }
    expect(selectedPassageRequestOptions(request)).toEqual({
      body: {
        selectedPassage: request,
        pageContext: {
          path: '/colophon',
          title: 'Colophon | Philip Ilic Thomas',
        },
      },
    })
    expect(selectedPassageRequestOptions(null)).toEqual({})
  })

  it('allows posts and public prose pages but excludes utility pages', () => {
    expect(isPassageSelectableContent('a-post', 'post')).toBe(true)
    expect(isPassageSelectableContent('colophon', 'page')).toBe(true)
    for (const slug of [
      'contact',
      'policies',
      'privacy',
      'stargazing',
      'terms',
      'text-messaging',
    ]) {
      expect(isPassageSelectableContent(slug, 'page')).toBe(false)
    }
  })
})
