import { SetNewsletter } from '@/components/layout/newsletter-context'
import { JsonLd } from '@/components/seo/json-ld'
import type { Page } from '@/lib/content/types'

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
  {
    label: 'Telephone',
    value: (
      <a
        className="underline decoration-gray-300 transition-colors duration-300 hover:text-gray-900 hover:decoration-gray-900"
        href="tel:+12123473190"
      >
        +1 212 347 3190
      </a>
    ),
  },
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
] as const

export function ContactPage({ page }: { page: Page }) {
  return (
    <article>
      <SetNewsletter newsletter={null} />
      <JsonLd type="webpage" page={page} />
      <div className="container py-12 md:py-16">
        <header className="mx-auto mb-10 flex max-w-3xl flex-col items-center text-center">
          <h1 className="font-sans font-semibold text-3xl text-gray-950 leading-tight tracking-tight text-pretty sm:text-4xl md:text-5xl lg:text-6xl">
            {page.frontmatter.title}
          </h1>
        </header>

        <dl className="mx-auto max-w-2xl divide-y divide-gray-200 border-y border-gray-200">
          {contactItems.map((item) => (
            <div
              className="grid gap-2 py-6 sm:grid-cols-[8rem_1fr]"
              key={item.label}
            >
              <dt className="font-mono font-semibold text-gray-500 text-xs uppercase tracking-[0.12em] sm:pt-1">
                {item.label}
              </dt>
              <dd className="font-sans text-gray-900 text-lg leading-relaxed">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  )
}
