import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { morningReportDeliveries, morningReports } from '@/lib/db/schema'
import type {
  MorningReportContent,
  MorningReportEmail,
} from '@/lib/morning-report/content'

export const MORNING_REPORT_ENQUEUE_LEASE_MS = 5 * 60_000

export async function getMorningReport(date: string) {
  const [row] = await getDb()
    .select()
    .from(morningReports)
    .where(eq(morningReports.reportDate, date))
  return row ?? null
}

/** The caller may replace an owner only after observing that exact run terminal. */
export async function reserveMorningReport(
  date: string,
  token: string,
  terminalRunId: string | null,
  now = new Date()
) {
  const db = getDb()
  await db
    .insert(morningReports)
    .values({ reportDate: date })
    .onConflictDoNothing()
  const [row] = await db
    .update(morningReports)
    .set({ enqueueToken: token, enqueueAt: now, workflowRunId: null })
    .where(
      and(
        eq(morningReports.reportDate, date),
        isNull(morningReports.completedAt),
        terminalRunId
          ? eq(morningReports.workflowRunId, terminalRunId)
          : and(
              isNull(morningReports.workflowRunId),
              or(
                isNull(morningReports.enqueueToken),
                lt(
                  morningReports.enqueueAt,
                  new Date(now.getTime() - MORNING_REPORT_ENQUEUE_LEASE_MS)
                )
              )
            )
      )
    )
    .returning()
  return !!row
}

export async function releaseMorningReport(date: string, token: string) {
  await getDb()
    .update(morningReports)
    .set({ enqueueToken: null, enqueueAt: null })
    .where(
      and(
        eq(morningReports.reportDate, date),
        eq(morningReports.enqueueToken, token),
        isNull(morningReports.workflowRunId)
      )
    )
}

/** A lost DB acknowledgement may replay the same accepted durable step. */
export async function acceptMorningReport(
  date: string,
  token: string,
  runId: string
) {
  const [row] = await getDb()
    .update(morningReports)
    .set({ workflowRunId: runId, enqueueToken: null, enqueueAt: null })
    .where(
      and(
        eq(morningReports.reportDate, date),
        isNull(morningReports.completedAt),
        or(
          and(
            eq(morningReports.enqueueToken, token),
            isNull(morningReports.workflowRunId)
          ),
          eq(morningReports.workflowRunId, runId)
        )
      )
    )
    .returning()
  return !!row
}

export async function snapshotMorningReport(
  date: string,
  runId: string,
  content: MorningReportContent,
  recipients: string[]
) {
  if (!recipients.length)
    throw new Error('Morning report has no admin recipients')
  await getDb()
    .update(morningReports)
    .set({ content, recipients })
    .where(
      and(
        eq(morningReports.reportDate, date),
        eq(morningReports.workflowRunId, runId),
        isNull(morningReports.content)
      )
    )
  const row = await getMorningReport(date)
  if (row?.workflowRunId !== runId || !row.content || !row.recipients?.length)
    throw new Error('Morning report ownership lost')
  await getDb()
    .insert(morningReportDeliveries)
    .values(
      row.recipients.map((recipient) => ({ reportDate: date, recipient }))
    )
    .onConflictDoNothing()
  return { content: row.content, recipients: row.recipients, email: row.email }
}

export async function saveMorningReportEmail(
  date: string,
  runId: string,
  email: MorningReportEmail
) {
  await getDb()
    .update(morningReports)
    .set({ email })
    .where(
      and(
        eq(morningReports.reportDate, date),
        eq(morningReports.workflowRunId, runId),
        isNull(morningReports.email)
      )
    )
  const row = await getMorningReport(date)
  if (row?.workflowRunId !== runId || !row.email)
    throw new Error('Morning report ownership lost')
  return row.email
}

export async function morningReportDeliveryPending(
  date: string,
  runId: string,
  recipient: string
) {
  const [row] = await getDb()
    .select({
      sentAt: morningReportDeliveries.sentAt,
      skippedAt: morningReportDeliveries.skippedAt,
    })
    .from(morningReportDeliveries)
    .innerJoin(
      morningReports,
      eq(morningReports.reportDate, morningReportDeliveries.reportDate)
    )
    .where(
      and(
        eq(morningReports.reportDate, date),
        eq(morningReports.workflowRunId, runId),
        isNull(morningReports.completedAt),
        eq(morningReportDeliveries.recipient, recipient)
      )
    )
  return !!row && !row.sentAt && !row.skippedAt
}

export async function markMorningReportDelivered(
  date: string,
  runId: string,
  recipient: string
) {
  // Idempotent for the same report/recipient, including acknowledgement retries.
  await getDb()
    .update(morningReportDeliveries)
    .set({ sentAt: sql`COALESCE(${morningReportDeliveries.sentAt}, now())` })
    .where(
      and(
        eq(morningReportDeliveries.reportDate, date),
        eq(morningReportDeliveries.recipient, recipient),
        isNull(morningReportDeliveries.skippedAt),
        sql`EXISTS (SELECT 1 FROM ${morningReports} WHERE ${morningReports.reportDate} = ${date} AND ${morningReports.workflowRunId} = ${runId})`
      )
    )
}

export async function completeMorningReport(date: string, runId: string) {
  const [row] = await getDb()
    .update(morningReports)
    .set({ completedAt: sql`COALESCE(${morningReports.completedAt}, now())` })
    .where(
      and(
        eq(morningReports.reportDate, date),
        eq(morningReports.workflowRunId, runId),
        sql`EXISTS (SELECT 1 FROM ${morningReportDeliveries} WHERE ${morningReportDeliveries.reportDate} = ${date})`,
        sql`NOT EXISTS (SELECT 1 FROM ${morningReportDeliveries} WHERE ${morningReportDeliveries.reportDate} = ${date} AND ${morningReportDeliveries.sentAt} IS NULL AND ${morningReportDeliveries.skippedAt} IS NULL)`
      )
    )
    .returning()
  if (!row) throw new Error('Morning report still has pending deliveries')
}

/** Removed administrators become terminal without claiming an email was sent. */
export async function skipMorningReportDelivery(
  date: string,
  runId: string,
  recipient: string
) {
  await getDb()
    .update(morningReportDeliveries)
    .set({
      skippedAt: sql`COALESCE(${morningReportDeliveries.skippedAt}, now())`,
      skipReason: 'admin_removed',
    })
    .where(
      and(
        eq(morningReportDeliveries.reportDate, date),
        eq(morningReportDeliveries.recipient, recipient),
        isNull(morningReportDeliveries.sentAt),
        sql`EXISTS (SELECT 1 FROM ${morningReports} WHERE ${morningReports.reportDate} = ${date} AND ${morningReports.workflowRunId} = ${runId})`
      )
    )
}
