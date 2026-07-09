import { SetNewsletter } from '@/components/layout/newsletter-context'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'

const mapSrc =
  'https://maps.google.com/maps?q=40.747157,-73.984165&z=12&output=embed'

export function ContactPage({ page }: { page: Page }) {
  const phoneNumber = sitePhoneNumber()
  const phoneDisplayNumber = sitePhoneDisplayNumber()
  const contactItems = [
    {
      label: 'Email',
      value: (
        <a
          className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
          href="mailto:mail@philipithomas.com"
        >
          mail@philipithomas.com
        </a>
      ),
    },
    ...(phoneNumber
      ? [
          {
            label: 'Telephone',
            value: (
              <a
                className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
                href={`tel:${phoneNumber}`}
              >
                {phoneDisplayNumber ?? phoneNumber}
              </a>
            ),
          },
        ]
      : []),
    {
      label: 'Address',
      value: (
        <address className="not-italic">
          The Contraption Company LLC
          <br />
          169 Madison Ave.
          <br />
          Suite 2174
          <br />
          New York, NY 10016
          <br />
          USA
        </address>
      ),
    },
  ]

  return (
    <article>
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />
      <div className="container pt-16 pb-20">
        <div className="max-w-4xl">
          <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-6xl">
            {page.frontmatter.title}
          </h1>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-12 md:grid-cols-2">
          <div>
            <dl className="space-y-8">
              {contactItems.map((item) => (
                <div key={item.label}>
                  <dt className="mb-1 font-sans font-semibold text-gray-900 text-sm">
                    {item.label}
                  </dt>
                  <dd className="font-serif text-gray-700 text-lg leading-relaxed">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="min-h-[360px] w-full overflow-hidden bg-gray-100">
            <iframe
              allowFullScreen
              className="h-full min-h-[360px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={mapSrc}
              title="Map showing the Contraption Company address"
            />
          </div>
        </div>
      </div>
    </article>
  )
}
