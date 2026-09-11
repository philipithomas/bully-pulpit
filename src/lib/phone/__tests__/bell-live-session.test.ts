import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hangupBellLiveCall } from '@/lib/phone/bell-live'
import type { BellLiveActionHandler } from '@/lib/phone/bell-live-actions'
import type { runBellLiveDelegation } from '@/lib/phone/bell-live-backend'
import {
  BellGptLiveTranscript,
  bellLiveContextChunks,
  startBellGptLiveSession,
} from '@/lib/phone/bell-live-session'

interface FakeConnection {
  emit: (event: string, ...args: unknown[]) => boolean
  socket: { emit: (event: string, ...args: unknown[]) => boolean }
  close: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  parameters: Record<string, unknown>
}

const state = vi.hoisted(() => ({ instances: [] as FakeConnection[] }))
const AUDIBLE_FRAME = Buffer.from([0, 8, 0, 8, 0, 8, 0, 8]).toString('base64')

vi.mock('openai/resources/live/sideband/ws', async () => {
  const { EventEmitter } = await import('node:events')
  class FakeSideband extends EventEmitter {
    socket = new EventEmitter()
    close = vi.fn()
    send = vi.fn()
    constructor(
      _client: unknown,
      public parameters: Record<string, unknown>
    ) {
      super()
      state.instances.push(this)
    }
  }
  return { SidebandWS: FakeSideband }
})

