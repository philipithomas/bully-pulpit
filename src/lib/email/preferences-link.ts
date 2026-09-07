export const EMAIL_PREFERENCES_ANCHOR = 'newsletters'

/** Keep the email's bearer token while linking straight to its preferences. */
export function emailPreferencesUrl(unsubscribeUrl: string): string {
  return `${unsubscribeUrl.replace(/#.*$/, '')}#${EMAIL_PREFERENCES_ANCHOR}`
}
