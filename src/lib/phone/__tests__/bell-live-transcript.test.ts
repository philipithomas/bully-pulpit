import { describe, expect, it } from 'vitest'
import {
  BellLiveTranscriptCollector,
  formatBellLiveTranscript,
} from '@/lib/phone/bell-live-transcript'

describe('Bell Live transcript collection', () => {
  it('uses conversation links when caller transcription completes late', () => {
    const collector = new BellLiveTranscriptCollector()
    collector.noteItem('caller-1', null)
    collector.noteItem('bell-1', 'caller-1')
    collector.completeBell('response-1', 'bell-1', 0, 'Hello there.')
    collector.completeCaller('caller-1', 0, 'Can you help?')

    expect(collector.snapshot().turns).toEqual([
      {
        complete: true,
        interrupted: false,
        itemId: 'caller-1',
        role: 'caller',
        text: 'Can you help?',
      },
      {
        complete: true,
        interrupted: false,
        itemId: 'bell-1',
        role: 'bell_ai',
        text: 'Hello there.',
      },
    ])
  })

  it('uses completed text in place of deltas and keeps partial close fallbacks', () => {
    const collector = new BellLiveTranscriptCollector()
    collector.addCallerDelta('caller-1', 0, 'Hel')
    collector.addCallerDelta('caller-1', 0, 'lo')
    collector.completeCaller('caller-1', 0, 'Hello.')
    collector.addBellDelta('response-1', 'bell-1', 0, 'Still speaking')

    expect(collector.snapshot().turns.map((turn) => turn.text)).toEqual([
      'Hello.',
      'Still speaking',
    ])
    expect(collector.snapshot().turns[1]?.complete).toBe(false)
  })

  it('marks interrupted Bell AI speech and caller transcription failures', () => {
    const collector = new BellLiveTranscriptCollector()
    collector.interruptBellResponse('response-1')
    collector.completeBell('response-1', 'bell-1', 0, 'A partial answer.')
    collector.failCaller('caller-2')

    const snapshot = collector.snapshot()
    expect(snapshot.inputFailureCount).toBe(1)
    expect(snapshot.turns[0]?.interrupted).toBe(true)
    expect(formatBellLiveTranscript(snapshot.turns)).toBe(
      'Bell AI (interrupted): A partial answer.'
    )
  })

  it('keeps failed or token-limited responses distinct from interruptions', () => {
    const collector = new BellLiveTranscriptCollector()
    collector.completeBell('response-1', 'bell-1', 0, 'An unfinished answer.')
    collector.markBellResponseIncomplete('response-1')

    const turn = collector.snapshot().turns[0]
    expect(turn).toMatchObject({ complete: false, interrupted: false })
    expect(formatBellLiveTranscript(turn ? [turn] : [])).toBe(
      'Bell AI (partial): An unfinished answer.'
    )
  })

  it('reports an expected audio item whose transcript never arrives', () => {
    const collector = new BellLiveTranscriptCollector()
    collector.expectTurn('caller', 'caller-1', 0)

    expect(collector.snapshot()).toMatchObject({
      missingTranscriptCount: 1,
      turns: [],
    })
  })
})
