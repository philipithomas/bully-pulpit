'use client'

import Script from 'next/script'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

interface SwaggerUiBundleOptions {
  url: string
  dom_id: string
  deepLinking?: boolean
  layout?: string
}

declare global {
  interface Window {
    SwaggerUIBundle?: (options: SwaggerUiBundleOptions) => unknown
  }
}

interface SwaggerUiProps {
  specUrl: string
}

export function SwaggerUi({ specUrl }: SwaggerUiProps) {
  const [loaded, setLoaded] = useState(false)
  const initialized = useRef(false)
  const reactId = useId()
  const domId = `swagger-ui-${reactId.replaceAll(':', '')}`

  const initialize = useCallback(() => {
    if (initialized.current || !window.SwaggerUIBundle) return

    initialized.current = true
    window.SwaggerUIBundle({
      url: specUrl,
      dom_id: `#${domId}`,
      deepLinking: true,
      layout: 'BaseLayout',
    })
  }, [domId, specUrl])

  useEffect(() => {
    if (loaded) initialize()
  }, [initialize, loaded])

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div
        id={domId}
        className="min-h-[640px] bg-white text-gray-950 [&_.swagger-ui]:font-sans [&_.swagger-ui_.info_.title]:font-serif [&_.swagger-ui_.info_.title]:text-gray-950 [&_.swagger-ui_.info_.title]:tracking-normal [&_.swagger-ui_.scheme-container]:shadow-none"
      />
    </>
  )
}
