import type { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DELETE } from '@/app/api/unsubscribe/[token]/route'

describe('DELETE /api/unsubscribe/[token]', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('proxies account deletion to printing press', async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
      })
    )
    vi.stubGlobal('fetch', fetch)

    const res = await DELETE({} as NextRequest, {
      params: Promise.resolve({ token: 'delete-token' }),
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8080/api/v1/unsubscribe/delete-token/account',
      {
        method: 'DELETE',
        cache: 'no-store',
      }
    )
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('returns a safe error when account deletion fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({}, { status: 404 }))
    )

    const res = await DELETE({} as NextRequest, {
      params: Promise.resolve({ token: 'missing-token' }),
    })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to delete subscription',
    })
  })
})
