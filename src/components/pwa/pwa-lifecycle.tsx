'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  PWA_CACHE_PREFIX,
  PWA_MESSAGE,
  SERVICE_WORKER_URL,
} from '@/lib/pwa/config'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const WARM_DOCUMENT_TIMEOUT_MS = 10 * 1000

let lastUpdateCheck = 0
const warmedDocumentPaths = new Set<string>()
const warmingDocumentPaths = new Set<string>()

function isPrimaryUnmodifiedClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}

/**
 * Owns the browser-only PWA lifecycle once for the whole application.
 * Registration is production-only so a local Turbopack session can never be
 * trapped behind an old worker.
 */
export function PwaLifecycle() {
  const pathname = usePathname()

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      const removeProductionWorker = async () => {
        const registration = await navigator.serviceWorker.getRegistration('/')
        await registration?.unregister()

        if ('caches' in window) {
          const cacheNames = await window.caches.keys()
          await Promise.all(
            cacheNames
              .filter((name) => name.startsWith(`${PWA_CACHE_PREFIX}-`))
              .map((name) => window.caches.delete(name))
          )
        }
      }
      void removeProductionWorker().catch((error) => {
        console.warn('[pwa] Development service worker cleanup failed', error)
      })
      return
    }

    let disposed = false
    let registration: ServiceWorkerRegistration | null = null
    let registrationInFlight = false
    let controlledByWorker = Boolean(navigator.serviceWorker.controller)
    const offeredWorkers = new WeakSet<ServiceWorker>()
    const watchedWorkers = new WeakSet<ServiceWorker>()

    const offerUpdate = (worker: ServiceWorker) => {
      // A missing controller means this is the first install, not an update.
      if (!navigator.serviceWorker.controller || offeredWorkers.has(worker)) {
        return
      }
      offeredWorkers.add(worker)

      toast('A site update is ready.', {
        id: 'pwa-update',
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: 'Reload',
          onClick: () => {
            worker.postMessage({ type: PWA_MESSAGE.skipWaiting })
          },
        },
      })
    }

    const handleControllerChange = () => {
      // Every tab already controlled by the previous worker reloads. This
      // covers the accepting tab and sibling tabs when one visitor activates
      // a waiting update, while avoiding a reload on the first installation.
      if (!controlledByWorker) {
        controlledByWorker = true
        return
      }
      window.location.reload()
    }

    const handleOffline = () => {
      toast.warning("You're offline. Saved pages remain available.", {
        id: 'pwa-connectivity',
        duration: 6000,
      })
    }

    const handleOnline = () => {
      toast.success('Back online.', {
        id: 'pwa-connectivity',
        duration: 3000,
      })
      if (!registration) void register()
    }

    // Next's router normally fetches an RSC payload for internal links. When
    // the browser is explicitly offline, use a document navigation instead so
    // the worker can serve a previously visited page or the offline fallback.
    const handleOfflineNavigation = (event: MouseEvent) => {
      if (
        navigator.onLine ||
        event.defaultPrevented ||
        !isPrimaryUnmodifiedClick(event)
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (
        !anchor ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      ) {
        return
      }

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return
      }

      event.preventDefault()
      window.location.assign(destination.href)
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState !== 'visible' ||
        !registration ||
        Date.now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS
      ) {
        return
      }
      lastUpdateCheck = Date.now()
      void registration.update().catch(() => undefined)
    }

    const watchInstallingWorker = (worker: ServiceWorker) => {
      if (watchedWorkers.has(worker)) return
      watchedWorkers.add(worker)

      if (worker.state === 'installed') {
        offerUpdate(worker)
        return
      }

      const handleStateChange = () => {
        if (worker.state !== 'installed') return
        worker.removeEventListener('statechange', handleStateChange)
        if (!disposed) offerUpdate(worker)
      }
      worker.addEventListener('statechange', handleStateChange)
    }

    const handleUpdateFound = () => {
      if (registration?.installing) {
        watchInstallingWorker(registration.installing)
      }
    }

    const register = async () => {
      if (registration || registrationInFlight) return
      registrationInFlight = true
      try {
        const nextRegistration = await navigator.serviceWorker.register(
          SERVICE_WORKER_URL,
          {
            scope: '/',
            updateViaCache: 'none',
          }
        )
        if (disposed) return
        registration = nextRegistration

        if (nextRegistration.waiting) offerUpdate(nextRegistration.waiting)
        if (nextRegistration.installing) {
          watchInstallingWorker(nextRegistration.installing)
        }
        nextRegistration.addEventListener('updatefound', handleUpdateFound)

        lastUpdateCheck = Date.now()
        void nextRegistration
          .update()
          .then(() => {
            if (disposed) return
            if (nextRegistration.waiting) {
              offerUpdate(nextRegistration.waiting)
            } else if (nextRegistration.installing) {
              watchInstallingWorker(nextRegistration.installing)
            }
          })
          .catch(() => undefined)

        const readyRegistration = await navigator.serviceWorker.ready
        if (!disposed) {
          readyRegistration.active?.postMessage({
            type: PWA_MESSAGE.refreshOfflineCache,
          })
        }
      } catch (error) {
        console.warn('[pwa] Service worker registration failed', error)
      } finally {
        registrationInFlight = false
      }
    }

    const startRegistration = () => void register()

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange
    )
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    document.addEventListener('click', handleOfflineNavigation, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (document.readyState === 'complete') {
      startRegistration()
    } else {
      window.addEventListener('load', startRegistration, { once: true })
    }

    return () => {
      disposed = true
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      )
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('load', startRegistration)
      document.removeEventListener('click', handleOfflineNavigation, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      registration?.removeEventListener('updatefound', handleUpdateFound)
    }
  }, [])

  // A normal Next Link transition fetches an RSC payload rather than an HTML
  // document, so the worker cannot learn that the destination was visited.
  // Warm one safe document copy during idle time so a later offline reload of
  // that route works without caching router payloads.
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator) ||
      !pathname ||
      warmedDocumentPaths.has(pathname) ||
      warmingDocumentPaths.has(pathname) ||
      window.location.search
    ) {
      return
    }

    let cancelled = false
    const warmDocument = () => {
      void navigator.serviceWorker.ready
        .then((registration) => {
          if (!cancelled && registration.active) {
            const worker = registration.active
            if (typeof MessageChannel === 'undefined') {
              worker.postMessage({
                type: PWA_MESSAGE.cachePublicPage,
                path: pathname,
              })
              return
            }

            warmingDocumentPaths.add(pathname)
            const channel = new MessageChannel()
            let settled = false
            let timeoutId: number | undefined
            const settle = (cached: boolean) => {
              if (settled) return
              settled = true
              if (timeoutId !== undefined) window.clearTimeout(timeoutId)
              channel.port1.close()
              warmingDocumentPaths.delete(pathname)
              if (cached) warmedDocumentPaths.add(pathname)
            }

            channel.port1.onmessage = (event) => {
              const result = event.data as {
                cached?: boolean
                path?: string
                type?: string
              }
              settle(
                result.type === PWA_MESSAGE.cachePublicPageResult &&
                  result.path === pathname &&
                  result.cached === true
              )
            }
            timeoutId = window.setTimeout(
              () => settle(false),
              WARM_DOCUMENT_TIMEOUT_MS
            )

            try {
              worker.postMessage(
                {
                  type: PWA_MESSAGE.cachePublicPage,
                  path: pathname,
                },
                [channel.port2]
              )
            } catch {
              settle(false)
            }
          }
        })
        .catch(() => undefined)
    }

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(warmDocument, { timeout: 5000 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(id)
      }
    }

    const id = window.setTimeout(warmDocument, 2000)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [pathname])

  return null
}
