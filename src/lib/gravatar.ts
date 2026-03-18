export function gravatarUrl(email: string, size = 64): string {
  const hash = hashEmail(email)
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`
}

function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  // Use SubtleCrypto-compatible sync hash via simple djb2 → hex won't work for Gravatar.
  // Gravatar requires MD5. We compute it inline (no dependency needed).
  return md5(normalized)
}

// Minimal MD5 implementation for Gravatar hashing (client-side, non-security use)
function md5(input: string): string {
  function cmn(
    q: number,
    a: number,
    b: number,
    x: number,
    s: number,
    t: number
  ) {
    a = (a + q + x + t) | 0
    return (((a << s) | (a >>> (32 - s))) + b) | 0
  }
  function ff(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) {
    return cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function gg(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function hh(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) {
    return cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function ii(
    a: number,
    b: number,
    c: number,
    d: number,
    x: number,
    s: number,
    t: number
  ) {
    return cmn(c ^ (b | ~d), a, b, x, s, t)
  }

  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }

  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  bytes.push(
    bitLen & 0xff,
    (bitLen >> 8) & 0xff,
    (bitLen >> 16) & 0xff,
    (bitLen >> 24) & 0xff,
    0,
    0,
    0,
    0
  )

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let i = 0; i < bytes.length; i += 64) {
    const w: number[] = []
    for (let j = 0; j < 16; j++) {
      const off = i + j * 4
      w[j] =
        bytes[off] |
        (bytes[off + 1] << 8) |
        (bytes[off + 2] << 16) |
        (bytes[off + 3] << 24)
    }

    let a = a0,
      b = b0,
      c = c0,
      d = d0

    a = ff(a, b, c, d, w[0], 7, 0xd76aa478)
    d = ff(d, a, b, c, w[1], 12, 0xe8c7b756)
    c = ff(c, d, a, b, w[2], 17, 0x242070db)
    b = ff(b, c, d, a, w[3], 22, 0xc1bdceee)
    a = ff(a, b, c, d, w[4], 7, 0xf57c0faf)
    d = ff(d, a, b, c, w[5], 12, 0x4787c62a)
    c = ff(c, d, a, b, w[6], 17, 0xa8304613)
    b = ff(b, c, d, a, w[7], 22, 0xfd469501)
    a = ff(a, b, c, d, w[8], 7, 0x698098d8)
    d = ff(d, a, b, c, w[9], 12, 0x8b44f7af)
    c = ff(c, d, a, b, w[10], 17, 0xffff5bb1)
    b = ff(b, c, d, a, w[11], 22, 0x895cd7be)
    a = ff(a, b, c, d, w[12], 7, 0x6b901122)
    d = ff(d, a, b, c, w[13], 12, 0xfd987193)
    c = ff(c, d, a, b, w[14], 17, 0xa679438e)
    b = ff(b, c, d, a, w[15], 22, 0x49b40821)

    a = gg(a, b, c, d, w[1], 5, 0xf61e2562)
    d = gg(d, a, b, c, w[6], 9, 0xc040b340)
    c = gg(c, d, a, b, w[11], 14, 0x265e5a51)
    b = gg(b, c, d, a, w[0], 20, 0xe9b6c7aa)
    a = gg(a, b, c, d, w[5], 5, 0xd62f105d)
    d = gg(d, a, b, c, w[10], 9, 0x02441453)
    c = gg(c, d, a, b, w[15], 14, 0xd8a1e681)
    b = gg(b, c, d, a, w[4], 20, 0xe7d3fbc8)
    a = gg(a, b, c, d, w[9], 5, 0x21e1cde6)
    d = gg(d, a, b, c, w[14], 9, 0xc33707d6)
    c = gg(c, d, a, b, w[3], 14, 0xf4d50d87)
    b = gg(b, c, d, a, w[8], 20, 0x455a14ed)
    a = gg(a, b, c, d, w[13], 5, 0xa9e3e905)
    d = gg(d, a, b, c, w[2], 9, 0xfcefa3f8)
    c = gg(c, d, a, b, w[7], 14, 0x676f02d9)
    b = gg(b, c, d, a, w[12], 20, 0x8d2a4c8a)

    a = hh(a, b, c, d, w[5], 4, 0xfffa3942)
    d = hh(d, a, b, c, w[8], 11, 0x8771f681)
    c = hh(c, d, a, b, w[11], 16, 0x6d9d6122)
    b = hh(b, c, d, a, w[14], 23, 0xfde5380c)
    a = hh(a, b, c, d, w[1], 4, 0xa4beea44)
    d = hh(d, a, b, c, w[4], 11, 0x4bdecfa9)
    c = hh(c, d, a, b, w[7], 16, 0xf6bb4b60)
    b = hh(b, c, d, a, w[10], 23, 0xbebfbc70)
    a = hh(a, b, c, d, w[13], 4, 0x289b7ec6)
    d = hh(d, a, b, c, w[0], 11, 0xeaa127fa)
    c = hh(c, d, a, b, w[3], 16, 0xd4ef3085)
    b = hh(b, c, d, a, w[6], 23, 0x04881d05)
    a = hh(a, b, c, d, w[9], 4, 0xd9d4d039)
    d = hh(d, a, b, c, w[12], 11, 0xe6db99e5)
    c = hh(c, d, a, b, w[15], 16, 0x1fa27cf8)
    b = hh(b, c, d, a, w[2], 23, 0xc4ac5665)

    a = ii(a, b, c, d, w[0], 6, 0xf4292244)
    d = ii(d, a, b, c, w[7], 10, 0x432aff97)
    c = ii(c, d, a, b, w[14], 15, 0xab9423a7)
    b = ii(b, c, d, a, w[5], 21, 0xfc93a039)
    a = ii(a, b, c, d, w[12], 6, 0x655b59c3)
    d = ii(d, a, b, c, w[3], 10, 0x8f0ccc92)
    c = ii(c, d, a, b, w[10], 15, 0xffeff47d)
    b = ii(b, c, d, a, w[1], 21, 0x85845dd1)
    a = ii(a, b, c, d, w[8], 6, 0x6fa87e4f)
    d = ii(d, a, b, c, w[15], 10, 0xfe2ce6e0)
    c = ii(c, d, a, b, w[6], 15, 0xa3014314)
    b = ii(b, c, d, a, w[13], 21, 0x4e0811a1)
    a = ii(a, b, c, d, w[4], 6, 0xf7537e82)
    d = ii(d, a, b, c, w[11], 10, 0xbd3af235)
    c = ii(c, d, a, b, w[2], 15, 0x2ad7d2bb)
    b = ii(b, c, d, a, w[9], 21, 0xeb86d391)

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  function toHex(n: number) {
    let s = ''
    for (let i = 0; i < 4; i++) {
      s +=
        ((n >> (i * 8 + 4)) & 0xf).toString(16) +
        ((n >> (i * 8)) & 0xf).toString(16)
    }
    return s
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)
}
