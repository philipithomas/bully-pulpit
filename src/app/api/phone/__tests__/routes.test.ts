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
vi.mock('@/lib/db/queries/phone-webhook-events', () => ({
  findOrCreatePhoneWebhookEvent: vi.fn(async () => ({
    event: { id: 1, processedAt: null },
    inserted: true,
  })),
  claimPhoneWebhookEvent: vi.fn(async () => new Date('2026-01-01T00:00:00Z')),
  markPhoneWebhookEventProcessed: vi.fn(async () => true),
  releasePhoneWebhookEvent: vi.fn(async () => undefined),
}))
vi.mock('@/lib/phone/greeting', () => ({
  generateGreeting: vi.fn(async () => 'You have reached the test suite.'),
}))
vi.mock('@/lib/phone/notifications', () => ({
  sendMissedCallNotification: vi.fn(async () => undefined),
  sendIncomingSmsNotification: vi.fn(async () => undefined),
}))
vi.mock('@/lib/flags', () => ({
  smsSignupUi: vi.fn(async () => false),
}))

// The SMS webhook writes to Postgres, so it is covered by the colocated
// sms.integration.test.ts instead of this unit file.
import { start } from 'workflow/api'
import { POST as recordingCompletePost } from '@/app/api/phone/recording-complete/route'
import { POST as recordingStatusPost } from '@/app/api/phone/recording-status/route'
import { POST as voicePost } from '@/app/api/phone/voice/route'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import { smsSignupUi } from '@/lib/flags'
import { sendMissedCallNotification } from '@/lib/phone/notifications'
import { twilioPostRequest } from '@/test/twilio'

const AUTH_TOKEN = 'test-twilio-auth-token'

function twilioPost(
  path: string,
  form: Record<string, string>,
  options: { signature?: string } = {}
): Request {
  return twilioPostRequest(
    `https://philipithomas.com${path}`,
    form,
    AUTH_TOKEN,
    options
  )
}

