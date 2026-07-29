import Link from 'next/link'
import { FooterNycStatus } from '@/components/layout/footer-nyc-status'
import { siteIdentity } from '@/lib/site-identity'

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 mt-16">
      <div className="container py-12 md:py-16">
        <div className="grid gap-y-3 md:grid-cols-[minmax(10rem,1fr)_minmax(0,auto)] md:items-baseline md:gap-x-8">
          <Link
            href="/"
            className="text-white font-semibold text-sm tracking-[0.04em] uppercase hover:text-gray-300 transition-colors"
          >
            {siteIdentity.name}
          </Link>
          <p className="order-2 text-xs text-gray-500 md:order-none md:col-start-1 md:row-start-2">
            &copy; {new Date().getFullYear()}{' '}
            <Link
              href="/contact"
              className="text-inherit no-underline hover:underline"
            >
              The Contraption Company LLC
            </Link>
            . All rights reserved.
          </p>
          <nav className="order-3 mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm md:order-none md:col-start-2 md:row-start-1 md:mt-0 md:justify-end">
            <Link
              href="/contact"
              className="hover:text-white transition-colors"
            >
              Contact
            </Link>
            <a
              href="https://github.com/philipithomas"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://linkedin.com/in/philipithomas"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              LinkedIn
            </a>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="/colophon"
              className="hover:text-white transition-colors"
            >
              Colophon
            </Link>
            <Link
              href="/sitemap"
              className="hover:text-white transition-colors"
            >
              Sitemap
            </Link>
          </nav>
          <div className="order-4 md:order-none md:col-start-2 md:row-start-2 md:justify-self-end">
            <FooterNycStatus />
          </div>
        </div>
      </div>
    </footer>
  )
}
