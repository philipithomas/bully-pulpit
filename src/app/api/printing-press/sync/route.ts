import { NextResponse } from 'next/server'
import { getRun, start } from 'workflow/api'
import { guardAdmin } from '@/lib/auth/admin'
import { syncPrintingPressWorkflow } from '@/workflows/sync-printing-press'

/** Starts the legacy printing-press subscriber sync (idempotent, durable). */
export async function POST() {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const run = await start(syncPrintingPressWorkflow)
  return NextResponse.json({ ok: true, runId: run.runId })
}

/** Polls a sync run: { status, result? } — result present once completed. */
export async function GET(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const runId = new URL(request.url).searchParams.get('runId')
  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 })
  }

  try {
    const run = getRun(runId)
    const status = await run.status
    if (status === 'completed') {
      return NextResponse.json({ status, result: await run.returnValue })
    }
    return NextResponse.json({ status })
  } catch {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
}
