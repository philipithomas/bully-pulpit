import type { Metadata } from 'next'
import { PressContent } from '@/app/print/press-content'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { publicAppPage } from '@/lib/public-pages'

const printPage = publicAppPage('/print')

export const metadata: Metadata = {
  title: printPage.title,
  description: printPage.description,
  alternates: { canonical: '/print', types: feedDiscovery() },
}

export default function PressPage() {
  return <PressContent />
}
