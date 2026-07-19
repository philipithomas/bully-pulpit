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

  it('applies the confirmed_at index migration', async () => {
    const indexes = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'subscribers'`
    )
    const names = indexes.rows.map((r) => r.indexname)
    expect(names).toContain('idx_subscribers_confirmed_at')
  })

  it('applies the Tidbits column and index renames', async () => {
    const columns = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('subscribers', 'sms_subscribers')
        AND (
          column_name LIKE '%umami%'
          OR column_name IN (
            'subscribed_tidbits',
            'tidbits_opt_in_notification_sent_at'
          )
        )
      ORDER BY table_name, column_name
    `)
    expect(columns.rows).toEqual([
      {
        table_name: 'sms_subscribers',
        column_name: 'subscribed_tidbits',
      },
      {
        table_name: 'subscribers',
        column_name: 'subscribed_tidbits',
      },
      {
        table_name: 'subscribers',
        column_name: 'tidbits_opt_in_notification_sent_at',
      },
    ])

    const indexes = await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexname LIKE '%umami%' OR indexname LIKE '%tidbits%')
      ORDER BY indexname
    `)
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'idx_sms_subscribers_tidbits_created',
      'idx_subscribers_tidbits_created',
    ])
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
