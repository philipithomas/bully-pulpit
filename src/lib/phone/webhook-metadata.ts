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
