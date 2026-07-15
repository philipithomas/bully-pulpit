import type { ReactNode } from 'react'
import { PrintingPressNav } from '@/components/printing-press/nav'
import { PressMark } from '@/components/printing-press/press-mark'

/**
 * A private workspace inside the public site's shared container. The inner
 * width stays intentionally narrower than the site while sharing its left
 * edge, so dense admin screens get room without feeling like another app.
 */
export function PrintingPressShell({ children }: { children: ReactNode }) {
  return (
    <div className="container pt-8 pb-16 sm:pt-10 md:pb-24">
      <div className="w-full max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-4 md:mb-14">
          <PressMark />
          <PrintingPressNav />
        </header>
        {/* min-height keeps the footer from jumping while a page loads */}
        <div className="min-h-[60vh]">{children}</div>
      </div>
    </div>
  )
}
