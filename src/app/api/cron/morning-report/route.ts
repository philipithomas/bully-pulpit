import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getRun, start } from 'workflow/api'
import { recordCronFailed } from '@/lib/cron/heartbeat'
import {
  getMorningReport,
  releaseMorningReport,
  reserveMorningReport,
} from '@/lib/db/queries/morning-reports'
import { requireEnv } from '@/lib/env'
import { morningReportClock } from '@/lib/morning-report/content'
import { morningReportWorkflow } from '@/workflows/morning-report'

// Vercel cron is UTC-only. Both possible 7am UTC hours invoke this route;
// the New York clock admits only the current local 7am hour (including DST).
// Repeated invocations provide bounded catch-up because Vercel does not retry.
export async function GET(request: Request) {
  if (
    request.headers.get('authorization') !==
    `Bearer ${requireEnv('CRON_SECRET')}`
  )
    return new NextResponse('Unauthorized', { status: 401 })
  if (process.env.VERCEL_ENV !== 'production')
    return NextResponse.json({ skipped: 'production-only' })
  const { date, due } = morningReportClock()
  if (!due) return NextResponse.json({ skipped: 'outside-morning-window' })
  try {
    const existing = await getMorningReport(date)
    if (existing?.completedAt)
      return NextResponse.json({ skipped: 'already-completed' })
    let terminalRunId: string | null = null
    if (existing?.workflowRunId) {
      const status = await getRun(existing.workflowRunId).status
      // Unknown/unavailable owners fail closed; never use elapsed time to
      // replace a workflow which may still send mail.
      if (status === 'cancelled')
        return NextResponse.json({ skipped: 'cancelled' })
      if (!['completed', 'failed'].includes(status))
        return NextResponse.json({ skipped: 'active-run' })
      terminalRunId = existing.workflowRunId
    }
    const token = randomUUID()
    if (!(await reserveMorningReport(date, token, terminalRunId)))
      return NextResponse.json({ skipped: 'claimed' })
    try {
      const run = await start(morningReportWorkflow, [date, token])
      return NextResponse.json(
        { started: true, runId: run.runId },
        { status: 202 }
      )
    } catch (error) {
      // CAS cannot revoke a run that already accepted. If a late enqueue
      // subsequently executes, its now-invalid token loses the first step.
      await releaseMorningReport(date, token)
      throw error
    }
  } catch {
    await recordCronFailed('morning-report')
    return NextResponse.json(
      { error: 'Morning report scheduling failed' },
      { status: 503 }
    )
  }
}
