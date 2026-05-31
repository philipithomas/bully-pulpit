// SES error names/messages that will never succeed on retry. Ported from
// printing-press's is_permanent_error: a bad address, malformed request, or a
// paused sending account should fail the row immediately rather than retry.
const PERMANENT_PATTERNS = [
  'MessageRejected',
  'InvalidParameterValue',
  'AccountSendingPaused',
]

export function isPermanentSesError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  return PERMANENT_PATTERNS.some(
    (pattern) => name.includes(pattern) || message.includes(pattern)
  )
}
