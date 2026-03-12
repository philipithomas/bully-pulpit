'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    plausible?: (event: string, options?: Record<string, unknown>) => void
  }
}

export function Plausible() {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fire on route change
  useEffect(() => {
    // Skip first render — the script handles the initial pageview
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    window.plausible?.('pageview')
  }, [pathname])

  return (
    <>
      <Script
        src="https://telegraph.contraption.co/js/pa-W07YPeF8qKtG6CodeoMRX.js"
        strategy="afterInteractive"
      />
      {/* biome-ignore lint/correctness/useUniqueElementIds: single instance in root layout */}
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
      </Script>
    </>
  )
}
