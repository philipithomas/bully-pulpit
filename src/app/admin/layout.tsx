import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/admin'

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  await requireAdmin()

  return (
    <div className="bg-offwhite min-h-screen">
      <div className="container max-w-4xl py-10">
        <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-4">
          <Link
            href="/admin"
            className="font-mono text-xs font-medium tracking-[0.15em] uppercase text-gray-500 hover:text-gray-900 transition-colors"
          >
            Admin · Newsletters
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Back to site
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
