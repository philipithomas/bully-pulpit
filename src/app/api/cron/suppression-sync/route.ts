import { NextResponse } from 'next/server'
import {
  deleteBySourceNotIn,
  upsertSuppression,
} from '@/lib/db/queries/suppressions'
import { listSuppressedDestinations } from '@/lib/email/ses'
import { requireEnv } from '@/lib/env'

// Hourly Vercel Cron. Vercel automatically sends `Authorization: Bearer
// $CRON_SECRET` to cron paths when CRON_SECRET is set.
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
