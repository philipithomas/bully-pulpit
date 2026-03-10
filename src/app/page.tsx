import Image from 'next/image'
import Link from 'next/link'
import { EmailSignupForm } from '@/components/auth/email-signup-form'
import { JsonLd } from '@/components/seo/json-ld'
import { siteConfig } from '@/lib/config'

export default function HomePage() {
  const newsletters = Object.values(siteConfig.newsletters)

  return (
    <div className="container py-16 md:py-24 lg:py-36">
      <JsonLd type="website" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Left: Portrait */}
        <div>
          <Image
            src="/images/portrait.jpg"
            alt="Philip I. Thomas"
            width={600}
            height={750}
            className="w-full max-w-md rounded-sm"
            priority
          />
        </div>

        {/* Right: Bio + Newsletter signup */}
        <div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-950 mb-6">
            Philip I. Thomas
          </h1>
          <div className="font-serif text-lg text-gray-600 leading-relaxed mb-10 max-w-prose">
            <p className="mb-4">
              I build companies and write about it. Currently based in New York.
            </p>
          </div>

          <div className="mb-10">
            <EmailSignupForm />
          </div>

          <div className="space-y-6">
            <p className="text-xs font-semibold tracking-[0.15em] uppercase text-gray-500">
              Three newsletters
            </p>
            {newsletters.map((nl) => (
              <Link key={nl.slug} href={`/${nl.slug}`} className="block group">
                <h3 className="text-lg font-semibold text-gray-950 group-hover:text-forest transition-colors">
                  {nl.name}
                </h3>
                <p className="font-serif text-sm text-gray-600">{nl.tagline}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
