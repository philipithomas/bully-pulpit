import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import { readJsonBody } from '@/lib/http/json-body'

const schema = z.strictObject({ value: z.string().max(20) })

function request(body: BodyInit, headers: HeadersInit = {}) {
  return new Request('https://example.com/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

describe('readJsonBody', () => {
  it('accepts bounded JSON with a charset parameter', async () => {
    const result = await readJsonBody(
      request(JSON.stringify({ value: 'hello' }), {
        'content-type': 'application/json; charset=utf-8',
      }),
      schema,
      100
    )

    expect(result).toEqual({ ok: true, data: { value: 'hello' } })
  })

  it('rejects the wrong media type', async () => {
    const result = await readJsonBody(
      request('{"value":"hello"}', { 'content-type': 'text/plain' }),
      schema,
      100
    )

    expect(result).toEqual({
      ok: false,
      status: 415,
      error: 'Content-Type must be application/json',
    })
  })

  it('uses Content-Length for an early oversized rejection', async () => {
    const getReader = vi.fn()
    const oversized = {
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': '101',
      }),
      body: { getReader },
    } as unknown as Request

    const result = await readJsonBody(oversized, schema, 100)

    expect(result).toMatchObject({ ok: false, status: 413 })
    expect(getReader).not.toHaveBeenCalled()
  })

  it('enforces the streamed byte cap when Content-Length is absent', async () => {
    const result = await readJsonBody(
      request(JSON.stringify({ value: 'x'.repeat(20) })),
      schema,
      10
    )

    expect(result).toMatchObject({ ok: false, status: 413 })
  })

  it('returns 400 for malformed JSON', async () => {
    const result = await readJsonBody(request('{'), schema, 100)

    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('returns 400 when the parsed body does not match the schema', async () => {
    const result = await readJsonBody(
      request(JSON.stringify({ value: 42 })),
      schema,
      100
    )

    expect(result).toMatchObject({ ok: false, status: 400 })
  })
})
