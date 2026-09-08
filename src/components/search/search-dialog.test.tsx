// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/image', () => ({ default: 'img' }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('@/lib/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics/events')>()
  return { ...actual, trackClientEvent: vi.fn() }
})

import { SearchDialog } from '@/components/search/search-dialog'

const matchedImage = {
  id: 'api-diagram',
  src: '/images/api-diagram.jpg',
  alt: 'Boxes and arrows describing the API',
  description: 'Image: Boxes and arrows describing the API',
  url: '/find-ai-api#api-diagram',
}
const post = {
  type: 'post' as const,
  slug: 'find-ai-api',
  title: 'Behind the scenes of the Find AI API',
  description: 'How we built an API for finding people and companies',
  url: '/find-ai-api',
  newsletter: 'contraption',
  coverImage: '/images/find-ai-cover.jpg',
  excerpts: ['The implementation started with a search endpoint.'],
  image: matchedImage,
  images: [matchedImage],
}

let root: Root | null = null
const onOpenChange = vi.fn()

async function search(result = post) {
  const fetchMock = vi.fn(async (input: string) => {
    if (input === '/api/posts/recent') {
      return Response.json({ posts: [] })
    }
    const params = new URL(input, 'https://www.philipithomas.com').searchParams
    return Response.json({
      results: [result],
      mode: params.get('phase'),
    })
  })
  vi.stubGlobal('fetch', fetchMock)

  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<SearchDialog open onOpenChange={onOpenChange} />)
  })

  const input = document.querySelector<HTMLInputElement>('[role="combobox"]')
  if (!input) throw new Error('Missing search input')
  await act(async () => {
    // Bypass React's value tracker to simulate a real browser text edit.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set?.call(input, 'behind the scenes')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })

  expect(fetchMock.mock.calls[0][0]).toBe('/api/posts/recent')
  expect(
    fetchMock.mock.calls
      .slice(1)
      .map(([url]) =>
        Object.fromEntries(
          new URL(url, 'https://www.philipithomas.com').searchParams
        )
      )
  ).toEqual(
    ['lexical', 'hybrid'].map((phase) => ({
      q: 'behind the scenes',
      scope: 'posts',
      source: 'typeahead',
      phase,
    }))
  )
  const option = document.querySelector<HTMLButtonElement>('li [role="option"]')
  if (!option) throw new Error('Missing search result')
  return { input, option }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('typeahead search results', () => {
  it.each([
    'click',
    'Enter',
  ])('shows the post subtitle and opens its URL on %s', async (action) => {
    const { input, option } = await search()
    expect(
      Array.from(option.querySelectorAll('p'), (p) => p.textContent)
    ).toEqual([post.title, post.description])
    expect(option.textContent).not.toContain(matchedImage.description)
    expect(option.textContent).not.toContain(post.excerpts[0])
    expect(option.querySelector('img')?.getAttribute('src')).toBe(
      post.coverImage
    )

    await act(async () => {
      if (action === 'click') {
        option.click()
      } else {
        input.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        )
      }
    })
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith(post.url)
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('uses a prose excerpt when the post has no subtitle', async () => {
    const { option } = await search({ ...post, description: '  ' })
    expect(
      Array.from(option.querySelectorAll('p'), (p) => p.textContent)
    ).toEqual([post.title, post.excerpts[0]])
    expect(option.textContent).not.toContain(matchedImage.description)
  })

  it('omits the second line when only image metadata is available', async () => {
    const { option } = await search({ ...post, description: '', excerpts: [] })
    expect(
      Array.from(option.querySelectorAll('p'), (p) => p.textContent)
    ).toEqual([post.title])
    expect(option.textContent).not.toContain(matchedImage.alt)
    expect(option.textContent).not.toContain(matchedImage.description)
  })
})
