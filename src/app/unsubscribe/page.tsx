import type { Metadata } from 'next'
import { UnsubscribeClient } from '@/app/unsubscribe/unsubscribe-client'

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
}

export default function UnsubscribePage() {
  return <UnsubscribeClient />
}
