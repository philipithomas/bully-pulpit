import type { Metadata } from 'next'
import { AccountClient } from '@/app/account/account-client'

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

export default function AccountPage() {
  return <AccountClient />
}
