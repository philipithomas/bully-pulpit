import { describe, expect, it } from 'vitest'
import { scrubLeakedToolJson } from '@/lib/chat/scrub-leaked-tool-json'

describe('scrubLeakedToolJson', () => {
  it('strips a single leading tool-call fragment', () => {
    expect(scrubLeakedToolJson('{"query":"home page"}The answer.')).toBe(
      'The answer.'
    )
  })

  it('strips a concatenated run of fragments, as observed live', () => {
    const leaked =
      '{"query":"home page philipithomas.com"}{"query":"about"}' +
      '{"slug":"colophon"}{"slug":"/software-in-the-ai-era"}' +
      '{"slug":"https://www.philipithomas.com/privacy"}The page you are looking at…'
    expect(scrubLeakedToolJson(leaked)).toBe('The page you are looking at…')
  })

  it('strips fragments separated by whitespace and newlines', () => {
    expect(scrubLeakedToolJson('{"query":"a"} \n{"slug":"b"}\n\nProse.')).toBe(
      'Prose.'
    )
  })

  it('strips fetchPage and scoped search inputs', () => {
    expect(
      scrubLeakedToolJson(
        '{"path":"/contact"}{"query":"coffee","scope":"images"}Answer.'
      )
    ).toBe('Answer.')
  })

  it('strips chronological listing inputs', () => {
    expect(
      scrubLeakedToolJson(
        '{"limit":1,"offset":0,"filter":{"mode":"only","newsletter":"workshop"}}Answer.'
      )
    ).toBe('Answer.')
  })

  it('returns an empty string when the part is only leaked JSON', () => {
    expect(scrubLeakedToolJson('{"slug":"colophon"}')).toBe('')
  })

  it('leaves JSON quoted mid-prose alone', () => {
    const text = 'The tool takes {"query":"…"} as input.'
    expect(scrubLeakedToolJson(text)).toBe(text)
  })

  it('leaves ordinary prose and other JSON shapes alone', () => {
    expect(scrubLeakedToolJson('Hello there.')).toBe('Hello there.')
    expect(scrubLeakedToolJson('{"other":"shape"} text')).toBe(
      '{"other":"shape"} text'
    )
  })
})
