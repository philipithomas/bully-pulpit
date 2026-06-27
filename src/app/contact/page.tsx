import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/config'
import { feedDiscovery } from '@/lib/feeds/discovery'

const email = 'hello@contraption.co'
const phone = '+1 212 347 3190'
const tel = '+12123473190'
const addressLines = [
  'The Contraption Company LLC',
  '169 Madison Ave.',
  'Suite 2174',
  'New York, NY 10016',
  'USA',
]
const mapQuery = encodeURIComponent(
  'The Contraption Company LLC, 169 Madison Ave Suite 2174, New York, NY 10016'
)
const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`
const mapEmbedUrl = `https://www.google.com/maps?q=${mapQuery}&output=embed`
const description =
  'Contact Philip I. Thomas and The Contraption Company LLC by email, phone, or mail.'

export const metadata: Metadata = {
  title: 'Contact',
  description,
  alternates: { canonical: '/contact', types: feedDiscovery() },
  openGraph: {
    title: 'Contact',
    description,
    url: '/contact',
    type: 'website',
    siteName: siteConfig.title,
    images: [{ url: siteConfig.image }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact',
    description,
    images: [{ url: siteConfig.image }],
  },
}

export default function ContactPage() {
  return (
    <div className="bg-gray-050" data-bg="gray-050">
      <div className="container py-12 md:py-16">
        <div className="mx-auto max-w-5xl">
          <header className="max-w-3xl mb-10 md:mb-12">
            <p className="font-mono text-xs text-gray-500 mb-4">Contact</p>
            <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-gray-950 mb-4">
              Get in touch
            </h1>
            <p className="font-serif text-xl leading-snug text-gray-700">
              Email is the best way to reach me. The address below is the public
              mailing address for The Contraption Company LLC.
            </p>
          </header>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <section>
              <h2 className="font-serif text-2xl text-gray-950 mb-5">
                Contact
              </h2>
              <dl className="divide-y divide-gray-200 border-y border-gray-200">
                <div className="py-5">
                  <dt className="font-mono text-xs uppercase tracking-[0.08em] text-gray-500 mb-2">
                    Email
                  </dt>
                  <dd>
                    <a
                      href={`mailto:${email}`}
                      className="text-lg text-gray-950 underline underline-offset-2 hover:text-forest transition-colors"
                    >
                      {email}
                    </a>
                  </dd>
                </div>
                <div className="py-5">
                  <dt className="font-mono text-xs uppercase tracking-[0.08em] text-gray-500 mb-2">
                    Phone
                  </dt>
                  <dd>
                    <a
                      href={`tel:${tel}`}
                      className="text-lg text-gray-950 underline underline-offset-2 hover:text-forest transition-colors"
                    >
                      {phone}
                    </a>
                  </dd>
                </div>
                <div className="py-5">
                  <dt className="font-mono text-xs uppercase tracking-[0.08em] text-gray-500 mb-2">
                    Mail
                  </dt>
                  <dd>
                    <address className="not-italic text-lg leading-relaxed text-gray-950">
                      {addressLines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </address>
                  </dd>
                </div>
              </dl>

              <div className="mt-8">
                <h2 className="font-serif text-2xl text-gray-950 mb-5">
                  Elsewhere
                </h2>
                <ul className="divide-y divide-gray-200 border-y border-gray-200">
                  <li className="py-4">
                    <a
                      href="https://github.com/philipithomas"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-950 underline underline-offset-2 hover:text-forest transition-colors"
                    >
                      GitHub
                    </a>
                  </li>
                  <li className="py-4">
                    <a
                      href="https://linkedin.com/in/philipithomas"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-950 underline underline-offset-2 hover:text-forest transition-colors"
                    >
                      LinkedIn
                    </a>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <div className="flex items-baseline justify-between gap-4 mb-5">
                <h2 className="font-serif text-2xl text-gray-950">Map</h2>
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-gray-500 underline underline-offset-2 hover:text-gray-950 transition-colors"
                >
                  Open map
                </a>
              </div>
              <div className="aspect-[4/3] overflow-hidden border border-gray-200 bg-gray-100">
                <iframe
                  title="Map to The Contraption Company LLC mailing address"
                  src={mapEmbedUrl}
                  className="h-full w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <p className="mt-4 text-sm leading-snug text-gray-600">
                This is a mailing address, not a studio or storefront.
              </p>
            </section>
          </div>

          <section className="mt-12 border-t border-gray-200 pt-8">
            <p className="text-gray-600 leading-snug">
              For the broader site map, visit the{' '}
              <Link
                href="/sitemap"
                className="underline underline-offset-2 hover:text-gray-950 transition-colors"
              >
                sitemap
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
