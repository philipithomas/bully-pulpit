import { SetNewsletter } from '@/components/layout/newsletter-context'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'
import { SMS_SUBSCRIBE_CONFIRMATION } from '@/lib/phone/sms-subscription-copy'

const mapSrc =
  'https://maps.google.com/maps?q=40.747157,-73.984165&z=12&output=embed'

export function SmsConsentSection({
  phoneDisplayNumber,
  phoneNumber,
}: {
  phoneDisplayNumber: string
  phoneNumber: string
}) {
  return (
    <>
      {/* biome-ignore lint/correctness/useUniqueElementIds: canonical contact-page anchor renders once */}
      <section
        id="text-messaging"
        className="mt-16 max-w-2xl border-gray-200 border-t pt-12"
      >
        <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
          Subscribe by text
        </h2>
        <div className="mt-6 space-y-5 font-serif text-gray-700 text-lg leading-relaxed">
          <p>
            Text <strong className="font-sans font-semibold">SUBSCRIBE</strong>{' '}
            to{' '}
            <a
              href={`sms:${phoneNumber}?body=SUBSCRIBE`}
              className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
            >
              {phoneDisplayNumber}
            </a>{' '}
            to consent to recurring automated new-post texts from The
            Contraption Company LLC through philipithomas.com.
          </p>
          <p>
            The texts announce new Contraption, Workshop, and Postcard posts. A
            new or reactivated subscription also sends one Bell contact-card
            MMS. Message frequency varies. Message and data rates may apply.
          </p>
          <p>
            For a first-time subscription, text SUBSCRIBE, START, or JOIN. After
            sending STOP, text START, UNSTOP, or YES to reactivate. SUBSCRIBE
            and JOIN do not reactivate a stopped subscription.
          </p>
          <p>
            Reply STOP to unsubscribe or HELP for help. Consent is not a
            condition of purchase. Mobile opt-in data is not shared with third
            parties or affiliates for marketing or promotional purposes.
          </p>
          <p>
            Texting a question instead requests one direct automated reply from
            Bell. It does not subscribe you to recurring new-post notifications.
          </p>
          <p>
            Read the{' '}
            <a
              href="/terms#text-messaging"
              className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
            >
              text messaging terms
            </a>{' '}
            and{' '}
            <a
              href="/privacy#text-messaging"
              className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
            >
              privacy policy
            </a>
            .
          </p>
          <div>
            <p className="font-sans font-semibold text-gray-900 text-sm">
              Confirmation message
            </p>
            <blockquote className="mt-2 border-gray-300 border-l-2 pl-4 text-base">
              {SMS_SUBSCRIBE_CONFIRMATION}
            </blockquote>
          </div>
        </div>
      </section>
    </>
  )
}

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

        {phoneNumber ? (
          <SmsConsentSection
            phoneDisplayNumber={phoneDisplayNumber ?? phoneNumber}
            phoneNumber={phoneNumber}
          />
        ) : null}
      </div>
    </article>
  )
}
