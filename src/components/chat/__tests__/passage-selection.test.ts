// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/article' }))

vi.mock('next/image', () => ({ default: 'img' }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}))
vi.mock('@/lib/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics/events')>()
  return { ...actual, trackClientEvent: vi.fn() }
})

import {
  installPassageSelectionListeners,
  PASSAGE_REDUCED_MOTION_CLASS,
  PassageSelection,
} from '@/components/chat/passage-selection'
import { trackClientEvent } from '@/lib/analytics/events'
import { useChatSidebar } from '@/stores/chat-store'

const ARTICLE_HTML = `
  <main>
    <div data-bell-selectable>
      <h2 id="first-section">First section</h2>
      <p id="first-prose">This paragraph contains enough ordinary prose for Bell.</p>
      <p><a id="linked-prose" href="/elsewhere">This linked text is long enough to reject.</a></p>
      <pre><code id="code-prose">const selectedCodeShouldNeverOpenBell = true</code></pre>
      <h2 id="second-section">Second section</h2>
      <p id="second-prose">This second paragraph has enough text for a selected passage.</p>
    </div>
  </main>
`

let root: Root | null = null

function eventWith(type: string, properties: Record<string, string>): Event {
  const event = new Event(type, { bubbles: true })
  for (const [name, value] of Object.entries(properties)) {
    Object.defineProperty(event, name, { value })
  }
  return event
}

function selectElementText(selector: string): string {
  const element = document.querySelector(selector)
  const textNode = element?.firstChild
  if (!textNode?.textContent) throw new Error(`Missing text for ${selector}`)
  const range = document.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, textNode.textContent.length)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return textNode.textContent
}

async function renderSelectionUi(html = ARTICLE_HTML) {
  document.body.innerHTML = `${html}<div id="selection-root"></div>`
  const container = document.querySelector('#selection-root')
  if (!container) throw new Error('Missing test root')
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(PassageSelection))
  })
}

function askBellButton(): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Ask Bell'
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  navigation.pathname = '/article'
  sessionStorage.clear()
  useChatSidebar.setState({
    ...useChatSidebar.getInitialState(),
    chatId: crypto.randomUUID(),
  })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  window.getSelection()?.removeAllRanges()
  document.body.innerHTML = ''
})

describe('selected-passage interaction inputs', () => {
  it('refreshes for keyboard, mouse, and touch selection paths', () => {
    const target = new EventTarget()
    const refresh = vi.fn()
    const dispose = installPassageSelectionListeners(
      target as unknown as Document,
      { refresh, dismiss: vi.fn() }
    )

    target.dispatchEvent(new Event('selectionchange'))
    target.dispatchEvent(eventWith('keyup', { key: 'ArrowRight' }))
    target.dispatchEvent(eventWith('pointerup', { pointerType: 'mouse' }))
    target.dispatchEvent(eventWith('pointerup', { pointerType: 'touch' }))

    expect(refresh.mock.calls.map(([trigger]) => trigger)).toEqual([
      'selectionchange',
      'keyboard',
      'pointer',
      'touch',
    ])

    dispose()
    target.dispatchEvent(new Event('selectionchange'))
    expect(refresh).toHaveBeenCalledTimes(4)
  })

  it('reveals actions from a real Range, focuses the first action, and sends only after action', async () => {
    await renderSelectionUi()
    const selectedText = selectElementText('#second-prose')

    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    const askButton = askBellButton()
    expect(askButton).toBeDefined()
    expect(useChatSidebar.getState().open).toBe(false)
    expect(trackClientEvent).not.toHaveBeenCalled()

    await act(async () => askButton?.click())
    const actions = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Ask Bell about selected passage"] button'
      )
    )
    expect(actions.map((button) => button.textContent?.trim())).toEqual([
      'Explain this',
      'Connect this to other writing',
      'Give me the surrounding context',
    ])
    expect(document.activeElement).toBe(actions[0])
    expect(useChatSidebar.getState().open).toBe(false)

    await act(async () => actions[0]?.click())
    expect(useChatSidebar.getState().open).toBe(true)
    expect(useChatSidebar.getState().activePassageRequest).toEqual({
      action: 'explain',
      text: selectedText,
      path: '/article',
      headingId: 'second-section',
    })
    expect(trackClientEvent).toHaveBeenCalledWith(
      'Bell passage action selected',
      { action: 'explain', page_type: 'post' }
    )
    expect(window.getSelection()?.rangeCount).toBe(0)
  })

  it('suppresses selections in links, code, and nonselectable utility content', async () => {
    await renderSelectionUi()
    for (const selector of ['#linked-prose', '#code-prose']) {
      selectElementText(selector)
      await act(async () => {
        document.dispatchEvent(new Event('selectionchange'))
      })
      expect(askBellButton()).toBeUndefined()
    }

    await act(async () => root?.unmount())
    root = null
    await renderSelectionUi(
      '<main><p id="utility-prose">Utility page text is long enough to select but has no public-prose marker.</p></main>'
    )
    selectElementText('#utility-prose')
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(askBellButton()).toBeUndefined()
  })

  it('reveals from a touch pointer event and dismisses on Escape', async () => {
    await renderSelectionUi()
    selectElementText('#first-prose')
    await act(async () => {
      document.dispatchEvent(eventWith('pointerup', { pointerType: 'touch' }))
    })
    expect(askBellButton()).toBeDefined()

    await act(async () => {
      document.dispatchEvent(eventWith('keydown', { key: 'Escape' }))
    })
    expect(askBellButton()).toBeUndefined()
  })

  it('clears the affordance across navigation and a fresh mount', async () => {
    await renderSelectionUi()
    selectElementText('#first-prose')
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    expect(askBellButton()).toBeDefined()

    navigation.pathname = '/another-article'
    await act(async () => root?.render(createElement(PassageSelection)))
    expect(askBellButton()).toBeUndefined()

    await act(async () => root?.unmount())
    root = null
    window.getSelection()?.removeAllRanges()
    await renderSelectionUi()
    expect(askBellButton()).toBeUndefined()
  })

  it('disables both transitions and animation for reduced motion', async () => {
    await renderSelectionUi()
    selectElementText('#first-prose')
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'))
    })
    const popover = askBellButton()?.parentElement
    expect(PASSAGE_REDUCED_MOTION_CLASS).toContain(
      'motion-reduce:transition-none'
    )
    expect(PASSAGE_REDUCED_MOTION_CLASS).toContain('motion-reduce:animate-none')
    expect(popover?.className).toContain('motion-reduce:transition-none')
    expect(popover?.className).toContain('motion-reduce:animate-none')
  })
})
