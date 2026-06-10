import type { Metadata } from 'next'
import { PressContent } from '@/app/print/press-content'

export const metadata: Metadata = {
  title: 'Print edition',
  description: 'Every newsletter printed and mailed to you.',
  alternates: { canonical: '/print' },
}

export default function PressPage() {
  return <PressContent />
}
