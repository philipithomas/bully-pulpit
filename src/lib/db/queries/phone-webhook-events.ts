import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type PhoneWebhookEvent, phoneWebhookEvents } from '@/lib/db/schema'

export async function findOrCreatePhoneWebhookEvent(input: {
  eventKey: string
  eventType: string
}): Promise<{ event: PhoneWebhookEvent; inserted: boolean }> {
  const inserted = await getDb()
    .insert(phoneWebhookEvents)
    .values(input)
    .onConflictDoNothing({ target: phoneWebhookEvents.eventKey })
    .returning()
  if (inserted.length > 0) return { event: inserted[0], inserted: true }

  const existing = await getDb()
    .select()
    .from(phoneWebhookEvents)
    .where(eq(phoneWebhookEvents.eventKey, input.eventKey))
    .limit(1)
  return { event: existing[0], inserted: false }
}

export async function markPhoneWebhookEventProcessed(
  id: number
): Promise<boolean> {
  const rows = await getDb()
    .update(phoneWebhookEvents)
    .set({ processedAt: sql`NOW()` })
    .where(eq(phoneWebhookEvents.id, id))
    .returning({ id: phoneWebhookEvents.id })
  return rows.length > 0
}
