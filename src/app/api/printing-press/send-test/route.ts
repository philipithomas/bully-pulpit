import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { sendNewsletterToOne } from '@/lib/email/send'

export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { slug } = await request.json()
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  try {
    await sendNewsletterToOne({ email: session.email, slug })
    return NextResponse.json({ ok: true, sentTo: session.email })
  } catch (err) {
    console.error('[admin/send-test] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Test send failed' },
      { status: 500 }
    )
  }
}
