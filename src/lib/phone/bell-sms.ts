import { generateText } from 'ai'
import { bucketDuration, bucketTurn } from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import {
  bellGatewayCost,
  bellModel,
  bellStopWhen,
  bellTools,
  getBellProviderOptions,
  getBellReasoning,
  prepareBellStep,
} from '@/lib/chat/bell-generation'
import { smsIdentityHash } from '@/lib/chat/bell-identity'
import { scrubLeakedToolJson } from '@/lib/chat/scrub-leaked-tool-json'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { siteConfig } from '@/lib/config'
import { markdownToPlaintext } from '@/lib/content/render-html'
import {
  completeBellGeneration,
  failBellGeneration,
  markBellGenerationRunning,
  setBellGenerationAssistantMessageId,
} from '@/lib/db/queries/bell-generations'
import {
  createBellMessage,
  updateBellMessage,
} from '@/lib/db/queries/bell-messages'
import {
  createTextMessageWithStatus,
  findTextMessageById,
  recentConversationWith,
} from '@/lib/db/queries/text-messages'
import type { TextMessage } from '@/lib/db/schema'
import { BELL_SMS_PREFIX } from '@/lib/phone/bell-sms-copy'
import { type SentSms, sendSms } from '@/lib/phone/twilio'

export type BellSmsInput = {
  from: string
  to: string
  inboundMessageId: number
  conversationId: string
  userMessageId: string
  generationId: string
}

export type BellSmsGenerationResult = {
  body: string
  assistantMessageId: string
}

export { BELL_SMS_PREFIX }

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
const LEGACY_BELL_SMS_COMPLIANCE_FOOTER =
  'philipithomas.com: Reply STOP to end.'

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

