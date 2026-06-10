import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { sendNewsletterToOne } from '@/lib/email/send'

export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { slug } = body
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
