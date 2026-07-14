import { and, desc, eq, lte, ne, or } from 'drizzle-orm'
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

/** Bell gets a small, deterministic window instead of the 500-row admin UI. */
const BELL_THREAD_LIMIT = 12

/**
 * Inserts one message. Inbound rows carry Twilio's MessageSid, which is
 * unique, so a webhook redelivery is a no-op instead of a duplicate; the
 * original row is returned either way.
 */
export async function createTextMessage(
  input: NewTextMessage
): Promise<TextMessage> {
  return (await createTextMessageWithStatus(input)).message
}

export async function createTextMessageWithStatus(
  input: NewTextMessage
): Promise<{ message: TextMessage; inserted: boolean }> {
  const dedupeByReply =
    input.replyToMessageId !== null && input.replyToMessageId !== undefined
  const inserted = await getDb()
    .insert(textMessages)
    .values(input)
    .onConflictDoNothing({
      target: dedupeByReply
        ? textMessages.replyToMessageId
        : textMessages.twilioSid,
    })
    .returning()
  if (inserted.length > 0) return { message: inserted[0], inserted: true }
  // Conflict: the Twilio sid or Bell source message is already stored.
  const existing = await getDb()
    .select()
    .from(textMessages)
    .where(
      dedupeByReply
        ? eq(textMessages.replyToMessageId, input.replyToMessageId as number)
        : eq(textMessages.twilioSid, input.twilioSid ?? '')
    )
    .limit(1)
  return { message: existing[0], inserted: false }
}

export async function findTextMessageById(
  id: number
): Promise<TextMessage | null> {
  const rows = await getDb()
    .select()
    .from(textMessages)
    .where(eq(textMessages.id, id))
    .limit(1)
  return rows[0] ?? null
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

/**
 * Recent delivered/received messages through one inbound row, oldest first.
 * The id ceiling keeps two rapidly arriving texts from reading each other as
 * history before either Bell reply exists. Failed outbound attempts are not
 * included because the other person never received them.
 */
export async function recentConversationWith(
  number: string,
  throughId: number,
  limit = BELL_THREAD_LIMIT
): Promise<TextMessage[]> {
  const rows = await getDb()
    .select()
    .from(textMessages)
    .where(
      and(
        or(
          eq(textMessages.fromNumber, number),
          eq(textMessages.toNumber, number)
        ),
        lte(textMessages.id, throughId),
        ne(textMessages.status, 'failed')
      )
    )
    .orderBy(desc(textMessages.createdAt), desc(textMessages.id))
    .limit(Math.max(1, Math.min(limit, 50)))
  return rows.reverse()
}
