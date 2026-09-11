import { randomUUID } from 'node:crypto'
import OpenAI from 'openai'
import { SidebandWS } from 'openai/resources/live/sideband/ws'
import {
  BellLiveGreetingError,
  type BellLiveGreetingResult,
  type BellLiveLifecycleEvent,
  hangupBellLiveCall,
  PHONE_BELL_MAX_CALL_SECONDS,
} from '@/lib/phone/bell-live'
import type { BellLiveActionHandler } from '@/lib/phone/bell-live-actions'
import { runBellLiveDelegation } from '@/lib/phone/bell-live-backend'
import { phoneBellInitialGreeting } from '@/lib/phone/bell-live-greeting'
import type {
  BellLiveTranscriptRole,
  BellLiveTranscriptTurn,
} from '@/lib/phone/bell-live-transcript'
import type { CallerSubscriptionStatus } from '@/lib/phone/caller-subscription'

const STARTUP_TIMEOUT_MS = 20_000
const FIRST_AUDIO_TIMEOUT_MS = 10_000
const CLOSE_TIMEOUT_MS = 15_000
const DELEGATION_COALESCE_MS = 250
const FINAL_SPEECH_RESERVE_MS = 45_000
const MAX_TRANSCRIPT_CHARS = 96_000

/** Reflected sideband output is PCM16LE at 24 kHz; inspect and discard it. */
function hasAudibleSamples(delta: unknown): boolean {
  if (
    typeof delta !== 'string' ||
    delta.length === 0 ||
    delta.length > 256_000 ||
    delta.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(delta)
  ) {
    return false
  }
  const samples = Buffer.from(delta, 'base64')
  if (samples.length % 2 !== 0) return false
  let audible = 0
  for (let offset = 0; offset < samples.length; offset += 2) {
    if (Math.abs(samples.readInt16LE(offset)) >= 64) audible += 1
    if (audible >= 4) return true
  }
  return false
}

interface TranscriptFragment {
  id: string
  role: BellLiveTranscriptRole
  text: string
  startMs: number
  endMs: number
}

/** Timeline grouping is for presentation only, never evidence of completed speech. */
export class BellGptLiveTranscript {
  private readonly fragments: TranscriptFragment[] = []
  private readonly ids = new Set<string>()
  private chars = 0

  append(
    role: BellLiveTranscriptRole,
    event: Record<string, unknown>
  ): boolean {
    if (
      typeof event.event_id !== 'string' ||
      this.ids.has(event.event_id) ||
      typeof event.delta !== 'string' ||
      !event.delta ||
      typeof event.start_ms !== 'number' ||
      !Number.isFinite(event.start_ms) ||
      typeof event.end_ms !== 'number' ||
      !Number.isFinite(event.end_ms) ||
      event.start_ms < 0 ||
      event.end_ms < event.start_ms
    ) {
      return false
    }
    this.ids.add(event.event_id)
    this.chars += event.delta.length
    if (this.chars > MAX_TRANSCRIPT_CHARS) {
      throw new Error('Live transcript capacity exceeded')
    }
    this.fragments.push({
      id: event.event_id,
      role,
      text: event.delta,
      startMs: event.start_ms,
      endMs: event.end_ms,
    })
    return true
  }

  hasCallerText(): boolean {
    return this.fragments.some(
      (fragment) => fragment.role === 'caller' && fragment.text.trim()
    )
  }

  snapshot(): BellLiveTranscriptTurn[] {
    const groups: Array<BellLiveTranscriptTurn & { endMs: number }> = []
    for (const fragment of this.fragments.toSorted(
      (left, right) => left.startMs - right.startMs
    )) {
      const last = groups.at(-1)
      if (
        last?.role === fragment.role &&
        fragment.startMs - last.endMs < 1_500
      ) {
        last.text += fragment.text
        last.endMs = Math.max(last.endMs, fragment.endMs)
      } else {
        groups.push({
          itemId: fragment.id,
          role: fragment.role,
          text: fragment.text,
          complete: false,
          interrupted: false,
          endMs: fragment.endMs,
        })
      }
    }
    return groups.map(({ endMs: _endMs, ...turn }) => turn)
  }
}