beforeEach(() => {
  process.env.TWILIO_SECRET = AUTH_TOKEN
  vi.mocked(smsSignupUi).mockResolvedValue(false)
  vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValue({
    event: {
      id: 1,
      eventKey: 'recording:RE123',
      eventType: 'recording-status',
      processingAt: null,
      processedAt: null,
      processedStepId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    inserted: true,
  })
  vi.mocked(claimPhoneWebhookEvent).mockResolvedValue(
    new Date('2026-01-01T00:00:00Z')
  )
})

afterEach(() => {
  delete process.env.TWILIO_SECRET
  vi.clearAllMocks()
})

describe('POST /api/phone/voice', () => {
  it('rejects an invalid signature', async () => {
    const response = await voicePost(
      twilioPost(
        '/api/phone/voice',
        { From: '+1', To: '+2' },
        {
          signature: 'invalid-signature',
        }
      )
    )
    expect(response.status).toBe(401)
  })

  it('defaults to voicemail-only TwiML and notifies', async () => {
    const response = await voicePost(
      twilioPost('/api/phone/voice', {
        From: '+15551234567',
        To: '+12123473190',
        CallSid: 'CA123',
        CallerName: 'Jane Caller',
        FromCity: 'San Francisco',
        FromState: 'CA',
        FromZip: '94105',
        FromCountry: 'US',
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/xml')
    const xml = await response.text()
    expect(xml).toContain('You have reached the test suite.')
    expect(xml).toContain('Leave a message after the tone.')
    expect(xml).not.toContain('<Gather')
    expect(xml).not.toContain('/api/phone/voice-menu')
    expect(xml).toContain('/api/phone/recording-status?caller=')
    expect(xml).toContain('caller=%2B15551234567')
    expect(xml).toContain('CallSid=CA123')
    expect(xml).toContain('CallerName=Jane+Caller')
    expect(xml).toContain('FromCity=San+Francisco')
    expect(xml).toContain('FromState=CA')
    expect(xml).toContain('FromZip=94105')
    expect(xml).toContain('/api/phone/recording-complete')
    expect(xml).not.toContain('secret=')
    expect(vi.mocked(sendMissedCallNotification)).toHaveBeenCalledWith({
      from: '+15551234567',
      to: '+12123473190',
      greeting: 'You have reached the test suite.',
      metadata: expect.objectContaining({
        callSid: 'CA123',
        callerName: 'Jane Caller',
        fromCity: 'San Francisco',
        fromState: 'CA',
        fromZip: '94105',
        fromCountry: 'US',
      }),
    })
  })

  it('offers the SMS signup menu when the flag is enabled', async () => {
    vi.mocked(smsSignupUi).mockResolvedValue(true)

    const response = await voicePost(
      twilioPost('/api/phone/voice', {
        From: '+15551234567',
        To: '+12123473190',
      })
    )

    expect(response.status).toBe(200)
    const xml = await response.text()
    expect(xml).toContain('<Gather')
    expect(xml).toContain('/api/phone/voice-menu')
    expect(xml.indexOf('You have reached the test suite.')).toBeLessThan(
      xml.indexOf('<Gather')
    )
    expect(xml.indexOf('Leave a message after the tone.')).toBeGreaterThan(
      xml.indexOf('</Gather>')
    )
    expect(xml).not.toContain('secret=')
    expect(xml).toContain(
      'Press 2 to subscribe to recurring new-post texts from philipithomas.com.'
    )
    expect(xml).toContain('Frequency varies. Message and data rates may apply.')
    expect(xml).toContain('Text STOP to unsubscribe or HELP for help.')
  })
})

describe('POST /api/phone/recording-status', () => {
  it('starts the voicemail workflow for completed recordings', async () => {
    const response = await recordingStatusPost(
      twilioPost(
        '/api/phone/recording-status?caller=%2B15551234567&called=%2B12123473190&CallSid=CA123&CallerName=Jane+Caller&FromCity=San+Francisco&FromState=CA&FromZip=94105&FromCountry=US',
        {
          RecordingStatus: 'completed',
          RecordingUrl: 'https://api.twilio.com/recordings/RE123',
          RecordingSid: 'RE123',
          RecordingDuration: '42',
          CallSid: 'CA_CALLBACK',
        }
      )
    )
    expect(response.status).toBe(202)
    expect(vi.mocked(start)).toHaveBeenCalledWith(expect.anything(), [
      {
        webhookEventId: 1,
        webhookLease: '2026-01-01T00:00:00.000Z',
        voicemail: {
          recordingUrl: 'https://api.twilio.com/recordings/RE123',
          recordingSid: 'RE123',
          from: '+15551234567',
          to: '+12123473190',
          durationSeconds: '42',
          metadata: expect.objectContaining({
            callSid: 'CA_CALLBACK',
            callerName: 'Jane Caller',
            fromCity: 'San Francisco',
            fromState: 'CA',
            fromZip: '94105',
            fromCountry: 'US',
          }),
        },
      },
    ])
    expect(markPhoneWebhookEventProcessed).not.toHaveBeenCalled()
    expect(releasePhoneWebhookEvent).not.toHaveBeenCalled()
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

  it('rejects a signed callback whose recording url is not Twilio', async () => {
    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'completed',
        RecordingUrl: 'https://attacker.example/recordings/RE123',
        RecordingSid: 'RE123',
      })
    )
    expect(response.status).toBe(400)
    expect(vi.mocked(start)).not.toHaveBeenCalled()
  })

  it('deduplicates repeated callbacks by RecordingSid', async () => {
    vi.mocked(findOrCreatePhoneWebhookEvent).mockResolvedValueOnce({
      event: {
        id: 1,
        eventKey: 'recording:RE123',
        eventType: 'recording-status',
        processingAt: null,
        processedAt: new Date('2026-01-01T00:00:00Z'),
        processedStepId: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      inserted: false,
    })
    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'completed',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        RecordingSid: 'RE123',
      })
    )
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'duplicate' })
    expect(vi.mocked(start)).not.toHaveBeenCalled()
  })

  it('does not start another workflow while the webhook lease is held', async () => {
    vi.mocked(claimPhoneWebhookEvent).mockResolvedValueOnce(null)

    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'completed',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        RecordingSid: 'RE123',
      })
    )

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: 'duplicate' })
    expect(start).not.toHaveBeenCalled()
  })

  it('releases the exact lease when workflow start definitively fails', async () => {
    vi.mocked(start).mockRejectedValueOnce(new Error('workflow unavailable'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await recordingStatusPost(
      twilioPost('/api/phone/recording-status', {
        RecordingStatus: 'completed',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
        RecordingSid: 'RE123',
      })
    )

    expect(response.status).toBe(503)
    expect(releasePhoneWebhookEvent).toHaveBeenCalledWith(
      1,
      new Date('2026-01-01T00:00:00Z')
    )
    expect(markPhoneWebhookEventProcessed).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
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
