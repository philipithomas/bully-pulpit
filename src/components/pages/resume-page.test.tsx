import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResumePage } from '@/components/pages/resume-page'
import { resumeExperience } from '@/lib/resume'

describe('ResumePage', () => {
  it('renders the resume hierarchy without adding unwanted sections', () => {
    const html = renderToStaticMarkup(<ResumePage />)

    expect(html).toContain('Philip I. Thomas')
    expect(html).toContain('Experience')
    expect(html).toContain('Education')
    expect(html).toContain('Security research')
    expect(html).not.toMatch(/>Summary</)
    expect(html).not.toMatch(/>Goals</)
    expect(html).not.toMatch(/>Skills</)
    expect(html).not.toContain('.pdf')
  })

  it('keeps the header to the name and contact links', () => {
    const html = renderToStaticMarkup(<ResumePage />)
    const header = html.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''

    expect(header).toContain('Philip I. Thomas')
    expect(header).toContain('mail@philipithomas.com')
    expect(header).toContain('github.com/philipithomas')
    expect(header).not.toContain('Résumé')
    expect(header).not.toContain('security disclosures')
  })

  it('keeps company and media destinations external and expandable', () => {
    const html = renderToStaticMarkup(<ResumePage />)

    expect(html.match(/<details/g)).toHaveLength(resumeExperience.length + 1)
    expect(html).toContain('Selected work and media')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    for (const entry of resumeExperience) {
      expect(html).toContain(`href="${entry.companyUrl}"`)
    }
  })

  it('emits ProfilePage structured data for the resume', () => {
    const html = renderToStaticMarkup(<ResumePage />)
    const match = html.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/
    )

    expect(match).not.toBeNull()
    const schema = JSON.parse(match?.[1] ?? '{}')
    expect(schema['@type']).toBe('ProfilePage')
    expect(schema.mainEntity).toMatchObject({
      '@type': 'Person',
      alternateName: 'Philip I. Thomas',
    })
  })
})
