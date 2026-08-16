'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

function manualInstallMessage(): string | null {
  const appleMobileUserAgent = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const iPadDesktopUserAgent =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  if (appleMobileUserAgent || iPadDesktopUserAgent) {
    return 'To install this site, tap Share, then Add to Home Screen.'
  }

  if (/Android/i.test(navigator.userAgent)) {
    return 'To install this site, open your browser menu, then choose Install app or Add to Home screen.'
  }

  const isMacSafari =
    /Mac/i.test(navigator.platform) &&
    /Safari/i.test(navigator.userAgent) &&
    !/(?:Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS)/i.test(
      navigator.userAgent
    )
  if (isMacSafari) {
    return 'In Safari, choose File, then Add to Dock.'
  }

  return null
}

function isRunningStandalone(): boolean {
  const appleNavigator = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    appleNavigator.standalone === true
  )
}

/** A quiet, capability-driven install action for the existing footer nav. */
export function PwaInstallLink() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [installInstructions, setInstallInstructions] = useState<string | null>(
    null
  )

  useEffect(() => {
    if (isRunningStandalone()) return

    setInstallInstructions(manualInstallMessage())

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(() => event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstallInstructions(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!installPrompt && installInstructions) {
      toast(installInstructions, {
        duration: 8000,
      })
      return
    }
    if (!installPrompt) return

    const prompt = installPrompt
    setInstallPrompt(null)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') {
        toast.success('Installed as an app.')
      }
    } catch {
      toast.error('The installation prompt could not be opened.')
    }
  }, [installInstructions, installPrompt])

  if (!installPrompt && !installInstructions) return null

  return (
    <button
      type="button"
      onClick={handleInstall}
      data-inverse-focus-ring
      className="cursor-pointer hover:text-white transition-colors"
    >
      Install app
    </button>
  )
}
