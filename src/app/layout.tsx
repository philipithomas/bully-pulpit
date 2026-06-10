import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata } from 'next'
import { preload } from 'react-dom'
import '@/styles/globals.css'
import { AuthProvider } from '@/components/auth/auth-provider'
import { SignInModal } from '@/components/auth/sign-in-modal'
import { SignInToast } from '@/components/auth/sign-in-toast'
import { Footer } from '@/components/layout/footer'
import { Header } from '@/components/layout/header'
import { NewsletterProvider } from '@/components/layout/newsletter-context'
import { CoverPreload } from '@/components/posts/cover-preload'
import { ImageZoom } from '@/components/ui/image-zoom'
import { Toaster } from '@/components/ui/sonner'
import { siteConfig } from '@/lib/config'

// The above-the-fold faces (Sohne 400/600, Tiempos Text 400) — otherwise the
// browser discovers them only after downloading and parsing the CSS. Emitted
// via ReactDOM.preload so React hoists each resource exactly once (literal
// <link> tags get duplicated into both the head and the RSC Float hints).
const PRELOADED_FONTS = [
  'https://fonts.philipithomas.com/klim/soehne-buch.woff2',
  'https://fonts.philipithomas.com/klim/soehne-halbfett.woff2',
  'https://fonts.philipithomas.com/klim/tiempos-text-regular.woff2',
]

function FontPreloads() {
  for (const href of PRELOADED_FONTS) {
    preload(href, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })
  }
  return null
}

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
    // X falls back to og:image, but explicit twitter images are more robust.
    images: [{ url: siteConfig.image, width: 1200, height: 630 }],
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
    // suppressHydrationWarning: the session hint script below adds a
    // data-member attribute to <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.philipithomas.com"
          crossOrigin="anonymous"
        />
        <FontPreloads />
        {/* Pre-paint session hint. Pages are statically cached, so the HTML
            always carries the signed-out header; this script flags returning
            members on <html> before first paint so CSS in the member menu
            shows the avatar placeholder instead of the sign-in controls.
            Same pattern as a dark mode flicker fix. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(/(?:^|; ?)bp_has_session=/.test(document.cookie))document.documentElement.setAttribute('data-member','')",
          }}
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
            <CoverPreload />
            <ImageZoom />
            <Analytics />
            <SpeedInsights />
          </NewsletterProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
