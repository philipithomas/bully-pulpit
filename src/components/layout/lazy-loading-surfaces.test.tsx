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
  ])('gives %s an immediate accessible loading state', (_, Component, status) => {
    const html = renderToStaticMarkup(createElement(Component))

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('role="status"')
    expect(html).toContain(status)
  })
})
