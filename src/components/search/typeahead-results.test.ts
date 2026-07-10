import { describe, expect, it } from 'vitest'
import {
  mergeTypeaheadResults,
  TYPEAHEAD_RESULT_LIMIT,
  typeaheadResultUrl,
} from '@/components/search/typeahead-results'

function result(slug: string) {
  return { id: slug, slug, url: `/${slug}` }
}

describe('mergeTypeaheadResults', () => {
  it('keeps lexical order and appends unique hybrid results', () => {
    const combined = mergeTypeaheadResults(
      [result('coffee'), result('tea')],
      [result('tea'), result('espresso'), result('matcha')]
    )

    expect(combined.map(({ slug }) => slug)).toEqual([
      'coffee',
      'tea',
      'espresso',
      'matcha',
    ])
  })

  it('does not exceed the typeahead result limit', () => {
    const lexical = Array.from({ length: 8 }, (_, index) =>
      result(`lexical-${index}`)
    )
    const hybrid = Array.from({ length: 8 }, (_, index) =>
      result(`hybrid-${index}`)
    )

    const combined = mergeTypeaheadResults(lexical, hybrid)

    expect(combined).toHaveLength(TYPEAHEAD_RESULT_LIMIT)
    expect(combined.slice(0, 8)).toEqual(lexical)
  })
})

describe('typeaheadResultUrl', () => {
  it('prefers the displayed image URL over the result URL', () => {
    expect(
      typeaheadResultUrl({
        url: '/post',
        image: { url: '/post#direct-image' },
        images: [{ url: '/post#matched-image' }],
      })
    ).toBe('/post#direct-image')
  })

  it('uses the first matched image URL when there is no direct image', () => {
    expect(
      typeaheadResultUrl({
        url: '/post',
        images: [{ url: '/post#matched-image' }],
      })
    ).toBe('/post#matched-image')
  })

  it('falls back to the result URL when there is no displayed image', () => {
    expect(typeaheadResultUrl({ url: '/post', images: [] })).toBe('/post')
  })
})
