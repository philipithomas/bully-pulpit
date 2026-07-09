import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { createBellGeneration } from '@/lib/db/queries/bell-generations'
import { createBellMessage } from '@/lib/db/queries/bell-messages'
import {
  type BellConversation,
  type BellGeneration,
  type BellMessage,
  bellConversations,
  bellGenerations,
  bellMessages,
  subscribers,
  textMessages,
} from '@/lib/db/schema'

export type BellSurface = 'web' | 'sms'
export type BellIdentity = 'signed_in' | 'phone' | 'anonymous'
export type BellConversationStatus = 'active' | 'completed' | 'error'

const ANONYMOUS_RETENTION_DAYS = 90
const SIGNED_IN_RETENTION_DAYS = 365
const DEFAULT_LIST_LIMIT = 30
const MAX_LIST_LIMIT = 100

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

export function bellConversationExpiry(
  surface: BellSurface,
  signedIn: boolean,
  now = new Date()
): Date | null {
  if (surface === 'sms') return null
  return addDays(
    now,
    signedIn ? SIGNED_IN_RETENTION_DAYS : ANONYMOUS_RETENTION_DAYS
  )
}

export async function getOrCreateWebBellConversation(input: {
  clientConversationId: string
  subscriberId?: number | null
  networkIdentityHash?: string | null
  networkIdentityPeriod?: string | null
  pagePath?: string | null
  pageTitle?: string | null
  now?: Date
}): Promise<BellConversation> {
  const now = input.now ?? new Date()
  const subscriberId = input.subscriberId ?? null
  const signedExpiresAt = bellConversationExpiry('web', true, now)
  const anonymousExpiresAt = bellConversationExpiry('web', false, now)
  const expiresAt = subscriberId ? signedExpiresAt : anonymousExpiresAt
  // Resolve identity inside the upsert itself. A preselect leaves a race where
  // concurrent signed-in and anonymous requests can both observe no row, then
  // let the anonymous conflict update erase the trusted subscriber. Existing
  // attribution wins; an anonymous row can still atomically upgrade once.
  const stickySubscriberId = sql`COALESCE(${bellConversations.subscriberId}, excluded.subscriber_id)`
  const rows = await getDb()
    .insert(bellConversations)
    .values({
      clientConversationId: input.clientConversationId,
      surface: 'web',
      subscriberId,
      networkIdentityHash: subscriberId
        ? null
        : (input.networkIdentityHash ?? null),
      networkIdentityPeriod: subscriberId
        ? null
        : (input.networkIdentityPeriod ?? null),
      firstPagePath: input.pagePath ?? null,
      firstPageTitle: input.pageTitle ?? null,
      lastPagePath: input.pagePath ?? null,
      lastPageTitle: input.pageTitle ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bellConversations.clientConversationId,
      set: {
        subscriberId: stickySubscriberId,
        networkIdentityHash: sql`CASE
          WHEN ${stickySubscriberId} IS NOT NULL THEN NULL
          ELSE COALESCE(excluded.network_identity_hash, ${bellConversations.networkIdentityHash})
        END`,
        networkIdentityPeriod: sql`CASE
          WHEN ${stickySubscriberId} IS NOT NULL THEN NULL
          ELSE COALESCE(excluded.network_identity_period, ${bellConversations.networkIdentityPeriod})
        END`,
        lastPagePath: input.pagePath ?? sql`${bellConversations.lastPagePath}`,
        lastPageTitle:
          input.pageTitle ?? sql`${bellConversations.lastPageTitle}`,
        expiresAt: sql`CASE
          WHEN ${stickySubscriberId} IS NOT NULL THEN ${signedExpiresAt}::timestamptz
          ELSE ${anonymousExpiresAt}::timestamptz
        END`,
        updatedAt: now,
      },
    })
    .returning()
  return rows[0]
}

export async function getOrCreateSmsBellConversation(input: {
  smsPhoneHash: string
  smsSubscriberId?: number | null
  now?: Date
}): Promise<BellConversation> {
  const now = input.now ?? new Date()
  const rows = await getDb()
    .insert(bellConversations)
    .values({
      surface: 'sms',
      smsPhoneHash: input.smsPhoneHash,
      smsSubscriberId: input.smsSubscriberId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: bellConversations.smsPhoneHash,
      set: {
        smsSubscriberId:
          input.smsSubscriberId ?? sql`${bellConversations.smsSubscriberId}`,
        updatedAt: now,
      },
    })
    .returning()
  return rows[0]
}

