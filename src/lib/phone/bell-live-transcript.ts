export type BellLiveTranscriptRole = 'caller' | 'bell_ai'

export interface BellLiveTranscriptTurn {
  complete: boolean
  interrupted: boolean
  itemId: string
  role: BellLiveTranscriptRole
  text: string
}

interface ConversationItemOrder {
  firstSeen: number
  previousItemId?: string | null
}

interface MutableTranscriptTurn {
  complete: boolean
  contentIndex: number
  delta: string
  interrupted: boolean
  itemId: string
  responseId?: string
  role: BellLiveTranscriptRole
  transcript?: string
}

/**
 * Collects only spoken caller and Bell AI turns from a Realtime sideband.
 * Input transcription completes asynchronously, so event arrival order is not
 * conversational order. Conversation item links provide the stable ordering.
 */
export class BellLiveTranscriptCollector {
  private readonly expectedTurnKeys = new Set<string>()
  private readonly incompleteResponseIds = new Set<string>()
  private readonly interruptedResponseIds = new Set<string>()
  private readonly itemOrder = new Map<string, ConversationItemOrder>()
  private readonly turns = new Map<string, MutableTranscriptTurn>()
  private nextItemSequence = 0
  private inputFailureCount = 0

  noteItem(itemId: string, previousItemId?: string | null): void {
    const existing = this.itemOrder.get(itemId)
    if (existing) {
      if (previousItemId !== undefined) existing.previousItemId = previousItemId
      return
    }
    this.itemOrder.set(itemId, {
      firstSeen: this.nextItemSequence++,
      ...(previousItemId !== undefined ? { previousItemId } : {}),
    })
  }

  expectTurn(
    role: BellLiveTranscriptRole,
    itemId: string,
    contentIndex: number
  ): void {
    this.noteItem(itemId)
    this.expectedTurnKeys.add(this.turnKey(role, itemId, contentIndex))
  }

  addCallerDelta(itemId: string, contentIndex: number, delta: string): void {
    this.appendDelta('caller', itemId, contentIndex, delta)
  }

  completeCaller(
    itemId: string,
    contentIndex: number,
    transcript: string
  ): void {
    this.completeTurn('caller', itemId, contentIndex, transcript)
  }

  failCaller(itemId: string): void {
    this.noteItem(itemId)
    this.inputFailureCount += 1
  }

  addBellDelta(
    responseId: string,
    itemId: string,
    contentIndex: number,
    delta: string
  ): void {
    this.appendDelta('bell_ai', itemId, contentIndex, delta, responseId)
  }

  completeBell(
    responseId: string,
    itemId: string,
    contentIndex: number,
    transcript: string
  ): void {
    this.completeTurn('bell_ai', itemId, contentIndex, transcript, responseId)
  }

  completeBellItem(
    itemId: string,
    contentIndex: number,
    transcript: string
  ): void {
    this.completeTurn('bell_ai', itemId, contentIndex, transcript)
  }

  interruptBellResponse(responseId: string): void {
    this.interruptedResponseIds.add(responseId)
    for (const turn of this.turns.values()) {
      if (turn.responseId === responseId) turn.interrupted = true
    }
  }

  markBellResponseIncomplete(responseId: string): void {
    this.incompleteResponseIds.add(responseId)
    for (const turn of this.turns.values()) {
      if (turn.responseId === responseId) turn.complete = false
    }
  }

