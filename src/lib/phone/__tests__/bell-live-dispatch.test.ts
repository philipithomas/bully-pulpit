import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type BellLiveLifecycleEvent,
  startBellLiveGreeting,
} from '@/lib/phone/bell-live'
import type {
  BellLiveActionHandler,
  BellLiveActionResult,
} from '@/lib/phone/bell-live-actions'
import { FakeOpenAiRealtimeWebSocket } from '@/test/fake-openai-realtime-websocket'

vi.mock('openai/realtime/ws', async () => {
  const { FakeOpenAiRealtimeWS } = await import(
    '@/test/fake-openai-realtime-websocket'
  )
  return { OpenAIRealtimeWS: FakeOpenAiRealtimeWS }
})

interface SentEvent {
  type: string
  item?: { call_id?: string; output?: string; type?: string }
  response?: {
    instructions?: string
    metadata?: { purpose?: string; [key: string]: string | undefined }
    tools?: unknown[]
    tool_choice?: string
  }
}

const confirmation: BellLiveActionResult = {
  status: 'confirmation_required',
  message: 'Would you like recurring new-post texts? Please say yes or no.',
  disclosure: 'Would you like recurring new-post texts? Please say yes or no.',
}

function functionCall(
  callId = 'function_subscription',
  name = 'subscribe_caller',
  args: unknown = '{"confirmed":false}'
) {
  return {
    id: `item_${callId}`,
    type: 'function_call',
    status: 'completed',
    call_id: callId,
    name,
    arguments: args,
  }
}

function sentEvents(): SentEvent[] {
  return FakeOpenAiRealtimeWebSocket.sentEvents as SentEvent[]
}

function functionOutputs(): SentEvent[] {
  return sentEvents().filter(
    (event) =>
      event.type === 'conversation.item.create' &&
      event.item?.type === 'function_call_output'
  )
}

