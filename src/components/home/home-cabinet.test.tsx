// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeCabinet } from '@/components/home/home-cabinet'
import type { HomeDrawer } from '@/lib/home/types'

const drawer: HomeDrawer = {
  date: '2026-09-06',
  photos: [
    {
      title: 'Latest photograph',
      src: '/images/latest.jpg',
      alt: 'A quiet street.',
      width: 1200,
      height: 800,
      href: '/latest',
      publishedAt: '2026-09-06',
      newsletter: 'tidbits',
    },
    {
      title: 'Older photograph',
      src: '/images/older.jpg',
      alt: 'A tall doorway.',
      width: 800,
      height: 1200,
      href: '/older',
      publishedAt: '2020-01-01',
      newsletter: 'tsundoku',
    },
  ],
  word: {
    title: 'Askance',
    description: 'With a sideways glance.',
    href: '/diction#askance',
  },
  contraption: {
    title: 'Binnacle',
    description: 'A compass housing.',
    href: '/contraptions#binnacle',
  },
  writing: {
    title: 'An older essay',
    description: 'Something worth rereading.',
    href: '/essay',
    publishedAt: '2024-09-06',
    label: 'On this day 2 years ago',
  },
}

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<HomeCabinet drawer={drawer} />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('homepage cabinet', () => {
  it('starts with one photograph and keeps its link, alt text, and zoom source in sync', async () => {
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')?.alt).toBe('A quiet street.')
    const another = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Another photograph')
    )
    await act(async () => another?.click())
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(container.querySelector('img')?.alt).toBe('A tall doorway.')
    expect(
      container.querySelector('[data-zoomable]')?.getAttribute('data-full-src')
    ).toBe('/images/older.jpg')
    expect(container.querySelector('figcaption a')?.getAttribute('href')).toBe(
      '/older'
    )
    await act(async () => another?.click())
    expect(container.querySelector('img')?.alt).toBe('A quiet street.')
  })

  it('supports arrow, Home, and End keys with one selected, focusable tab', async () => {
    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]
    tabs[0].focus()
    await act(async () =>
      tabs[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(
      container.querySelectorAll('[role="tab"][tabindex="0"]')
    ).toHaveLength(1)
    const panel = container.querySelector<HTMLElement>(
      '[role="tabpanel"]:not([hidden])'
    )
    expect(panel?.textContent).toContain('Askance')
    expect(panel?.querySelector('a')?.getAttribute('href')).toBe(
      '/diction#askance'
    )

    await act(async () =>
      tabs[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[3])
    expect(
      container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
    ).toContain('On this day 2 years ago')
    await act(async () =>
      tabs[3].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
      )
    )
    expect(document.activeElement).toBe(tabs[0])
    expect(
      container.querySelectorAll('[role="tabpanel"]:not([hidden])')
    ).toHaveLength(1)
  })

  it('preserves the chosen photograph when browsing other compartments', async () => {
    const tabs = [
      ...container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ]
    const another = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Another photograph')
    )
    await act(async () => another?.click())
    await act(async () => tabs[2].click())
    expect(
      container.querySelector('[role="tabpanel"]:not([hidden])')?.textContent
    ).toContain('Binnacle')
    await act(async () => tabs[0].click())
    expect(container.querySelector('img')?.alt).toBe('A tall doorway.')
  })
})
