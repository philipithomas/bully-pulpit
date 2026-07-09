import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '@/app/api/md/[slug]/route'

const previousPhoneNumber = process.env.PHONE_NUMBER

afterEach(() => {
  if (previousPhoneNumber === undefined) delete process.env.PHONE_NUMBER
  else process.env.PHONE_NUMBER = previousPhoneNumber
})

function params(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

describe('GET /api/md/[slug]', () => {
  it('injects the active phone number into the contact Markdown mirror', async () => {
    process.env.PHONE_NUMBER = '+442079460000'

    const response = await GET(
      new Request('https://philipithomas.com/contact.md'),
      params('contact')
    )
    const markdown = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    expect(markdown).toContain(
      '**Telephone:** [+442079460000](tel:+442079460000)'
    )
    expect(markdown).not.toContain('+1 212 347 3190')
  })

  it('omits the telephone when the active number is unavailable', async () => {
    delete process.env.PHONE_NUMBER

    const response = await GET(
      new Request('https://philipithomas.com/contact.md'),
      params('contact')
    )
    const markdown = await response.text()

    expect(markdown).not.toContain('**Telephone:**')
    expect(markdown).not.toContain('+1 212 347 3190')
  })
})