vi.mock('@/lib/phone/bell-live', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/phone/bell-live')>()),
  hangupBellLiveCall: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/phone/bell-live-backend', () => ({
  runBellLiveDelegation: vi.fn().mockResolvedValue('A verified answer.'),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-11T12:00:00Z'))
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
  state.instances.length = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function connection(): FakeConnection {
  return state.instances[state.instances.length - 1]
}

function startAndAcknowledgeGreeting(): void {
  const fake = connection()
  fake.emit('event', { type: 'session.started' })
  const event = fake.send.mock.calls[0][0]
  fake.emit('event', {
    type: 'session.instructions.appended',
    client_event_id: event.event_id,
  })
  fake.emit('event', {
    type: 'session.output_audio.delta',
    delta: AUDIBLE_FRAME,
    start_ms: 0,
    end_ms: 100,
  })
  greetingTranscript()
}

function greetingTranscript(): void {
  connection().emit('event', {
    type: 'session.output_transcript.delta',
    event_id: 'greeting_transcript',
    delta: 'Good morning.',
    start_ms: 0,
    end_ms: 100,
  })
}

function caller(delta: string, id = 'caller_1', start = 1_000): void {
  connection().emit('event', {
    type: 'session.input_transcript.delta',
    event_id: id,
    delta,
    start_ms: start,
    end_ms: start + 100,
  })
}

function delegate(id = 'item_delegation_1'): void {
  connection().emit('event', {
    type: 'session.delegation.created',
    event_id: `event_${id}`,
    offset_ms: 1_000,
    delegation: { id, target: 'client' },
  })
}

function closeSession(reason = 'remote_hangup'): void {
  connection().emit('event', { type: 'session.closed', reason })
}

function isBackendCommentary(event: Record<string, unknown>): boolean {
  return (
    event.type === 'session.commentary.append' && event.delegation_id !== null
  )
}

describe('GPT-Live sideband', () => {
  it('attaches without starting another session and checkpoints generated audio once', async () => {
    const onGreetingConsumed = vi.fn().mockResolvedValue(true)
    const promise = startBellGptLiveSession('live_test123', {
      onGreetingConsumed,
    })
    let resolved = false
    void promise.then(() => {
      resolved = true
    })
    const fake = connection()
    expect(fake.parameters).toEqual({
      session_id: 'live_test123',
      graceful_close: true,
    })
    expect(fake.send).not.toHaveBeenCalled()
    fake.emit('event', { type: 'session.started' })
    const greeting = fake.send.mock.calls[0][0]
    expect(greeting).toMatchObject({
      type: 'session.instructions.append',
      delegation_id: null,
    })
    expect(greeting.content).toContain('This is Bell AI')
    expect(Buffer.byteLength(greeting.content)).toBeLessThan(480)
    fake.emit('event', {
      type: 'session.output_audio.delta',
      delta: AUDIBLE_FRAME,
    })
    fake.emit('event', {
      type: 'session.output_audio.delta',
      delta: AUDIBLE_FRAME,
    })
    greetingTranscript()
    await vi.advanceTimersByTimeAsync(0)
    expect(onGreetingConsumed).toHaveBeenCalledTimes(1)
    expect(resolved).toBe(false)
    fake.emit('event', {
      type: 'session.instructions.appended',
      client_event_id: 'unrelated',
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(resolved).toBe(false)
    expect(fake.send).toHaveBeenCalledOnce()
    fake.emit('event', {
      type: 'session.instructions.appended',
      client_event_id: greeting.event_id,
    })
    fake.emit('event', {
      type: 'session.instructions.appended',
      client_event_id: greeting.event_id,
    })
    expect(fake.send).toHaveBeenCalledTimes(2)
    expect(fake.send.mock.calls[1][0]).toMatchObject({
      type: 'session.commentary.append',
      delegation_id: null,
      content:
        'Begin the conversation now, following the instructions provided.',
    })
    const result = await promise
    expect(result).toMatchObject({
      outcome: 'generated',
      audioStarted: true,
      responseCheckpointed: true,
    })
    closeSession()
    expect((await result.conversation).observerCompleted).toBe(true)
    expect(
      fake.send.mock.calls.some(([event]) => event.type === 'session.start')
    ).toBe(false)
  })

  it('does not treat output transcript or acknowledgment as generated audio', async () => {
    const promise = startBellGptLiveSession('live_test123')
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'audio_not_started',
      audioStarted: false,
    })
    const fake = connection()
    fake.emit('event', { type: 'session.started' })
    fake.emit('event', {
      type: 'session.instructions.appended',
      client_event_id: fake.send.mock.calls[0][0].event_id,
    })
    fake.emit('event', {
      type: 'session.output_transcript.delta',
      event_id: 'greeting_transcript',
      delta: 'Good morning.',
      start_ms: 0,
      end_ms: 100,
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(hangupBellLiveCall).toHaveBeenCalledWith('live_test123')
  })

  it('starts the greeting on attach without requiring a replay of session.started', async () => {
    const promise = startBellGptLiveSession('live_test123')
    const fake = connection()
    fake.socket.emit('open')
    const greeting = fake.send.mock.calls[0][0]
    fake.emit('event', {
      type: 'session.instructions.appended',
      client_event_id: greeting.event_id,
    })
    greetingTranscript()
    fake.emit('event', {
      type: 'session.output_audio.delta',
      delta: AUDIBLE_FRAME,
    })
    const result = await promise
    expect(result.outcome).toBe('generated')
    fake.emit('event', { type: 'session.started' })
    expect(fake.send).toHaveBeenCalledTimes(2)
    closeSession()
    await result.conversation
  })

  it('does not let silent full-duplex frames satisfy the audio deadline', async () => {
    const onGreetingConsumed = vi.fn().mockResolvedValue(true)
    const promise = startBellGptLiveSession('live_test123', {
      onGreetingConsumed,
    })
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'audio_not_started',
      audioStarted: false,
    })
    connection().emit('event', { type: 'session.started' })
    connection().emit('event', {
      type: 'session.instructions.appended',
      client_event_id: connection().send.mock.calls[0][0].event_id,
    })
    greetingTranscript()
    for (let index = 0; index < 10; index += 1) {
      connection().emit('event', {
        type: 'session.output_audio.delta',
        delta: Buffer.alloc(4_800).toString('base64'),
      })
      await vi.advanceTimersByTimeAsync(1_000)
    }
    await rejection
    expect(onGreetingConsumed).not.toHaveBeenCalled()
  })

  it('requires speech transcript as well as audible frames', async () => {
    const promise = startBellGptLiveSession('live_test123')
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'audio_not_started',
    })
    connection().emit('event', { type: 'session.started' })
    connection().emit('event', {
      type: 'session.instructions.appended',
      client_event_id: connection().send.mock.calls[0][0].event_id,
    })
    connection().emit('event', {
      type: 'session.output_audio.delta',
      delta: AUDIBLE_FRAME,
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
  })

  it('reports missing finalization even for a normal WebSocket close code', async () => {
    const promise = startBellGptLiveSession('live_test123')
    startAndAcknowledgeGreeting()
    const result = await promise
    caller('A short question.')
    connection().emit('close', 1_000)
    expect(await result.conversation).toMatchObject({
      observerCompleted: false,
      turns: expect.arrayContaining([
        expect.objectContaining({
          role: 'caller',
          text: 'A short question.',
          complete: false,
        }),
      ]),
    })
    expect(hangupBellLiveCall).toHaveBeenCalledWith('live_test123')
  })

  it('closes after five minutes and waits for the final session event', async () => {
    const promise = startBellGptLiveSession('live_test123')
    startAndAcknowledgeGreeting()
    const result = await promise
    await vi.advanceTimersByTimeAsync(300_000)
    expect(connection().send).toHaveBeenCalledWith({ type: 'session.close' })
    let finalized = false
    void result.conversation.then(() => {
      finalized = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(finalized).toBe(false)
    closeSession('close_requested')
    expect((await result.conversation).observerCompleted).toBe(true)
  })

  it.each([
    ['expired', true],
    ['content', true],
    ['connection_lost', false],
  ] as const)('classifies a finalized %s session observation correctly', async (reason, observerCompleted) => {
    const promise = startBellGptLiveSession('live_test123')
    startAndAcknowledgeGreeting()
    const result = await promise
    closeSession(reason)
    const observation = await result.conversation
    expect(observation.observerCompleted).toBe(observerCompleted)
    expect(observation.turns.every((turn) => !turn.complete)).toBe(true)
  })

  it('bounds a startup that never emits a session event', async () => {
    const promise = startBellGptLiveSession('live_test123')
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'timeout',
    })
    await vi.advanceTimersByTimeAsync(20_000)
    await rejection
    expect(connection().close).toHaveBeenCalledOnce()
  })

  it('retains only the HTTP status from a failed sideband upgrade', async () => {
    const promise = startBellGptLiveSession('live_test123')
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'socket_error',
      socketHttpStatus: 403,
      responseRequested: false,
    })
    const resume = vi.fn()
    connection().socket.emit('unexpected-response', null, {
      statusCode: 403,
      resume,
    })
    await rejection
    expect(resume).toHaveBeenCalledOnce()
    expect(connection().close).toHaveBeenCalledOnce()
  })

  it('requires the greeting acknowledgment even when audio has been generated', async () => {
    const onGreetingConsumed = vi.fn().mockResolvedValue(true)
    const promise = startBellGptLiveSession('live_test123', {
      onGreetingConsumed,
    })
    const rejection = expect(promise).rejects.toMatchObject({
      reason: 'timeout',
      audioStarted: true,
    })
    connection().emit('event', { type: 'session.started' })
    connection().emit('event', {
      type: 'session.output_audio.delta',
      delta: AUDIBLE_FRAME,
    })
    greetingTranscript()
    await vi.advanceTimersByTimeAsync(20_000)
    await rejection
    expect(onGreetingConsumed).toHaveBeenCalledOnce()
  })

  it('keeps a failed checkpoint visible while retaining the conversation observer', async () => {
    const promise = startBellGptLiveSession('live_test123', {
      onGreetingConsumed: vi
        .fn()
        .mockRejectedValue(new Error('database unavailable')),
    })
    startAndAcknowledgeGreeting()
    const result = await promise
    expect(result.responseCheckpointed).toBe(false)
    closeSession()
    expect((await result.conversation).observerCompleted).toBe(true)
  })

  it('fails closed on a provider error after the opening and sanitizes diagnostics', async () => {
    const onLifecycleEvent = vi.fn()
    const promise = startBellGptLiveSession('live_test123', {
      onLifecycleEvent,
    })
    startAndAcknowledgeGreeting()
    const result = await promise
    connection().emit('error', {
      error: {
        type: 'error',
        error: {
          code: 'private user text with spaces',
          message: 'private content',
        },
      },
    })
    expect((await result.conversation).observerCompleted).toBe(false)
    expect(JSON.stringify(onLifecycleEvent.mock.calls)).not.toContain('private')
    expect(hangupBellLiveCall).toHaveBeenCalledWith('live_test123')
  })

  it('reports incomplete finalization when graceful close receives no final event', async () => {
    const promise = startBellGptLiveSession('live_test123')
    startAndAcknowledgeGreeting()
    const result = await promise
    await vi.advanceTimersByTimeAsync(315_000)
    expect((await result.conversation).observerCompleted).toBe(false)
    expect(hangupBellLiveCall).toHaveBeenCalledWith('live_test123')
  })

  it('retains early delegations and prevents corrected work from returning stale results', async () => {
    const resolvers: Array<(result: string) => void> = []
    const runDelegation = vi.fn<typeof runBellLiveDelegation>(
      () => new Promise((resolve) => resolvers.push(resolve))
    )
    const promise = startBellGptLiveSession('live_test123', { runDelegation })
    startAndAcknowledgeGreeting()
    const result = await promise
    delegate()
    delegate()
    await vi.advanceTimersByTimeAsync(500)
    expect(runDelegation).not.toHaveBeenCalled()
    caller('Find Friday posts.')
    await vi.advanceTimersByTimeAsync(250)
    expect(runDelegation).toHaveBeenCalledOnce()
    const original = runDelegation.mock.calls[0][0]
    expect(original.transcript).toContain('Caller: "Find Friday posts."')
    expect(original.isCurrent()).toBe(true)
    caller(' Actually Thursday.', 'caller_2', 1_100)
    expect(original.signal.aborted).toBe(true)
    expect(original.isCurrent()).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    expect(runDelegation).toHaveBeenCalledTimes(2)
    resolvers[0]('Wrong Friday result')
    await vi.advanceTimersByTimeAsync(0)
    expect(
      connection().send.mock.calls.some(([event]) =>
        event.content?.includes('Wrong Friday')
      )
    ).toBe(false)
    resolvers[1]('Verified Thursday result')
    await vi.advanceTimersByTimeAsync(0)
    const returned = connection()
      .send.mock.calls.map(([event]) => event)
      .find(isBackendCommentary)
    expect(returned).toMatchObject({
      delegation_id: 'item_delegation_1',
      content: 'Verified Thursday result',
    })
    connection().emit('event', {
      type: 'session.commentary.appended',
      client_event_id: returned.event_id,
    })
    await vi.advanceTimersByTimeAsync(0)
    caller('Thanks.', 'caller_3', 3_000)
    delegate()
    await vi.advanceTimersByTimeAsync(500)
    expect(runDelegation).toHaveBeenCalledTimes(2)
    closeSession()
    await result.conversation
  })

  it('invalidates backend actions on shutdown and drops late results', async () => {
    let resolveBackend!: (result: string) => void
    const runDelegation = vi.fn<typeof runBellLiveDelegation>(
      () => new Promise((resolve) => (resolveBackend = resolve))
    )
    const promise = startBellGptLiveSession('live_test123', { runDelegation })
    startAndAcknowledgeGreeting()
    const result = await promise
    caller('Leave voicemail.')
    delegate()
    await vi.advanceTimersByTimeAsync(250)
    const request = runDelegation.mock.calls[0][0]
    closeSession()
    await result.conversation
    expect(request.signal.aborted).toBe(true)
    expect(request.isCurrent()).toBe(false)
    resolveBackend('Voicemail started')
    await vi.advanceTimersByTimeAsync(0)
    expect(
      connection().send.mock.calls.some(([event]) => isBackendCommentary(event))
    ).toBe(false)
  })

  it('holds a distinct delegation until fresh caller text arrives', async () => {
    const runDelegation = vi
      .fn<typeof runBellLiveDelegation>()
      .mockResolvedValue('First result')
    const promise = startBellGptLiveSession('live_test123', { runDelegation })
    startAndAcknowledgeGreeting()
    const result = await promise
    caller('Try this action.')
    delegate('item_first')
    await vi.advanceTimersByTimeAsync(250)
    const returned = connection()
      .send.mock.calls.map(([event]) => event)
      .find(isBackendCommentary)
    connection().emit('event', {
      type: 'session.commentary.appended',
      client_event_id: returned.event_id,
    })
    await vi.advanceTimersByTimeAsync(0)
    delegate('item_second')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(runDelegation).toHaveBeenCalledOnce()
    caller(' ', 'caller_whitespace', 2_000)
    await vi.advanceTimersByTimeAsync(500)
    expect(runDelegation).toHaveBeenCalledOnce()
    caller('Actually stop that.', 'caller_second', 2_500)
    await vi.advanceTimersByTimeAsync(250)
    expect(runDelegation).toHaveBeenCalledTimes(2)
    expect(runDelegation.mock.calls[1][0].transcript).toContain(
      'Actually stop that.'
    )
    closeSession()
    await result.conversation
  })

  it.each([
    'confirmed',
    'ambiguous',
    'throws',
  ] as const)('ends only the OpenAI child after a %s handoff with the socket still open', async (outcome) => {
    let handedOff = false
    const actions: BellLiveActionHandler = {
      execute: vi.fn(),
      hasHandedOff: () => handedOff,
      markSubscriptionDisclosureDelivered: vi.fn(),
      cancelSubscriptionDisclosure: vi.fn(),
    }
    const runDelegation = vi.fn<typeof runBellLiveDelegation>(async () => {
      handedOff = true
      if (outcome === 'throws') throw new Error('Lost redirect acknowledgment')
      return 'This handoff result must never be announced.'
    })
    const promise = startBellGptLiveSession('live_test123', {
      actions,
      runDelegation,
    })
    startAndAcknowledgeGreeting()
    const result = await promise
    caller('Leave voicemail.')
    delegate()
    await vi.advanceTimersByTimeAsync(250)
    expect(connection().send).toHaveBeenCalledWith({ type: 'session.close' })
    expect(connection().close).not.toHaveBeenCalled()
    expect(runDelegation.mock.calls[0][0].signal.aborted).toBe(true)
    caller('Another request.', 'caller_later', 3_000)
    delegate('item_later')
    await vi.advanceTimersByTimeAsync(500)
    expect(runDelegation).toHaveBeenCalledOnce()
    expect(
      connection().send.mock.calls.some(([event]) => isBackendCommentary(event))
    ).toBe(false)
    if (outcome !== 'confirmed') {
      await vi.advanceTimersByTimeAsync(15_000)
      expect(hangupBellLiveCall).toHaveBeenCalledExactlyOnceWith('live_test123')
      let settled = false
      void result.conversation.then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
    }
    closeSession('close_requested')
    expect((await result.conversation).observerCompleted).toBe(true)
    if (outcome === 'confirmed')
      expect(hangupBellLiveCall).not.toHaveBeenCalled()
  })
})