export async function createWebBellTurn(input: {
  conversation: BellConversation
  requestId: string
  clientMessageId: string
  content: string
  parts: unknown[]
  traceId?: string | null
}) {
  const user = await createBellMessage({
    conversationId: input.conversation.id,
    role: 'user',
    authorKind: 'visitor',
    content: input.content,
    parts: input.parts,
    clientMessageId: input.clientMessageId,
    status: 'received',
    expiresAt: input.conversation.expiresAt,
  })
  const generation = await createBellGeneration({
    requestId: input.requestId,
    conversationId: input.conversation.id,
    userMessageId: user.message.id,
    traceId: input.traceId,
    expiresAt: input.conversation.expiresAt,
  })
  return {
    userMessage: user.message,
    generation: generation.generation,
    inserted: user.inserted,
    generationInserted: generation.inserted,
  }
}

export async function createSmsBellTurn(input: {
  conversation: BellConversation
  inboundTextMessageId: number
  traceId?: string | null
}) {
  const user = await createBellMessage({
    conversationId: input.conversation.id,
    role: 'user',
    authorKind: 'visitor',
    // The transport row is canonical for SMS content. Bell stores only the
    // author/link metadata and hydrates the body for authorized admin reads.
    content: '',
    parts: null,
    sourceTextMessageId: input.inboundTextMessageId,
    status: 'received',
  })
  if (!user.inserted) {
    const existing = await getDb()
      .select()
      .from(bellGenerations)
      .where(eq(bellGenerations.userMessageId, user.message.id))
      .orderBy(desc(bellGenerations.createdAt), desc(bellGenerations.id))
      .limit(1)
    if (existing[0]) {
      return {
        userMessage: user.message,
        generation: existing[0],
        inserted: false,
      }
    }
  }
  const generation = await createBellGeneration({
    conversationId: input.conversation.id,
    userMessageId: user.message.id,
    traceId: input.traceId,
  })
  return {
    userMessage: user.message,
    generation: generation.generation,
    inserted: user.inserted,
    generationInserted: generation.inserted,
  }
}

export type BellConversationListInput = {
  surface?: BellSurface
  identity?: BellIdentity
  status?: BellConversationStatus
  dateFrom?: Date
  /** Exclusive upper bound. */
  dateTo?: Date
  search?: string
  cursor?: string
  limit?: number
}

export type BellConversationSummary = {
  id: string
  surface: BellSurface
  status: BellConversationStatus
  identity: BellIdentity
  subscriberUuid: string | null
  subscriberEmail: string | null
  subscriberName: string | null
  smsNumber: string | null
  networkIdentityLabel: string | null
  firstPagePath: string | null
  firstPageTitle: string | null
  lastPagePath: string | null
  messageCount: number
  lastMessageAt: Date | null
  latestGenerationStatus: string | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date | null
}

type Cursor = { updatedAt: string; id: string }

function decodeCursor(cursor?: string): Cursor | null {
  if (!cursor) return null
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as Cursor
    if (
      typeof value.id !== 'string' ||
      typeof value.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(value.updatedAt))
    ) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function encodeCursor(conversation: BellConversation): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: conversation.updatedAt.toISOString(),
      id: conversation.id,
    })
  ).toString('base64url')
}

function identityWhere(identity: BellIdentity): SQL {
  if (identity === 'signed_in') return isNotNull(bellConversations.subscriberId)
  if (identity === 'phone') return eq(bellConversations.surface, 'sms')
  return and(
    eq(bellConversations.surface, 'web'),
    isNull(bellConversations.subscriberId)
  ) as SQL
}

