import { createVerify, X509Certificate } from 'node:crypto'

/**
 * Hand-rolled verification of Amazon SNS message signatures, per the AWS
 * "Verifying the signatures of Amazon SNS messages" documentation. SNS signs
 * the byte-sorted `key\nvalue\n` pairs of a fixed per-type field list with the
 * RSA key behind SigningCertURL: SignatureVersion 1 is RSA-SHA1 and 2 is
 * RSA-SHA256. Any other version is rejected.
 */

export type SnsMessage = {
  Type: string
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: string
  Signature: string
  SigningCertURL: string
  Subject?: string
  SubscribeURL?: string
  Token?: string
}

/** Fetches a PEM certificate body. Injectable so tests can serve a fixture. */
export type CertFetcher = (url: string) => Promise<string>

// SNS serves signing certificates from sns.<region>.amazonaws.com only.
const SNS_CERT_HOST = /^sns\.[a-z0-9-]{3,}\.amazonaws\.com(\.cn)?$/i

// Signable fields per message type, already in byte-sort order. Optional
// fields (Subject) are skipped when absent.
const SIGNABLE_KEYS: Record<string, ReadonlyArray<keyof SnsMessage>> = {
  Notification: [
    'Message',
    'MessageId',
    'Subject',
    'Timestamp',
    'TopicArn',
    'Type',
  ],
  SubscriptionConfirmation: [
    'Message',
    'MessageId',
    'SubscribeURL',
    'Timestamp',
    'Token',
    'TopicArn',
    'Type',
  ],
  UnsubscribeConfirmation: [
    'Message',
    'MessageId',
    'SubscribeURL',
    'Timestamp',
    'Token',
    'TopicArn',
    'Type',
  ],
}

const ALGORITHM_BY_VERSION: Record<string, string> = {
  '1': 'RSA-SHA1',
  '2': 'RSA-SHA256',
}

/** True for https URLs on an SNS *.amazonaws.com host; the only hosts we fetch. */
export function isTrustedSnsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && SNS_CERT_HOST.test(parsed.hostname)
  } catch {
    return false
  }
}

// Per-instance cache: SNS rotates signing certificates rarely, and every
// message from a topic reuses the same SigningCertURL.
const certCache = new Map<string, string>()

async function fetchCertDefault(url: string): Promise<string> {
  const cached = certCache.get(url)
  if (cached) return cached
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Certificate fetch failed with ${response.status}`)
  }
  const pem = await response.text()
  certCache.set(url, pem)
  return pem
}

function stringToSign(message: SnsMessage): string | null {
  const keys = SIGNABLE_KEYS[message.Type]
  if (!keys) return null
  let payload = ''
  for (const key of keys) {
    const value = message[key]
    if (value !== undefined) payload += `${key}\n${value}\n`
  }
  return payload
}

/**
 * Verifies the signature of an SNS message. Returns false (never throws) on
 * unknown signature versions, unknown message types, untrusted certificate
 * URLs, fetch failures, malformed certificates, and signature mismatches.
 */
export async function verifySnsSignature(
  message: SnsMessage,
  fetchCert: CertFetcher = fetchCertDefault
): Promise<boolean> {
  const algorithm = ALGORITHM_BY_VERSION[message.SignatureVersion]
  if (!algorithm) return false
  if (!isTrustedSnsUrl(message.SigningCertURL)) return false
  const payload = stringToSign(message)
  if (payload === null) return false
  try {
    const pem = await fetchCert(message.SigningCertURL)
    const { publicKey } = new X509Certificate(pem)
    const verifier = createVerify(algorithm)
    verifier.update(payload, 'utf8')
    return verifier.verify(publicKey, message.Signature, 'base64')
  } catch {
    return false
  }
}
