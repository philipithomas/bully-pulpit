import { describe, expect, it } from 'vitest'
import { buildMimeMessage, type MimeMessageInput } from '@/lib/email/mime'

function build(overrides: Partial<MimeMessageInput> = {}): string {
  return new TextDecoder().decode(
    buildMimeMessage({
      from: 'Philip I. Thomas <mail@philipithomas.com>',
      to: ['admin@example.com'],
      subject: 'Subscriber backup 2026-06-01',
      text: 'The attached CSV contains all 2 subscribers as of 2026-06-01.',
      attachment: {
        filename: 'subscribers-2026-06-01.csv',
        contentType: 'text/csv; charset=utf-8',
        content: 'email,name\r\na@example.com,Alice\r\n',
      },
      ...overrides,
    })
  )
}

function boundaryOf(message: string): string {
  const match = message.match(/boundary="([^"]+)"/)
  if (!match) throw new Error('no boundary in message')
  return match[1]
}

describe('buildMimeMessage', () => {
  it('generates a unique boundary per message', () => {
    const a = boundaryOf(build())
    const b = boundaryOf(build())
    expect(a).not.toBe(b)
    expect(a).toMatch(/^=_bp_[0-9a-f]{32}$/)
    // The boundary must not collide with any part content.
    const message = build()
    const boundary = boundaryOf(message)
    const occurrences = message.split(boundary).length - 1
    // Content-Type declaration + two part separators + closing delimiter.
    expect(occurrences).toBe(4)
  })

  it('writes correct top-level and part headers', () => {
    const message = build()
    const boundary = boundaryOf(message)
    expect(message).toContain(
      'From: Philip I. Thomas <mail@philipithomas.com>\r\n'
    )
    expect(message).toContain('To: admin@example.com\r\n')
    expect(message).toContain('Subject: Subscriber backup 2026-06-01\r\n')
    expect(message).toContain('MIME-Version: 1.0\r\n')
    expect(message).toContain(
      `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`
    )
    expect(message).toContain('Content-Type: text/plain; charset=utf-8\r\n')
    expect(message).toContain('Content-Type: text/csv; charset=utf-8\r\n')
    expect(message).toContain(
      'Content-Disposition: attachment; filename="subscribers-2026-06-01.csv"\r\n'
    )
    expect(message).toContain('Content-Transfer-Encoding: base64\r\n')
    // Header block and body are separated by one blank line.
    expect(message).toContain(`boundary="${boundary}"\r\n\r\n--${boundary}\r\n`)
    // The closing delimiter ends the message.
    expect(message.endsWith(`--${boundary}--\r\n`)).toBe(true)
  })

  it('joins multiple recipients with a comma', () => {
    const message = build({ to: ['a@example.com', 'b@example.com'] })
    expect(message).toContain('To: a@example.com, b@example.com\r\n')
  })

  it('wraps base64 bodies at 76 characters and round-trips the content', () => {
    const csv = `email\r\n${'x'.repeat(500)}@example.com\r\n`
    const message = build({
      attachment: {
        filename: 'big.csv',
        contentType: 'text/csv; charset=utf-8',
        content: csv,
      },
    })
    const boundary = boundaryOf(message)
    const parts = message.split(`--${boundary}`)
    const attachmentBody = parts[2].split('\r\n\r\n')[1].trim()
    const lines = attachmentBody.split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(76)
      expect(line).toMatch(/^[A-Za-z0-9+/=]+$/)
    }
    expect(Buffer.from(lines.join(''), 'base64').toString('utf-8')).toBe(csv)
  })

  it('round-trips the text body through base64', () => {
    const message = build()
    const boundary = boundaryOf(message)
    const textBody = message
      .split(`--${boundary}`)[1]
      .split('\r\n\r\n')[1]
      .trim()
    expect(Buffer.from(textBody, 'base64').toString('utf-8')).toBe(
      'The attached CSV contains all 2 subscribers as of 2026-06-01.'
    )
  })

  it('uses CRLF for every line ending', () => {
    const message = build()
    // No bare LF: every \n is preceded by \r.
    expect(message.replace(/\r\n/g, '')).not.toContain('\n')
    expect(message.replace(/\r\n/g, '')).not.toContain('\r')
  })

  it('encodes non-ASCII header values as UTF-8 encoded-words', () => {
    const message = build({ subject: 'Sauvegarde des abonnés' })
    const expected = `=?UTF-8?B?${Buffer.from(
      'Sauvegarde des abonnés',
      'utf-8'
    ).toString('base64')}?=`
    expect(message).toContain(`Subject: ${expected}\r\n`)
  })

  it('strips CR/LF from header values to block header injection', () => {
    const message = build({
      subject: 'Backup\r\nBcc: attacker@example.com',
    })
    expect(message).toContain('Subject: Backup Bcc: attacker@example.com\r\n')
    expect(message).not.toContain('\r\nBcc:')
  })

  it('accepts Uint8Array attachment content', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252])
    const message = build({
      attachment: {
        filename: 'data.bin',
        contentType: 'application/octet-stream',
        content: bytes,
      },
    })
    const boundary = boundaryOf(message)
    const body = message.split(`--${boundary}`)[2].split('\r\n\r\n')[1].trim()
    expect(new Uint8Array(Buffer.from(body, 'base64'))).toEqual(bytes)
  })
})
