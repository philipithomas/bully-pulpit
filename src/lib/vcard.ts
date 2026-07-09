const CRLF = '\r\n'
const MAX_PHYSICAL_LINE_OCTETS = 75

export interface VCardContact {
  name: string
  organization: string
  phoneNumber: string
  website: string
  photo: {
    base64: string
    type: 'JPEG' | 'PNG'
  }
}

function utf8Octets(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

/** Fold one content line without splitting a UTF-8 code point. */
function foldLine(line: string): string {
  const physicalLines: string[] = []
  let physicalLine = ''
  let octets = 0

  for (const character of line) {
    const characterOctets = utf8Octets(character)
    if (octets + characterOctets > MAX_PHYSICAL_LINE_OCTETS) {
      physicalLines.push(physicalLine)
      physicalLine = ` ${character}`
      octets = 1 + characterOctets
      continue
    }

    physicalLine += character
    octets += characterOctets
  }

  physicalLines.push(physicalLine)
  return physicalLines.join(CRLF)
}

/** Render a deterministic vCard 3.0 document with RFC-style line folding. */
export function renderVCard(contact: VCardContact): string {
  const photoBase64 = contact.photo.base64.replace(/\s/g, '')
  const logicalLines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${escapeText(contact.name)};;;`,
    `FN:${escapeText(contact.name)}`,
    `ORG:${escapeText(contact.organization)}`,
    `TEL;TYPE=CELL:${contact.phoneNumber}`,
    `URL:${contact.website}`,
    `PHOTO;ENCODING=b;TYPE=${contact.photo.type}:${photoBase64}`,
    'END:VCARD',
  ]

  return `${logicalLines.map(foldLine).join(CRLF)}${CRLF}`
}