/** Bound each append below 500 tokens even for unusual Unicode/tool output. */
export function bellLiveContextChunks(content: string): string[] {
  const chunks: string[] = []
  let remaining = content.trim()
  while (remaining) {
    let length = 0
    let bytes = 0
    for (const character of remaining) {
      bytes += Buffer.byteLength(character)
      if (bytes > 480 || length + character.length > 1_200) break
      length += character.length
    }
    const prefix = remaining.slice(0, length)
    const boundary = prefix.search(/\s+\S*$/)
    const split = length < remaining.length && boundary > 0 ? boundary : length
    chunks.push(remaining.slice(0, split))
    remaining = remaining.slice(split).trimStart()
  }
  return chunks
}

interface BellGptLiveSessionOptions {
  onGreetingConsumed?: () => Promise<boolean>
  onLifecycleEvent?: (event: BellLiveLifecycleEvent) => void
  actions?: BellLiveActionHandler
  subscriptionStatus?: CallerSubscriptionStatus
  runDelegation?: typeof runBellLiveDelegation
}

/**
 * Observe an already accepted Live SIP session. Generated audio is deliberately
 * not reported as heard: Live has no spoken-response or playback completion.
 */
export async function startBellGptLiveSession(
  callId: string,
  options: BellGptLiveSessionOptions = {}
): Promise<BellLiveGreetingResult> {
  if (!/^live_[A-Za-z0-9_-]{3,155}$/.test(callId)) {
    throw new Error('Invalid OpenAI Live session ID')
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const project = process.env.OPENAI_PROJECT_ID?.trim()
  if (!apiKey || !project) throw new Error('OpenAI Live is not configured')

  const startedAt = Date.now()
  const deadline = startedAt + PHONE_BELL_MAX_CALL_SECONDS * 1_000
  const greetingId = `greeting_${randomUUID()}`
  const connection = new SidebandWS(
    new OpenAI({ apiKey, project, baseURL: 'https://api.openai.com/v1' }),
    { session_id: callId, graceful_close: true },
    { headers: { 'OpenAI-Project': project }, reconnect: null }
  )

  return new Promise((resolve, reject) => {
    const transcript = new BellGptLiveTranscript()
    const seenDelegations = new Set<string>()
    const appendAcks = new Map<string, (accepted: boolean) => void>()
    let greetingRequested = false
    let greetingAcknowledged = false
    let outputTranscriptObserved = false
    let audibleSamplesObserved = false
    let audioGenerated = false
    let greetingSettled = false
    let conversationSettled = false
    let checkpointStarted = false
    let responseCheckpointed = !options.onGreetingConsumed
    let closing = false
    let observerHadError = false
    let observerCompleted = false
    let callerRevision = 0
    let lastStartedCallerRevision = 0
    let pendingMinimumCallerRevision = 1
    let pendingDelegation: string | null = null
    let hangupRequested = false
    let running: AbortController | null = null
    let coalesceTimer: ReturnType<typeof setTimeout> | undefined
    let firstAudioTimer: ReturnType<typeof setTimeout> | undefined
    let closeTimer: ReturnType<typeof setTimeout> | undefined
    let resolveConversation!: (
      result: Awaited<BellLiveGreetingResult['conversation']>
    ) => void
    const conversation = new Promise<
      Awaited<BellLiveGreetingResult['conversation']>
    >((resolveResult) => {
      resolveConversation = resolveResult
    })

    const emit = (event: BellLiveLifecycleEvent): void => {
      // Optional telemetry must never break call cleanup or action guards.
      try {
        options.onLifecycleEvent?.(event)
      } catch {}
    }
    const endOpenAiChild = (): void => {
      if (hangupRequested) return
      hangupRequested = true
      // Only the OpenAI child is ended; an existing Twilio handoff is untouched.
      void hangupBellLiveCall(callId).catch(() => {})
    }
    const finishConversation = (complete: boolean): void => {
      if (conversationSettled) return
      conversationSettled = true
      observerCompleted = complete && !observerHadError
      clearTimeout(startupTimer)
      clearTimeout(callTimer)
      clearTimeout(firstAudioTimer)
      clearTimeout(closeTimer)
      clearTimeout(coalesceTimer)
      running?.abort()
      pendingDelegation = null
      for (const acknowledge of appendAcks.values()) acknowledge(false)
      appendAcks.clear()
      resolveConversation({
        durationMs: Date.now() - startedAt,
        inputFailureCount: 0,
        missingTranscriptCount: 0,
        observerCompleted,
        turns: transcript.snapshot(),
      })
    }
    const fail = (
      reason: BellLiveGreetingError['reason'],
      details: {
        providerCode?: string
        socketCloseCode?: number
        socketHttpStatus?: number
      } = {}
    ): void => {
      if (conversationSettled) return
      observerHadError = true
      emit({
        event: 'bell_live.observer',
        outcome: 'failed',
        providerCode: details.providerCode ?? null,
        providerType: null,
        reason:
          reason === 'audio_not_started'
            ? reason
            : reason === 'provider_error'
              ? reason
              : 'socket_error',
        socketHttpStatus: details.socketHttpStatus ?? null,
      })
      if (!greetingSettled) {
        greetingSettled = true
        reject(
          new BellLiveGreetingError({
            reason,
            durationMs: Date.now() - startedAt,
            audioStarted: audioGenerated,
            responseCreated: audioGenerated,
            responseRequested: greetingRequested,
            ...details,
          })
        )
      }
      finishConversation(false)
      connection.close()
      endOpenAiChild()
    }
    const send = (event: Parameters<SidebandWS['send']>[0]): boolean => {
      if (conversationSettled || closing) return false
      try {
        connection.send(event)
        // The SDK reports some send failures synchronously through its emitter.
        return !conversationSettled
      } catch {
        fail('socket_error')
        return false
      }
    }
    const completeGreeting = (): void => {
      if (
        greetingSettled ||
        !audioGenerated ||
        !greetingAcknowledged ||
        (options.onGreetingConsumed && !checkpointStarted)
      ) {
        return
      }
      greetingSettled = true
      clearTimeout(startupTimer)
      resolve({
        audioStarted: true,
        conversation,
        durationMs: Date.now() - startedAt,
        outcome: 'generated',
        responseCheckpointed,
        responseCreated: true,
      })
    }
    let checkpoint: Promise<void> | null = null
    const noteGeneratedAudio = (): void => {
      if (
        !greetingRequested ||
        audioGenerated ||
        conversationSettled ||
        !outputTranscriptObserved ||
        !audibleSamplesObserved
      ) {
        return
      }
      audioGenerated = true
      clearTimeout(firstAudioTimer)
      checkpointStarted = true
      checkpoint = Promise.resolve()
        .then(() => options.onGreetingConsumed?.() ?? true)
        .then((saved) => {
          responseCheckpointed = saved
        })
        .catch(() => {
          responseCheckpointed = false
        })
        .then(completeGreeting)
    }
    const invalidate = (): void => {
      running?.abort()
      running = null
      for (const acknowledge of appendAcks.values()) acknowledge(false)
      appendAcks.clear()
    }
    const appendResult = (
      delegationId: string,
      content: string,
      isCurrent: () => boolean
    ): Promise<boolean> =>
      new Promise((acknowledge) => {
        if (!isCurrent()) return acknowledge(false)
        const eventId = `result_${randomUUID()}`
        const timer = setTimeout(() => {
          appendAcks.delete(eventId)
          acknowledge(false)
          if (isCurrent()) fail('timeout')
        }, STARTUP_TIMEOUT_MS)
        appendAcks.set(eventId, (accepted) => {
          clearTimeout(timer)
          acknowledge(accepted && isCurrent())
        })
        if (
          !send({
            type: 'session.commentary.append',
            event_id: eventId,
            delegation_id: delegationId,
            content,
          })
        ) {
          appendAcks.get(eventId)?.(false)
          appendAcks.delete(eventId)
        }
      })
    const finishHandoff = (): boolean => {
      if (!options.actions?.hasHandedOff()) return false
      if (closing || conversationSettled) return true
      invalidate()
      pendingDelegation = null
      clearTimeout(coalesceTimer)
      clearTimeout(callTimer)
      if (!send({ type: 'session.close' })) return true
      closing = true
      closeTimer = setTimeout(() => {
        // A timed-out Twilio redirect may have succeeded. Never redirect the
        // parent again; ending this child safely restores its keypad otherwise.
        endOpenAiChild()
        // Keep observing while the bounded REST hangup and final events settle.
        closeTimer = setTimeout(() => fail('timeout'), CLOSE_TIMEOUT_MS)
      }, CLOSE_TIMEOUT_MS)
      return true
    }
    const startDelegation = async (): Promise<void> => {
      if (
        !pendingDelegation ||
        !transcript.hasCallerText() ||
        callerRevision < pendingMinimumCallerRevision ||
        closing ||
        conversationSettled
      ) {
        return
      }
      if (Date.now() >= deadline - FINAL_SPEECH_RESERVE_MS) {
        pendingDelegation = null
        send({
          type: 'session.instructions.append',
          event_id: `limit_${randomUUID()}`,
          delegation_id: null,
          content:
            'There is less than a minute left in this call. Briefly summarize verified results already available. Do not begin new research or actions.',
        })
        return
      }
      const delegationId = pendingDelegation
      const revision = callerRevision
      lastStartedCallerRevision = revision
      const abort = new AbortController()
      running = abort
      const isCurrent = (): boolean =>
        !abort.signal.aborted &&
        !conversationSettled &&
        !closing &&
        pendingDelegation === delegationId &&
        callerRevision === revision
      try {
        const result = await (options.runDelegation ?? runBellLiveDelegation)({
          transcript: transcript
            .snapshot()
            .map(
              (turn) =>
                `${turn.role === 'caller' ? 'Caller' : 'Bell AI'}: ${JSON.stringify(turn.text)}`
            )
            .join('\n\n'),
          actions: options.actions,
          callerTurn: revision,
          signal: abort.signal,
          isCurrent,
          deadline: deadline - FINAL_SPEECH_RESERVE_MS,
        })
        if (finishHandoff()) return
        if (!isCurrent()) return
        for (const content of bellLiveContextChunks(result)) {
          if (!(await appendResult(delegationId, content, isCurrent))) return
        }
      } catch {
        if (finishHandoff()) return
        if (!isCurrent()) return
        await appendResult(
          delegationId,
          'The requested lookup or action could not be completed. Do not claim it succeeded. Offer the star-key keypad for telephone actions.',
          isCurrent
        )
      } finally {
        if (isCurrent()) {
          pendingDelegation = null
          running = null
        }
      }
    }
    const scheduleDelegation = (): void => {
      clearTimeout(coalesceTimer)
      if (pendingDelegation && !closing && !conversationSettled) {
        // Coalesce delivery bursts; this delay never establishes a complete turn.
        coalesceTimer = setTimeout(() => {
          void startDelegation()
        }, DELEGATION_COALESCE_MS)
      }
    }
    const startupTimer = setTimeout(() => fail('timeout'), STARTUP_TIMEOUT_MS)
    const callTimer = setTimeout(() => {
      if (conversationSettled) return
      invalidate()
      pendingDelegation = null
      if (!send({ type: 'session.close' })) return
      closing = true
      closeTimer = setTimeout(() => fail('timeout'), CLOSE_TIMEOUT_MS)
    }, PHONE_BELL_MAX_CALL_SECONDS * 1_000)

    const requestGreeting = (): void => {
      if (greetingRequested || conversationSettled || closing) return
      greetingRequested = true
      firstAudioTimer = setTimeout(
        () => fail('audio_not_started'),
        FIRST_AUDIO_TIMEOUT_MS
      )
      send({
        type: 'session.instructions.append',
        event_id: greetingId,
        delegation_id: null,
        content: `Greet immediately in English without waiting for the caller, then pause and listen. Say: ${phoneBellInitialGreeting(new Date(startedAt), options.subscriptionStatus ?? 'unknown')}`,
      })
    }
    // Acceptance already initialized the session. An attached observer must not
    // depend on a replay of the primary connection's earlier session.started.
    connection.socket.on('open', requestGreeting)
    connection.socket.on(
      'unexpected-response',
      (
        _request: unknown,
        response: { statusCode?: number; resume: () => void }
      ) => {
        response.resume()
        const status = response.statusCode
        fail('socket_error', {
          ...(typeof status === 'number' &&
          Number.isInteger(status) &&
          status >= 100 &&
          status <= 599
            ? { socketHttpStatus: status }
            : {}),
        })
      }
    )

    connection.on('event', (received) => {
      if (conversationSettled) return
      // The guide documents reflected audio before the SDK's sideband union does.
      const event = received as unknown as Record<string, unknown>
      if (event.type === 'session.started' && !greetingRequested) {
        requestGreeting()
      } else if (event.type === 'session.instructions.appended') {
        if (event.client_event_id === greetingId && !greetingAcknowledged) {
          greetingAcknowledged = true
          // Live instructions can be incorporated silently. The documented
          // commentary cue starts speech after the greeting instructions arrive.
          send({
            type: 'session.commentary.append',
            event_id: `greeting_start_${randomUUID()}`,
            delegation_id: null,
            content:
              'Begin the conversation now, following the instructions provided.',
          })
          if (checkpoint) void checkpoint.then(completeGreeting)
        }
      } else if (event.type === 'session.output_audio.delta') {
        if (greetingRequested && !audioGenerated) {
          audibleSamplesObserved ||= hasAudibleSamples(event.delta)
        }
        // Silence frames are normal in full duplex; no waveform is retained.
        noteGeneratedAudio()
      } else if (event.type === 'session.commentary.appended') {
        if (typeof event.client_event_id === 'string') {
          appendAcks.get(event.client_event_id)?.(true)
          appendAcks.delete(event.client_event_id)
        }
      } else if (
        event.type === 'session.input_transcript.delta' ||
        event.type === 'session.output_transcript.delta'
      ) {
        const caller = event.type === 'session.input_transcript.delta'
        try {
          if (
            transcript.append(caller ? 'caller' : 'bell_ai', event) &&
            caller &&
            typeof event.delta === 'string' &&
            event.delta.trim().length > 0
          ) {
            callerRevision += 1
            invalidate()
            scheduleDelegation()
          }
          if (!caller && greetingRequested && typeof event.delta === 'string') {
            outputTranscriptObserved ||= event.delta.trim().length > 0
            noteGeneratedAudio()
          }
        } catch {
          fail('provider_error')
        }
      } else if (event.type === 'session.delegation.created') {
        if (closing) return
        const delegation = event.delegation as
          | { id?: unknown; target?: unknown }
          | undefined
        if (
          delegation?.target === 'client' &&
          typeof delegation.id === 'string' &&
          !seenDelegations.has(delegation.id)
        ) {
          seenDelegations.add(delegation.id)
          invalidate()
          pendingDelegation = delegation.id
          // A new metadata event alone cannot reuse a previous caller request
          // as fresh authorization. Retain it until new transcript arrives.
          pendingMinimumCallerRevision = lastStartedCallerRevision + 1
          scheduleDelegation()
        }
      } else if (event.type === 'session.closed') {
        const normal =
          event.reason === 'close_requested' ||
          event.reason === 'remote_hangup' ||
          event.reason === 'expired' ||
          event.reason === 'content'
        if (!greetingSettled) {
          fail('closed')
          return
        }
        finishConversation(normal)
        connection.close()
      }
    })
    connection.on('error', (error) => {
      const providerCode = error.error?.error.code
      fail(error.error ? 'provider_error' : 'socket_error', {
        ...(typeof providerCode === 'string' &&
        /^[A-Za-z0-9_-]{1,100}$/.test(providerCode)
          ? { providerCode }
          : {}),
      })
    })
    connection.on('close', (code) => {
      emit({
        event: 'bell_live.sideband',
        outcome: observerCompleted ? 'completed' : 'failed',
        socketCloseCode: code,
      })
      // Even a 1000 close is incomplete without the authoritative final event.
      if (!conversationSettled) fail('closed', { socketCloseCode: code })
    })
  })
}
