import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET, HEAD } from '@/app/bell.vcf/route'

const PHONE_NUMBER = '+12123473190'

beforeEach(() => {
  process.env.PHONE_NUMBER = PHONE_NUMBER
})

afterEach(() => {
  delete process.env.PHONE_NUMBER
})

function expectDownloadHeaders(response: Response): void {
  expect(response.headers.get('Content-Type')).toBe('text/vcard; charset=utf-8')
  expect(response.headers.get('Content-Disposition')).toBe(
    'attachment; filename="Bell.vcf"'
  )
  expect(response.headers.get('Cache-Control')).toContain('no-store')
  expect(response.headers.get('Cache-Control')).toContain('no-cache')
  expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
}

describe('/bell.vcf', () => {
  it('returns a downloadable vCard', async () => {
    const response = GET()
    const body = await response.text()

    expect(response.status).toBe(200)
    expectDownloadHeaders(response)
    expect(response.headers.get('Content-Length')).toBe(
      String(new TextEncoder().encode(body).byteLength)
    )
    expect(body).toContain('BEGIN:VCARD\r\n')
    expect(body).toContain('FN:Bell\r\n')
  })

  it('returns matching headers and no body for HEAD', async () => {
    const getResponse = GET()
    const headResponse = HEAD()

    expect(headResponse.status).toBe(200)
    expectDownloadHeaders(headResponse)
    expect(headResponse.headers.get('Content-Length')).toBe(
      getResponse.headers.get('Content-Length')
    )
    await expect(headResponse.text()).resolves.toBe('')
  })

  it.each([
    undefined,
    '212-347-3190',
  ])('fails without caching when PHONE_NUMBER is %s', async (phoneNumber) => {
    if (phoneNumber === undefined) {
      delete process.env.PHONE_NUMBER
    } else {
      process.env.PHONE_NUMBER = phoneNumber
    }

    const getResponse = GET()
    const headResponse = HEAD()

    expect(getResponse.status).toBe(503)
    expect(getResponse.headers.get('Cache-Control')).toContain('no-store')
    expect(getResponse.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    )
    await expect(getResponse.text()).resolves.toBe(
      'Bell contact card is unavailable.'
    )
    expect(headResponse.status).toBe(503)
    expect(headResponse.headers.get('Content-Length')).toBe(
      String(
        new TextEncoder().encode('Bell contact card is unavailable.').byteLength
      )
    )
    await expect(headResponse.text()).resolves.toBe('')
  })
})
