import { NextResponse } from 'next/server'
import { cronHealthSnapshot } from '@/lib/cron/jobs'
import { listCronJobHealth } from '@/lib/db/queries/cron-job-health'
import { requireEnv } from '@/lib/env'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

/**
 * Redacted dead-man endpoint for scheduled operational checks. It exposes only
 * fixed job labels, lifecycle timestamps, and fixed failure categories behind
 * the same bearer token as the cron routes.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: PRIVATE_HEADERS,
    })
  }

  try {
    const snapshot = cronHealthSnapshot(await listCronJobHealth())
    return NextResponse.json(snapshot, {
      status: snapshot.ok ? 200 : 503,
      headers: PRIVATE_HEADERS,
    })
  } catch (error) {
    const errorKind = error instanceof Error ? error.name : 'UnknownError'
    console.error(`[cron/health] status read failed (${errorKind})`)
    return NextResponse.json(
      { ok: false, error: 'Cron health unavailable' },
      { status: 503, headers: PRIVATE_HEADERS }
    )
  }
}
