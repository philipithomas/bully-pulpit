import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribers } from '@/lib/db/schema'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { db, getDb, resetDb } from '@/test/integration/db'

beforeEach(resetDb)

describe('integration harness', () => {
  it('applies the real migrations', async () => {
    const tables = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    )
    const names = tables.rows.map((r) => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'email_sends',
        'email_suppressions',
        'logins',
        'subscribers',
      ])
    )
  })

  it('getDb returns the PGlite-backed drizzle instance', async () => {
    const [row] = await getDb()
      .insert(subscribers)
      .values({ email: 'harness@example.com' })
      .returning()
    expect(row.email).toBe('harness@example.com')
    expect(row.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('resetDb truncates between tests', async () => {
    const rows = await db.select().from(subscribers)
    expect(rows).toHaveLength(0)
  })
})
