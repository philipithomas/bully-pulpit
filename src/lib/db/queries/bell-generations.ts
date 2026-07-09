import { and, eq, gt, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { getDb } from '@/lib/db/client'
import {
  type BellGeneration,
  bellConversations,
  bellGenerations,
} from '@/lib/db/schema'

export type BellGenerationStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'aborted'
  | 'error'

export async function createBellGeneration(input: {
  requestId?: string | null
  conversationId: string
  userMessageId: string
  traceId?: string | null
  workflowRunId?: string | null
  expiresAt?: Date | null
}): Promise<{ generation: BellGeneration; inserted: boolean }> {
  const rows = await getDb()
    .insert(bellGenerations)
    .values({
      requestId: input.requestId ?? null,
      conversationId: input.conversationId,
      userMessageId: input.userMessageId,
      traceId: input.traceId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoNothing(
      input.requestId ? { target: bellGenerations.requestId } : undefined
    )
    .returning()
  if (rows[0]) {
    await setConversationStatusForGeneration(rows[0], 'active')
    return { generation: rows[0], inserted: true }
  }
  if (!input.requestId) {
    throw new Error('Bell generation insert returned no row')
  }
  const existing = await getDb()
    .select()
    .from(bellGenerations)
    .where(eq(bellGenerations.requestId, input.requestId))
    .limit(1)
  if (!existing[0]) {
    throw new Error('Bell generation conflict row was not found')
  }
  if (
    existing[0].conversationId !== input.conversationId ||
    existing[0].userMessageId !== input.userMessageId
  ) {
    throw new Error('Bell generation request ID belongs to another turn')
  }
  return { generation: existing[0], inserted: false }
}

async function setConversationStatusForGeneration(
  generation: BellGeneration,
  status: 'active' | 'completed' | 'error'
) {
  const newerGeneration = alias(bellGenerations, 'newer_generation')
  await getDb()
    .update(bellConversations)
    .set({ status, updatedAt: sql`NOW()` })
    .where(
      and(
        eq(bellConversations.id, generation.conversationId),
        notExists(
          getDb()
            .select({ id: newerGeneration.id })
            .from(newerGeneration)
            .where(
              and(
                eq(newerGeneration.conversationId, generation.conversationId),
                or(
                  gt(newerGeneration.createdAt, generation.createdAt),
                  and(
                    eq(newerGeneration.createdAt, generation.createdAt),
                    gt(newerGeneration.id, generation.id)
                  )
                )
              )
            )
        )
      )
    )
}

export async function markBellGenerationRunning(
  id: string
): Promise<BellGeneration | null> {
  const rows = await getDb()
    .update(bellGenerations)
    .set({
      status: 'running',
      startedAt: sql`COALESCE(${bellGenerations.startedAt}, NOW())`,
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(bellGenerations.id, id))
    .returning()
  if (rows[0]) await setConversationStatusForGeneration(rows[0], 'active')
  return rows[0] ?? null
}

export type CompleteBellGenerationInput = {
  assistantMessageId?: string | null
  model?: string | null
  provider?: string | null
  callId?: string | null
  gatewayGenerationId?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  cachedInputTokens?: number | null
  reasoningTokens?: number | null
  costUsd?: number | null
  latencyMs?: number | null
  finishReason?: string | null
  toolsUsed?: string[] | null
}

export async function completeBellGeneration(
  id: string,
  input: CompleteBellGenerationInput
): Promise<BellGeneration | null> {
  const rows = await getDb()
    .update(bellGenerations)
    .set({
      ...input,
      status: 'completed',
      finishedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(bellGenerations.id, id))
    .returning()
  if (rows[0]) {
    await setConversationStatusForGeneration(rows[0], 'completed')
  }
  return rows[0] ?? null
}

function sanitizedError(error: unknown): { code: string; message: string } {
  const code =
    error instanceof Error && error.name ? error.name.slice(0, 120) : 'Error'
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+\d{8,15}/g, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
  return { code, message: message || 'Bell generation failed' }
}

export async function failBellGeneration(
  id: string,
  error: unknown,
  latencyMs?: number
): Promise<BellGeneration | null> {
  const details = sanitizedError(error)
  const rows = await getDb()
    .update(bellGenerations)
    .set({
      status: 'error',
      errorCode: details.code,
      errorMessage: details.message,
      latencyMs,
      finishedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(bellGenerations.id, id))
    .returning()
  if (rows[0]) await setConversationStatusForGeneration(rows[0], 'error')
  return rows[0] ?? null
}

export async function abortBellGeneration(
  id: string,
  latencyMs?: number
): Promise<BellGeneration | null> {
  const rows = await getDb()
    .update(bellGenerations)
    .set({
      status: 'aborted',
      latencyMs,
      finishReason: 'aborted',
      finishedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(bellGenerations.id, id))
    .returning()
  if (rows[0]) {
    await setConversationStatusForGeneration(rows[0], 'completed')
  }
  return rows[0] ?? null
}

export async function setBellGenerationWorkflowRunId(
  id: string,
  workflowRunId: string
): Promise<void> {
  await getDb()
    .update(bellGenerations)
    .set({ workflowRunId, updatedAt: sql`NOW()` })
    .where(eq(bellGenerations.id, id))
}

export async function setBellGenerationAssistantMessageId(
  id: string,
  assistantMessageId: string
): Promise<void> {
  await getDb()
    .update(bellGenerations)
    .set({ assistantMessageId, updatedAt: sql`NOW()` })
    .where(eq(bellGenerations.id, id))
}
