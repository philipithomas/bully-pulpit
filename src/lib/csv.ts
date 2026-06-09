/** Minimal RFC 4180-ish CSV utilities — no dependency. */

function escapeField(
  value: string | number | boolean | null | undefined
): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null>>
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(','))
  return `${lines.join('\r\n')}\r\n`
}

/**
 * Neutralizes spreadsheet formula injection for an untrusted value headed into
 * a CSV cell: Excel/Sheets/Numbers evaluate cells starting with = + - @ (or a
 * tab/CR) as formulas, so prefix a single quote, which spreadsheets render as
 * "treat as text". Apply only to untrusted text columns at the export site —
 * not inside toCsv — so trusted columns and import round-trips stay verbatim.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/**
 * Parses CSV text into rows of string fields. Handles quoted fields, escaped
 * quotes (""), commas/newlines inside quotes, CRLF or LF line endings, and a BOM.
 */
export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // strip BOM
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += c
      i += 1
      continue
    }
    if (c === '"') {
      inQuotes = true
      i += 1
    } else if (c === ',') {
      endField()
      i += 1
    } else if (c === '\r') {
      // Row terminator: CRLF or a bare CR (classic Mac / old Excel exports).
      endField()
      endRow()
      i += text[i + 1] === '\n' ? 2 : 1
    } else if (c === '\n') {
      endField()
      endRow()
      i += 1
    } else {
      field += c
      i += 1
    }
  }
  // Flush a trailing field/row when the file doesn't end with a newline.
  if (field !== '' || row.length > 0) {
    endField()
    endRow()
  }
  return rows
}
