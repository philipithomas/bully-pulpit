import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { parseCsv } from '@/lib/csv'
import { type ImportRow, importSubscribers } from '@/lib/db/queries/subscribers'

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
  const confIdx = col('confirmed')

  // Dedupe by email — a single INSERT … ON CONFLICT can't touch a row twice.
  // A column that's absent entirely defaults to subscribed/confirmed for NEW
  // rows only (the common "here's my list, sign them up" case) — existing rows
  // keep their current flags, so a bare email list can't re-subscribe someone
  // who opted out. A present-but-blank cell means false.
  const byEmail = new Map<string, ImportRow>()
  let skipped = 0
  for (const r of rows.slice(1)) {
    const email = (r[emailIdx] ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      if (r.some((c) => c.trim() !== '')) skipped += 1 // count malformed, ignore blank lines
      continue
    }
    byEmail.set(email, {
      email,
      name: nameIdx >= 0 ? r[nameIdx]?.trim() || null : null,
      postcard: pIdx < 0 ? true : truthy(r[pIdx]),
      contraption: cIdx < 0 ? true : truthy(r[cIdx]),
      workshop: wIdx < 0 ? true : truthy(r[wIdx]),
      confirmed: confIdx < 0 ? true : truthy(r[confIdx]),
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
    confirmed: confIdx >= 0,
  })
  return NextResponse.json({ created, updated, skipped, total: list.length })
}
