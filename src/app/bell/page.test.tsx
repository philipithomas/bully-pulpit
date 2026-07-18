import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/bell/bell-page-client', () => ({
  BellPageClient: () => <div data-testid="bell-page-chat" />,
}))

import BellPage, { metadata } from '@/app/bell/page'

describe('BellPage', () => {
  it('publishes an indexable search page around the shared chat', () => {
    const html = renderToStaticMarkup(<BellPage />)

    expect(html).toContain('Search with Bell')
    expect(html).toContain('writing, photographs, and projects')
    expect(html).toContain('data-testid="bell-page-chat"')
    expect(metadata).toMatchObject({
      title: 'Search with Bell',
      alternates: { canonical: '/bell' },
      openGraph: { url: '/bell' },
    })
  })
})
