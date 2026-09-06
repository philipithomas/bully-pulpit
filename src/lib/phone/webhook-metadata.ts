export type TwilioWebhookMetadata = {
  messageSid?: string | null
  callSid?: string | null
  callerName?: string | null
  fromCity?: string | null
  fromState?: string | null
  fromZip?: string | null
  fromCountry?: string | null
  areaCode?: string | null
  areaDescription?: string | null
}

const NANP_AREA_CODES: Record<string, string> = {
  '201': 'northeastern New Jersey',
  '202': 'Washington, DC',
  '206': 'Seattle, WA',
  '212': 'Manhattan, New York, NY',
  '213': 'Los Angeles, CA',
  '310': 'Los Angeles westside, CA',
  '312': 'Chicago, IL',
  '315': 'central New York',
  '323': 'Los Angeles, CA',
  '332': 'Manhattan, New York, NY',
  '347': 'New York City, NY',
  '408': 'San Jose, CA',
  '415': 'San Francisco, CA',
  '424': 'Los Angeles westside, CA',
  '510': 'Oakland and the East Bay, CA',
  '516': 'Nassau County, NY',
  '617': 'Boston, MA',
  '628': 'San Francisco, CA',
  '646': 'Manhattan, New York, NY',
  '650': 'San Mateo County and Silicon Valley, CA',
  '669': 'San Jose, CA',
  '718': 'New York City outer boroughs, NY',
  '747': 'San Fernando Valley, CA',
  '818': 'San Fernando Valley, CA',
  '917': 'New York City, NY',
  '929': 'New York City, NY',
}

// Only short caller-name/location hints cross the SIP handoff. Full telephone
// numbers and message IDs are deliberately absent; the invitation binds CallSid.
const HANDOFF_METADATA_FIELDS = [
  ['n', 'callerName', 96],
  ['c', 'fromCity', 96],
  ['s', 'fromState', 32],
  ['z', 'fromZip', 16],
  ['o', 'fromCountry', 8],
  ['a', 'areaCode', 3],
] as const
const HANDOFF_METADATA_MAX_LENGTH = 600
const HANDOFF_METADATA_QUERY_PARAM = 'phoneMetadata'

function boundedHandoffValue(value: unknown, byteLimit: number): string {
  if (typeof value !== 'string') return ''
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remove control characters from SIP metadata
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  let result = ''
  for (const character of clean) {
    if (Buffer.byteLength(result + character, 'utf8') > byteLimit) break
    result += character
  }
  return result.trim()
}

/** Encodes a bounded allowlist; it must be authenticated by the SIP invitation. */
export function encodePhoneHandoffMetadata(
  metadata?: TwilioWebhookMetadata | null
): string | undefined {
  if (!metadata) return undefined
  const values: Record<string, string> = {}
  for (const [key, field, byteLimit] of HANDOFF_METADATA_FIELDS) {
    const value = boundedHandoffValue(metadata[field], byteLimit)
    if (value && (field !== 'areaCode' || /^\d{3}$/.test(value))) {
      values[key] = value
    }
  }
  if (Object.keys(values).length === 0) return undefined
  const encoded = Buffer.from(JSON.stringify(values), 'utf8').toString(
    'base64url'
  )
  return encoded.length <= HANDOFF_METADATA_MAX_LENGTH ? encoded : undefined
}

/** Decodes only the allowlisted transport shape, after its HMAC is verified. */
export function decodePhoneHandoffMetadata(
  encoded: string
): TwilioWebhookMetadata | null {
  if (
    encoded.length === 0 ||
    encoded.length > HANDOFF_METADATA_MAX_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    return null
  }
  try {
    const decoded = Buffer.from(encoded, 'base64url')
    if (decoded.toString('base64url') !== encoded) return null
    const values: unknown = JSON.parse(decoded.toString('utf8'))
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return null
    }
    const allowedKeys = new Set<string>(
      HANDOFF_METADATA_FIELDS.map(([key]) => key)
    )
    if (Object.keys(values).some((key) => !allowedKeys.has(key))) return null

    const metadata: TwilioWebhookMetadata = {}
    for (const [key, field, byteLimit] of HANDOFF_METADATA_FIELDS) {
      if (!Object.hasOwn(values, key)) continue
      const value = (values as Record<string, unknown>)[key]
      if (
        typeof value !== 'string' ||
        !value ||
        boundedHandoffValue(value, byteLimit) !== value ||
        (field === 'areaCode' && !/^\d{3}$/.test(value))
      ) {
        return null
      }
      metadata[field] = value
    }
    if (metadata.areaCode) {
      metadata.areaDescription = NANP_AREA_CODES[metadata.areaCode] ?? null
    }
    return metadata
  } catch {
    return null
  }
}

