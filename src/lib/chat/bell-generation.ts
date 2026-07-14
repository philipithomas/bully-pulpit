import { gateway } from '@ai-sdk/gateway'
import { stepCountIs } from 'ai'
import { fetchPage } from '@/lib/chat/fetch-page-tool'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
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

export const bellTools = { listPosts, searchPosts, fetchPost, fetchPage }

export const bellStopWhen = stepCountIs(7)

/** The final step cannot call tools, so every Bell run ends in prose. */
export function prepareBellStep({ stepNumber }: { stepNumber: number }) {
  return stepNumber >= 6 ? { activeTools: [] } : undefined
}
