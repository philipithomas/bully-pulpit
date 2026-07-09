/**
 * Map-backed stand-in for next/headers so route handlers can read a session
 * cookie under vitest. Full replacement (no importActual): the real module is
 * RSC-only and throws outside a request scope. jwt.ts only calls
 * cookies().get(), so that is all this implements. Usage:
 *
 *   vi.mock('next/headers', () => import('@/test/integration/session'))
 *   setSessionCookie(await signSession(subscriber))
 */

const store = new Map<string, string>()

export async function cookies() {
  return {
    get: (name: string) =>
      store.has(name) ? { name, value: store.get(name) as string } : undefined,
  }
}

export async function headers() {
  return new Headers()
}

export function setSessionCookie(jwt: string) {
  store.set('__Host-bp_token', jwt)
}

export function setCookie(name: string, value: string) {
  store.set(name, value)
}

export function clearSessionStore() {
  store.clear()
}
