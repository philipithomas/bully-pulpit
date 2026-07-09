import { NextResponse } from 'next/server'
import { purgeExpiredBellConversations } from '@/lib/db/queries/bell-conversations'
import { requireEnv } from '@/lib/env'

// Daily cleanup enforces Bell's published web-transcript retention policy.
// SMS conversations have no expires_at value and are deliberately untouched.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${requireEnv('CRON_SECRET')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const deleted = await purgeExpiredBellConversations()
    return NextResponse.json({ deleted })
  } catch (error) {
    console.error('[cron/bell-retention] error:', error)
    return NextResponse.json(
      { error: 'Retention cleanup failed' },
      { status: 500 }
    )
  }
}
