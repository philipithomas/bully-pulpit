import { NextResponse } from 'next/server'
import { getRun, start } from 'workflow/api'
import { requireEnv } from '@/lib/env'
import { bellSmokeWorkflow } from '@/workflows/bell-smoke'
import { workflowSmokeWorkflow } from '@/workflows/workflow-smoke'

export const maxDuration = 180

type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTerminalStatus(
  runId: string,
  bell: boolean
): Promise<WorkflowStatus> {
  const timeoutMs = numberEnv(
    'WORKFLOW_SMOKE_TIMEOUT_MS',
    bell ? 140_000 : 15_000
  )
  const pollMs = numberEnv('WORKFLOW_SMOKE_POLL_MS', 500)
  const deadline = Date.now() + timeoutMs
  let status = (await getRun(runId).status) as WorkflowStatus

  while (
    (status === 'pending' || status === 'running') &&
    Date.now() < deadline
  ) {
    await sleep(pollMs)
    status = (await getRun(runId).status) as WorkflowStatus
  }

  return status
}

// Manual smoke test for Vercel Workflow delivery. Not scheduled in vercel.json.
// Requires the same Bearer $CRON_SECRET convention as scheduled cron routes.
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const mode = new URL(request.url).searchParams.get('mode')
  if (mode !== null && mode !== 'bell') {
    return NextResponse.json({ error: 'Unknown smoke mode' }, { status: 400 })
  }

  try {
    const label = `workflow-smoke-${new Date().toISOString()}`
    const run =
      mode === 'bell'
        ? await start(bellSmokeWorkflow, [])
        : await start(workflowSmokeWorkflow, [label])
    const status = await waitForTerminalStatus(run.runId, mode === 'bell')
    const ok = status === 'completed'
    const httpStatus =
      status === 'completed'
        ? 200
        : status === 'pending' || status === 'running'
          ? 504
          : 500

    return NextResponse.json(
      {
        ok,
        runId: run.runId,
        status,
        ...(ok && mode === 'bell'
          ? { bell: await getRun(run.runId).returnValue }
          : {}),
      },
      { status: httpStatus, headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[cron/workflow-smoke] error:', err)
    return NextResponse.json(
      { error: 'Workflow smoke failed' },
      { status: 500 }
    )
  }
}
