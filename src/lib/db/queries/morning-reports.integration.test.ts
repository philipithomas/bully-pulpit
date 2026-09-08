import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  acceptMorningReport,
  completeMorningReport,
  getMorningReport,
  markMorningReportDelivered,
  morningReportDeliveryPending,
  releaseMorningReport,
  reserveMorningReport,
  saveMorningReportEmail,
  skipMorningReportDelivery,
  snapshotMorningReport,
} from '@/lib/db/queries/morning-reports'
import { morningReportDeliveries } from '@/lib/db/schema'
import {
  buildMorningReportContent,
  fallbackMorningReportCopy,
} from '@/lib/morning-report/content'
import { renderMorningReport } from '@/lib/morning-report/render'
import { db, resetDb } from '@/test/integration/db'

const date = '2026-09-08'
const content = buildMorningReportContent(date, {
  posts: [],
  words: [{ term: 'Word', definition: 'Definition' }],
  contraptions: [{ term: 'Tool', definition: 'Useful' }],
})
const copy = fallbackMorningReportCopy(content)
const email = {
  ...copy,
  ...renderMorningReport(content, copy),
  model: null,
  generationId: null,
}
beforeEach(resetDb)

async function accepted() {
  expect(await reserveMorningReport(date, 'token', null)).toBe(true)
  expect(await acceptMorningReport(date, 'token', 'run1')).toBe(true)
}

describe('morning report durable ownership', () => {
  it('lets only one simultaneous cron reserve and one run accept; same-run acknowledgement retry succeeds', async () => {
    const claims = await Promise.all(
      ['one', 'two'].map((token) => reserveMorningReport(date, token, null))
    )
    expect(claims.filter(Boolean)).toHaveLength(1)
    const token = claims[0] ? 'one' : 'two'
    expect(await acceptMorningReport(date, token, 'winner')).toBe(true)
    expect(await acceptMorningReport(date, token, 'winner')).toBe(true)
    expect(await acceptMorningReport(date, token, 'loser')).toBe(false)
    await releaseMorningReport(date, token)
    expect((await getMorningReport(date))?.workflowRunId).toBe('winner')
  })

  it('fences late starts after a stale pending lease is replaced', async () => {
    const then = new Date('2026-09-08T11:00:00Z')
    expect(await reserveMorningReport(date, 'old', null, then)).toBe(true)
    expect(
      await reserveMorningReport(
        date,
        'early',
        null,
        new Date('2026-09-08T11:04:00Z')
      )
    ).toBe(false)
    expect(
      await reserveMorningReport(
        date,
        'new',
        null,
        new Date('2026-09-08T11:06:00Z')
      )
    ).toBe(true)
    expect(await acceptMorningReport(date, 'old', 'late-run')).toBe(false)
    await releaseMorningReport(date, 'old')
    expect(await acceptMorningReport(date, 'new', 'new-run')).toBe(true)
  })

  it('requires the exact observed terminal owner for takeover and freezes content/rendering across runs', async () => {
    await accepted()
    expect(
      await reserveMorningReport(
        date,
        'replacement',
        null,
        new Date('2027-01-01')
      )
    ).toBe(false)
    expect(await reserveMorningReport(date, 'replacement', 'wrong-run')).toBe(
      false
    )
    await snapshotMorningReport(date, 'run1', content, [
      'a@example.com',
      'b@example.com',
    ])
    await saveMorningReportEmail(date, 'run1', email)
    await markMorningReportDelivered(date, 'run1', 'a@example.com')
    expect(await reserveMorningReport(date, 'replacement', 'run1')).toBe(true)
    expect(await reserveMorningReport(date, 'race', 'run1')).toBe(false)
    expect(await acceptMorningReport(date, 'replacement', 'run2')).toBe(true)
    const snapshot = await snapshotMorningReport(
      date,
      'run2',
      { ...content, date: 'changed' },
      ['new@example.com']
    )
    expect(snapshot).toEqual({
      content,
      email,
      recipients: ['a@example.com', 'b@example.com'],
    })
    expect(
      await saveMorningReportEmail(date, 'run2', {
        ...email,
        subject: 'changed',
      })
    ).toEqual(email)
    expect(
      await morningReportDeliveryPending(date, 'run1', 'b@example.com')
    ).toBe(false)
    expect(
      await morningReportDeliveryPending(date, 'run2', 'a@example.com')
    ).toBe(false)
    expect(
      await morningReportDeliveryPending(date, 'run2', 'b@example.com')
    ).toBe(true)
    await expect(completeMorningReport(date, 'run2')).rejects.toThrow('pending')
    await markMorningReportDelivered(date, 'run2', 'b@example.com')
    const sentAt = (await db.select().from(morningReportDeliveries))[1].sentAt
    await markMorningReportDelivered(date, 'run2', 'b@example.com')
    expect((await db.select().from(morningReportDeliveries))[1].sentAt).toEqual(
      sentAt
    )
    await completeMorningReport(date, 'run2')
    await completeMorningReport(date, 'run2')
    expect(await reserveMorningReport(date, 'another', 'run2')).toBe(false)
  })

  it('fences skipped recipients by owner and preserves actual sent timestamps', async () => {
    await accepted()
    await snapshotMorningReport(date, 'run1', content, [
      'a@example.com',
      'b@example.com',
    ])
    await markMorningReportDelivered(date, 'run1', 'a@example.com')
    await skipMorningReportDelivery(date, 'run1', 'a@example.com')
    await skipMorningReportDelivery(date, 'wrong-run', 'b@example.com')
    expect(
      await morningReportDeliveryPending(date, 'run1', 'b@example.com')
    ).toBe(true)
    await skipMorningReportDelivery(date, 'run1', 'b@example.com')
    const skippedAt = (await db.select().from(morningReportDeliveries)).find(
      (row) => row.recipient === 'b@example.com'
    )!.skippedAt
    await skipMorningReportDelivery(date, 'run1', 'b@example.com')
    await markMorningReportDelivered(date, 'run1', 'b@example.com')
    const rows = await db.select().from(morningReportDeliveries)
    expect(rows.find((row) => row.recipient === 'a@example.com')).toMatchObject(
      { sentAt: expect.any(Date), skippedAt: null, skipReason: null }
    )
    expect(rows.find((row) => row.recipient === 'b@example.com')).toMatchObject(
      { sentAt: null, skippedAt, skipReason: 'admin_removed' }
    )
    expect(
      await morningReportDeliveryPending(date, 'run1', 'b@example.com')
    ).toBe(false)
    await expect(completeMorningReport(date, 'run1')).resolves.toBeUndefined()
  })

  it('rejects empty recipients and cannot complete an empty report', async () => {
    await accepted()
    await expect(
      snapshotMorningReport(date, 'run1', content, [])
    ).rejects.toThrow('no admin')
    await expect(completeMorningReport(date, 'run1')).rejects.toThrow('pending')
  })
})
