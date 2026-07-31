type WebSocketListener = (...args: unknown[]) => void

interface FakeWebSocketOptions {
  headers?: Record<string, string>
  [key: string]: unknown
}

/** Minimal Node `ws`-style socket used by Bell Live route and unit tests. */
export class FakeOpenAiRealtimeWebSocket {
  static connections: Array<{
    options: FakeWebSocketOptions
    url: string
  }> = []
  static emitAudioCleared = false
  static emitAudioStarted = true
  static emitAudioStopped = true
  static finalStatus: 'completed' | 'failed' = 'completed'
  static handshakeHttpStatus: number | null = null
  static handshakeHttpStatuses: Array<number | null> = []
  static sentEvents: unknown[] = []
  static throwOnSend = false

  readonly options: FakeWebSocketOptions
  readonly url: string
  private readonly listeners = new Map<string, WebSocketListener[]>()

  constructor(url: string | URL, options: FakeWebSocketOptions = {}) {
    this.url = String(url)
    this.options = options
    FakeOpenAiRealtimeWebSocket.connections.push({
      options,
      url: this.url,
    })
    queueMicrotask(() => {
      const handshakeHttpStatus =
        FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses.length > 0
          ? FakeOpenAiRealtimeWebSocket.handshakeHttpStatuses.shift()
          : FakeOpenAiRealtimeWebSocket.handshakeHttpStatus
      if (handshakeHttpStatus !== null) {
        this.emit(
          'unexpected-response',
          {},
          {
            resume: () => undefined,
            statusCode: handshakeHttpStatus,
          }
        )
        return
      }
      this.emit('open')
    })
  }

  on(type: string, listener: WebSocketListener): this {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
    return this
  }

  close(): void {}

  send(value: string): void {
    if (FakeOpenAiRealtimeWebSocket.throwOnSend) {
      throw new Error('WebSocket send failed')
    }
    const event = JSON.parse(value) as unknown
    FakeOpenAiRealtimeWebSocket.sentEvents.push(event)
    queueMicrotask(() => {
      this.emit(
        'message',
        JSON.stringify({
          type: 'response.created',
          event_id: 'evt_greeting_started',
          response: {
            id: 'resp_greeting',
            status: 'in_progress',
            metadata: { purpose: 'bell_initial_greeting' },
          },
        })
      )
      if (FakeOpenAiRealtimeWebSocket.emitAudioStarted) {
        this.emit(
          'message',
          JSON.stringify({
            type: 'output_audio_buffer.started',
            event_id: 'evt_greeting_audio_started',
            response_id: 'resp_greeting',
          })
        )
      }
      this.emit(
        'message',
        JSON.stringify({
          type: 'response.done',
          event_id: 'evt_greeting_done',
          response: {
            id: 'resp_greeting',
            status: FakeOpenAiRealtimeWebSocket.finalStatus,
            metadata: { purpose: 'bell_initial_greeting' },
            ...(FakeOpenAiRealtimeWebSocket.finalStatus === 'failed'
              ? {
                  status_details: {
                    type: 'failed',
                    error: {
                      code: 'greeting_failed',
                      type: 'server_error',
                    },
                  },
                }
              : {}),
          },
        })
      )
      if (FakeOpenAiRealtimeWebSocket.emitAudioStopped) {
        this.emit(
          'message',
          JSON.stringify({
            type: 'output_audio_buffer.stopped',
            event_id: 'evt_greeting_audio_stopped',
            response_id: 'resp_greeting',
          })
        )
      }
      if (FakeOpenAiRealtimeWebSocket.emitAudioCleared) {
        this.emit(
          'message',
          JSON.stringify({
            type: 'output_audio_buffer.cleared',
            event_id: 'evt_greeting_audio_cleared',
            response_id: 'resp_greeting',
          })
        )
      }
    })
  }

  private emit(type: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(type) ?? []) listener(...args)
  }
}

type FakeRealtimeListener = (event: Record<string, unknown>) => void

/** Test double for the SDK's Node-only `OpenAIRealtimeWS` helper. */
export class FakeOpenAiRealtimeWS {
  readonly socket: FakeOpenAiRealtimeWebSocket
  private readonly listeners = new Map<string, FakeRealtimeListener[]>()

  constructor(
    props: {
      callID: string
      options?: FakeWebSocketOptions
    },
    client?: {
      apiKey: string
      baseURL: string
    }
  ) {
    const baseUrl = (client?.baseURL ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    )
    const url = new URL(`${baseUrl}/realtime`)
    url.protocol = 'wss:'
    url.searchParams.set('call_id', props.callID)
    this.socket = new FakeOpenAiRealtimeWebSocket(url, {
      ...props.options,
      headers: {
        ...props.options?.headers,
        Authorization: `Bearer ${client?.apiKey ?? ''}`,
      },
    })
    this.socket.on('message', (value) => {
      const event = JSON.parse(String(value)) as Record<string, unknown>
      if (event.type === 'error') {
        const error = Object.assign(new Error('OpenAI Realtime error'), {
          error: event.error,
        })
        this.emit('error', error)
        return
      }
      this.emit(String(event.type), event)
    })
    this.socket.on('error', (value) => {
      this.emit(
        'error',
        Object.assign(new Error(String(value)), { error: undefined })
      )
    })
  }

  on(type: string, listener: FakeRealtimeListener): this {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
    return this
  }

  close(): void {
    this.socket.close()
  }

  send(event: unknown): void {
    try {
      this.socket.send(JSON.stringify(event))
    } catch (cause) {
      this.emit(
        'error',
        Object.assign(new Error('could not send data'), {
          cause,
          error: undefined,
        })
      )
    }
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as Record<string, unknown>)
    }
  }
}