function truncateToSmsBudget(value: string, suffix = ''): string {
  const completeValue = `${value}${suffix}`
  const measurement = smsUnits(completeValue)
  const limit =
    measurement.encoding === 'GSM-7'
      ? BELL_SMS_MAX_GSM_UNITS
      : BELL_SMS_MAX_UCS2_UNITS
  if (measurement.units <= limit) return completeValue

  const suffixUnits =
    measurement.encoding === 'GSM-7' ? smsUnits(suffix).units : suffix.length
  const contentLimit = limit - suffixUnits

  if (measurement.encoding === 'UCS-2') {
    // If the GSM-safe prefix already fills the larger GSM budget before the
    // first Unicode grapheme, that later grapheme would be truncated anyway.
    // Keep the useful 300-unit prefix instead of shrinking it to 132 units.
    const gsmContentLimit = BELL_SMS_MAX_GSM_UNITS - smsUnits(suffix).units
    let gsmUnits = 0
    let reachedGsmBudget = false
    for (const { segment } of SMS_SEGMENTER.segment(value)) {
      if (gsmUnits >= gsmContentLimit - 3) {
        reachedGsmBudget = true
        break
      }
      const segmentMeasurement = smsUnits(segment)
      if (segmentMeasurement.encoding === 'UCS-2') break
      if (gsmUnits + segmentMeasurement.units > gsmContentLimit - 3) {
        reachedGsmBudget = true
        break
      }
      gsmUnits += segmentMeasurement.units
    }
    if (reachedGsmBudget) {
      return `${truncateWithEncoding(value, 'GSM-7', gsmContentLimit)}${suffix}`
    }
  }

  return `${truncateWithEncoding(value, measurement.encoding, contentLimit)}${suffix}`
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

function stripLegacyBellSmsComplianceFooter(value: string): string {
  let stripped = value.trimEnd()
  while (stripped.endsWith(LEGACY_BELL_SMS_COMPLIANCE_FOOTER)) {
    stripped = stripped
      .slice(0, -LEGACY_BELL_SMS_COMPLIANCE_FOOTER.length)
      .trimEnd()
  }
  return stripped
}

/** Converts defensive Markdown output to one bounded, prefixed SMS body. */
export function formatBellSmsBody(markdown: string): string {
  const scrubbed = scrubLeakedToolJson(markdown)
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
  const plain = stripLegacyBellSmsComplianceFooter(
    normalizeSmsTypography(
      markdownToPlaintext(scrubbed, 10_000, { preserveParagraphs: true })
    ).replace(/^\[Bell AI\]\s*/i, '')
  )
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
): Promise<BellSmsGenerationResult> {
  const startedAt = Date.now()
  await markBellGenerationRunning(input.generationId)
  const history = await recentConversationWith(
    input.from,
    input.inboundMessageId
  )
  try {
    const generated = await generateText({
      model: bellModel,
      reasoning: getBellReasoning('sms'),
      providerOptions: getBellProviderOptions({
        surface: 'sms',
        pseudonymousUser: `sms:${smsIdentityHash(input.from)}`,
      }),
      // Reasoning tokens share this budget. Leave enough room for xhigh
      // reasoning and tool use; the formatter still caps the delivered SMS.
      maxOutputTokens: 2048,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      runtimeContext: { surface: 'sms' },
      telemetry: {
        isEnabled: true,
        functionId: 'bell-sms',
        recordInputs: false,
        recordOutputs: false,
        includeRuntimeContext: { surface: true },
      },
      system: getSystemPrompt({ surface: 'sms' }),
      prompt: buildBellSmsPrompt(history),
      tools: bellTools,
      stopWhen: bellStopWhen,
      prepareStep: prepareBellStep,
    })
    const body = formatBellSmsBody(generated.text)
    const assistant = await createBellMessage({
      conversationId: input.conversationId,
      role: 'assistant',
      authorKind: 'bell',
      content: body,
      parts: null,
      clientMessageId: `generation:${input.generationId}`,
      replyToMessageId: input.userMessageId,
      status: 'generating',
    })
    await setBellGenerationAssistantMessageId(
      input.generationId,
      assistant.message.id
    )
    const gateway = await bellGatewayCost(
      generated.steps.map((step) => step.providerMetadata)
    )
    const toolsUsed = Array.from(
      new Set(
        generated.steps.flatMap((step) =>
          step.toolCalls.map((call) => call.toolName)
        )
      )
    )
    await completeBellGeneration(input.generationId, {
      assistantMessageId: assistant.message.id,
      model: generated.finalStep.model.modelId,
      provider: generated.finalStep.model.provider,
      callId: generated.finalStep.callId,
      gatewayGenerationId: gateway.gatewayGenerationId,
      inputTokens: generated.usage.inputTokens ?? null,
      outputTokens: generated.usage.outputTokens ?? null,
      totalTokens: generated.usage.totalTokens ?? null,
      cachedInputTokens:
        generated.usage.inputTokenDetails.cacheReadTokens ?? null,
      reasoningTokens:
        generated.usage.outputTokenDetails.reasoningTokens ?? null,
      costUsd: gateway.costUsd,
      latencyMs: Date.now() - startedAt,
      finishReason: generated.finishReason,
      toolsUsed,
    })
    await trackServerEvent(null, 'Bell reply finished', {
      surface: 'sms',
      outcome: 'success',
      duration: bucketDuration(Date.now() - startedAt),
      finish_reason: smsAnalyticsFinishReason(generated.finishReason),
      tool_used: toolsUsed.length > 0,
      turn: bucketTurn(
        history.filter((message) => message.direction === 'inbound').length
      ),
    })
    return { body, assistantMessageId: assistant.message.id }
  } catch (error) {
    await failBellGeneration(input.generationId, error, Date.now() - startedAt)
    await trackServerEvent(null, 'Bell reply finished', {
      surface: 'sms',
      outcome: 'error',
      duration: bucketDuration(Date.now() - startedAt),
      finish_reason: 'error',
      tool_used: false,
      turn: bucketTurn(
        history.filter((message) => message.direction === 'inbound').length
      ),
    })
    throw error
  }
}

function smsAnalyticsFinishReason(
  reason: string
):
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'tool_calls'
  | 'error'
  | 'other'
  | 'unknown' {
  if (reason === 'stop' || reason === 'length' || reason === 'error') {
    return reason
  }
  if (reason === 'content-filter') return 'content_filter'
  if (reason === 'tool-calls') return 'tool_calls'
  if (reason === 'unknown') return 'unknown'
  return 'other'
}

/** Sends one Bell reply. Workflow persists this step result before moving on. */
export async function sendBellSmsBody(
  input: BellSmsInput,
  body: string
): Promise<SentSms | null> {
  if (!(await findTextMessageById(input.inboundMessageId))) return null
  return sendSms({ from: input.to, to: input.from, body })
}

/** Records a delivery result in the shared Printing press phone thread. */
export async function recordBellSms(
  input: BellSmsInput,
  body: string,
  result: SentSms | null,
  assistantMessageId?: string | null
): Promise<TextMessage | null> {
  if (!(await findTextMessageById(input.inboundMessageId))) return null
  const transport = await createTextMessageWithStatus({
    fromNumber: input.to,
    toNumber: input.from,
    body,
    direction: 'outbound',
    twilioSid: result?.sid ?? null,
    replyToMessageId: input.inboundMessageId,
    status: result?.status ?? 'failed',
  })
  const assistant = assistantMessageId
    ? await updateBellMessage(assistantMessageId, {
        content: '',
        parts: null,
        sourceTextMessageId: transport.message.id,
        status: result ? 'completed' : 'error',
      })
    : (
        await createBellMessage({
          conversationId: input.conversationId,
          role: 'assistant',
          authorKind: 'bell',
          content: '',
          parts: null,
          sourceTextMessageId: transport.message.id,
          replyToMessageId: input.userMessageId,
          status: result ? 'completed' : 'error',
        })
      ).message
  if (assistant) {
    await setBellGenerationAssistantMessageId(input.generationId, assistant.id)
  }
  return transport.message
}
