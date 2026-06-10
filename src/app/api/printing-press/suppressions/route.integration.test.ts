import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))
// Mock the SES seam only — the route's clear-SES-then-clear-local ordering
// stays real against the in-memory database.
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { DELETE as clearSuppression } from '@/app/api/printing-press/suppressions/route'
import { signSession } from '@/lib/auth/jwt'
import { emailSuppressions } from '@/lib/db/schema'
import { deleteSuppressedDestination } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

const BASE = 'http://localhost/api/printing-press/suppressions'

function clearRequest(body: unknown) {
  return new NextRequest(BASE, {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function signInAs(email: string) {
  setSessionCookie(await signSession({ uuid: randomUUID(), email, name: null }))
}

const signInAsAdmin = () => signInAs('admin@example.com')

async function seedSuppression(email: string) {
  await db.insert(emailSuppressions).values({
    email,
    reason: 'Permanent bounce (General): smtp; 550 5.1.1 user unknown',
    source: 'ses-webhook',
  })
}

async function allSuppressions() {
  return db.select().from(emailSuppressions)
}

beforeEach(async () => {
  clearSessionStore()
  await resetDb()
  vi.mocked(deleteSuppressedDestination).mockClear()
})

describe('admin guard', () => {
  it('returns 403 with no session and touches neither SES nor the database', async () => {
    await seedSuppression('gone@example.com')
    const res = await clearSuppression(
      clearRequest({ email: 'gone@example.com' })
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
    expect(deleteSuppressedDestination).not.toHaveBeenCalled()
    expect(await allSuppressions()).toHaveLength(1)
  })

  it('returns 403 for a signed-in non-admin', async () => {
    await signInAs('user@example.com')
    await seedSuppression('gone@example.com')
    const res = await clearSuppression(
      clearRequest({ email: 'gone@example.com' })
    )
    expect(res.status).toBe(403)
    expect(deleteSuppressedDestination).not.toHaveBeenCalled()
    expect(await allSuppressions()).toHaveLength(1)
  })
})

describe('validation', () => {
  it('returns 400 (not 500) for a malformed JSON body', async () => {
    await signInAsAdmin()
    const res = await clearSuppression(clearRequest('not json'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid request body' })
  })

  it('returns 400 when email is missing or not a string', async () => {
    await signInAsAdmin()
    for (const body of [{}, { email: 42 }, { email: '' }]) {
      const res = await clearSuppression(clearRequest(body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'email is required' })
    }
    expect(deleteSuppressedDestination).not.toHaveBeenCalled()
  })

  it('returns 404 for an email with no suppression row, without calling SES', async () => {
    await signInAsAdmin()
    const res = await clearSuppression(
      clearRequest({ email: 'fine@example.com' })
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(deleteSuppressedDestination).not.toHaveBeenCalled()
  })
})

describe('clearing', () => {
  it('clears SES and deletes the local row', async () => {
    await signInAsAdmin()
    await seedSuppression('gone@example.com')
    await seedSuppression('other@example.com')

    const res = await clearSuppression(
      clearRequest({ email: 'gone@example.com' })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(deleteSuppressedDestination).toHaveBeenCalledExactlyOnceWith(
      'gone@example.com'
    )
    const remaining = await allSuppressions()
    expect(remaining.map((r) => r.email)).toEqual(['other@example.com'])
  })

  it('matches the lowercase-stored row when the request uses mixed case', async () => {
    await signInAsAdmin()
    await seedSuppression('gone@example.com')

    const res = await clearSuppression(
      clearRequest({ email: 'GoNe@Example.COM' })
    )
    expect(res.status).toBe(200)
    expect(await allSuppressions()).toHaveLength(0)
  })

  it('returns 502 and keeps the local row when the SES delete fails', async () => {
    await signInAsAdmin()
    await seedSuppression('gone@example.com')
    vi.mocked(deleteSuppressedDestination).mockRejectedValueOnce(
      new Error('TooManyRequestsException')
    )

    const res = await clearSuppression(
      clearRequest({ email: 'gone@example.com' })
    )
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: 'Could not clear the suppression in SES',
    })
    // The row survives, so the admin still sees the suppression and the
    // hourly sync stays consistent with SES.
    expect(await allSuppressions()).toHaveLength(1)
  })
})
