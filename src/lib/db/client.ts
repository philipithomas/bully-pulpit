import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from '@/lib/db/schema'
import { requireEnv } from '@/lib/env'

type Database = ReturnType<typeof drizzle<typeof schema>>

let cached: Database | null = null

/**
 * Lazily-constructed Drizzle client over the Neon HTTP driver. Constructed on
 * first use (not at import) so importing this module during `next build` never
 * requires DATABASE_URL. The HTTP driver is the right fit for serverless
 * request/response queries — no socket to leak between invocations.
 *
 * Multi-statement atomicity (e.g. cascading deletes) is done with a single
 * CTE statement rather than an interactive transaction, which the HTTP driver
 * does not support.
 */
export function getDb(): Database {
  if (!cached) {
    cached = drizzle(neon(requireEnv('DATABASE_URL')), { schema })
  }
  return cached
}
