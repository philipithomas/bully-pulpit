import { describe, expect, it } from 'vitest'
import { bellStarterQuestions } from '@/lib/chat/starter-questions'

describe('Bell starter questions', () => {
  it('introduces the archive from the homepage', () => {
    expect(bellStarterQuestions('/')).toEqual([
      {
        kind: 'archive_overview',
        text: 'What does Philip write about?',
      },
      {
        kind: 'recent_writing',
        text: 'What has Philip published recently?',
      },
      { kind: 'photo_search', text: 'Show me photos of coffee' },
    ])
  })

  it('uses photography-specific starters on the photo search page', () => {
    expect(
      bellStarterQuestions('/photography').map((item) => item.kind)
    ).toEqual(['photo_search', 'photo_japan', 'photo_approach'])
  })

  it('names the current newsletter and handles a trailing slash', () => {
    expect(bellStarterQuestions('/workshop/')[0]).toEqual({
      kind: 'newsletter_overview',
      text: 'What is Workshop about?',
    })
  })

  it('uses current-page questions for posts and public pages', () => {
    for (const path of ['/finding-a-software-job', '/contact', '/print']) {
      expect(bellStarterQuestions(path).map((item) => item.kind)).toEqual([
        'page_summary',
        'archive_connections',
        'related_reading',
      ])
    }
  })

  it('does not suggest summarizing private or utility surfaces', () => {
    for (const path of ['/account', '/printing-press/bell', '/api/search']) {
      expect(bellStarterQuestions(path)[0].kind).toBe('archive_overview')
    }
  })
})
