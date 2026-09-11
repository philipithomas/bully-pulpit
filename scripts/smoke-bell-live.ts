/** Delivery-free Live transport smoke: no actions, notification, or persistence callbacks. */

import { writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import OpenAI from 'openai'
import type {
  MediaSessionConfig,
  ServerEvent,
} from 'openai/resources/live/live'
import { BellLiveGreetingError } from '@/lib/phone/bell-live'
import { runBellLiveDelegation } from '@/lib/phone/bell-live-backend'
import { phoneBellGptLiveSession } from '@/lib/phone/bell-live-config'
import { startBellGptLiveSession } from '@/lib/phone/bell-live-session'

const RATE = 24_000
const CLOSE_AFTER_MS = 50_000
const HARD_STOP_MS = 60_000

type BrowserPage = {
  evaluate<T, A = undefined>(
    callback: ((argument: A) => T | Promise<T>) | string,
    argument?: A
  ): Promise<T>
  exposeFunction(
    name: string,
    callback: (event: ServerEvent) => void
  ): Promise<void>
}
type SmokeBrowser = { newPage(): Promise<BrowserPage>; close(): Promise<void> }
type BrowserRuntime = {
  chromium: {
    launch(options: {
      headless: boolean
      channel: string
      args: string[]
      timeout: number
    }): Promise<SmokeBrowser>
  }
}
type BrowserHarness = {
  accept(sdp: string): Promise<void>
  playQuestion(): void
  requestClose(): boolean
  dispose(): Promise<void>
  stats(): Promise<Record<string, string | number>>
}
type SmokeWindow = Window & {
  bellSmoke: BrowserHarness
  bellSmokeEvent(event: ServerEvent): Promise<void>
}

/** A synthetic WebRTC peer, with no microphone permission or API key in the browser. */
async function createWebRtcPeer(client: OpenAI, inputPcm: Buffer | null) {
  const require = createRequire(import.meta.url)
  let runtime: BrowserRuntime
  try {
    runtime = require(
      process.env.BELL_LIVE_PLAYWRIGHT_PATH || 'playwright'
    ) as BrowserRuntime
  } catch {
    throw new Error('playwright_missing_set_bell_live_playwright_path')
  }
  const browser = await runtime.chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
    timeout: 10_000,
  })
  try {
    let receive = (_event: ServerEvent) => {}
    let sessionId: string | undefined
    const page = await browser.newPage()
    await page.exposeFunction('bellSmokeEvent', (event) => receive(event))
    // tsx may preserve function names in serialized evaluate callbacks.
    await page.evaluate('globalThis.__name = (value) => value')
    const sdp = await page.evaluate(async (base64) => {
      const host = window as unknown as SmokeWindow
      const context = new AudioContext({ sampleRate: 24_000 })
      await context.resume()
      const peer = new RTCPeerConnection()
      const input = context.createMediaStreamDestination()
      const silence = context.createConstantSource()
      silence.offset.value = 0
      silence.connect(input)
      silence.start()
      peer.addTrack(input.stream.getAudioTracks()[0], input.stream)
      const channel = peer.createDataChannel('oai-events')
      const retainedNodes: Array<AudioNode | HTMLAudioElement> = []
      channel.onmessage = (message) => {
        void host.bellSmokeEvent(JSON.parse(message.data) as ServerEvent)
      }
      peer.ontrack = async (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track])
        // Chrome needs a playing media element to activate remote-track
        // decoding. Keep that sink muted and retain the recording graph.
        const element = document.createElement('audio')
        element.srcObject = stream
        element.muted = true
        element.autoplay = true
        document.body.append(element)
        await element.play()
        const source = context.createMediaStreamSource(stream)
        const recorder = context.createScriptProcessor(2_048, 1, 1)
        const mute = context.createGain()
        mute.gain.value = 0
        source.connect(recorder)
        recorder.connect(mute)
        mute.connect(context.destination)
        retainedNodes.push(source, recorder, mute, element)
        recorder.onaudioprocess = (audio) => {
          const samples = audio.inputBuffer.getChannelData(0)
          const bytes = new Uint8Array(samples.length * 2)
          const view = new DataView(bytes.buffer)
          for (let index = 0; index < samples.length; index++) {
            view.setInt16(
              index * 2,
              Math.max(-1, Math.min(1, samples[index])) * 32_767,
              true
            )
          }
          void host.bellSmokeEvent({
            type: 'session.output_audio.delta',
            delta: btoa(String.fromCharCode(...bytes)),
          })
        }
      }
      let question: AudioBuffer | undefined
      if (base64) {
        const raw = atob(base64)
        const bytes = Uint8Array.from(raw, (value) => value.charCodeAt(0))
        const view = new DataView(bytes.buffer)
        question = context.createBuffer(1, bytes.length / 2, 24_000)
        const samples = question.getChannelData(0)
        for (let index = 0; index < samples.length; index++)
          samples[index] = view.getInt16(index * 2, true) / 32_768
      }
      host.bellSmoke = {
        accept: async (answer) => {
          await peer.setRemoteDescription({ type: 'answer', sdp: answer })
        },
        playQuestion: () => {
          if (!question) return
          const source = context.createBufferSource()
          source.buffer = question
          source.connect(input)
          source.start()
          question = undefined
        },
        requestClose: () => {
          if (channel.readyState !== 'open') return false
          channel.send(JSON.stringify({ type: 'session.close' }))
          return true
        },
        dispose: async () => {
          for (const node of retainedNodes) {
            if (node instanceof HTMLAudioElement) node.remove()
            else node.disconnect()
          }
          peer.close()
          await context.close()
        },
        stats: async () => {
          const values: Record<string, string | number> = {
            audioContext: context.state,
            connection: peer.connectionState,
            iceConnection: peer.iceConnectionState,
          }
          for (const report of (await peer.getStats()).values()) {
            if (report.kind !== 'audio') continue
            if (report.type === 'inbound-rtp') {
              values.inboundPackets = report.packetsReceived ?? 0
              values.inboundBytes = report.bytesReceived ?? 0
              values.inboundAudioEnergy = report.totalAudioEnergy ?? 0
            } else if (report.type === 'outbound-rtp') {
              values.outboundPackets = report.packetsSent ?? 0
              values.outboundBytes = report.bytesSent ?? 0
            }
          }
          return values
        },
      }
      await peer.setLocalDescription(await peer.createOffer())
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === 'complete') return resolve()
        const timer = setTimeout(resolve, 2_000)
        peer.onicegatheringstatechange = () => {
          if (peer.iceGatheringState === 'complete') {
            clearTimeout(timer)
            resolve()
          }
        }
      })
      return peer.localDescription?.sdp ?? ''
    }, inputPcm?.toString('base64') ?? '')
    return {
      onEvent(callback: (event: ServerEvent) => void) {
        receive = callback
      },
      async start(session: MediaSessionConfig) {
        // The Live API accepts JSON SDP exchange, unlike Realtime's multipart API.
        const created = await client.live.create(
          { session, transport: { type: 'webrtc', sdp } },
          { timeout: 15_000, maxRetries: 0 }
        )
        sessionId = created.session.id
        await page.evaluate(
          (answer) =>
            (window as unknown as SmokeWindow).bellSmoke.accept(answer),
          created.transport.sdp
        )
      },
      playQuestion: () =>
        page.evaluate(() =>
          (window as unknown as SmokeWindow).bellSmoke.playQuestion()
        ),
      async requestClose() {
        const sent = await page.evaluate(() =>
          (window as unknown as SmokeWindow).bellSmoke.requestClose()
        )
        if (!sent && sessionId)
          await client.live.sessions.hangup(sessionId, {
            timeout: 5_000,
            maxRetries: 0,
          })
      },
      async close() {
        await page
          .evaluate(() =>
            (window as unknown as SmokeWindow).bellSmoke.dispose()
          )
          .catch(() => {})
        await browser.close()
      },
      stats: () =>
        page.evaluate(() =>
          (window as unknown as SmokeWindow).bellSmoke.stats()
        ),
    }
  } catch (error) {
    await browser.close().catch(() => {})
    throw error
  }
}

