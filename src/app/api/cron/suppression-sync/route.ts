import { NextResponse } from 'next/server'
import {
  deleteBySourceNotIn,
  upsertSuppression,
} from '@/lib/db/queries/suppressions'
import { listSuppressedDestinations } from '@/lib/email/ses'
import { requireEnv } from '@/lib/env'

// Vercel Cron, every 15 minutes: the SES account-level suppression list is
// the only capture mechanism for bounces and complaints, so the poll runs
// often enough that the admin panel and per-send checks stay close to real
// time. Each run is one ListSuppressedDestinations page per 1000 suppressed
// addresses and is idempotent. Vercel automatically sends `Authorization:
// Bearer $CRON_SECRET` to cron paths when CRON_SECRET is set.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const destinations = await listSuppressedDestinations()
    for (const { email, reason } of destinations) {
      await upsertSuppression(email, reason, 'ses_suppression_list')
    }
    // Authoritative for this source: drop rows SES no longer suppresses. Safe
    // on an empty list because listSuppressedDestinations throws on API errors
    // (a failed fetch lands in the catch and never reaches this delete).
    const removed = await deleteBySourceNotIn(
      'ses_suppression_list',
      destinations.map((d) => d.email)
    )
    return NextResponse.json({ synced: destinations.length, removed })
  } catch (err) {
    console.error('[cron/suppression-sync] error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
