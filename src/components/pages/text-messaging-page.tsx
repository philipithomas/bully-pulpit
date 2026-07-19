import { SetNewsletter } from '@/components/layout/newsletter-context'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'
import { sitePhoneDisplayNumber, sitePhoneNumber } from '@/lib/phone/config'
import { SMS_SUBSCRIBE_CONFIRMATION } from '@/lib/phone/sms-subscription-copy'

const linkClassName =
  'underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900'

export function TextMessagingConsent({
  phoneDisplayNumber,
  phoneNumber,
}: {
  phoneDisplayNumber: string
  phoneNumber: string
}) {
  return (
    <div className="space-y-12">
      <section>
        <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
          New-post notifications
        </h2>
        <div className="mt-5 space-y-5 font-serif text-gray-700 text-lg leading-relaxed">
          <p>
            Text <strong className="font-sans font-semibold">SUBSCRIBE</strong>{' '}
            to{' '}
            <a
              href={`sms:${phoneNumber}?body=SUBSCRIBE`}
              className={linkClassName}
            >
              {phoneDisplayNumber}
            </a>{' '}
            to consent to recurring automated new-post texts from The
            Contraption Company LLC through philipithomas.com.
          </p>
          <p>
            The texts announce new Contraption, Workshop, Postcard, and tidbits
            posts. A new or reactivated subscription also sends one Bell
            contact-card MMS. On iPhone, open the attachment, then tap Create
            New Contact to save Bell so later messages show Bell's name and
            photo. Message frequency varies. Message and data rates may apply.
          </p>
          <p>
            For a first-time subscription, text SUBSCRIBE, START, or JOIN. After
            sending STOP, text START, UNSTOP, or YES to reactivate.
          </p>
          <p>
            Reply STOP to unsubscribe or HELP for help. Consent is not a
            condition of purchase. Mobile opt-in data is not shared with third
            parties or affiliates for marketing or promotional purposes.
          </p>
        </div>
      </section>

      <section className="border-gray-200 border-t pt-10">
        <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
          Bell replies
        </h2>
        <p className="mt-5 font-serif text-gray-700 text-lg leading-relaxed">
          Text Bell questions about philipithomas.com to receive one direct
          automated reply. Asking a question alone does not subscribe you to
          recurring new-post notifications.
        </p>
      </section>

      <section className="border-gray-200 border-t pt-10">
        <h2 className="font-sans font-semibold text-gray-950 text-lg tracking-tight">
          Confirmation message
        </h2>
        <blockquote className="mt-4 border-gray-300 border-l-2 pl-4 font-serif text-base text-gray-700 leading-relaxed">
          {SMS_SUBSCRIBE_CONFIRMATION}
        </blockquote>
      </section>

      <p className="border-gray-200 border-t pt-10 font-serif text-gray-700 text-lg leading-relaxed">
        Read the{' '}
        <a href="/terms#text-messaging" className={linkClassName}>
          text messaging terms
        </a>{' '}
        and{' '}
        <a href="/privacy#text-messaging" className={linkClassName}>
          privacy policy
        </a>
        .
      </p>
    </div>
  )
}

export function TextMessagingPage({ page }: { page: Page }) {
  const phoneNumber = sitePhoneNumber()
  const phoneDisplayNumber = sitePhoneDisplayNumber()

  return (
    <article>
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />
      <div className="container py-16 md:py-20">
        <div className="max-w-3xl">
          <header className="mb-12">
            <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-6xl">
              {page.frontmatter.title}
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-gray-600 text-xl leading-relaxed">
              How to receive new-post notifications or ask Bell a question by
              text.
            </p>
          </header>

          {phoneNumber ? (
            <TextMessagingConsent
              phoneDisplayNumber={phoneDisplayNumber ?? phoneNumber}
              phoneNumber={phoneNumber}
            />
          ) : (
            <p className="font-serif text-gray-700 text-lg leading-relaxed">
              Text messaging is not currently available.
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