function parseArguments() {
  const args = process.argv.slice(2)
  let inputWav: string | undefined
  let outputWav: string | undefined
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error('invalid_arguments')
    if (args[index] === '--input-wav') inputWav = path.resolve(value)
    else if (args[index] === '--output-wav') outputWav = path.resolve(value)
    else throw new Error('invalid_arguments')
  }
  if (
    outputWav &&
    (!outputWav.startsWith('/tmp/') || !outputWav.endsWith('.wav'))
  ) {
    throw new Error('output_must_be_tmp_wav')
  }
  return { inputWav, outputWav }
}

/** Parse RIFF chunks instead of assuming every encoder writes a 44-byte header. */
function readPcmWav(wav: Buffer): Buffer {
  if (
    wav.length > RATE * 2 * 15 + 65_536 ||
    wav.toString('ascii', 0, 4) !== 'RIFF' ||
    wav.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('invalid_input_wav')
  }
  let formatValid = false
  let pcm: Buffer | undefined
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const kind = wav.toString('ascii', offset, offset + 4)
    const declaredLength = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    // Streaming TTS WAVs cannot seek back to fill the data length. Their final
    // data chunk uses INT_MAX or UINT_MAX; the bounded file is authoritative.
    const length =
      kind === 'data' &&
      (declaredLength === 0x7fffffff || declaredLength === 0xffffffff)
        ? wav.length - start
        : declaredLength
    if (start + length > wav.length) throw new Error('invalid_input_wav')
    if (kind === 'fmt ' && length >= 16) {
      formatValid =
        wav.readUInt16LE(start) === 1 &&
        wav.readUInt16LE(start + 2) === 1 &&
        wav.readUInt32LE(start + 4) === RATE &&
        wav.readUInt32LE(start + 8) === RATE * 2 &&
        wav.readUInt16LE(start + 12) === 2 &&
        wav.readUInt16LE(start + 14) === 16
    }
    if (kind === 'data') pcm = wav.subarray(start, start + length)
    offset = start + length + (length % 2)
  }
  if (
    !formatValid ||
    !pcm?.length ||
    pcm.length % 2 ||
    pcm.length > RATE * 2 * 15
  ) {
    throw new Error('input_requires_mono_pcm16le_24khz_at_most_15_seconds')
  }
  return pcm
}

function wrapPcmWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(pcm.length + 36, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function main() {
  const { inputWav, outputWav } = parseArguments()
  const inputPcm = inputWav ? readPcmWav(await readFile(inputWav)) : null
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const project = process.env.OPENAI_PROJECT_ID?.trim()
  if (!apiKey || !project) throw new Error('openai_configuration_missing')
  const startedAt = Date.now()
  const smokeAbort = new AbortController()
  const metrics = {
    mode: inputPcm ? 'caller_audio_and_research' : 'greeting',
    model: 'gpt-live-1',
    transport: 'webrtc',
    primaryStarted: false,
    greetingGenerated: false,
    greetingRequested: false,
    greetingInstructionAcks: 0,
    observerProviderCode: '',
    observerHttpStatus: null as number | null,
    outputAudioBytes: 0,
    audibleSamples: 0,
    outputTranscriptChars: 0,
    inputTranscriptChars: 0,
    inputAudioBytes: 0,
    backendStarted: 0,
    backendCompleted: 0,
    backendFailed: 0,
    backendAborted: 0,
    backendSummaryChars: 0,
    commentaryAcknowledged: 0,
    answerTranscriptChars: 0,
    primaryFinalized: false,
    observerFinalized: false,
    transcriptTurns: 0,
    closeReason: '',
    errorCode: '',
  }
  const outputAudio: Buffer[] = []
  const transcript: Array<{ role: string; text: string }> = []
  const transcriptPath = outputWav?.replace(/\.wav$/, '-transcript.txt')
  let mediaStats: Record<string, string | number> = {}
  const appendTranscript = (role: string, text: string) => {
    const last = transcript.at(-1)
    if (last?.role === role) last.text += text
    else transcript.push({ role, text })
  }
  const renderedTranscript = () =>
    transcript.map((turn) => `${turn.role}: ${turn.text}`).join('\n\n')
  let closeRequested = false
  let finished = false
  let observerSettled = false
  let lastTranscriptAt = 0
  let greetingAt = 0
  let questionStarted = false
  let frameTimer: ReturnType<typeof setInterval> | undefined
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })
  const connection = await createWebRtcPeer(
    new OpenAI({ apiKey, project }),
    inputPcm
  )

  function requestClose() {
    if (closeRequested) return
    closeRequested = true
    clearInterval(frameTimer)
    smokeAbort.abort()
    void connection.requestClose().catch(() => {
      metrics.errorCode ||= 'close_failed'
    })
  }

  function fail(code: string) {
    if (!metrics.errorCode) metrics.errorCode = code
    requestClose()
  }

  function maybeFinish() {
    if (metrics.primaryFinalized && observerSettled) resolveDone()
  }

  function result() {
    const passed =
      metrics.primaryStarted &&
      metrics.greetingGenerated &&
      metrics.audibleSamples > 0 &&
      metrics.outputTranscriptChars > 0 &&
      metrics.primaryFinalized &&
      metrics.observerFinalized &&
      metrics.closeReason === 'close_requested' &&
      !metrics.errorCode &&
      (!inputPcm ||
        (metrics.inputTranscriptChars > 0 &&
          metrics.backendCompleted > 0 &&
          metrics.answerTranscriptChars > 0))
    return {
      passed,
      ...metrics,
      media: mediaStats,
      durationMs: Date.now() - startedAt,
      ...(outputWav ? { outputWav } : {}),
    }
  }

  const hardTimer = setTimeout(
    async () => {
      if (finished) return
      metrics.errorCode ||= 'hard_deadline'
      clearInterval(frameTimer)
      smokeAbort.abort()
      await Promise.race([
        connection.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ])
      if (outputWav) {
        try {
          writeFileSync(outputWav, wrapPcmWav(Buffer.concat(outputAudio)))
          if (transcriptPath)
            writeFileSync(transcriptPath, renderedTranscript())
        } catch {}
      }
      // The controller intentionally owns its sideband. Process exit is the final
      // bound if the remote service never sends its authoritative close event.
      console.log(JSON.stringify(result(), null, 2))
      process.exit(1)
    },
    Math.max(1, HARD_STOP_MS - 2_000 - (Date.now() - startedAt))
  )
  const closeTimer = setTimeout(
    requestClose,
    Math.max(1, CLOSE_AFTER_MS - (Date.now() - startedAt))
  )

  connection.onEvent((event) => {
    if (event.type === 'session.started') {
      if (metrics.primaryStarted) return
      metrics.primaryStarted = true
      frameTimer = setInterval(() => {
        if (closeRequested) return
        // This quiet interval only schedules a test fixture; it is never used
        // as a production turn-completion or consent signal.
        const quiet =
          metrics.outputTranscriptChars > 0 &&
          Date.now() - lastTranscriptAt >= 2_500
        if (
          metrics.greetingGenerated &&
          quiet &&
          Date.now() - greetingAt >= 3_000
        ) {
          if (inputPcm) {
            if (!questionStarted) {
              questionStarted = true
              metrics.inputAudioBytes = inputPcm.length
              void connection
                .playQuestion()
                .catch(() => fail('question_playback_failed'))
            }
          } else requestClose()
        }
        if (inputPcm && metrics.answerTranscriptChars > 0 && quiet)
          requestClose()
      }, 100)
      void startBellGptLiveSession(event.session.id, {
        // Deliberately omit actions and onGreetingConsumed. Importing this
        // observer never sends a notification; callers own that separately.
        runDelegation: async ({ actions: _actions, ...request }) => {
          metrics.backendStarted += 1
          try {
            const summary = await runBellLiveDelegation({
              ...request,
              signal: AbortSignal.any([request.signal, smokeAbort.signal]),
            })
            if (summary) {
              metrics.backendCompleted += 1
              metrics.backendSummaryChars += summary.length
              appendTranscript('Backend', summary)
            }
            return summary
          } catch (error) {
            if (request.signal.aborted || smokeAbort.signal.aborted)
              metrics.backendAborted += 1
            else metrics.backendFailed += 1
            throw error
          }
        },
      })
        .then(async (greeting) => {
          metrics.greetingGenerated = greeting.outcome === 'generated'
          metrics.greetingRequested = true
          greetingAt = Date.now()
          const conversation = await greeting.conversation
          observerSettled = true
          metrics.observerFinalized = conversation.observerCompleted
          metrics.transcriptTurns = conversation.turns.length
          if (!conversation.observerCompleted) fail('observer_incomplete')
          maybeFinish()
        })
        .catch((error: unknown) => {
          observerSettled = true
          if (error instanceof BellLiveGreetingError) {
            metrics.greetingRequested = error.responseRequested
            metrics.observerProviderCode = error.providerCode ?? ''
            metrics.observerHttpStatus = error.socketHttpStatus
            fail(`observer_${error.reason}`)
          } else fail('observer_failed')
          maybeFinish()
        })
    } else if (event.type === 'session.output_audio.delta') {
      const pcm = Buffer.from(event.delta, 'base64')
      metrics.outputAudioBytes += pcm.length
      for (let offset = 0; offset + 1 < pcm.length; offset += 2) {
        if (Math.abs(pcm.readInt16LE(offset)) > 100) metrics.audibleSamples += 1
      }
      if (
        outputWav &&
        metrics.outputAudioBytes <= (RATE * 2 * HARD_STOP_MS) / 1_000
      )
        outputAudio.push(pcm)
    } else if (event.type === 'session.output_transcript.delta') {
      appendTranscript('Bell AI', event.delta)
      metrics.outputTranscriptChars += event.delta.length
      lastTranscriptAt = Date.now()
      if (metrics.backendCompleted > 0)
        metrics.answerTranscriptChars += event.delta.length
    } else if (event.type === 'session.input_transcript.delta') {
      appendTranscript('Caller', event.delta)
      metrics.inputTranscriptChars += event.delta.length
    } else if (event.type === 'session.commentary.appended') {
      metrics.commentaryAcknowledged += 1
    } else if (event.type === 'session.instructions.appended') {
      metrics.greetingInstructionAcks += 1
    } else if (event.type === 'session.closed') {
      metrics.primaryFinalized = true
      metrics.closeReason = event.reason
      clearInterval(frameTimer)
      maybeFinish()
    } else if (event.type === 'error') {
      fail(
        /^[A-Za-z0-9_-]{1,100}$/.test(event.error.code)
          ? event.error.code
          : 'primary_error'
      )
    }
  })
  const { type: _type, ...production } = phoneBellGptLiveSession()
  try {
    await connection.start(production)
  } catch {
    fail('webrtc_session_creation_failed')
  }
  await done
  finished = true
  clearTimeout(hardTimer)
  clearTimeout(closeTimer)
  clearInterval(frameTimer)
  smokeAbort.abort()
  mediaStats = await connection.stats()
  await connection.close()
  if (outputWav)
    await writeFile(outputWav, wrapPcmWav(Buffer.concat(outputAudio)))
  if (transcriptPath) await writeFile(transcriptPath, renderedTranscript())
  const summary = result()
  console.log(JSON.stringify(summary, null, 2))
  process.exit(summary.passed ? 0 : 1)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : ''
  const code = /^[a-z0-9_]+$/.test(message) ? message : 'smoke_setup_failed'
  console.error(JSON.stringify({ passed: false, errorCode: code }))
  process.exitCode = 1
})
