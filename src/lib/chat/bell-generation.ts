import { gateway } from '@ai-sdk/gateway'
import { isStepCount, type ModelMessage, type StreamTextTransform } from 'ai'
import { fetchPage } from '@/lib/chat/fetch-page-tool'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
import { fetchPublicUrl } from '@/lib/chat/fetch-public-url-tool'
import { listPosts } from '@/lib/chat/list-posts-tool'
import { searchPosts } from '@/lib/chat/search-posts-tool'

export {
  BELL_MODEL_ID,
  bellModel,
  getBellProviderOptions,
  getBellReasoning,
} from '@/lib/chat/bell-model'

export function gatewayGenerationIdFromMetadata(
  metadata: unknown
): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const gatewayMetadata = (metadata as { gateway?: unknown }).gateway
  if (typeof gatewayMetadata !== 'object' || gatewayMetadata === null) {
    return null
  }
  const generationId = (gatewayMetadata as { generationId?: unknown })
    .generationId
  return typeof generationId === 'string' ? generationId : null
}

const GATEWAY_COST_LOOKUP_TIMEOUT_MS = 200
const GATEWAY_COST_RETRY_DELAYS_MS = [75, 200] as const

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      () => {
        clearTimeout(timeout)
        resolve(null)
      }
    )
  })
}

/** Best-effort aggregate cost for every Gateway call in a tool loop. */
export async function bellGatewayCost(
  providerMetadata: unknown[]
): Promise<{ gatewayGenerationId: string | null; costUsd: number | null }> {
  const ids = Array.from(
    new Set(
      providerMetadata
        .map(gatewayGenerationIdFromMetadata)
        .filter((id): id is string => Boolean(id))
    )
  )
  if (ids.length === 0) return { gatewayGenerationId: null, costUsd: null }

  // The generation ID arrives in the stream before Gateway's separate billing
  // record is always queryable. Retry only unresolved IDs, with a hard bound of
  // 875 ms across three attempts so persistence never holds the response open.
  const costs = new Map<string, number>()
  let pendingIds = ids
  const attempts = GATEWAY_COST_RETRY_DELAYS_MS.length + 1

  for (
    let attempt = 0;
    attempt < attempts && pendingIds.length > 0;
    attempt++
  ) {
    if (attempt > 0) {
      await wait(GATEWAY_COST_RETRY_DELAYS_MS[attempt - 1])
    }

    const results = await Promise.all(
      pendingIds.map(async (id) => ({
        id,
        info: await settleWithin(
          Promise.resolve().then(() => gateway.getGenerationInfo({ id })),
          GATEWAY_COST_LOOKUP_TIMEOUT_MS
        ),
      }))
    )

    for (const result of results) {
      if (result.info && Number.isFinite(result.info.totalCost)) {
        costs.set(result.id, result.info.totalCost)
      }
    }
    pendingIds = pendingIds.filter((id) => !costs.has(id))
  }

  return {
    gatewayGenerationId: ids[ids.length - 1],
    costUsd:
      costs.size === ids.length
        ? Array.from(costs.values()).reduce((sum, cost) => sum + cost, 0)
        : null,
  }
}

export const bellTools = {
  listPosts,
  searchPosts,
  fetchPost,
  fetchPage,
  fetchPublicUrl,
}

// Reasoning consumes the same output budget as visible text. The former SMS
// limit of 2,048 could end a successful reasoning call without any answer.
export const BELL_MAX_OUTPUT_TOKENS = 32_768
export const BELL_GENERATION_MAX_RETRIES = 2
export const BELL_SMS_TIMEOUT_MS = 300_000
export const BELL_WEB_TIMEOUT_MS = 720_000
export const BELL_FINAL_ANSWER_RESERVE_MS = 90_000
export const BELL_SMS_MAX_STEPS = 20
export const BELL_WEB_MAX_STEPS = 20

export const bellSmsStopWhen = isStepCount(BELL_SMS_MAX_STEPS)
export const bellWebStopWhen = isStepCount(BELL_WEB_MAX_STEPS)

const FINAL_ANSWER_INSTRUCTION =
  'Research is complete for this turn. Write the final answer now using the evidence already retrieved. Follow the original source, citation, and surface-format rules. State material uncertainty or missing evidence honestly. Do not call tools, describe future research, or return an empty answer.'

type BellStepInput = { stepNumber: number; messages?: ModelMessage[] }

/** Reserve a final prose step, including when research is near its deadline. */
function prepareBellStep(
  { stepNumber, messages }: BellStepInput,
  maximumSteps: number,
  deadline?: number
) {
  const shouldFinish =
    stepNumber >= maximumSteps - 1 ||
    (stepNumber > 0 &&
      deadline !== undefined &&
      Date.now() >= deadline - BELL_FINAL_ANSWER_RESERVE_MS)
  if (!shouldFinish) return undefined
  return {
    activeTools: [],
    toolChoice: 'none' as const,
    // The archive analysis is already in context. Allocate this last call to
    // expressing it; provider reasoningEffort overrides top-level reasoning.
    providerOptions: { openai: { reasoningEffort: 'low' } },
    ...(messages
      ? {
          messages: [
            ...messages,
            { role: 'system' as const, content: FINAL_ANSWER_INSTRUCTION },
          ],
        }
      : {}),
  }
}

export function prepareBellSmsStep(input: BellStepInput) {
  return prepareBellStep(input, BELL_SMS_MAX_STEPS)
}

export function prepareBellWebStep(input: BellStepInput) {
  return prepareBellStep(input, BELL_WEB_MAX_STEPS)
}

export function createBellPrepareStep(
  surface: 'web' | 'sms',
  startedAt = Date.now()
) {
  const timeout = surface === 'sms' ? BELL_SMS_TIMEOUT_MS : BELL_WEB_TIMEOUT_MS
  const maximumSteps =
    surface === 'sms' ? BELL_SMS_MAX_STEPS : BELL_WEB_MAX_STEPS
  return (input: BellStepInput) =>
    prepareBellStep(input, maximumSteps, startedAt + timeout)
}

/** An empty final stream is a failure, even if reasoning/tool calls succeeded. */
export const requireBellAnswer: StreamTextTransform<typeof bellTools> = () => {
  let hasFinalText = false
  let hasError = false
  return new TransformStream({
    transform(part, controller) {
      if (part.type === 'start-step') hasFinalText = false
      if (part.type === 'text-delta' && part.text.trim()) hasFinalText = true
      if (part.type === 'error' || part.type === 'abort') hasError = true
      if (part.type === 'finish' && !hasFinalText && !hasError) {
        controller.enqueue({
          type: 'error',
          error: new Error('Bell generation ended without a final answer'),
        })
        controller.enqueue({ ...part, finishReason: 'error' })
        return
      }
      controller.enqueue(part)
    },
  })
}
