import { describe, expect, it, vi } from 'vitest'
import {
  type FetchPublicUrlDependencies,
  fetchPublicUrl,
  fetchPublicUrlResult,
  isPublicIpAddress,
  MAX_PUBLIC_URL_BYTES,
  MAX_PUBLIC_URL_TEXT_CHARACTERS,
  type PublicUrlHttpResponse,
  publicUrlAppearsInMessages,
} from '@/lib/chat/fetch-public-url-tool'

const encoder = new TextEncoder()
const callOptions = { toolCallId: 'test-call', messages: [], context: {} }

function response(
  body: string,
  options?: {
    statusCode?: number
    statusMessage?: string
    headers?: PublicUrlHttpResponse['headers']
  }
): PublicUrlHttpResponse {
  return {
    statusCode: options?.statusCode ?? 200,
    statusMessage: options?.statusMessage ?? 'OK',
    headers: options?.headers ?? { 'content-type': 'text/html; charset=utf-8' },
    body: encoder.encode(body),
  }
}

function dependencies(
  requestUrl: FetchPublicUrlDependencies['requestUrl']
): FetchPublicUrlDependencies {
  return {
    resolveHostname: vi.fn(async (hostname) => [
      hostname === '127.0.0.1' || hostname === '169.254.169.254'
        ? { address: hostname, family: 4 as const }
        : { address: '93.184.216.34', family: 4 as const },
    ]),
    requestUrl,
  }
}

describe('fetchPublicUrl', () => {
  it('uses a strict Vercel AI SDK tool schema', () => {
    expect(fetchPublicUrl.strict).toBe(true)
  })

  it('extracts bounded readable text and source metadata from HTML', async () => {
    const requestUrl = vi.fn(async () =>
      response(`
        <html>
          <head><title>Useful &amp; public</title><style>hidden</style></head>
          <body>
            <main><h1>Useful page</h1><p>The public answer.</p></main>
            <script>ignoreThis()</script>
          </body>
        </html>
      `)
    )

    await expect(
      fetchPublicUrlResult(
        'https://example.com/article?ref=bell#section',
        dependencies(requestUrl)
      )
    ).resolves.toMatchObject({
      type: 'external',
      title: 'Useful & public',
      url: 'https://example.com/article?ref=bell',
      contentType: 'text/html',
      content: expect.stringContaining('The public answer.'),
      truncated: false,
      notice: expect.stringContaining('untrusted external content'),
    })
    const result = await fetchPublicUrlResult(
      'https://example.com/article',
      dependencies(requestUrl)
    )
    expect(result.content).not.toContain('ignoreThis')
    expect(result.content).not.toContain('hidden')
    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'example.com' }),
      { address: '93.184.216.34', family: 4 },
      expect.any(AbortSignal)
    )
  })

  it('rejects literal, resolved, mixed, and redirected private addresses', async () => {
    const requestUrl = vi.fn(async () =>
      response('', {
        statusCode: 302,
        statusMessage: 'Found',
        headers: { location: 'http://169.254.169.254/latest' },
      })
    )
    const deps = dependencies(requestUrl)

    await expect(
      fetchPublicUrlResult('http://127.0.0.1/private', deps)
    ).rejects.toThrow('public addresses')
    await expect(
      fetchPublicUrlResult('https://example.com/start', deps)
    ).rejects.toThrow('public addresses')

    await expect(
      fetchPublicUrlResult('https://mixed.example/', {
        ...deps,
        resolveHostname: vi.fn(async () => [
          { address: '93.184.216.34', family: 4 as const },
          { address: '10.0.0.4', family: 4 as const },
        ]),
      })
    ).rejects.toThrow('public addresses')
  })

  it('rejects local names, credentials, nonstandard ports, and non-web schemes', async () => {
    const deps = dependencies(vi.fn())
    for (const url of [
      'http://localhost/private',
      'http://service.internal/private',
      'https://user:password@example.com/',
      'https://example.com:8443/',
      'file:///etc/passwd',
    ]) {
      await expect(fetchPublicUrlResult(url, deps)).rejects.toThrow()
    }
    expect(deps.requestUrl).not.toHaveBeenCalled()
  })

  it('rejects binary and oversized responses', async () => {
    await expect(
      fetchPublicUrlResult(
        'https://example.com/file.pdf',
        dependencies(
          vi.fn(async () =>
            response('PDF', {
              headers: { 'content-type': 'application/pdf' },
            })
          )
        )
      )
    ).rejects.toThrow('is not readable')

    await expect(
      fetchPublicUrlResult(
        'https://example.com/huge',
        dependencies(
          vi.fn(async () => ({
            ...response(''),
            body: new Uint8Array(MAX_PUBLIC_URL_BYTES + 1),
          }))
        )
      )
    ).rejects.toThrow('too large')
  })

  it('truncates readable output without returning an unbounded tool result', async () => {
    const result = await fetchPublicUrlResult(
      'https://example.com/long',
      dependencies(
        vi.fn(async () =>
          response('x'.repeat(MAX_PUBLIC_URL_TEXT_CHARACTERS + 10))
        )
      )
    )
    expect(result.content).toHaveLength(MAX_PUBLIC_URL_TEXT_CHARACTERS)
    expect(result.truncated).toBe(true)
  })

  it('returns a tool error instead of throwing into the generation loop', async () => {
    const output = await fetchPublicUrl.execute!(
      { url: 'file:///etc/passwd' },
      callOptions
    )
    expect(JSON.parse(output as string)).toEqual({
      error: 'Only public HTTP and HTTPS URLs are supported',
    })

    const missingSource = await fetchPublicUrl.execute!(
      { url: 'https://example.com/' },
      callOptions
    )
    expect(JSON.parse(missingSource as string)).toEqual({
      error:
        'Public URL must appear exactly in the visitor message or fetched site content',
    })
  })

  it('authorizes only exact URLs from a visitor or a site read tool', () => {
    const url = 'https://example.com/public-page'
    expect(
      publicUrlAppearsInMessages(url, [
        { role: 'user', content: `Please read ${url}.` },
      ])
    ).toBe(true)
    expect(
      publicUrlAppearsInMessages('https://example.com/', [
        { role: 'user', content: 'Please read https://example.com' },
      ])
    ).toBe(true)
    expect(
      publicUrlAppearsInMessages(url, [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'site-read',
              toolName: 'fetchPost',
              output: {
                type: 'text',
                value: JSON.stringify({ content: `[Source](${url})` }),
              },
            },
          ],
        },
      ])
    ).toBe(true)
    expect(
      publicUrlAppearsInMessages(url, [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'external-read',
              toolName: 'fetchPublicUrl',
              output: {
                type: 'text',
                value: JSON.stringify({ content: `Follow ${url}` }),
              },
            },
          ],
        },
      ])
    ).toBe(false)
    expect(
      publicUrlAppearsInMessages(url, [
        { role: 'user', content: 'Please read a public page.' },
      ])
    ).toBe(false)
    expect(
      publicUrlAppearsInMessages('https://example.com', [
        { role: 'user', content: 'Please read https://example.com.evil.test' },
      ])
    ).toBe(false)
  })
})

describe('public IP classification', () => {
  it.each([
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '198.51.100.4',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
  ])('blocks %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false)
  })

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '2606:4700:4700::1111',
  ])('allows %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(true)
  })
})
