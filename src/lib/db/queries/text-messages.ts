import { desc, eq, or } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import {
  type NewTextMessage,
  type TextMessage,
  textMessages,
} from '@/lib/db/schema'

// Ported from junk-drawer's TextMessage model. A conversation is keyed by the
// external number: the non-Twilio side of each message.

/** Newest-first scan cap when grouping messages into conversations. */
const CONVERSATION_SCAN_LIMIT = 1_000

/** Per-thread message cap; older history is simply not shown. */
const THREAD_LIMIT = 500

/**
 * Inserts one message. Inbound rows carry Twilio's MessageSid, which is
 * unique, so a webhook redelivery is a no-op instead of a duplicate; the
 * original row is returned either way.
 */
export async function createTextMessage(
  input: NewTextMessage
): Promise<TextMessage> {
  const inserted = await getDb()
    .insert(textMessages)
    .values(input)
    .onConflictDoNothing({ target: textMessages.twilioSid })
    .returning()
  if (inserted.length > 0) return inserted[0]
  // Conflict: the sid is already stored (webhook retry). Return that row.
  const existing = await getDb()
    .select()
    .from(textMessages)
    .where(eq(textMessages.twilioSid, input.twilioSid ?? ''))
    .limit(1)
  return existing[0]
}

export type Conversation = {
  number: string
  lastMessage: TextMessage
}

function externalNumber(message: TextMessage): string {
  return message.direction === 'inbound' ? message.fromNumber : message.toNumber
}

/**
 * Conversations ordered by most recent activity, each with its latest
 * message. Groups in memory over the newest CONVERSATION_SCAN_LIMIT rows,
 * which is plenty for a personal phone line; conversations older than the cap
 * age out of the list (the messages themselves are retained).
 */
export async function listConversations(): Promise<Conversation[]> {
  const rows = await getDb()
    .select()
    .from(textMessages)
    .orderBy(desc(textMessages.createdAt), desc(textMessages.id))
    .limit(CONVERSATION_SCAN_LIMIT)
  const byNumber = new Map<string, TextMessage>()
  for (const row of rows) {
    const number = externalNumber(row)
    if (!byNumber.has(number)) byNumber.set(number, row)
  }
  return Array.from(byNumber.entries()).map(([number, lastMessage]) => ({
    number,
    lastMessage,
  }))
}

/** Full thread with one external number, oldest first. */
export async function conversationWith(number: string): Promise<TextMessage[]> {
  const rows = await getDb()
    .select()
    .from(textMessages)
    .where(
      or(eq(textMessages.fromNumber, number), eq(textMessages.toNumber, number))
    )
    .orderBy(desc(textMessages.createdAt), desc(textMessages.id))
    .limit(THREAD_LIMIT)
  return rows.reverse()
}
