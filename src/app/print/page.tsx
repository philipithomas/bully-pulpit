import type { Metadata } from 'next'
import { PressContent } from '@/app/print/press-content'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Print edition',
  description:
    'Every newsletter printed and mailed to you. The experiment has concluded and the print edition is no longer available to order.',
  alternates: { canonical: '/print', types: feedDiscovery() },
}

export default function PressPage() {
  return <PressContent />
}
