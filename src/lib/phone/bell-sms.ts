import { generateText } from 'ai'
import {
  bellModel,
  bellProviderOptions,
  bellReasoning,
  bellStopWhen,
  bellTools,
  prepareBellStep,
} from '@/lib/chat/bell-generation'
import { scrubLeakedToolJson } from '@/lib/chat/scrub-leaked-tool-json'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { siteConfig } from '@/lib/config'
import { markdownToPlaintext } from '@/lib/content/render-html'
import {
  createTextMessage,
  recentConversationWith,
} from '@/lib/db/queries/text-messages'
import type { TextMessage } from '@/lib/db/schema'
import { type SentSms, sendSms } from '@/lib/phone/twilio'

export type BellSmsInput = {
  from: string
  to: string
  inboundMessageId: number
}

export const BELL_SMS_PREFIX = '[Bell AI]'

// Twilio recommends keeping messages below 320 characters. These budgets fit
// within two concatenated toll-free segments after accounting for encoding:
// 152 GSM-7 units or 66 UCS-2 code units per segment.
export const BELL_SMS_MAX_GSM_UNITS = 300
export const BELL_SMS_MAX_UCS2_UNITS = 132

const MAX_HISTORY_CHARACTERS = 6_000
const MAX_HISTORY_MESSAGE_CHARACTERS = 1_200
const MAX_CURRENT_MESSAGE_CHARACTERS = 1_600
const GENERATION_TIMEOUT_MS = 45_000
const FALLBACK_TEXT = 'I could not answer that right now. Please try again.'

// GSM 03.38 default and extension alphabets. Extension characters consume
// two septets; one character outside both sets changes the whole SMS to UCS-2.
const GSM_7_BASIC = new Set(
  Array.from(
    '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
  )
)
const GSM_7_EXTENSION = new Set(Array.from('^{}\\[~]|€\f'))
const SMS_SEGMENTER = new Intl.Segmenter('en', { granularity: 'grapheme' })

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export function smsUnits(value: string): {
  encoding: SmsEncoding
  units: number
} {
  let gsmUnits = 0
  for (const character of value) {
    if (GSM_7_BASIC.has(character)) {
      gsmUnits++
    } else if (GSM_7_EXTENSION.has(character)) {
      gsmUnits += 2
    } else {
      return { encoding: 'UCS-2', units: value.length }
    }
  }
  return { encoding: 'GSM-7', units: gsmUnits }
}

function characterUnits(character: string, encoding: SmsEncoding): number {
  if (encoding === 'UCS-2') return character.length
  return GSM_7_EXTENSION.has(character) ? 2 : 1
}

