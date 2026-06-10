import { vi } from 'vitest'

/**
 * Shared mock factories for the external-I/O seams the integration tests cut:
 * SES (so real email templates render but nothing sends) and BotID. Usage:
 *
 *   vi.mock('@/lib/email/ses', () => import('@/test/integration/mocks').then((m) => m.sesMock()))
 *   vi.mock('botid/server', () => import('@/test/integration/mocks').then((m) => m.botidMock()))
 *
 * Each factory returns fresh vi.fn()s; grab them in tests via vi.mocked() on
 * the imported module functions.
 */

export function sesMock() {
  return {
    sendSimpleEmail: vi.fn(async () => undefined),
    sendNewsletterEmail: vi.fn(async () => undefined),
    sendEmailWithAttachment: vi.fn(async () => undefined),
    listSuppressedDestinations: vi.fn(async () => []),
    deleteSuppressedDestination: vi.fn(async () => undefined),
  }
}

export function botidMock() {
  return {
    checkBotId: vi.fn(async () => ({ isBot: false })),
  }
}
