'use client'

import { useEffect } from 'react'
import { useChatSidebar } from '@/stores/chat-store'

/** Registers native browser-side tools when the experimental API is present. */
export function SiteWebMcp() {
  useEffect(() => {
    const modelContext = document.modelContext
    if (!modelContext) return

    const lifecycle = new AbortController()
    let abortRegistration: (() => void) | undefined
    let registrationSignal: AbortSignal | undefined

    void import('@/lib/webmcp/site-tools')
      .then(async ({ registerSiteWebMcpTools }) => {
        if (lifecycle.signal.aborted) return

        const registration = registerSiteWebMcpTools(modelContext, {
          fetch: (input, init) => fetch(input, init),
          origin: window.location.origin,
          startBellQuestion: (question) =>
            useChatSidebar.getState().openSidebar(question),
        })
        abortRegistration = registration.abort
        registrationSignal = registration.signal
        await registration.ready
      })
      .catch((error) => {
        if (lifecycle.signal.aborted || registrationSignal?.aborted) return
        console.warn(
          '[webmcp] Tool registration failed:',
          error instanceof Error ? error.name : 'UnknownError'
        )
      })

    return () => {
      lifecycle.abort()
      abortRegistration?.()
    }
  }, [])

  return null
}
