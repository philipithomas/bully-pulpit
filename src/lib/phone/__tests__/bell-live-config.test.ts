import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptBellLiveCall,
  hangupBellLiveCall,
  phoneBellLiveConfigured,
} from '@/lib/phone/bell-live'
import {
  phoneBellGptLiveSession,
  phoneBellVoiceEngine,
} from '@/lib/phone/bell-live-config'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GPT-Live phone configuration', () => {
  it('defaults to Live independently of the retained Realtime rollback model', () => {
    vi.stubEnv('OPENAI_PHONE_VOICE_ENGINE', '')
    vi.stubEnv('OPENAI_PHONE_REALTIME_MODEL', 'unsupported-legacy-model')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
    vi.stubEnv('OPENAI_WEBHOOK_SECRET', 'whsec_test')
    vi.stubEnv('TWILIO_SECRET', 'test-secret')
    expect(phoneBellVoiceEngine()).toBe('gpt-live-1')
    expect(phoneBellLiveConfigured()).toBe(true)
    vi.stubEnv('OPENAI_PHONE_VOICE_ENGINE', 'unknown')
    expect(phoneBellVoiceEngine()).toBeNull()
    expect(phoneBellLiveConfigured()).toBe(false)
  })

  it('keeps voice, backend, recording, and caller status in the Live contract', () => {
    const session = phoneBellGptLiveSession('subscribed')
    expect(session).toMatchObject({
      type: 'live',
      model: 'gpt-live-1',
      store: false,
      delegation: { type: 'client' },
      audio: { output: { voice: 'marin' } },
    })
    expect(session.audio).not.toHaveProperty('format')
    expect(session).not.toHaveProperty('tools')
    expect(session).not.toHaveProperty('reasoning')
    expect(session.audio).not.toHaveProperty('input')
    expect(session.instructions).toContain('Do not offer signup again')
    expect(session.instructions).toContain('a spoken yes never subscribes')
    expect(phoneBellGptLiveSession().instructions).toContain(
      'Subscription status is unknown'
    )
  })

  it('accepts and hangs up through Live endpoints without changing opaque IDs', async () => {
    vi.stubEnv('OPENAI_PHONE_VOICE_ENGINE', 'gpt-live-1')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await acceptBellLiveCall('live_test_session')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/live/sessions/live_test_session/accept',
      expect.objectContaining({
        body: JSON.stringify({ session: phoneBellGptLiveSession() }),
        redirect: 'error',
      })
    )
    await hangupBellLiveCall('live_test_session')
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.openai.com/v1/live/sessions/live_test_session/hangup',
      expect.objectContaining({ body: undefined })
    )
  })
})
