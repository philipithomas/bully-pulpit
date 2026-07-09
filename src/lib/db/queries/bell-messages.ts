import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import {
  type BellMessage,
  bellConversations,
  bellMessages,
  type NewBellMessage,
} from '@/lib/db/schema'

export type BellMessageRole = 'user' | 'assistant' | 'system'
export type BellAuthorKind = 'visitor' | 'bell' | 'admin' | 'system'
export type BellMessageStatus =
  | 'received'
  | 'generating'
  | 'completed'
  | 'aborted'
  | 'error'
  | 'redacted'

export const MAX_BELL_MESSAGE_CHARACTERS = 16_000
export const MAX_BELL_PARTS_JSON_BYTES = 64_000

export function boundedBellContent(value: string): string {
  return value.trim().slice(0, MAX_BELL_MESSAGE_CHARACTERS)
}

export function boundedBellParts(
  parts: unknown[] | null | undefined,
  fallbackText = ''
): unknown[] | null {
  if (!parts) return null
  try {
    if (
      Buffer.byteLength(JSON.stringify(parts), 'utf8') <=
      MAX_BELL_PARTS_JSON_BYTES
    ) {
      return parts
    }
  } catch {
    // Non-serializable client data falls back to the already-sanitized text.
  }
  const text = boundedBellContent(fallbackText)
  return text ? [{ type: 'text', text }] : null
}

export function textFromBellParts(parts: unknown[] | null | undefined): string {
  if (!parts) return ''
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        typeof part === 'object' &&
        part !== null &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string'
    )
    .map((part) => part.text)
    .join('\n')
    .trim()
}

/**
 * Inserts one canonical Bell message. Browser message IDs and linked SMS rows
 * are idempotency keys, so replays return the original row.
 */
export async function createBellMessage(
  input: NewBellMessage
): Promise<{ message: BellMessage; inserted: boolean }> {
  const content = boundedBellContent(input.content ?? '')
  const values = {
    ...input,
    content,
    parts: boundedBellParts(input.parts, content),
  }
  const conflictTarget = input.sourceTextMessageId
    ? bellMessages.sourceTextMessageId
    : input.clientMessageId
      ? [bellMessages.conversationId, bellMessages.clientMessageId]
      : null
  const query = getDb().insert(bellMessages).values(values)
  const inserted = conflictTarget
    ? await query.onConflictDoNothing({ target: conflictTarget }).returning()
    : await query.returning()
  if (inserted[0]) return { message: inserted[0], inserted: true }

  const where = input.sourceTextMessageId
    ? eq(bellMessages.sourceTextMessageId, input.sourceTextMessageId)
    : and(
        eq(bellMessages.conversationId, input.conversationId),
        eq(bellMessages.clientMessageId, input.clientMessageId ?? '')
      )
  const existing = await getDb()
    .select()
    .from(bellMessages)
    .where(where)
    .limit(1)
  if (!existing[0]) throw new Error('Bell message conflict row was not found')
  return { message: existing[0], inserted: false }
}

export async function updateBellMessage(
  id: string,
  values: Partial<
    Pick<
      BellMessage,
      | 'content'
      | 'parts'
      | 'sourceTextMessageId'
      | 'replyToMessageId'
      | 'status'
      | 'redactedAt'
    >
  >
): Promise<BellMessage | null> {
  const content =
    values.content === undefined
      ? undefined
      : boundedBellContent(values.content)
  const parts =
    values.parts === undefined
      ? undefined
      : boundedBellParts(values.parts, content ?? '')
  const rows = await getDb()
    .update(bellMessages)
    .set({ ...values, content, parts, updatedAt: sql`NOW()` })
    .where(eq(bellMessages.id, id))
    .returning()
  if (rows[0]) {
    await getDb()
      .update(bellConversations)
      .set({ updatedAt: sql`NOW()` })
      .where(eq(bellConversations.id, rows[0].conversationId))
  }
  return rows[0] ?? null
}

export async function findBellMessageById(
  id: string
): Promise<BellMessage | null> {
  const rows = await getDb()
    .select()
    .from(bellMessages)
    .where(eq(bellMessages.id, id))
    .limit(1)
  return rows[0] ?? null
}
