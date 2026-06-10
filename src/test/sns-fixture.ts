import { createSign } from 'node:crypto'

/**
 * Shared SNS signing fixture for tests: a self-signed RSA certificate (valid
 * for 100 years; never fetched over the network, tests serve it in place of
 * the real SigningCertURL) plus a signer that mirrors the AWS SNS signing
 * scheme independently of src/lib/email/sns-verify.ts, so tests check the
 * module against the documented spec rather than against itself.
 */

export const SNS_TEST_CERT_URL =
  'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem'

export const SNS_TEST_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDLzCCAhegAwIBAgIUMmFFBhx63HeDc/O2w+quF/gJ+vAwDQYJKoZIhvcNAQEL
BQAwJjEkMCIGA1UEAwwbc25zLnVzLWVhc3QtMS5hbWF6b25hd3MuY29tMCAXDTI2
MDYxMDE3MDg0NVoYDzIxMjYwNTE3MTcwODQ1WjAmMSQwIgYDVQQDDBtzbnMudXMt
ZWFzdC0xLmFtYXpvbmF3cy5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDo5AMRE9aIh2/w25ZmfMh5FKbvl5s0wwV3PijtOhN34AMZLpBkaV4nrFiy
RK4/+s5mJTMwzZdQxDlTUnbUWHdo5rbnspNBdDDZFIwKVOmSTAM5OC6WbRgH9BFJ
4C3O7h18rIZzqiA2224EeumvZO77/0ZAqlJTm0YmfPASvdUZJCZ2zkN5JGGwfOEN
ahg6276QxZRPJD+hG5ETg74IqaBgkD1cUSl7mOTSfMXGOorXchC+fF6nCpR3xuYI
ttmTCBNVVvZmv2xAl3BsX33RcCgGi6ziH9ocdhw2X0BYeYWv8qu13Hgzvgz/hSkx
pzoi5aDGZxzaJ/fbZDoy8I8fIdAdAgMBAAGjUzBRMB0GA1UdDgQWBBQ5BR42ATBM
ETIoy2uIJt+78yESBTAfBgNVHSMEGDAWgBQ5BR42ATBMETIoy2uIJt+78yESBTAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBppcYoxEld4T+gFchI
pcil6zSusoKabPuBnMMJ/KU6ou+xnRHfWPE4zrbUxgUwzzzRVt/xZZTxOGbBbOUy
1QeggHWYYEJzUf4LLB4oNovKFUPXPTNC3/76ZkW9g+MfUh5cu76QXMLWUiBPXCc7
wdc35TLF2P+NuFTwWag1sBQc1iXHTG5NJzkN4cX+sAMkPtrxeLO0qyPLwnK8fF1U
o6FumjHUykcpsWckNyvqZvvRiSBLcOtR2f9bHo1DtELf3xkkpCGA2qL2y7rTyGUP
+Bholb7k3kfUivomzSz4e+KCPx9cV/0Oduaofu4r0jSTiPeOuJXGkw3QuTSrmaPI
+N5g
-----END CERTIFICATE-----
`

const SNS_TEST_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDo5AMRE9aIh2/w
25ZmfMh5FKbvl5s0wwV3PijtOhN34AMZLpBkaV4nrFiyRK4/+s5mJTMwzZdQxDlT
UnbUWHdo5rbnspNBdDDZFIwKVOmSTAM5OC6WbRgH9BFJ4C3O7h18rIZzqiA2224E
eumvZO77/0ZAqlJTm0YmfPASvdUZJCZ2zkN5JGGwfOENahg6276QxZRPJD+hG5ET
g74IqaBgkD1cUSl7mOTSfMXGOorXchC+fF6nCpR3xuYIttmTCBNVVvZmv2xAl3Bs
X33RcCgGi6ziH9ocdhw2X0BYeYWv8qu13Hgzvgz/hSkxpzoi5aDGZxzaJ/fbZDoy
8I8fIdAdAgMBAAECggEAIj6y774rx+AodvGHHFNhdCJ0CJuRpDDAG0Bd6sIlLjWX
pwqIi2dOA8XtNetw9vH1iyIRtK2qgCMWbdjcpc1LY7a3Mvs4eYGxFB6YGAXT4aIB
QFbxTMfGZpb+Os921OyBE/3XeGcN/RsHgqujNJoCJTZseWJCIE6fAlZRQ+Q7k0pM
dsOQObs59Prd7YllSzLt1L3MBgIFXZj1ESrT3+db4pgNAW3KwOPRPhBHaHIH8ZDh
4rVOPTSWcV1Fl57lwxXXYSybMlahfn5pl8NlZKYpqIrhPxcn6m1rY74H6+K7jkgC
iKHwre5oanAz1n6XPjQxbBSYmor0QwLOldR8bARcKQKBgQD4gq/IhnTX/XxcWkVo
ISzcTcPMywZc0g7Q/7cX5PXKnAm/93oPQrlrMH/x4+QZNAASlMQxaAKydwDZxc5h
XeBAMA6nViO2ryx5NnSghrnL77xfrOq/AHOP+iSOGQXgeBrkq+AmSzc+ozXNMmPv
l1iSRLzDbEIJXepRJSEl8Nf5BQKBgQDv6NCgEJDgfPeHT/YGPcrUUup89cRkViF5
JvZSWO63GzcXUz8PQl/rfk9upUy0QsX4/mFYCRNGd2TQih2ixZYp0D3g/o/aOXGa
x562NqyaKn5Pg107bGnIvUVPr/hg+p9FpoiguuEGWbCxVqgooj07cnn2hjJq13n8
zSYvb2RGOQKBgQC8h7DCCTdlkRoimh1jtR9qdtifajsGehnhds45o2rQ7fX7m80O
/MjcR+wY35HxiOCxOAlrjgPVzrBnhkhe17BEIfFMA+6OLnEn+CccjXkw/UxErVNd
2gLR7KyE3Pj3ZUbJypb/ljpwG7O6W4szffck6F7oRx4GKyiTrP5r4T6H3QKBgHFg
2ZeLvKwa4vAzvdVdRonpVaAQlevFOLSE0UxBcy9d0T9YvCh9+c7VNrzXqdRW6jCu
J1rvjwhyTFaxryfJsRm5rES0iU9cbm/zfvImDJQfGOqC7oCyz5tqt2LdishqKPNF
rLQpHUdfA74LchUh90Ys56615QXRJ3ltimpIfl8hAoGAVt60LrdlATbWWD5GIPh9
Fh9Lr/4SRzOD4GuCL+HyW1WNJesqiRGqHZ+AP+r4mu0jPCuVlVXLfMeUHpTcrJjq
79woVzKoeTMtW8RVVpG8KuG6RHggwcctxz6xe99hlEyhVRbi4W4tQGMZpJv3fttV
mm9wMFM7XDx4ZflwVWvT6Fw=
-----END PRIVATE KEY-----
`

// Per the AWS docs: byte-sorted keys, `key\nvalue\n` per present key,
// Notification signs Subject only when present, confirmations sign
// SubscribeURL and Token instead.
const SIGNABLE_KEYS: Record<string, string[]> = {
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

/**
 * Signs an SNS message with the fixture key, filling in Signature,
 * SignatureVersion, and SigningCertURL. Pass signatureVersion '2' for the
 * SHA256 scheme; '1' (SHA1) is the default, matching SNS's default.
 */
export function signSnsMessage<T extends { Type: string }>(
  message: T,
  signatureVersion: '1' | '2' = '1'
): T & { Signature: string; SignatureVersion: string; SigningCertURL: string } {
  const keys = SIGNABLE_KEYS[message.Type] ?? []
  const fields = message as Record<string, unknown>
  let payload = ''
  for (const key of keys) {
    if (fields[key] !== undefined) payload += `${key}\n${fields[key]}\n`
  }
  const signer = createSign(
    signatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  )
  signer.update(payload, 'utf8')
  return {
    ...message,
    Signature: signer.sign(SNS_TEST_KEY_PEM, 'base64'),
    SignatureVersion: signatureVersion,
    SigningCertURL: SNS_TEST_CERT_URL,
  }
}