describe('Live transcript and context boundaries', () => {
  it('preserves fragment text, overlap and late ordering without invented complete turns', () => {
    const transcript = new BellGptLiveTranscript()
    const event = (event_id: string, delta: string, start_ms: number) => ({
      event_id,
      delta,
      start_ms,
      end_ms: start_ms + 100,
    })
    transcript.append('caller', event('first', 'I need', 1_000))
    transcript.append('caller', event('last', ' help.', 1_300))
    transcript.append('bell_ai', event('middle', 'Mm-hm.', 1_200))
    expect(transcript.append('caller', event('first', 'I need', 1_000))).toBe(
      false
    )
    const turns = transcript.snapshot()
    expect(turns.map((turn) => turn.text)).toEqual([
      'I need',
      'Mm-hm.',
      ' help.',
    ])
    expect(turns.every((turn) => !turn.complete && !turn.interrupted)).toBe(
      true
    )
  })

  it('bounds Unicode chunks by bytes and keeps whole words where possible', () => {
    const text = `${'A useful word '.repeat(100)}${'🦊'.repeat(300)}`
    const chunks = bellLiveContextChunks(text)
    expect(chunks.every((chunk) => Buffer.byteLength(chunk) <= 480)).toBe(true)
    expect(chunks.every((chunk) => chunk.length <= 1_200)).toBe(true)
    expect(chunks.some((chunk) => chunk.includes('\uFFFD'))).toBe(false)
    expect(chunks.join('').replaceAll(/\s/g, '')).toBe(
      text.replaceAll(/\s/g, '')
    )
  })
})
