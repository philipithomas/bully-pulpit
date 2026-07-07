import { describe, expect, it } from 'vitest'
import { toolImageCardsFromOutput } from '@/lib/chat/tool-images'

describe('toolImageCardsFromOutput', () => {
  it('turns direct image-search tool output into display cards', () => {
    const cards = toolImageCardsFromOutput(
      JSON.stringify([
        {
          title: 'Morning coffee',
          url: '/morning-coffee',
          image: {
            src: '/images/posts/morning-coffee/cup.jpg',
            alt: 'A cup of coffee on a counter',
            url: '/morning-coffee#cup',
            description: 'Coffee on a wooden counter',
          },
          images: [
            {
              src: '/images/posts/morning-coffee/cup.jpg',
              alt: 'Duplicate',
              url: '/morning-coffee#cup',
              description: 'Duplicate',
            },
          ],
        },
      ])
    )

    expect(cards).toEqual([
      {
        src: '/images/posts/morning-coffee/cup.jpg',
        alt: 'A cup of coffee on a counter',
        url: '/morning-coffee#cup',
        label: 'Coffee on a wooden counter',
      },
    ])
  })

  it('falls back to cover images for post tool output', () => {
    expect(
      toolImageCardsFromOutput([
        {
          title: 'A mini data center',
          url: '/a-mini-data-center',
          coverImage: '/images/covers/a-mini-data-center.jpg',
        },
      ])
    ).toEqual([
      {
        src: '/images/covers/a-mini-data-center.jpg',
        alt: 'A mini data center',
        url: '/a-mini-data-center',
        label: 'A mini data center',
      },
    ])
  })

  it('ignores malformed output', () => {
    expect(toolImageCardsFromOutput('{nope')).toEqual([])
  })
})
