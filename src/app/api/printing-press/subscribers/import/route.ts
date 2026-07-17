import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { parseCsv } from '@/lib/csv'
import { type ImportRow, importSubscribers } from '@/lib/db/queries/subscribers'
import { isNewsletterAcceptingSubscriptions } from '@/lib/newsletters'

const truthy = (v: string | undefined) =>
  /^(true|1|yes|y)$/i.test((v ?? '').trim())

export async function POST(request: NextRequest) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const text = await request.text()
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return NextResponse.json(
      { error: 'CSV needs a header row and at least one data row.' },
      { status: 400 }
    )
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  const emailIdx = col('email')
  if (emailIdx === -1) {
    return NextResponse.json(
      { error: 'CSV must have an "email" column.' },
      { status: 400 }
    )
  }
  const nameIdx = col('name')
  const pIdx = col('postcard')
  const cIdx = col('contraption')
  const wIdx = col('workshop')
  const uIdx = col('umami')
  const tIdx = col('tsundoku')
  const confIdx = col('confirmed')
  const srcIdx = col('source')

  // Dedupe by email — a single INSERT … ON CONFLICT can't touch a row twice.
  // An absent newsletter column uses the current signup default for NEW rows
  // only. Existing rows keep their current flags, so a bare email list cannot
  // re-subscribe someone who opted out. For an inactive newsletter, explicit
  // true preserves an existing subscription but cannot create or reactivate
  // one; false may opt out. Source is optional free text; importSubscribers
  // backfills it without overwriting a real captured referrer on existing rows.
  const byEmail = new Map<string, ImportRow>()
  let skipped = 0
  for (const r of rows.slice(1)) {
    const email = (r[emailIdx] ?? '').trim().toLowerCase()
    // An empty string never contains '@', so this also skips blank cells.
    if (!email.includes('@')) {
      if (r.some((c) => c.trim() !== '')) skipped += 1 // count malformed, ignore blank lines
      continue
    }
    byEmail.set(email, {
      email,
      name: nameIdx >= 0 ? r[nameIdx]?.trim() || null : null,
      postcard:
        pIdx < 0
          ? isNewsletterAcceptingSubscriptions('postcard')
          : truthy(r[pIdx]),
      contraption:
        cIdx < 0
          ? isNewsletterAcceptingSubscriptions('contraption')
          : truthy(r[cIdx]),
      workshop:
        wIdx < 0
          ? isNewsletterAcceptingSubscriptions('workshop')
          : truthy(r[wIdx]),
      umami:
        uIdx < 0
          ? isNewsletterAcceptingSubscriptions('umami')
          : truthy(r[uIdx]),
      tsundoku:
        tIdx < 0
          ? isNewsletterAcceptingSubscriptions('tsundoku')
          : truthy(r[tIdx]),
      confirmed: confIdx < 0 ? true : truthy(r[confIdx]),
      source: srcIdx >= 0 ? r[srcIdx]?.trim() || null : null,
    })
  }

  const list = [...byEmail.values()]
  if (list.length === 0) {
    return NextResponse.json(
      { error: 'No valid rows (each needs an email containing "@").', skipped },
      { status: 400 }
    )
  }

  const { created, updated } = await importSubscribers(list, {
    postcard: pIdx >= 0,
    contraption: cIdx >= 0,
    workshop: wIdx >= 0,
    umami: uIdx >= 0,
    tsundoku: tIdx >= 0,
    confirmed: confIdx >= 0,
  })
  return NextResponse.json({ created, updated, skipped, total: list.length })
}
