export const CSP_REPORT_MAX_BYTES = 16 * 1024
export const CSP_REPORT_MAX_ENTRIES = 10

const KNOWN_DIRECTIVES = new Set([
  'base-uri',
  'child-src',
  'connect-src',
  'default-src',
  'font-src',
  'form-action',
  'frame-ancestors',
  'frame-src',
  'img-src',
  'manifest-src',
  'media-src',
  'object-src',
  'script-src',
  'script-src-attr',
  'script-src-elem',
  'style-src',
  'style-src-attr',
  'style-src-elem',
  'worker-src',
])

type JsonRecord = Record<string, unknown>

export type NormalizedCspReport = {
  directive: string
  disposition: 'enforce' | 'report' | 'other'
  destination: 'same-origin' | 'external' | 'data' | 'blob'
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDirective(value: unknown): string {
  if (typeof value !== 'string') return 'other'
  const directive = value.trim().toLowerCase().split(/\s+/, 1)[0]
  return KNOWN_DIRECTIVES.has(directive) ? directive : 'other'
}

function normalizeDisposition(
  value: unknown
): NormalizedCspReport['disposition'] {
  if (value === 'enforce' || value === 'report') return value
  return 'other'
}

function classifyDestination(
  value: unknown,
  documentOrigin: string
): NormalizedCspReport['destination'] {
  if (typeof value !== 'string') return 'same-origin'
  const destination = value.trim()
  const lowerDestination = destination.toLowerCase()
  if (lowerDestination === 'data' || lowerDestination.startsWith('data:')) {
    return 'data'
  }
  if (lowerDestination === 'blob' || lowerDestination.startsWith('blob:')) {
    return 'blob'
  }
  // Inline and eval violations execute in the protected document rather than
  // at a separately addressable destination.
  if (
    destination === '' ||
    lowerDestination === 'inline' ||
    lowerDestination === 'eval' ||
    lowerDestination === 'wasm-eval'
  ) {
    return 'same-origin'
  }
  try {
    return new URL(destination, documentOrigin).origin === documentOrigin
      ? 'same-origin'
      : 'external'
  } catch {
    return 'external'
  }
}

function normalizeLegacyReport(
  payload: unknown,
  documentOrigin: string
): NormalizedCspReport[] | null {
  if (!isRecord(payload) || !isRecord(payload['csp-report'])) return null
  const report = payload['csp-report']
  return [
    {
      directive: normalizeDirective(
        report['effective-directive'] ?? report['violated-directive']
      ),
      disposition: normalizeDisposition(report.disposition),
      destination: classifyDestination(report['blocked-uri'], documentOrigin),
    },
  ]
}

function normalizeReportingApiReports(
  payload: unknown,
  documentOrigin: string
): NormalizedCspReport[] | null {
  if (!Array.isArray(payload)) return null
  return payload
    .filter(
      (report): report is JsonRecord =>
        isRecord(report) &&
        report.type === 'csp-violation' &&
        isRecord(report.body)
    )
    .slice(0, CSP_REPORT_MAX_ENTRIES)
    .map((report) => {
      const body = report.body as JsonRecord
      return {
        directive: normalizeDirective(body.effectiveDirective),
        disposition: normalizeDisposition(body.disposition),
        destination: classifyDestination(body.blockedURL, documentOrigin),
      }
    })
}

export function normalizeCspReportPayload(
  payload: unknown,
  mediaType: string,
  documentOrigin: string
): NormalizedCspReport[] | null {
  if (mediaType === 'application/csp-report') {
    return normalizeLegacyReport(payload, documentOrigin)
  }
  if (mediaType === 'application/reports+json') {
    return normalizeReportingApiReports(payload, documentOrigin)
  }
  return null
}
