import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/csp-report/route'
import { CSP_REPORT_MAX_BYTES } from '@/lib/security/csp-report'

function reportRequest(
  body: string,
  contentType: string,
  headers: Record<string, string> = {}
): Request {
  return new Request('https://www.philipithomas.com/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/csp-report', () => {
  it('accepts legacy reports and logs only normalized low-cardinality fields', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const privateValue = 'do-not-log-this-path-or-sample'
    const response = await POST(
      reportRequest(
        JSON.stringify({
          'csp-report': {
            'document-uri': `https://www.philipithomas.com/${privateValue}`,
            'effective-directive': 'script-src-elem',
            'blocked-uri': `https://attacker.example/${privateValue}`,
            disposition: 'report',
            'source-file': `https://www.philipithomas.com/${privateValue}.js`,
            sample: privateValue,
          },
        }),
        'application/csp-report'
      )
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(consoleInfo).toHaveBeenCalledWith('[security/csp-report]', {
      directive: 'script-src-elem',
      disposition: 'report',
      destination: 'external',
    })
    expect(JSON.stringify(consoleInfo.mock.calls)).not.toContain(privateValue)
  })

  it('accepts Reporting API batches and classifies destinations without URLs', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const body = (blockedURL: string) => ({
      effectiveDirective: 'img-src',
      disposition: 'report',
      blockedURL,
    })
    const response = await POST(
      reportRequest(
        JSON.stringify([
          {
            type: 'csp-violation',
            body: body('https://www.philipithomas.com/images/cover.jpg'),
          },
          { type: 'csp-violation', body: body('data') },
          { type: 'csp-violation', body: body('data:image/png;base64,abc') },
          { type: 'csp-violation', body: body('blob') },
          { type: 'csp-violation', body: body('blob:https://example.com/id') },
          { type: 'deprecation', body: { id: 'ignored' } },
        ]),
        'application/reports+json; charset=utf-8'
      )
    )

    expect(response.status).toBe(204)
    expect(consoleInfo.mock.calls.map((call) => call[1])).toEqual([
      {
        directive: 'img-src',
        disposition: 'report',
        destination: 'same-origin',
      },
      {
        directive: 'img-src',
        disposition: 'report',
        destination: 'data',
      },
      {
        directive: 'img-src',
        disposition: 'report',
        destination: 'data',
      },
      {
        directive: 'img-src',
        disposition: 'report',
        destination: 'blob',
      },
      {
        directive: 'img-src',
        disposition: 'report',
        destination: 'blob',
      },
    ])
  })

  it('rejects cross-origin submissions before reading or logging them', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(
      reportRequest('{}', 'application/csp-report', {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(consoleInfo).not.toHaveBeenCalled()
  })

  it('rejects bodies above the tight byte cap without parsing or logging them', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(
      reportRequest(
        'x'.repeat(CSP_REPORT_MAX_BYTES + 1),
        'application/reports+json'
      )
    )

    expect(response.status).toBe(413)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(consoleInfo).not.toHaveBeenCalled()
  })

  it('bounds the number of Reporting API entries logged per request', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const response = await POST(
      reportRequest(
        JSON.stringify(
          Array.from({ length: 12 }, () => ({
            type: 'csp-violation',
            body: {
              effectiveDirective: 'style-src-elem',
              disposition: 'report',
              blockedURL: 'inline',
            },
          }))
        ),
        'application/reports+json'
      )
    )

    expect(response.status).toBe(204)
    expect(consoleInfo).toHaveBeenCalledTimes(10)
  })
})
