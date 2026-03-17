import type { Metadata } from 'next'
import '@/styles/globals.css'
import { Plausible } from '@/components/analytics/plausible'
import { AuthProvider } from '@/components/auth/auth-provider'
import { SignInModal } from '@/components/auth/sign-in-modal'
import { SignInToast } from '@/components/auth/sign-in-toast'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { NewsletterProvider } from '@/components/layout/newsletter-context'
import { ImageZoom } from '@/components/ui/image-zoom'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { Toaster } from '@/components/ui/sonner'
import { siteConfig } from '@/lib/config'

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.url,
    siteName: siteConfig.title,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.philipithomas.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans font-normal antialiased text-gray-900 bg-offwhite flex flex-col min-h-screen">
        <AuthProvider>
          <NewsletterProvider>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-gray-950"
            >
              Skip to content
            </a>
            <Header />
            {/* biome-ignore lint/correctness/useUniqueElementIds: root layout renders once */}
            <main id="content" className="flex-1">
              {children}
            </main>
            <Footer />
            <SignInModal />
            <SignInToast />
            <Toaster />
            <ScrollReveal />
            <ImageZoom />
            <Plausible />
          </NewsletterProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
