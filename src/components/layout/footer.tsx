import Link from 'next/link'
import { FooterNycStatus } from '@/components/layout/footer-nyc-status'

export function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-400 mt-16">
      <div className="container py-12 md:py-16">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <Link
              href="/"
              className="text-white font-semibold text-sm tracking-[0.04em] uppercase hover:text-gray-300 transition-colors"
            >
              Philip I. Thomas
            </Link>
            <p className="mt-3 text-xs text-gray-500">
              &copy; {new Date().getFullYear()}{' '}
              <Link
                href="/contact"
                className="text-inherit no-underline hover:underline"
              >
                The Contraption Company LLC
              </Link>
            </p>
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm md:justify-end">
              <Link
                href="/contraption"
                className="hover:text-white transition-colors"
              >
                Contraption
              </Link>
              <Link
                href="/workshop"
                className="hover:text-white transition-colors"
              >
                Workshop
              </Link>
              <Link
                href="/postcard"
                className="hover:text-white transition-colors"
              >
                Postcard
              </Link>
              <Link
                href="/tsundoku"
                className="hover:text-white transition-colors"
              >
                Tsundoku
              </Link>
              <Link
                href="/terms"
                className="hover:text-white transition-colors"
              >
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
            <FooterNycStatus />
          </div>
        </div>
      </div>
    </footer>
  )
}
