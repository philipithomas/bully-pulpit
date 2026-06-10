import { neutralizeFormula, toCsv } from '@/lib/csv'
import type { ExportRow } from '@/lib/db/queries/subscribers'

/**
 * Renders the subscriber list as a CSV string. Shared by the Printing Press
 * export route and the monthly backup cron so both emit the exact same
 * columns and formula neutralization.
 */
export function subscribersToCsv(rows: ExportRow[]): string {
  return toCsv(
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
}
