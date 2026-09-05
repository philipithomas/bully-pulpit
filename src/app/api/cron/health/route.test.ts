import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CronJobHealth } from '@/lib/db/schema'

const listCronJobHealth = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db/queries/cron-job-health', () => ({ listCronJobHealth }))

import { GET } from '@/app/api/cron/health/route'

function request(auth?: string) {
  return new Request('http://localhost/api/cron/health', {
    headers: auth ? { authorization: auth } : undefined,
  })
}

function healthyRows(): CronJobHealth[] {
  const now = new Date()
  return ['suppression-sync', 'bell-retention', 'subscriber-backup'].map(
    (jobName) => ({
      jobName,
      monitoringStartedAt: now,
      lastStartedAt: now,
      lastSucceededAt: now,
      lastFailedAt: null,
      lastFailureCode: null,
      updatedAt: now,
    })
  )
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  listCronJobHealth.mockReset()
  listCronJobHealth.mockResolvedValue(healthyRows())
})

describe('GET cron health', () => {
  it('requires the cron bearer and never reads status when unauthorized', async () => {
    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(listCronJobHealth).not.toHaveBeenCalled()
  })

  it('returns only the fixed redacted health contract when jobs are current', async () => {
    const response = await GET(request('Bearer test-cron-secret'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.jobs.map((job: { name: string }) => job.name)).toEqual([
      'suppression-sync',
      'bell-retention',
      'subscriber-backup',
    ])
    expect(JSON.stringify(body)).not.toContain('errorMessage')
  })

  it('returns 503 when a configured heartbeat is absent', async () => {
    listCronJobHealth.mockResolvedValue([])

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(503)
    expect((await response.json()).ok).toBe(false)
  })

  it('fails closed without exposing database error details', async () => {
    listCronJobHealth.mockRejectedValue(
      new Error('postgres://user:secret@example.test/private')
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Cron health unavailable',
    })
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
