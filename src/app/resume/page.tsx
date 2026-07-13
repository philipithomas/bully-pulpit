import type { Metadata } from 'next'
import { ResumePage } from '@/components/pages/resume-page'
import { siteConfig } from '@/lib/config'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { publicAppPage } from '@/lib/public-pages'

const resumePage = publicAppPage('/resume')

export const metadata: Metadata = {
  title: resumePage.title,
  description: resumePage.description,
  keywords: [
    'Philip I. Thomas',
    'Philip Thomas resume',
    'software engineer',
    'product manager',
    'founder',
  ],
  alternates: { canonical: resumePage.path, types: feedDiscovery() },
  openGraph: {
    type: 'profile',
    title: `Philip I. Thomas | ${resumePage.title}`,
    description: resumePage.description,
    url: resumePage.path,
    siteName: siteConfig.title,
    images: [
      {
        url: siteConfig.image,
        width: 1200,
        height: 630,
        alt: siteConfig.title,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Philip I. Thomas | ${resumePage.title}`,
    description: resumePage.description,
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
  },
}

export default function Page() {
  return <ResumePage />
}