  snapshot(): {
    inputFailureCount: number
    missingTranscriptCount: number
    turns: BellLiveTranscriptTurn[]
  } {
    const orderedItems = this.orderedItemIds()
    const itemRanks = new Map(
      orderedItems.map((itemId, index) => [itemId, index])
    )
    const turns = Array.from(this.turns.values())
      .map((turn) => ({
        complete: turn.complete,
        interrupted: turn.interrupted,
        itemId: turn.itemId,
        role: turn.role,
        text: (turn.transcript ?? turn.delta).trim(),
        contentIndex: turn.contentIndex,
      }))
      .filter((turn) => turn.text.length > 0)
      .sort((left, right) => {
        const leftRank = itemRanks.get(left.itemId) ?? Number.MAX_SAFE_INTEGER
        const rightRank = itemRanks.get(right.itemId) ?? Number.MAX_SAFE_INTEGER
        return leftRank - rightRank || left.contentIndex - right.contentIndex
      })
      .map(({ contentIndex: _contentIndex, ...turn }) => turn)

    const missingTranscriptCount = Array.from(this.expectedTurnKeys).filter(
      (key) => {
        const turn = this.turns.get(key)
        return !turn || (turn.transcript ?? turn.delta).trim().length === 0
      }
    ).length

    return {
      inputFailureCount: this.inputFailureCount,
      missingTranscriptCount,
      turns,
    }
  }

  private turnKey(
    role: BellLiveTranscriptRole,
    itemId: string,
    contentIndex: number
  ): string {
    return `${role}:${itemId}:${contentIndex}`
  }

  private mutableTurn(
    role: BellLiveTranscriptRole,
    itemId: string,
    contentIndex: number,
    responseId?: string
  ): MutableTranscriptTurn {
    this.noteItem(itemId)
    const key = this.turnKey(role, itemId, contentIndex)
    const existing = this.turns.get(key)
    if (existing) {
      if (responseId) {
        existing.responseId = responseId
        existing.complete &&= !this.incompleteResponseIds.has(responseId)
        existing.interrupted ||= this.interruptedResponseIds.has(responseId)
      }
      return existing
    }
    const turn = {
      complete: false,
      contentIndex,
      delta: '',
      interrupted: Boolean(
        responseId && this.interruptedResponseIds.has(responseId)
      ),
      itemId,
      ...(responseId ? { responseId } : {}),
      role,
    }
    this.turns.set(key, turn)
    return turn
  }

  private appendDelta(
    role: BellLiveTranscriptRole,
    itemId: string,
    contentIndex: number,
    delta: string,
    responseId?: string
  ): void {
    if (!delta) return
    const turn = this.mutableTurn(role, itemId, contentIndex, responseId)
    if (!turn.complete) turn.delta += delta
  }

  private completeTurn(
    role: BellLiveTranscriptRole,
    itemId: string,
    contentIndex: number,
    transcript: string,
    responseId?: string
  ): void {
    const turn = this.mutableTurn(role, itemId, contentIndex, responseId)
    turn.complete = !(responseId && this.incompleteResponseIds.has(responseId))
    turn.transcript = transcript
  }

  private orderedItemIds(): string[] {
    const pending = Array.from(this.itemOrder.entries()).sort(
      (left, right) => left[1].firstSeen - right[1].firstSeen
    )
    const allIds = new Set(pending.map(([itemId]) => itemId))
    const emitted = new Set<string>()
    const result: string[] = []

    while (pending.length > 0) {
      let progressed = false
      for (let index = 0; index < pending.length; ) {
        const [itemId, order] = pending[index]
        const previous = order.previousItemId
        if (
          previous === undefined ||
          previous === null ||
          previous === 'root' ||
          !allIds.has(previous) ||
          emitted.has(previous)
        ) {
          result.push(itemId)
          emitted.add(itemId)
          pending.splice(index, 1)
          progressed = true
          continue
        }
        index += 1
      }

      if (!progressed) {
        // Defensive cycle fallback: preserve deterministic event order.
        result.push(...pending.map(([itemId]) => itemId))
        break
      }
    }
    return result
  }
}

export function formatBellLiveTranscript(
  turns: readonly BellLiveTranscriptTurn[]
): string {
  if (turns.length === 0) return 'No spoken transcript was available.'
  return turns
    .map((turn) => {
      const speaker = turn.role === 'caller' ? 'Caller' : 'Bell AI'
      const status = turn.interrupted
        ? ' (interrupted)'
        : turn.complete
          ? ''
          : ' (partial)'
      return `${speaker}${status}: ${turn.text}`
    })
    .join('\n\n')
}
