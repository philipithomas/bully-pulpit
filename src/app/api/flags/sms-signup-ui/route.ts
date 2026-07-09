import { NextResponse } from 'next/server'
import { smsSignupUi } from '@/lib/flags'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ enabled: await smsSignupUi() })
}
