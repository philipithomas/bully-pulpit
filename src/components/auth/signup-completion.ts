export function matchesSubmittedEmail(
  sessionEmail: unknown,
  submittedEmail: string
): boolean {
  return (
    typeof sessionEmail === 'string' &&
    sessionEmail.trim().toLowerCase() === submittedEmail.trim().toLowerCase()
  )
}
