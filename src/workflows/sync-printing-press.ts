import { FatalError, getStepMetadata, RetryableError } from 'workflow'
import { siteConfig } from '@/lib/config'
import {
  type LegacySyncRow,
  syncFromLegacy,
} from '@/lib/db/queries/subscribers'

/**
 * One-time migration: mirrors every subscriber from the legacy printing-press
 * service into this app's database. Idempotent — pages by keyset and the
 * upsert is newest-wins (see syncFromLegacy), so it can run repeatedly until
 * cutover. Delete alongside the legacy service once the migration is done.
 */

const PAGE_SIZE = 500

/** Wire shape of the legacy GET /api/v1/subscribers export (serde snake_case). */
type LegacyApiSubscriber = {
  id: number
  uuid: string
  email: string
  name: string | null
  confirmed_at: string | null
  subscribed_postcard: boolean
  subscribed_contraption: boolean
  subscribed_workshop: boolean
  source: string | null
  created_at: string
  updated_at: string
}

async function fetchLegacyPage(afterId: number): Promise<{
  subscribers: LegacyApiSubscriber[]
  total: number
}> {
  'use step'
  const url = `${siteConfig.printingPressUrl}/api/v1/subscribers?after_id=${afterId}&limit=${PAGE_SIZE}`
  const res = await fetch(url, {
    headers: { 'x-api-key': siteConfig.m2mApiKey },
  })
  if (res.status === 401 || res.status === 403) {
    throw new FatalError('Legacy API rejected the M2M key')
  }
  if (!res.ok) {
    const { attempt } = getStepMetadata()
    throw new RetryableError(`Legacy export returned ${res.status}`, {
      retryAfter: Math.min(60_000, 2 ** attempt * 1000),
    })
  }
  return res.json()
}

async function upsertPage(rows: LegacyApiSubscriber[]): Promise<{
  created: number
  updated: number
  unchanged: number
}> {
  'use step'
  const mapped: LegacySyncRow[] = rows.map((r) => ({
    uuid: r.uuid,
    email: r.email,
    name: r.name,
    confirmedAt: r.confirmed_at ? new Date(r.confirmed_at) : null,
    subscribedPostcard: r.subscribed_postcard,
    subscribedContraption: r.subscribed_contraption,
    subscribedWorkshop: r.subscribed_workshop,
    source: r.source,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  }))
  return syncFromLegacy(mapped)
}

export async function syncPrintingPressWorkflow(): Promise<{
  pages: number
  created: number
  updated: number
  unchanged: number
  legacyTotal: number
}> {
  'use workflow'
  let afterId = 0
  let pages = 0
  let created = 0
  let updated = 0
  let unchanged = 0
  let legacyTotal = 0

  for (;;) {
    const page = await fetchLegacyPage(afterId)
    legacyTotal = page.total
    if (page.subscribers.length === 0) break

    const counts = await upsertPage(page.subscribers)
    pages += 1
    created += counts.created
    updated += counts.updated
    unchanged += counts.unchanged

    afterId = page.subscribers[page.subscribers.length - 1].id
    if (page.subscribers.length < PAGE_SIZE) break
  }

  return { pages, created, updated, unchanged, legacyTotal }
}
