import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BELL_CONTACT_PHOTO_BASE64,
  renderBellContactCard,
} from '@/lib/bell-contact-card'
import { renderVCard } from '@/lib/vcard'

function unfold(value: string): string {
  return value.replace(/\r\n[ \t]/g, '')
}

describe('renderVCard', () => {
  it('renders Bell with the public phone number, website, and embedded image', () => {
    const card = renderBellContactCard('+12123473190')
    const unfolded = unfold(card)

    expect(unfolded).toContain('BEGIN:VCARD\r\nVERSION:3.0\r\n')
    expect(unfolded).toContain('N:;Bell;;;\r\n')
    expect(unfolded).toContain('FN:Bell\r\n')
    expect(unfolded).toContain('ORG:Philip I. Thomas\r\n')
    expect(unfolded).toContain('TEL;TYPE=CELL:+12123473190\r\n')
    expect(unfolded).toContain('URL:https://www.philipithomas.com\r\n')
    expect(unfolded).toContain(
      `PHOTO;ENCODING=b;TYPE=PNG:${BELL_CONTACT_PHOTO_BASE64}\r\n`
    )
    expect(unfolded.endsWith('END:VCARD\r\n')).toBe(true)
  })

  it('uses CRLF and keeps every physical line within 75 UTF-8 octets', () => {
    const card = renderVCard({
      name: 'Bell',
      organization: `Philip ${'é'.repeat(80)}`,
      phoneNumber: '+12123473190',
      website: 'https://www.philipithomas.com',
      photo: { base64: 'a'.repeat(200), type: 'PNG' },
    })

    expect(card.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of card.split('\r\n').filter(Boolean)) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75)
    }
    expect(unfold(card)).toContain(`ORG:Philip ${'é'.repeat(80)}\r\n`)
  })

  it('keeps the embedded bytes in sync with the committed raster', () => {
    const image = fs.readFileSync(
      path.join(process.cwd(), 'public/images/bell-contact.png')
    )

    expect(Buffer.from(BELL_CONTACT_PHOTO_BASE64, 'base64')).toEqual(image)
    expect(image.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  })
})
