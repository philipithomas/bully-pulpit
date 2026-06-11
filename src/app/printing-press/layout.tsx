import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PrintingPressShell } from '@/components/printing-press/shell'
import { requireAdmin } from '@/lib/auth/admin'

export const metadata: Metadata = {
  title: 'Printing press',
  robots: { index: false, follow: false },
}

export default async function PrintingPressLayout({
  children,
}: {
  children: ReactNode
}) {
  // Layout-level gate (each API route + page also guards independently).
  await requireAdmin()

  return <PrintingPressShell>{children}</PrintingPressShell>
}
