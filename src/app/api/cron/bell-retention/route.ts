import { NextResponse } from 'next/server'
import {
  recordCronFailed,
  recordCronStarted,
  recordCronSucceeded,
} from '@/lib/cron/heartbeat'
import { purgeExpiredBellConversations } from '@/lib/db/queries/bell-conversations'
import { requireEnv } from '@/lib/env'

// Daily cleanup enforces Bell's published web-transcript retention policy.
// SMS conversations have no expires_at value and are deliberately untouched.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  await recordCronStarted('bell-retention')
  try {
    const deleted = await purgeExpiredBellConversations()
    await recordCronSucceeded('bell-retention')
    return NextResponse.json({ deleted })
  } catch (error) {
    await recordCronFailed('bell-retention')
    console.error('[cron/bell-retention] error:', error)
    return NextResponse.json(
      { error: 'Retention cleanup failed' },
      { status: 500 }
    )
  }
}