type TwilioValueSource = Pick<FormData, 'get'> | Pick<URLSearchParams, 'get'>

function sourceValue(source: TwilioValueSource, key: string): string | null {
  const value = source.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nanpAreaCode(phoneNumber: string): string | null {
  const digits = phoneNumber.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1, 4)
  if (digits.length === 10) return digits.slice(0, 3)
  return null
}

export function describePhoneOrigin(
  phoneNumber: string,
  metadata?: TwilioWebhookMetadata | null
): string | null {
  const city = metadata?.fromCity
  const region = metadata?.fromState ?? metadata?.fromCountry
  if (city && region) return `${city}, ${region}`
  if (city) return city

  const areaCode = metadata?.areaCode ?? nanpAreaCode(phoneNumber)
  if (!areaCode) return null
  const description = NANP_AREA_CODES[areaCode]
  return description
    ? `Area code ${areaCode}: ${description}`
    : `Area code ${areaCode}`
}

function twilioWebhookMetadataFromSource(
  source: TwilioValueSource,
  phoneNumber: string
): TwilioWebhookMetadata {
  const areaCode = nanpAreaCode(phoneNumber)
  return {
    messageSid:
      sourceValue(source, 'MessageSid') ?? sourceValue(source, 'SmsSid'),
    callSid: sourceValue(source, 'CallSid'),
    callerName: sourceValue(source, 'CallerName'),
    fromCity:
      sourceValue(source, 'FromCity') ?? sourceValue(source, 'CallerCity'),
    fromState:
      sourceValue(source, 'FromState') ?? sourceValue(source, 'CallerState'),
    fromZip: sourceValue(source, 'FromZip') ?? sourceValue(source, 'CallerZip'),
    fromCountry:
      sourceValue(source, 'FromCountry') ??
      sourceValue(source, 'CallerCountry'),
    areaCode,
    areaDescription: areaCode ? NANP_AREA_CODES[areaCode] : null,
  }
}

export function twilioWebhookMetadataFromForm(
  form: FormData,
  phoneNumber: string
): TwilioWebhookMetadata {
  return twilioWebhookMetadataFromSource(form, phoneNumber)
}

/**
 * Call only after validatedPhoneWebhookForm authenticates the exact request URL.
 * A signed callback carries the original hints; current Twilio fields win when
 * present. Primary From/To identity must still come from the signed form itself.
 */
export function twilioWebhookMetadataFromSignedRequest(
  form: FormData,
  requestUrl: string,
  phoneNumber: string
): TwilioWebhookMetadata {
  const encoded = new URL(requestUrl).searchParams.get(
    HANDOFF_METADATA_QUERY_PARAM
  )
  const original = encoded ? decodePhoneHandoffMetadata(encoded) : null
  const current = twilioWebhookMetadataFromForm(form, phoneNumber)
  if (!original) return current
  return {
    ...original,
    ...Object.fromEntries(
      Object.entries(current).filter(([, value]) => value != null)
    ),
  }
}

/** Twilio's signature on its later request authenticates this bounded payload. */
export function phoneHandoffCallbackUrl(
  callbackUrl: string,
  metadata?: TwilioWebhookMetadata | null
): string {
  const url = new URL(callbackUrl)
  const encoded = encodePhoneHandoffMetadata(metadata)
  if (encoded) url.searchParams.set(HANDOFF_METADATA_QUERY_PARAM, encoded)
  return url.toString()
}

export function twilioWebhookMetadataFromSearchParams(
  searchParams: URLSearchParams,
  phoneNumber: string
): TwilioWebhookMetadata {
  return twilioWebhookMetadataFromSource(searchParams, phoneNumber)
}

/** Carries initial-call metadata into Twilio's later recording callback. */
export function appendTwilioWebhookMetadata(
  searchParams: URLSearchParams,
  metadata?: TwilioWebhookMetadata | null
): void {
  if (!metadata) return

  const forwarded = [
    ['CallSid', metadata.callSid],
    ['CallerName', metadata.callerName],
    ['FromCity', metadata.fromCity],
    ['FromState', metadata.fromState],
    ['FromZip', metadata.fromZip],
    ['FromCountry', metadata.fromCountry],
  ] as const

  for (const [key, value] of forwarded) {
    if (typeof value === 'string' && value.trim()) {
      searchParams.set(key, value.trim())
    }
  }
}
