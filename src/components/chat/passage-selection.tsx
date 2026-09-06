'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { analyticsPageType, trackClientEvent } from '@/lib/analytics/events'
import {
  isSelectedPassageAction,
  normalizeSelectedPassage,
  SELECTED_PASSAGE_ACTIONS,
  type SelectedPassageAction,
  type SelectedPassageRequest,
} from '@/lib/chat/selected-passage'
import { cn } from '@/lib/utils'
import { useChatSidebar } from '@/stores/chat-store'

const SELECTABLE_SELECTOR = '[data-bell-selectable]'
const BLOCKED_SELECTION_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable]:not([contenteditable="false"])',
  'code',
  'pre',
  'kbd',
  'samp',
].join(',')

export const PASSAGE_REDUCED_MOTION_CLASS =
  'motion-reduce:transition-none motion-reduce:animate-none'

export type PassageSelectionTrigger =
  | 'selectionchange'
  | 'keyboard'
  | 'pointer'
  | 'touch'

export type PassageSelectionSnapshot = Omit<SelectedPassageRequest, 'action'>

interface PassageSelectionListeners {
  refresh: (trigger: PassageSelectionTrigger) => void
  dismiss: () => void
}

/**
 * Installs every input path that can create or dismiss a text selection. The
 * small exported boundary keeps keyboard, pointer, touch, and Escape behavior
 * testable without a browser DOM implementation.
 */
export function installPassageSelectionListeners(
  target: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  listeners: PassageSelectionListeners
): () => void {
  const handleSelectionChange = () => listeners.refresh('selectionchange')
  const handlePointerUp = (event: Event) => {
    const pointerType = (event as PointerEvent).pointerType
    listeners.refresh(pointerType === 'touch' ? 'touch' : 'pointer')
  }
  const handleKeyUp = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Escape') {
      listeners.refresh('keyboard')
    }
  }
  const handleKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key === 'Escape') listeners.dismiss()
  }

  target.addEventListener('selectionchange', handleSelectionChange)
  target.addEventListener('pointerup', handlePointerUp)
  target.addEventListener('keyup', handleKeyUp)
  target.addEventListener('keydown', handleKeyDown)
  return () => {
    target.removeEventListener('selectionchange', handleSelectionChange)
    target.removeEventListener('pointerup', handlePointerUp)
    target.removeEventListener('keyup', handleKeyUp)
    target.removeEventListener('keydown', handleKeyDown)
  }
}

function elementForNode(node: Node | null): Element | null {
  if (!node) return null
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
}

function nearestHeading(
  container: HTMLElement,
  startElement: Element
): HTMLElement | null {
  let nearest: HTMLElement | null = null
  for (const heading of container.querySelectorAll<HTMLElement>(
    'h2[id], h3[id]'
  )) {
    if (heading === startElement || heading.contains(startElement)) {
      return heading
    }
    if (
      heading.compareDocumentPosition(startElement) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      nearest = heading
      continue
    }
    break
  }
  return nearest
}

export function readPassageSelection(
  selection: Selection | null,
  path: string
): PassageSelectionSnapshot | null {
  if (selection?.rangeCount !== 1 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  const startElement = elementForNode(range.startContainer)
  const endElement = elementForNode(range.endContainer)
  if (!startElement || !endElement) return null

  const container = startElement.closest<HTMLElement>(SELECTABLE_SELECTOR)
  if (!container || endElement.closest(SELECTABLE_SELECTOR) !== container) {
    return null
  }
  const text = normalizeSelectedPassage(selection.toString())
  if (!text) return null
  if (
    startElement.closest(BLOCKED_SELECTION_SELECTOR) ||
    endElement.closest(BLOCKED_SELECTION_SELECTOR) ||
    range.cloneContents().querySelector(BLOCKED_SELECTION_SELECTOR)
  ) {
    return null
  }

  const heading = nearestHeading(container, startElement)
  return {
    text,
    path,
    ...(heading?.id ? { headingId: heading.id } : {}),
  }
}

export function PassageSelection() {
  const pathname = usePathname()
  const openSidebarWithPassage = useChatSidebar(
    (state) => state.openSidebarWithPassage
  )
  const [selection, setSelection] = useState<PassageSelectionSnapshot | null>(
    null
  )
  const [expanded, setExpanded] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const firstActionRef = useRef<HTMLButtonElement>(null)

  const dismiss = useCallback(() => {
    setSelection(null)
    setExpanded(false)
  }, [])

  const refresh = useCallback(() => {
    // Moving focus into the action group can collapse a visual selection. Do
    // not dismiss the group while the visitor is choosing an explicit action.
    if (popoverRef.current?.contains(document.activeElement)) return
    setSelection(readPassageSelection(window.getSelection(), pathname))
    setExpanded(false)
  }, [pathname])

  useEffect(
    () => installPassageSelectionListeners(document, { refresh, dismiss }),
    [dismiss, refresh]
  )

  useEffect(() => {
    if (pathname) dismiss()
  }, [dismiss, pathname])

  useEffect(() => {
    if (expanded) firstActionRef.current?.focus()
  }, [expanded])

  const handleAction = useCallback(
    (action: SelectedPassageAction) => {
      if (!selection) return
      const request: SelectedPassageRequest = { ...selection, action }
      openSidebarWithPassage(request)
      trackClientEvent('Bell passage action selected', {
        action,
        page_type: analyticsPageType(pathname),
      })
      window.getSelection()?.removeAllRanges()
      dismiss()
    },
    [dismiss, openSidebarWithPassage, pathname, selection]
  )
  const handleActionClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const action = event.currentTarget.dataset.passageAction
      if (isSelectedPassageAction(action)) handleAction(action)
    },
    [handleAction]
  )
  const expandActions = useCallback(() => setExpanded(true), [])
  const preserveSelection = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => event.preventDefault(),
    []
  )

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {selection ? 'Ask Bell actions are available for this passage.' : ''}
      </div>
      {selection ? (
        <div
          ref={popoverRef}
          className={cn(
            'fixed bottom-5 left-1/2 z-[45] -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-1.5 font-sans shadow-lg sm:bottom-7',
            PASSAGE_REDUCED_MOTION_CLASS
          )}
          onPointerDown={preserveSelection}
        >
          {expanded ? (
            <div
              role="group"
              aria-label="Ask Bell about selected passage"
              className="flex max-w-[calc(100vw-2rem)] flex-col gap-1 sm:flex-row"
            >
              {SELECTED_PASSAGE_ACTIONS.map((action, index) => (
                <button
                  key={action.id}
                  ref={index === 0 ? firstActionRef : undefined}
                  type="button"
                  data-passage-action={action.id}
                  onClick={handleActionClick}
                  className={cn(
                    'whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-700 transition-colors hover:bg-gray-050 hover:text-gray-950',
                    PASSAGE_REDUCED_MOTION_CLASS
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              aria-expanded="false"
              aria-haspopup="true"
              onClick={expandActions}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-800 transition-colors hover:bg-gray-050',
                PASSAGE_REDUCED_MOTION_CLASS
              )}
            >
              <Image src="/images/bell.svg" alt="" width={16} height={16} />
              Ask Bell
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}
