import type { Metadata } from 'next'
import { PressContent } from '@/app/press/press-content'

export const metadata: Metadata = {
  title: 'Print Edition',
  description: 'Every newsletter printed and mailed to you.',
}

export default function PressPage() {
  return <PressContent />
}
