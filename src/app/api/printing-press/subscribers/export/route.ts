import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { neutralizeFormula, toCsv } from '@/lib/csv'
import { allSubscribersForExport } from '@/lib/db/queries/subscribers'

export async function GET() {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await allSubscribersForExport()
  const csv = toCsv(
    [
      'email',
      'name',
      'postcard',
      'contraption',
      'workshop',
      'confirmed',
      'created_at',
    ],
    // email + name are subscriber-controlled free text; neutralize spreadsheet
    // formula injection before the admin opens the file in Excel/Sheets.
    rows.map((r) => [
      neutralizeFormula(r.email),
      neutralizeFormula(r.name ?? ''),
      r.postcard,
      r.contraption,
      r.workshop,
      r.confirmed,
      r.createdAt,
    ])
  )

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="subscribers-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
