import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { deleteSuppression, isSuppressed } from '@/lib/db/queries/suppressions'
import { deleteSuppressedDestination } from '@/lib/email/ses'

/**
 * Manual suppression clearing for the Printing press subscribers list. SES is
 * cleared before the local row: if the account-level removal fails, the row
 * stays so the admin still sees the suppression (and the 15-minute sync would
 * have re-created it anyway). "Not found in SES" counts as success inside
 * deleteSuppressedDestination, so local-only records clear cleanly.
 */
export async function DELETE(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { email } = body
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  if (!(await isSuppressed(email))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    await deleteSuppressedDestination(email)
  } catch (err) {
    console.error('[printing-press/suppressions] SES delete failed:', err)
    return NextResponse.json(
      { error: 'Could not clear the suppression in SES' },
      { status: 502 }
    )
  }

  await deleteSuppression(email)
  return NextResponse.json({ ok: true })
}
