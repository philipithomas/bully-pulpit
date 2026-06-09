import type { ReactNode } from 'react'
import { PrintingPressShell } from '@/components/printing-press/shell'
import { requireAdmin } from '@/lib/auth/admin'

export default async function PrintingPressLayout({
  children,
}: {
  children: ReactNode
}) {
  // Layout-level gate (each API route + page also guards independently).
  const session = await requireAdmin()

  return (
    <PrintingPressShell adminEmail={session.email}>
      {children}
    </PrintingPressShell>
  )
}
