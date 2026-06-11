import Link from 'next/link'
import type { ReactNode } from 'react'
import { PrintingPressNav } from '@/components/printing-press/nav'

/**
 * One centered column: serif masthead, a row of plain text nav links, then
 * the page. The public site header already renders above and links home, so
 * the shell carries no chrome of its own. Hierarchy comes from type and
 * space, and everything shares the column's left edge.
 */
export function PrintingPressShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-10 pb-16 md:pt-14 md:pb-24">
      <header className="mb-10 md:mb-14">
        <Link
          href="/printing-press"
          className="font-serif text-xl text-gray-950"
        >
          Printing press
        </Link>
        <PrintingPressNav />
      </header>
      {/* min-height keeps the footer from jumping while a page loads */}
      <div className="min-h-[60vh]">{children}</div>
    </div>
  )
}