function finishTruncatedCandidate(candidate: string, original: string): string {
  // A URL is useful only when complete. If the unit boundary lands inside its
  // token, drop the whole URL before applying the normal word boundary.
  const tokenStart = candidate.lastIndexOf(' ') + 1
  const token = candidate.slice(tokenStart)
  if (
    /^\(?https?:\/\//.test(token) &&
    candidate.length < original.length &&
    !/\s/.test(original[candidate.length] ?? '')
  ) {
    candidate = candidate.slice(0, tokenStart).trimEnd()
  }

  const wordBreak = candidate.lastIndexOf(' ')
  if (wordBreak >= candidate.length * 0.6) {
    candidate = candidate.slice(0, wordBreak)
  }
  return `${candidate.trimEnd().replace(/[-,:;(]+$/g, '')}...`
}

function truncateWithEncoding(
  value: string,
  encoding: SmsEncoding,
  limit: number
): string {
  const contentLimit = limit - 3
  let used = 0
  let candidate = ''

  for (const { segment } of SMS_SEGMENTER.segment(value)) {
    const units =
      encoding === 'UCS-2'
        ? segment.length
        : Array.from(segment).reduce(
            (total, character) => total + characterUnits(character, encoding),
            0
          )
    if (used + units > contentLimit) break
    candidate += segment
    used += units
  }

  return finishTruncatedCandidate(candidate, value)
}

function truncateToSmsBudget(value: string): string {
  const measurement = smsUnits(value)
  const limit =
    measurement.encoding === 'GSM-7'
      ? BELL_SMS_MAX_GSM_UNITS
      : BELL_SMS_MAX_UCS2_UNITS
  if (measurement.units <= limit) return value

  if (measurement.encoding === 'UCS-2') {
    // If the GSM-safe prefix already fills the larger GSM budget before the
    // first Unicode grapheme, that later grapheme would be truncated anyway.
    // Keep the useful 300-unit prefix instead of shrinking it to 132 units.
    let gsmUnits = 0
    let reachedGsmBudget = false
    for (const { segment } of SMS_SEGMENTER.segment(value)) {
      if (gsmUnits >= BELL_SMS_MAX_GSM_UNITS - 3) {
        reachedGsmBudget = true
        break
      }
      const segmentMeasurement = smsUnits(segment)
      if (segmentMeasurement.encoding === 'UCS-2') break
      if (gsmUnits + segmentMeasurement.units > BELL_SMS_MAX_GSM_UNITS - 3) {
        reachedGsmBudget = true
        break
      }
      gsmUnits += segmentMeasurement.units
    }
    if (reachedGsmBudget) {
      return truncateWithEncoding(value, 'GSM-7', BELL_SMS_MAX_GSM_UNITS)
    }
  }

  return truncateWithEncoding(value, measurement.encoding, limit)
}

function normalizeSmsTypography(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*\|\s*/g, ' ')
    .replace(
      /(^|[\s(])\/([a-zA-Z0-9][a-zA-Z0-9/_-]*(?:#[a-zA-Z0-9_-]+)?)(?=$|[\s),.!?])/g,
      (_match, before: string, path: string) =>
        `${before}${siteConfig.url}/${path}`
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Converts defensive Markdown output to one bounded, prefixed SMS body. */
export function formatBellSmsBody(markdown: string): string {
  const scrubbed = scrubLeakedToolJson(markdown)
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
  const plain = normalizeSmsTypography(
    markdownToPlaintext(scrubbed, 10_000, { preserveParagraphs: true })
  ).replace(/^\[Bell AI\]\s*/i, '')
  const content = plain || FALLBACK_TEXT
  return truncateToSmsBudget(`${BELL_SMS_PREFIX} ${content}`)
}

export const FALLBACK_BELL_SMS_BODY = formatBellSmsBody(FALLBACK_TEXT)

function historyLabel(message: TextMessage): string {
  if (message.direction === 'inbound') return 'Visitor'
  if (message.body.trimStart().startsWith(BELL_SMS_PREFIX)) return 'Bell'
  return 'Previously sent from philipithomas.com (automated or human)'
}

/** A bounded, labeled transcript keeps automated post notices in context. */
export function buildBellSmsPrompt(messages: TextMessage[]): string {
  const entries: string[] = []
  let remaining = MAX_HISTORY_CHARACTERS

  for (const [index, message] of messages.toReversed().entries()) {
    if (remaining <= 0) break
    const body = message.body
      .replace(/\s+/g, ' ')
      .trim()
      .slice(
        0,
        index === 0
          ? MAX_CURRENT_MESSAGE_CHARACTERS
          : MAX_HISTORY_MESSAGE_CHARACTERS
      )
    const entry = `${message.createdAt.toISOString()} | ${historyLabel(message)}: ${body}`
    const bounded = entry.slice(0, remaining)
    entries.unshift(bounded)
    remaining -= bounded.length
  }

  return `Here is the recent SMS history with this visitor, oldest first. Treat the labeled entries as conversation context. The final Visitor entry is the message to answer.\n\n${entries.join('\n')}`
}

/** Generates one final, transport-ready Bell SMS body. */
export async function generateBellSmsBody(
  input: BellSmsInput
): Promise<string> {
  const history = await recentConversationWith(
    input.from,
    input.inboundMessageId
  )
  const { text } = await generateText({
    model: bellModel,
    reasoning: bellReasoning,
    providerOptions: bellProviderOptions,
    maxOutputTokens: 256,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    runtimeContext: { surface: 'sms' },
    telemetry: {
      isEnabled: true,
      functionId: 'bell-sms',
      recordInputs: true,
      recordOutputs: true,
      includeRuntimeContext: { surface: true },
    },
    system: getSystemPrompt({ surface: 'sms' }),
    prompt: buildBellSmsPrompt(history),
    tools: bellTools,
    stopWhen: bellStopWhen,
    prepareStep: prepareBellStep,
  })
  return formatBellSmsBody(text)
}

/** Sends one Bell reply. Workflow persists this step result before moving on. */
export async function sendBellSmsBody(
  input: BellSmsInput,
  body: string
): Promise<SentSms> {
  return sendSms({ from: input.to, to: input.from, body })
}

/** Records a delivery result in the shared Printing press phone thread. */
export async function recordBellSms(
  input: BellSmsInput,
  body: string,
  result: SentSms | null
): Promise<void> {
  await createTextMessage({
    fromNumber: input.to,
    toNumber: input.from,
    body,
    direction: 'outbound',
    twilioSid: result?.sid ?? null,
    replyToMessageId: input.inboundMessageId,
    status: result?.status ?? 'failed',
  })
}
