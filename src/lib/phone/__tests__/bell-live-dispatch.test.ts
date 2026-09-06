import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startBellLiveGreeting } from '@/lib/phone/bell-live'
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
  response?: { metadata?: { purpose?: string } }
}

const confirmation: BellLiveActionResult = {
  status: 'confirmation_required',
  message: 'Would you like recurring new-post texts? Please say yes or no.',
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
  const greeting = await startBellLiveGreeting('rtc_dispatch', {
    actions: { execute, hasHandedOff },
  })
  const socket = FakeOpenAiRealtimeWebSocket.sockets[0]
  return { execute, hasHandedOff, greeting, socket }
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
      actions: { execute, hasHandedOff: () => false },
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
    expect(sentEvents().indexOf(functionOutputs()[0])).toBeLessThan(
      sentEvents().indexOf(continuations()[0])
    )
  })
})
