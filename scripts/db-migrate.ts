import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { migrate } from 'drizzle-orm/neon-http/migrator'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations')
  }
  const db = drizzle(neon(url))
  await migrate(db, { migrationsFolder: 'src/lib/db/migrations' })
  console.log('✓ Migrations applied')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
