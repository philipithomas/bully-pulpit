import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// after() runs the callback inline so route tests observe its side effects.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: (() => Promise<void>) | Promise<void>) => {
      void (typeof task === 'function' ? task() : task)
    },
  }
})
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'run_test' })),
}))
vi.mock('@/lib/phone/greeting', () => ({
  generateGreeting: vi.fn(async () => 'You have reached the test suite.'),
}))
vi.mock('@/lib/phone/notifications', () => ({
  sendMissedCallNotification: vi.fn(async () => undefined),
  sendIncomingSmsNotification: vi.fn(async () => undefined),
}))

import { start } from 'workflow/api'
import { POST as recordingCompletePost } from '@/app/api/phone/recording-complete/route'
import { POST as recordingStatusPost } from '@/app/api/phone/recording-status/route'
import { POST as smsPost } from '@/app/api/phone/sms/route'
import { POST as voicePost } from '@/app/api/phone/voice/route'
import {
  sendIncomingSmsNotification,
  sendMissedCallNotification,
} from '@/lib/phone/notifications'

const SECRET = 'test-webhook-secret'

function twilioPost(path: string, form: Record<string, string>): Request {
  const url = new URL(`https://philipithomas.com${path}`)
  if (!url.searchParams.has('secret')) {
    url.searchParams.set('secret', SECRET)
  }
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
}

beforeEach(() => {
  process.env.PHONE_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.PHONE_WEBHOOK_SECRET
  vi.clearAllMocks()
})

describe('POST /api/phone/voice', () => {
  it('rejects a bad secret', async () => {
    const response = await voicePost(
      twilioPost('/api/phone/voice?secret=wrong', { From: '+1', To: '+2' })
    )
    expect(response.status).toBe(401)
  })

  it('returns greeting TwiML with secret-bearing callbacks and notifies', async () => {
    const response = await voicePost(
      twilioPost('/api/phone/voice', {
        From: '+15551234567',
        To: '+12123473190',
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/xml')
    const xml = await response.text()
    expect(xml).toContain('You have reached the test suite.')
    expect(xml).toContain(
      '/api/phone/recording-status?secret=test-webhook-secret'
    )
    expect(xml).toContain('caller=%2B15551234567')
    expect(xml).toContain(
      '/api/phone/recording-complete?secret=test-webhook-secret'
    )
    expect(vi.mocked(sendMissedCallNotification)).toHaveBeenCalledWith({
      from: '+15551234567',
      to: '+12123473190',
      greeting: 'You have reached the test suite.',
    })
  })
})

describe('POST /api/phone/recording-status', () => {
  it('starts the voicemail workflow for completed recordings', async () => {
    const response = await recordingStatusPost(
      twilioPost(
        '/api/phone/recording-status?caller=%2B15551234567&called=%2B12123473190',
        {
          RecordingStatus: 'completed',
          RecordingUrl: 'https://api.twilio.com/recordings/RE123',
          RecordingSid: 'RE123',
          RecordingDuration: '42',
        }
      )
    )
    expect(response.status).toBe(202)
    expect(vi.mocked(start)).toHaveBeenCalledWith(expect.anything(), [
      {
        recordingUrl: 'https://api.twilio.com/recordings/RE123',
        recordingSid: 'RE123',
        from: '+15551234567',
        to: '+12123473190',
        durationSeconds: '42',
      },
    ])
  })

  it('ignores non-completed statuses', async () => {
    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'in-progress',
      })
    )
    expect(response.status).toBe(202)
    expect(vi.mocked(start)).not.toHaveBeenCalled()
  })

  it('rejects completed callbacks without a recording url', async () => {
    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'completed',
      })
    )
    expect(response.status).toBe(400)
  })
})

describe('POST /api/phone/recording-complete', () => {
  it('thanks the caller and hangs up', async () => {
    const response = await recordingCompletePost(
      twilioPost('/api/phone/recording-complete', {})
    )
    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('Thank you. Goodbye.')
    expect(xml).toContain('<Hangup/>')
  })
})

describe('POST /api/phone/sms', () => {
  it('emails the message and returns an empty response', async () => {
    const response = await smsPost(
      twilioPost('/api/phone/sms', {
        From: '+15551234567',
        To: '+12123473190',
        Body: 'Running late',
      })
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')
    expect(vi.mocked(sendIncomingSmsNotification)).toHaveBeenCalledWith({
      from: '+15551234567',
      to: '+12123473190',
      body: 'Running late',
    })
  })

  it('rejects a missing secret', async () => {
    const url = new URL('https://philipithomas.com/api/phone/sms')
    const response = await smsPost(
      new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          From: '+1',
          To: '+2',
          Body: 'x',
        }).toString(),
      })
    )
    expect(response.status).toBe(401)
  })
})