function listWhere(input: BellConversationListInput): SQL {
  const conditions: Array<SQL | undefined> = [
    isNull(bellConversations.deletedAt),
    input.surface ? eq(bellConversations.surface, input.surface) : undefined,
    input.identity ? identityWhere(input.identity) : undefined,
    input.status ? eq(bellConversations.status, input.status) : undefined,
    input.dateFrom
      ? gte(bellConversations.createdAt, input.dateFrom)
      : undefined,
    input.dateTo ? lt(bellConversations.createdAt, input.dateTo) : undefined,
  ]
  const cursor = decodeCursor(input.cursor)
  if (cursor) {
    const at = new Date(cursor.updatedAt)
    conditions.push(
      or(
        lt(bellConversations.updatedAt, at),
        and(
          eq(bellConversations.updatedAt, at),
          lt(bellConversations.id, cursor.id)
        )
      )
    )
  }
  const search = input.search?.trim().slice(0, 100)
  if (search) {
    const pattern = `%${search}%`
    conditions.push(
      or(
        ilike(subscribers.email, pattern),
        ilike(subscribers.name, pattern),
        ilike(bellConversations.networkIdentityHash, pattern),
        sql`EXISTS (
          SELECT 1 FROM ${bellMessages} bm
          JOIN ${textMessages} tm ON tm.id = bm.source_text_message_id
          WHERE bm.conversation_id = ${bellConversations.id}
            AND (tm.from_number ILIKE ${pattern} OR tm.to_number ILIKE ${pattern})
        )`
      )
    )
  }
  return and(...conditions) as SQL
}

async function summariesFor(
  rows: Array<{
    conversation: BellConversation
    subscriberUuid: string | null
    subscriberEmail: string | null
    subscriberName: string | null
  }>
): Promise<BellConversationSummary[]> {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.conversation.id)
  const [messageStats, sourceRows, generationRows] = await Promise.all([
    getDb()
      .select({
        conversationId: bellMessages.conversationId,
        messageCount: count(),
        lastMessageAt: max(bellMessages.createdAt),
      })
      .from(bellMessages)
      .where(inArray(bellMessages.conversationId, ids))
      .groupBy(bellMessages.conversationId),
    getDb()
      .select({
        conversationId: bellMessages.conversationId,
        fromNumber: textMessages.fromNumber,
        toNumber: textMessages.toNumber,
        direction: textMessages.direction,
      })
      .from(bellMessages)
      .innerJoin(
        textMessages,
        eq(textMessages.id, bellMessages.sourceTextMessageId)
      )
      .where(inArray(bellMessages.conversationId, ids))
      .orderBy(asc(bellMessages.createdAt)),
    getDb()
      .select({
        conversationId: bellGenerations.conversationId,
        status: bellGenerations.status,
      })
      .from(bellGenerations)
      .where(inArray(bellGenerations.conversationId, ids))
      .orderBy(desc(bellGenerations.createdAt), desc(bellGenerations.id)),
  ])
  const stats = new Map(messageStats.map((row) => [row.conversationId, row]))
  const numbers = new Map<string, string>()
  for (const row of sourceRows) {
    if (!numbers.has(row.conversationId)) {
      numbers.set(
        row.conversationId,
        row.direction === 'inbound' ? row.fromNumber : row.toNumber
      )
    }
  }
  const generationStatus = new Map<string, string>()
  for (const row of generationRows) {
    if (!generationStatus.has(row.conversationId)) {
      generationStatus.set(row.conversationId, row.status)
    }
  }

  return rows.map((row) => {
    const c = row.conversation
    const identity: BellIdentity = c.subscriberId
      ? 'signed_in'
      : c.surface === 'sms'
        ? 'phone'
        : 'anonymous'
    return {
      id: c.id,
      surface: c.surface as BellSurface,
      status: c.status as BellConversationStatus,
      identity,
      subscriberUuid: row.subscriberUuid,
      subscriberEmail: row.subscriberEmail,
      subscriberName: row.subscriberName,
      smsNumber: numbers.get(c.id) ?? null,
      networkIdentityLabel:
        c.networkIdentityHash && c.networkIdentityPeriod
          ? `Network ${c.networkIdentityHash.slice(0, 8)} (${c.networkIdentityPeriod})`
          : null,
      firstPagePath: c.firstPagePath,
      firstPageTitle: c.firstPageTitle,
      lastPagePath: c.lastPagePath,
      messageCount: Number(stats.get(c.id)?.messageCount ?? 0),
      lastMessageAt: stats.get(c.id)?.lastMessageAt ?? null,
      latestGenerationStatus: generationStatus.get(c.id) ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      expiresAt: c.expiresAt,
    }
  })
}

