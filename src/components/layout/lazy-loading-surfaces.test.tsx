import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignInModalLoading } from '@/components/auth/sign-in-modal-lazy'
import {
  ChatSidebarLoading,
  SearchDialogLoading,
} from '@/components/layout/header'

describe('interaction-loaded surface fallbacks', () => {
  it.each([
    ['Bell', ChatSidebarLoading, 'Opening Bell…'],
    ['search', SearchDialogLoading, 'Loading search…'],
    ['sign in', SignInModalLoading, 'Opening sign in…'],
  ])('keeps trigger focus while announcing the %s loading state', (_, Component, status) => {
    const html = renderToStaticMarkup(createElement(Component))

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain('pointer-events-none')
    expect(html).toContain(status)
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-modal')
    expect(html).not.toContain('tabindex')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
  })
})