function continuations(): SentEvent[] {
  return sentEvents().filter(
    (event) =>
      event.type === 'response.create' &&
      event.response?.metadata?.purpose !== 'bell_initial_greeting'
  )
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function flushDispatch(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function startController() {
  const execute = vi
    .fn<BellLiveActionHandler['execute']>()
    .mockResolvedValue(confirmation)
  const hasHandedOff = vi.fn(() => false)
  const markSubscriptionDisclosureDelivered = vi.fn()
  const cancelSubscriptionDisclosure = vi.fn()
  const greeting = await startBellLiveGreeting('rtc_dispatch', {
    actions: {
      execute,
      hasHandedOff,
      markSubscriptionDisclosureDelivered,
      cancelSubscriptionDisclosure,
    },
  })
  const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
  return {
    execute,
    hasHandedOff,
    markSubscriptionDisclosureDelivered,
    cancelSubscriptionDisclosure,
    greeting,
    socket,
  }
}

function startCallerResponse(
  socket: FakeOpenAiRealtimeWebSocket,
  responseId = 'response_action'
): void {
  socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
  socket.emitServerEvent({
    type: 'response.created',
    response: { id: responseId, status: 'in_progress' },
  })
}

function completeResponse(
  socket: FakeOpenAiRealtimeWebSocket,
  output: unknown[],
  responseId = 'response_action'
): void {
  socket.emitServerEvent({
    type: 'response.done',
    response: { id: responseId, status: 'completed', output },
  })
}

function startDisclosureResponse(
  socket: FakeOpenAiRealtimeWebSocket,
  responseId = 'response_disclosure'
) {
  const response = continuations().at(-1)?.response
  expect(response).toMatchObject({
    metadata: { purpose: 'bell_subscription_disclosure' },
    tools: [],
    tool_choice: 'none',
  })
  expect(response?.instructions).toContain(confirmation.disclosure)
  const responseMetadata = {
    id: responseId,
    metadata: response?.metadata,
  }
  socket.emitServerEvent({
    type: 'response.created',
    response: { ...responseMetadata, status: 'in_progress' },
  })
  return responseMetadata
}

beforeEach(() => {
  FakeOpenAiRealtimeWebSocket.afterContinuationEventBatches = []
  FakeOpenAiRealtimeWebSocket.afterContinuationEvents = []
  FakeOpenAiRealtimeWebSocket.connections = []
  FakeOpenAiRealtimeWebSocket.sockets = []
  FakeOpenAiRealtimeWebSocket.afterGreetingEvents = []
  FakeOpenAiRealtimeWebSocket.autoCloseAfterGreeting = false
  FakeOpenAiRealtimeWebSocket.emitAudioCleared = false
  FakeOpenAiRealtimeWebSocket.emitAudioStarted = true
  FakeOpenAiRealtimeWebSocket.emitAudioStopped = true
  FakeOpenAiRealtimeWebSocket.finalStatus = 'completed'
  FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 0
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatus = null
  FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses = []
  FakeOpenAiRealtimeWebSocket.sentEvents = []
  FakeOpenAiRealtimeWebSocket.throwOnContinuationSend = false
  FakeOpenAiRealtimeWebSocket.throwOnSend = false
  vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
  vi.stubEnv('OPENAI_PROJECT_ID', 'proj_test123')
  vi.stubEnv('OPENAI_WEBHOOK_SECRET', 'whsec_test-webhook-secret')
  vi.stubEnv('TWILIO_SECRET', 'test-twilio-secret')
})

afterEach(() => {
  for (const socket of FakeOpenAiRealtimeWebSocket.sockets) {
    socket.closeFromServer()
  }
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Bell Live private action dispatch', () => {
  it('plays the opener before enabling interruption and answers buffered input only after acknowledgement', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const pendingGreeting = startBellLiveGreeting('rtc_buffered_opening')
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket.acknowledgeSessionUpdates = false
    const response = {
      id: 'resp_greeting',
      metadata: { purpose: 'bell_initial_greeting' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...response, status: 'in_progress' },
    })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_stopped' })
    socket.emitServerEvent({ type: 'input_audio_buffer.committed' })
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: 'resp_greeting',
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed' },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(
      sentEvents().filter((event) => event.type === 'session.update')
    ).toHaveLength(0)
    expect(continuations()).toHaveLength(0)

    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: 'resp_greeting',
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(
      sentEvents().filter((event) => event.type === 'session.update')
    ).toEqual([
      {
        type: 'session.update',
        session: {
          type: 'realtime',
          audio: {
            input: {
              turn_detection: {
                type: 'semantic_vad',
                eagerness: 'high',
                create_response: true,
                interrupt_response: true,
              },
            },
          },
        },
      },
    ])
    expect(continuations()).toHaveLength(0)

    const acknowledgement = {
      type: 'session.updated',
      session: {
        type: 'realtime',
        audio: {
          input: {
            turn_detection: {
              type: 'semantic_vad',
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    }
    socket.emitServerEvent(acknowledgement)
    socket.emitServerEvent(acknowledgement)
    await expect(pendingGreeting).resolves.toMatchObject({
      audioStarted: true,
      outcome: 'delivered',
    })
    expect(continuations()).toEqual([
      {
        type: 'response.create',
        response: {
          metadata: { purpose: 'bell_opening_caller_turn' },
          output_modalities: ['audio'],
        },
      },
    ])
    // Later input is handled by the server's restored automatic turn detection.
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_stopped' })
    socket.emitServerEvent({ type: 'input_audio_buffer.committed' })
    expect(continuations()).toHaveLength(1)
  })

  it.each([
    'still speaking',
    'response already started',
  ])('does not duplicate an opening caller response when %s', async (state) => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const pendingGreeting = startBellLiveGreeting('rtc_opening_race')
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_stopped' })
    socket.emitServerEvent({ type: 'input_audio_buffer.committed' })
    if (state === 'still speaking') {
      socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    } else {
      socket.emitServerEvent({
        type: 'response.created',
        response: { id: 'response_auto', status: 'in_progress' },
      })
    }
    const response = {
      id: 'resp_greeting',
      metadata: { purpose: 'bell_initial_greeting' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...response, status: 'in_progress' },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed' },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    await pendingGreeting
    expect(continuations()).toHaveLength(0)
  })

  it('bounds a missing acknowledgement when restoring normal conversation', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 1
    const pendingGreeting = startBellLiveGreeting('rtc_missing_restore_ack')
    const failure = pendingGreeting.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket.acknowledgeSessionUpdates = false
    const close = vi.spyOn(socket, 'close')

    await vi.advanceTimersByTimeAsync(20_000)

    expect(await failure).toMatchObject({
      audioStarted: true,
      reason: 'timeout',
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(continuations()).toHaveLength(0)
  })

  it('allows the spoken opener to continue past the first-audio deadline', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const pendingGreeting = startBellLiveGreeting('rtc_longer_opening')
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    const close = vi.spyOn(socket, 'close')
    const response = {
      id: 'resp_greeting',
      metadata: { purpose: 'bell_initial_greeting' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...response, status: 'in_progress' },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed' },
    })

    await vi.advanceTimersByTimeAsync(12_000)

    expect(close).not.toHaveBeenCalled()
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    await expect(pendingGreeting).resolves.toMatchObject({
      audioStarted: true,
      outcome: 'delivered',
    })
  })

  it('rejects a still-pending greeting after ten seconds without playback', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const pendingGreeting = startBellLiveGreeting('rtc_no_initial_audio')
    const failure = pendingGreeting.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    const close = vi.spyOn(FakeOpenAiRealtimeWebSocket.sockets[0], 'close')

    await vi.advanceTimersByTimeAsync(10_000)

    expect(await failure).toMatchObject({
      audioStarted: false,
      durationMs: 10_000,
      reason: 'audio_not_started',
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('settles a call that closes while normal conversation is being restored', async () => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 1
    const pendingGreeting = startBellLiveGreeting('rtc_close_during_restore')
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    socket.acknowledgeSessionUpdates = false
    await vi.advanceTimersByTimeAsync(1)

    socket.closeFromServer(1006)

    const greeting = await pendingGreeting
    expect(greeting.outcome).toBe('delivered')
    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: false,
    })
    expect(continuations()).toHaveLength(0)
  })

  it.each([
    false,
    true,
  ])('keeps the first-audio deadline after an unheard interrupted opener (later audio: %s)', async (laterAudio) => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const lifecycle: BellLiveLifecycleEvent[] = []
    const pendingGreeting = startBellLiveGreeting('rtc_silent_opening', {
      onLifecycleEvent: (event) => lifecycle.push(event),
    })
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    const close = vi.spyOn(socket, 'close')
    const response = {
      id: 'resp_greeting',
      metadata: { purpose: 'bell_initial_greeting' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...response, status: 'in_progress' },
    })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'cancelled' },
    })
    const greeting = await pendingGreeting
    expect(greeting).toMatchObject({
      audioStarted: false,
      outcome: 'interrupted',
    })
    socket.emitServerEvent({
      type: 'response.created',
      response: { id: 'response_cancelled', status: 'in_progress' },
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { id: 'response_cancelled', status: 'cancelled', output: [] },
    })
    if (laterAudio) {
      socket.emitServerEvent({
        type: 'output_audio_buffer.started',
        response_id: 'response_later',
      })
    }
    await vi.advanceTimersByTimeAsync(10_000)
    if (laterAudio) {
      expect(close).not.toHaveBeenCalled()
      expect(lifecycle).not.toContainEqual(
        expect.objectContaining({ reason: 'audio_not_started' })
      )
    } else {
      expect(close).toHaveBeenCalledTimes(1)
      expect(lifecycle).toContainEqual(
        expect.objectContaining({
          event: 'bell_live.observer',
          outcome: 'failed',
          reason: 'audio_not_started',
        })
      )
      await expect(greeting.conversation).resolves.toMatchObject({
        observerCompleted: false,
      })
    }
  })

  it.each([
    'cancelled before audio',
    'cleared before playback',
  ])('keeps private actions available when the opening is %s by the caller', async (interruption) => {
    vi.useFakeTimers()
    FakeOpenAiRealtimeWebSocket.greetingEventDelayMs = 60_000
    const execute = vi
      .fn<BellLiveActionHandler['execute']>()
      .mockResolvedValue(confirmation)
    const checkpoint = vi.fn(async () => true)
    const pendingGreeting = startBellLiveGreeting('rtc_early_caller', {
      actions: {
        execute,
        hasHandedOff: () => false,
        markSubscriptionDisclosureDelivered: vi.fn(),
        cancelSubscriptionDisclosure: vi.fn(),
      },
      onGreetingConsumed: checkpoint,
    })
    await vi.advanceTimersByTimeAsync(0)
    const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
    const close = vi.spyOn(socket, 'close')
    const greetingResponse = {
      id: 'resp_greeting',
      metadata: { purpose: 'bell_initial_greeting' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...greetingResponse, status: 'in_progress' },
    })

    if (interruption === 'cancelled before audio') {
      socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
      socket.emitServerEvent({
        type: 'response.done',
        response: { ...greetingResponse, status: 'cancelled' },
      })
    } else {
      socket.emitServerEvent({
        type: 'response.done',
        response: { ...greetingResponse, status: 'completed' },
      })
      socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    }
    socket.emitServerEvent({
      type: 'output_audio_buffer.cleared',
      response_id: 'resp_greeting',
    })
    const greeting = await pendingGreeting

    expect(greeting).toMatchObject({
      audioStarted: false,
      responseCheckpointed: true,
      responseCreated: true,
    })
    expect(checkpoint).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()

    // The caller's very first request still reaches the action controller;
    // no second speech event is needed after interrupting the introduction.
    socket.emitServerEvent({
      type: 'response.created',
      response: { id: 'response_action', status: 'in_progress' },
    })
    completeResponse(socket, [functionCall()])
    await vi.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      'subscribe_caller',
      { confirmed: false },
      1,
      expect.any(Function)
    )
    expect(functionOutputs()).toHaveLength(1)
    expect(continuations()).toHaveLength(1)
    expect(checkpoint).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
    socket.closeFromServer()
    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: true,
    })
  })

  it('returns one result and requests one spoken continuation despite repeated response.done events', async () => {
    const { socket, execute } = await startController()
    startCallerResponse(socket)
    const call = functionCall()
    completeResponse(socket, [call])
    completeResponse(socket, [call])
    await flushDispatch()

    expect(execute).toHaveBeenCalledExactlyOnceWith(
      'subscribe_caller',
      { confirmed: false },
      1,
      expect.any(Function)
    )
    expect(functionOutputs()).toHaveLength(1)
    expect(functionOutputs()[0].item).toMatchObject({
      call_id: call.call_id,
      output: JSON.stringify(confirmation),
    })
    expect(continuations()).toHaveLength(1)
    expect(sentEvents().indexOf(functionOutputs()[0])).toBeLessThan(
      sentEvents().indexOf(continuations()[0])
    )
  })

  it('deduplicates a repeated function-call ID within the same response output', async () => {
    const { socket, execute } = await startController()
    startCallerResponse(socket)
    const call = functionCall()
    completeResponse(socket, [call, { ...call }])
    await flushDispatch()

    expect(execute).toHaveBeenCalledTimes(1)
    expect(functionOutputs()).toHaveLength(1)
    expect(continuations()).toHaveLength(1)
  })

  it.each([
    ['unknown function', 'send_anywhere', '{"phone":"+15551234567"}'],
    ['malformed JSON', 'subscribe_caller', '{'],
    ['oversized arguments', 'subscribe_caller', 'x'.repeat(1_025)],
    ['non-string arguments', 'subscribe_caller', { confirmed: true }],
  ])('returns a safe failure for %s without executing an action', async (_label, name, args) => {
    const { socket, execute } = await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall('unsafe_call', String(name), args)])
    await flushDispatch()

    expect(execute).not.toHaveBeenCalled()
    expect(functionOutputs()).toHaveLength(1)
    expect(JSON.parse(functionOutputs()[0].item?.output ?? '{}')).toMatchObject(
      {
        status: 'unavailable',
      }
    )
    expect(continuations()).toHaveLength(1)
  })

  it('cancels a queued action if the caller starts a newer turn before dispatch', async () => {
    const { socket, execute } = await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    await flushDispatch()

    expect(execute).not.toHaveBeenCalled()
    expect(functionOutputs()).toHaveLength(1)
    expect(JSON.parse(functionOutputs()[0].item?.output ?? '{}')).toMatchObject(
      {
        status: 'cancelled',
      }
    )
    expect(continuations()).toHaveLength(0)
  })

  it('makes caller interruption visible to an action awaiting its preflight', async () => {
    const { socket, execute } = await startController()
    const action = deferred<BellLiveActionResult>()
    execute.mockReturnValueOnce(action.promise)
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()

    const isCurrent = execute.mock.calls[0]?.[3]
    expect(isCurrent).toEqual(expect.any(Function))
    expect(isCurrent?.()).toBe(true)
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    expect(isCurrent?.()).toBe(false)
    action.resolve({ status: 'cancelled', message: 'The caller interrupted.' })
    await flushDispatch()
    expect(continuations()).toHaveLength(0)
  })

  it('arms subscription consent once after the entire disclosure has played and completed', async () => {
    const {
      socket,
      markSubscriptionDisclosureDelivered,
      cancelSubscriptionDisclosure,
    } = await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
    const response = startDisclosureResponse(socket)

    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    expect(markSubscriptionDisclosureDelivered).toHaveBeenCalledExactlyOnceWith(
      1
    )

    // Duplicate terminal provider events must not authorize another consent.
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).toHaveBeenCalledTimes(1)

    // The caller's next answer must retain the fully delivered disclosure.
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    expect(cancelSubscriptionDisclosure).not.toHaveBeenCalled()
  })

  it('waits for audio playback to stop after disclosure generation completes', async () => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()

    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).toHaveBeenCalledExactlyOnceWith(
      1
    )
  })

  it('does not arm consent if the caller interrupts before disclosure playback', async () => {
    const {
      socket,
      markSubscriptionDisclosureDelivered,
      cancelSubscriptionDisclosure,
    } = await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })

    // Late playback and completion events still belong to the interrupted turn.
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
    expect(cancelSubscriptionDisclosure).toHaveBeenCalledTimes(1)
  })

  it('does not arm consent if the caller interrupts in the middle of the disclosure', async () => {
    const {
      socket,
      markSubscriptionDisclosureDelivered,
      cancelSubscriptionDisclosure,
    } = await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({ type: 'input_audio_buffer.speech_started' })
    socket.emitServerEvent({
      type: 'output_audio_buffer.cleared',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
    expect(cancelSubscriptionDisclosure).toHaveBeenCalledTimes(1)
  })

  it.each([
    'cancelled',
    'failed',
  ])('does not arm consent when disclosure generation is %s', async (status) => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status, output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
  })

  it('requires audio to have started before accepting a stop event as delivery', async () => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
  })

  it('ignores a different response carrying a stale disclosure nonce', async () => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const requested = continuations().at(-1)?.response
    const unrelated = {
      id: 'response_stale_disclosure',
      metadata: { ...requested?.metadata, disclosure_id: 'stale-disclosure' },
    }
    socket.emitServerEvent({
      type: 'response.created',
      response: { ...unrelated, status: 'in_progress' },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: unrelated.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...unrelated, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: unrelated.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()

    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).toHaveBeenCalledExactlyOnceWith(
      1
    )
  })

  it('does not let late events from an earlier disclosure arm its replacement', async () => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const previous = startDisclosureResponse(socket, 'response_disclosure_old')
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: previous.id,
    })
    startCallerResponse(socket, 'response_action_new')
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...previous, status: 'cancelled', output: [] },
    })
    completeResponse(
      socket,
      [functionCall('function_subscription_new')],
      'response_action_new'
    )
    await flushDispatch()
    const replacement = startDisclosureResponse(
      socket,
      'response_disclosure_new'
    )
    expect(replacement.metadata?.disclosure_id).not.toBe(
      previous.metadata?.disclosure_id
    )

    socket.emitServerEvent({
      type: 'response.created',
      response: { ...previous, status: 'in_progress' },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: previous.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...previous, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: previous.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()

    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: replacement.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...replacement, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: replacement.id,
    })
    expect(markSubscriptionDisclosureDelivered).toHaveBeenCalledExactlyOnceWith(
      2
    )
  })

  it('never treats cleared disclosure audio as fully delivered', async () => {
    const { socket, markSubscriptionDisclosureDelivered } =
      await startController()
    startCallerResponse(socket)
    completeResponse(socket, [functionCall()])
    await flushDispatch()
    const response = startDisclosureResponse(socket)
    socket.emitServerEvent({
      type: 'output_audio_buffer.started',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'response.done',
      response: { ...response, status: 'completed', output: [] },
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.cleared',
      response_id: response.id,
    })
    socket.emitServerEvent({
      type: 'output_audio_buffer.stopped',
      response_id: response.id,
    })
    expect(markSubscriptionDisclosureDelivered).not.toHaveBeenCalled()
  })

  it('closes the controller after voicemail handoff without speaking over the recorder', async () => {
    const { socket, execute, hasHandedOff, greeting } = await startController()
    const close = vi.spyOn(socket, 'close')
    execute.mockImplementationOnce(async () => {
      hasHandedOff.mockReturnValue(true)
      return { status: 'handed_off', message: 'Voicemail is starting.' }
    })
    startCallerResponse(socket)
    completeResponse(socket, [
      functionCall('voicemail_call', 'start_voicemail', '{}'),
    ])

    await expect(greeting.conversation).resolves.toMatchObject({
      observerCompleted: true,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalled()
    expect(functionOutputs()).toHaveLength(0)
    expect(continuations()).toHaveLength(0)
  })

  it.each([
    'archive first',
    'action first',
  ])('waits for both results before one mixed-tool continuation when %s', async (order) => {
    const { socket, execute } = await startController()
    const action = deferred<BellLiveActionResult>()
    execute.mockReturnValueOnce(action.promise)
    startCallerResponse(socket)
    const archiveItem = {
      id: 'archive_item',
      type: 'mcp_call',
      name: 'fetch',
      server_label: 'philip_archive',
      arguments: '{"id":"/posts/cycling"}',
    }
    socket.emitServerEvent({
      type: 'response.output_item.added',
      response_id: 'response_action',
      output_index: 0,
      item: archiveItem,
    })
    completeResponse(socket, [archiveItem, functionCall()])
    await flushDispatch()
    expect(execute).toHaveBeenCalledTimes(1)
    expect(continuations()).toHaveLength(0)

    const finishArchive = () => {
      socket.emitServerEvent({
        type: 'response.output_item.done',
        response_id: 'response_action',
        output_index: 0,
        item: {
          ...archiveItem,
          output: 'Cycling is a photograph of a cyclist.',
        },
      })
    }
    if (order === 'archive first') finishArchive()
    else action.resolve(confirmation)
    await flushDispatch()
    expect(continuations()).toHaveLength(0)

    if (order === 'archive first') action.resolve(confirmation)
    else finishArchive()
    await flushDispatch()

    expect(functionOutputs()).toHaveLength(1)
    expect(continuations()).toHaveLength(1)
    expect(continuations()[0].response).toMatchObject({
      metadata: { purpose: 'bell_subscription_disclosure' },
      tools: [],
      tool_choice: 'none',
    })
    expect(continuations()[0].response?.instructions).toContain(
      confirmation.disclosure
    )
    expect(sentEvents().indexOf(functionOutputs()[0])).toBeLessThan(
      sentEvents().indexOf(continuations()[0])
    )
  })
})