export async function listBellConversations(
  input: BellConversationListInput = {}
): Promise<{
  conversations: BellConversationSummary[]
  nextCursor: string | null
}> {
  const limit = Math.max(
    1,
    Math.min(Math.floor(input.limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT)
  )
  const rows = await getDb()
    .select({
      conversation: bellConversations,
      subscriberUuid: subscribers.uuid,
      subscriberEmail: subscribers.email,
      subscriberName: subscribers.name,
    })
    .from(bellConversations)
    .leftJoin(subscribers, eq(subscribers.id, bellConversations.subscriberId))
    .where(listWhere(input))
    .orderBy(desc(bellConversations.updatedAt), desc(bellConversations.id))
    .limit(limit + 1)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return {
    conversations: await summariesFor(page),
    nextCursor: hasMore
      ? encodeCursor(page[page.length - 1].conversation)
      : null,
  }
}

export type BellConversationDetail = {
  conversation: BellConversationSummary
  messages: BellMessage[]
  generations: BellGeneration[]
}

export async function getBellConversationDetail(
  id: string
): Promise<BellConversationDetail | null> {
  const rows = await getDb()
    .select({
      conversation: bellConversations,
      subscriberUuid: subscribers.uuid,
      subscriberEmail: subscribers.email,
      subscriberName: subscribers.name,
    })
    .from(bellConversations)
    .leftJoin(subscribers, eq(subscribers.id, bellConversations.subscriberId))
    .where(
      and(eq(bellConversations.id, id), isNull(bellConversations.deletedAt))
    )
    .limit(1)
  if (!rows[0]) return null
  const [summaries, rawMessages, generations] = await Promise.all([
    summariesFor(rows),
    getDb()
      .select()
      .from(bellMessages)
      .where(eq(bellMessages.conversationId, id))
      .orderBy(asc(bellMessages.createdAt), asc(bellMessages.id)),
    getDb()
      .select()
      .from(bellGenerations)
      .where(eq(bellGenerations.conversationId, id))
      .orderBy(asc(bellGenerations.createdAt), asc(bellGenerations.id)),
  ])
  const sourceIds = rawMessages
    .map((message) => message.sourceTextMessageId)
    .filter((id): id is number => id !== null)
  const sourceMessages =
    sourceIds.length > 0
      ? await getDb()
          .select({ id: textMessages.id, body: textMessages.body })
          .from(textMessages)
          .where(inArray(textMessages.id, sourceIds))
      : []
  const sourceBodies = new Map(
    sourceMessages.map((message) => [message.id, message.body])
  )
  const messages = rawMessages.map((message) =>
    message.sourceTextMessageId && message.status !== 'redacted'
      ? {
          ...message,
          content: sourceBodies.get(message.sourceTextMessageId) ?? '',
        }
      : message
  )
  return { conversation: summaries[0], messages, generations }
}

export async function redactBellConversation(id: string): Promise<boolean> {
  const result = await getDb().execute(sql`
    WITH redacted AS (
      UPDATE ${bellMessages}
      SET content = '[Redacted]', parts = NULL, status = 'redacted',
          redacted_at = NOW(), updated_at = NOW()
      WHERE ${bellMessages.conversationId} = ${id}
      RETURNING 1
    ), scrubbed_errors AS (
      UPDATE ${bellGenerations}
      SET error_message = NULL, updated_at = NOW()
      WHERE ${bellGenerations.conversationId} = ${id}
      RETURNING 1
    )
    UPDATE ${bellConversations}
    SET updated_at = NOW()
    WHERE ${bellConversations.id} = ${id}
    RETURNING ${bellConversations.id}
  `)
  return result.rows.length > 0
}

export async function deleteBellConversation(id: string): Promise<boolean> {
  const rows = await getDb()
    .delete(bellConversations)
    .where(eq(bellConversations.id, id))
    .returning({ id: bellConversations.id })
  return rows.length > 0
}

export async function purgeExpiredBellConversations(
  now = new Date()
): Promise<number> {
  const rows = await getDb()
    .delete(bellConversations)
    .where(
      and(
        isNotNull(bellConversations.expiresAt),
        lte(bellConversations.expiresAt, now)
      )
    )
    .returning({ id: bellConversations.id })
  return rows.length
}
