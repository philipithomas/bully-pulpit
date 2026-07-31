type WebSocketListener = (event: { data?: string; message?: string }) => void

/** Minimal successful WebSocket used by Bell Live route and unit tests. */
export class FakeOpenAiRealtimeWebSocket {
  static finalStatus: 'completed' | 'failed' = 'completed'
  static sentEvents: unknown[] = []
  static throwOnSend = false

  readonly protocols: string[]
  readonly url: string
  private readonly listeners = new Map<string, WebSocketListener[]>()

  constructor(url: string | URL, protocols: string | string[] = []) {
    this.url = String(url)
    this.protocols = Array.isArray(protocols) ? protocols : [protocols]
    queueMicrotask(() => this.emit('open', {}))
  }

  addEventListener(type: string, listener: WebSocketListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {}

  send(value: string): void {
    if (FakeOpenAiRealtimeWebSocket.throwOnSend) {
      throw new Error('WebSocket send failed')
    }
    const event = JSON.parse(value) as unknown
    FakeOpenAiRealtimeWebSocket.sentEvents.push(event)
    queueMicrotask(() => {
      this.emit('message', {
        data: JSON.stringify({
          type: 'response.created',
          event_id: 'evt_greeting_started',
          response: {
            id: 'resp_greeting',
            status: 'in_progress',
            metadata: { purpose: 'bell_initial_greeting' },
          },
        }),
      })
      this.emit('message', {
        data: JSON.stringify({
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
        }),
      })
    })
  }

  private emit(type: string, event: { data?: string; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}
