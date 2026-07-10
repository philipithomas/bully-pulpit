export const LOGOUT_FAILURE_MESSAGE = 'Could not sign out. Please try again.'

type LogoutFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

/**
 * Clears browser auth state only after the server confirms that logout is
 * complete. A failed revocation keeps the session intact so it can be retried.
 */
export async function logoutAndClearClientSession(
  clearClientSession: () => void,
  fetcher: LogoutFetcher = fetch
): Promise<void> {
  const response = await fetcher('/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error(LOGOUT_FAILURE_MESSAGE)
  clearClientSession()
}
