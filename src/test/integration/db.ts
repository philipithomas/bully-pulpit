import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import * as schema from '@/lib/db/schema'

/**
 * Integration-test database: an in-memory PGlite instance with the real
 * migration files applied. Test files swap it in for the Neon client with
 *
 *   vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
 *
 * Vitest's per-file module isolation means each test file gets its own
 * instance, so files can run in parallel workers without interfering.
 * Within a file, call `resetDb()` in beforeEach — tests run sequentially.
 */

// Env the config/auth/admin paths read; set before any app module loads them.
process.env.JWT_SECRET ??= 'integration-test-secret-at-least-32-chars-long'
process.env.ADMIN_EMAILS ??= 'admin@example.com'
// rate-limit no-ops off Vercel
delete process.env.VERCEL

const client = new PGlite()

export const db = drizzle(client, { schema })

// Same folder scripts/db-migrate.ts points at — the real schema, not a copy.
await migrate(db, { migrationsFolder: 'src/lib/db/migrations' })

/** Drop-in for @/lib/db/client's getDb. */
export function getDb() {
  return db
}

/** Empties app tables between tests; leaves drizzle's migration bookkeeping. */
export async function resetDb() {
  await db.execute(
    sql`TRUNCATE bell_generations, bell_messages, bell_conversations, email_sends, send_runs, logins, email_suppressions, subscribers, text_messages, phone_webhook_events, sms_sends, sms_subscribers RESTART IDENTITY CASCADE`
  )
}

export async function closeDb() {
  await client.close()
}
