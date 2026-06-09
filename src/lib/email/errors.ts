// SESv2 exception names that will never succeed on retry for this recipient: a
// rejected or malformed message should fail the row immediately rather than
// burn the batch's retry budget (and eventually strand the whole run) on an
// error that can't clear. Account-level exceptions (AccountSuspendedException,
// SendingPausedException, MailFromDomainNotVerifiedException) stay on the retry
// path on purpose — rows remain pending, so a re-send resumes cleanly once the
// account recovers. Names must match the installed @aws-sdk/client-sesv2
// exactly (the v1 names InvalidParameterValue / AccountSendingPaused do not
// exist in SESv2 and never match).
const PERMANENT_ERROR_NAMES = new Set([
  'MessageRejected',
  'BadRequestException',
])

export function isPermanentSesError(err: unknown): boolean {
  return err instanceof Error && PERMANENT_ERROR_NAMES.has(err.name)
}
