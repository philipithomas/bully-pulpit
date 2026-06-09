import { redirect } from 'next/navigation'
import { getSession, type Session } from '@/lib/auth/jwt'
import { siteConfig } from '@/lib/config'

/** True if the email is in the ADMIN_EMAILS allowlist. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return siteConfig.adminEmails.includes(email.toLowerCase())
}

/**
 * For server components / pages: returns the admin session or redirects home.
 * The admin signs in through the normal OTP/Google flow first.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await getSession()
  if (!session || !isAdmin(session.email)) {
    redirect('/')
  }
  return session
}

/** For API route handlers: returns the admin session, or null if not an admin. */
export async function guardAdmin(): Promise<Session | null> {
  const session = await getSession()
  if (!session || !isAdmin(session.email)) {
    return null
  }
  return session
}
