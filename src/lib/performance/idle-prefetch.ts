type ConnectionInfo = {
  effectiveType?: string
  saveData?: boolean
}

type NavigatorWithConnection = {
  connection?: ConnectionInfo | null
  mozConnection?: ConnectionInfo | null
  webkitConnection?: ConnectionInfo | null
}

type IdlePrefetchTarget = {
  navigator?: NavigatorWithConnection
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number }
  ) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout: (callback: () => void, delay: number) => number
  clearTimeout: (handle: number) => void
}

type IdlePrefetchOptions = {
  fallbackDelay?: number
  target?: IdlePrefetchTarget | null
  timeout?: number
}

const CONSTRAINED_CONNECTIONS = new Set(['slow-2g', '2g', '3g'])
const noop = () => undefined

function detectedConnection(
  navigatorLike?: NavigatorWithConnection
): ConnectionInfo | undefined {
  return (
    navigatorLike?.connection ??
    navigatorLike?.mozConnection ??
    navigatorLike?.webkitConnection ??
    undefined
  )
}

/**
 * Whether a connection should spend bandwidth on work the visitor has not
 * requested yet. Unknown connections stay eligible so Safari and Firefox keep
 * the existing perceived-speed improvement.
 */
export function allowsIdlePrefetch(
  connection?: ConnectionInfo | null
): boolean {
  if (!connection) return true
  if (connection.saveData) return false

  const effectiveType = connection.effectiveType?.toLowerCase()
  return !effectiveType || !CONSTRAINED_CONNECTIONS.has(effectiveType)
}

/**
 * Schedule speculative UI warming after first paint. The connection is
 * checked both before scheduling and when the callback runs in case it changes
 * while the page is open. User-initiated hover/focus handlers do not use this
 * helper and therefore remain immediate on every connection.
 */
export function scheduleIdlePrefetch(
  prefetch: () => void,
  options: IdlePrefetchOptions = {}
): () => void {
  const target =
    options.target ??
    (typeof window === 'undefined'
      ? null
      : (window as unknown as IdlePrefetchTarget))

  if (!target || !allowsIdlePrefetch(detectedConnection(target.navigator))) {
    return noop
  }

  const guardedPrefetch = () => {
    if (allowsIdlePrefetch(detectedConnection(target.navigator))) prefetch()
  }

  if (target.requestIdleCallback) {
    const handle = target.requestIdleCallback(guardedPrefetch, {
      timeout: options.timeout ?? 5000,
    })
    return () => target.cancelIdleCallback?.(handle)
  }

  const handle = target.setTimeout(
    guardedPrefetch,
    options.fallbackDelay ?? 2000
  )
  return () => target.clearTimeout(handle)
}
