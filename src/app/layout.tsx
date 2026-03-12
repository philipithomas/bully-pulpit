import type { Metadata } from 'next'
import '@/styles/globals.css'
import { Plausible } from '@/components/analytics/plausible'
import { AuthProvider } from '@/components/auth/auth-provider'
import { GoogleOneTap } from '@/components/auth/google-one-tap'
import { SignInModal } from '@/components/auth/sign-in-modal'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { ImageZoom } from '@/components/ui/image-zoom'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
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
    images: [{ url: '/images/portrait.jpg', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
  },
  icons: {
    icon: '/favicon.ico',
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
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.contraption.co"
          crossOrigin="anonymous"
        />
      </head>
      <body className="font-sans font-normal antialiased text-gray-900 bg-offwhite">
        <AuthProvider>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-white focus:text-gray-950"
          >
            Skip to content
          </a>
          <Header />
          {/* biome-ignore lint/correctness/useUniqueElementIds: root layout renders once */}
          <main id="content">{children}</main>
          <Footer />
          <SignInModal />
          <GoogleOneTap />
          <ScrollReveal />
          <ImageZoom />
          <Plausible />
        </AuthProvider>
      </body>
    </html>
  )
}
