'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { SidebarNav } from '@/components/printing-press/sidebar-nav'
import { Sheet, SheetContent } from '@/components/ui/sheet'

function SidebarBody({
  adminEmail,
  onNavigate,
}: {
  adminEmail: string
  onNavigate?: () => void
}) {
  return (
    <div className="flex h-full flex-col px-3 py-6">
      <div className="px-3">
        <Link
          href="/printing-press"
          onClick={onNavigate}
          className="font-serif text-lg leading-none text-gray-950"
        >
          Printing Press
        </Link>
      </div>

      <div className="mt-7">
        <SidebarNav onNavigate={onNavigate} />
      </div>

      <div className="mt-auto border-t border-gray-100 px-3 pt-5">
        <p className="truncate text-xs text-gray-500" title={adminEmail}>
          {adminEmail}
        </p>
        <Link
          href="/"
          onClick={onNavigate}
          className="mt-1.5 inline-block text-xs text-gray-400 transition-colors hover:text-gray-900"
        >
          ← Back to site
        </Link>
      </div>
    </div>
  )
}

export function PrintingPressShell({
  adminEmail,
  children,
}: {
  adminEmail: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-offwhite">
      <div className="mx-auto flex w-full max-w-6xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-[calc(100vh-1px)] w-60 shrink-0 self-start border-r border-gray-200 md:block">
          <SidebarBody adminEmail={adminEmail} />
        </aside>

        {/* Content column */}
        <div className="min-w-0 flex-1">
          {/* Mobile bar */}
          <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 md:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="-m-2 p-2 text-gray-500 hover:text-gray-900"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-serif text-base text-gray-950">
              Printing Press
            </span>
          </div>

          <div className="min-h-[60vh] px-5 py-8 md:px-10 md:py-12">
            {children}
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0">
          <SidebarBody
            adminEmail={adminEmail}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
