import { randomBytes } from 'node:crypto'

/**
 * Minimal MIME message builder for SESv2 Raw sends — no dependency. SESv2
 * Simple content cannot carry attachments, so the subscriber-backup cron and
 * the voicemail notification hand-roll a multipart/mixed message: a body
 * (text/plain, or multipart/alternative when an HTML rendering is supplied)
 * plus one base64-encoded attachment. Pure (no I/O) so it unit-tests directly.
 */

const CRLF = '\r\n'

export type MimeAttachment = {
  filename: string
  /** e.g. 'text/csv; charset=utf-8' */
  contentType: string
  content: string | Uint8Array
}

export type MimeMessageInput = {
  /** Display-name form is fine: 'Name <a@b.com>'. */
  from: string
  to: string[]
  subject: string
  text: string
  /** Optional HTML alternative; the body becomes multipart/alternative. */
  html?: string
  attachment: MimeAttachment
}

/** RFC 2045 base64 body: wrapped at 76 characters with CRLF line breaks. */
function wrapBase64(base64: string): string {
  const lines: string[] = []
  for (let i = 0; i < base64.length; i += 76) {
    lines.push(base64.slice(i, i + 76))
  }
  return lines.join(CRLF)
}

function toBase64Body(content: string | Uint8Array): string {
  const buf =
    typeof content === 'string'
      ? Buffer.from(content, 'utf-8')
      : Buffer.from(content)
  return wrapBase64(buf.toString('base64'))
}

/**
 * Makes a value safe to place in a header: strips CR/LF (header injection)
 * and RFC 2047-encodes non-ASCII as a UTF-8 encoded-word.
 */
function headerValue(value: string): string {
  const flat = value.replace(/[\r\n]+/g, ' ')
  return /^[\x20-\x7e]*$/.test(flat)
    ? flat
    : `=?UTF-8?B?${Buffer.from(flat, 'utf-8').toString('base64')}?=`
}

const textPartLines = (text: string): string[] => [
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  toBase64Body(text),
]

/**
 * The multipart/alternative body part (text first, html last, per RFC 2046
 * order of increasing preference) used when an HTML rendering is supplied.
 */
function alternativeLines(text: string, html: string): string[] {
  const boundary = `=_alt_${randomBytes(16).toString('hex')}`
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...textPartLines(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Body(html),
    `--${boundary}--`,
  ]
}

/**
 * Builds a complete multipart/mixed message as bytes for SESv2
 * `Content.Raw.Data`. Every line ends with CRLF. All parts are
 * base64-encoded so non-ASCII body text and arbitrary attachment bytes are
 * always 7-bit safe.
 */
export function buildMimeMessage(input: MimeMessageInput): Uint8Array {
  // 32 hex chars of randomness make collisions with part content negligible;
  // the '=_' prefix cannot appear in base64 or quoted-printable output.
  const boundary = `=_bp_${randomBytes(16).toString('hex')}`
  const filename = headerValue(input.attachment.filename).replace(/"/g, "'")
  const bodyLines = input.html
    ? alternativeLines(input.text, input.html)
    : textPartLines(input.text)

  const lines = [
    `From: ${headerValue(input.from)}`,
    `To: ${input.to.map((t) => headerValue(t)).join(', ')}`,
    `Subject: ${headerValue(input.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...bodyLines,
    `--${boundary}`,
    `Content-Type: ${headerValue(input.attachment.contentType)}`,
    `Content-Disposition: attachment; filename="${filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    toBase64Body(input.attachment.content),
    `--${boundary}--`,
    '',
  ]
  return new TextEncoder().encode(lines.join(CRLF))
}
