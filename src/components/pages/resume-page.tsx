import { ChevronDown, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { SetNewsletter } from '@/components/layout/newsletter-context'
import { serializeJsonLd } from '@/components/seo/json-ld'
import { Badge } from '@/components/ui/badge'
import { siteConfig } from '@/lib/config'
import {
  type ResumeEntry,
  resumeEducation,
  resumeExperience,
  resumeSecurityCredit,
} from '@/lib/resume'

const externalLinkClassName =
  'underline decoration-gray-300 underline-offset-2 transition-colors duration-300 hover:text-gray-950 hover:decoration-gray-900'

function ResumeJsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: 'Résumé for Philip I. Thomas',
    description:
      'Work experience and education for engineer and product builder Philip I. Thomas.',
    url: `${siteConfig.url}/resume`,
    mainEntity: {
      '@type': 'Person',
      name: siteConfig.author,
      alternateName: 'Philip I. Thomas',
      url: siteConfig.url,
      email: `mailto:${siteConfig.email}`,
      sameAs: ['https://github.com/philipithomas'],
      alumniOf: {
        '@type': 'CollegeOrUniversity',
        name: resumeEducation.company,
        url: resumeEducation.companyUrl,
      },
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  )
}

function ResumeMedia({ entry }: { entry: ResumeEntry }) {
  if (!entry.media?.length) return null

  return (
    <details className="group mt-5 border-gray-200 border-t pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans font-semibold text-gray-700 text-sm transition-colors hover:text-gray-950 [&::-webkit-details-marker]:hidden">
        <span>
          Selected work and media
          <span className="ml-2 font-mono font-normal text-gray-500 text-xs">
            {String(entry.media.length).padStart(2, '0')}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <ul className="mt-4 divide-y divide-gray-100 border-gray-100 border-y">
        {entry.media.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link grid gap-2 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
            >
              <Badge
                variant="outline"
                className="w-fit rounded-none border-gray-200 px-2 font-mono font-normal text-gray-600 text-[0.6875rem]"
              >
                {item.kind}
              </Badge>
              <span className="font-serif text-gray-700 leading-snug transition-colors group-hover/link:text-gray-950">
                {item.title}
              </span>
              <span className="flex items-center gap-1 font-mono text-gray-500 text-xs">
                {item.source}
                <ExternalLink aria-hidden="true" className="size-3" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

function ResumeEntryRow({ entry }: { entry: ResumeEntry }) {
  return (
    <li className="grid gap-x-5 gap-y-4 py-8 sm:grid-cols-[3rem_minmax(0,1fr)] lg:grid-cols-[3rem_minmax(0,1fr)_11rem] lg:gap-x-7">
      <a
        href={entry.companyUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${entry.company}`}
        className="row-span-2 block size-12 border border-gray-200 bg-white p-1.5"
      >
        <Image
          src={entry.logoSrc}
          alt=""
          width={48}
          height={48}
          className="size-full object-contain"
        />
      </a>

      <div className="sm:col-start-2 lg:col-start-2 lg:row-start-1">
        <h3 className="font-sans font-semibold text-gray-950 text-xl leading-tight tracking-tight">
          {entry.role}{' '}
          <span aria-hidden="true" className="mx-1 text-gray-300">
            |
          </span>{' '}
          <a
            href={entry.companyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={externalLinkClassName}
          >
            {entry.company}
          </a>
        </h3>

        <ul className="mt-4 list-disc space-y-2.5 pl-5 font-serif text-base text-gray-700 leading-relaxed marker:text-gray-400">
          {entry.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>

        <ResumeMedia entry={entry} />
      </div>

      <div className="sm:col-start-2 lg:col-start-3 lg:row-start-1 lg:text-right">
        <p className="font-mono font-semibold text-gray-700 text-xs tabular-nums">
          <time dateTime={entry.start}>{entry.start}</time>
          <span aria-hidden="true"> to </span>
          <time dateTime={entry.end}>{entry.end}</time>
        </p>
        <p className="mt-1 font-sans text-gray-500 text-xs leading-snug">
          {entry.location}
        </p>
      </div>
    </li>
  )
}

export function ResumePage() {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <SetNewsletter newsletter={null} />
      <ResumeJsonLd />

      <div className="container py-8 sm:py-12 lg:py-16">
        <div className="mx-auto max-w-6xl border border-gray-200 bg-offwhite-light">
          <header className="border-gray-200 border-b px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
            <p className="font-mono text-gray-500 text-xs uppercase tracking-[0.14em]">
              Résumé
            </p>
            <div className="mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-6xl">
                Philip I. Thomas
              </h1>
              <address className="flex flex-col items-start gap-1 font-serif text-gray-700 text-sm not-italic md:items-end md:text-right">
                <a
                  href={`mailto:${siteConfig.email}`}
                  className={externalLinkClassName}
                >
                  {siteConfig.email}
                </a>
                <a
                  href="https://github.com/philipithomas"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClassName}
                >
                  github.com/philipithomas
                </a>
              </address>
            </div>

            <a
              href={resumeSecurityCredit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-gray-600 text-xs transition-colors hover:text-gray-950"
            >
              <span>{resumeSecurityCredit.title}</span>
              <span className="whitespace-nowrap text-gray-400">
                {resumeSecurityCredit.dates}
              </span>
              <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
            </a>
          </header>

          <div className="px-5 sm:px-8 lg:px-12">
            <section aria-labelledby="resume-experience">
              {/* biome-ignore lint/correctness/useUniqueElementIds: stable resume section anchor */}
              <h2
                id="resume-experience"
                className="border-gray-200 border-b py-5 font-mono font-semibold text-gray-500 text-xs uppercase tracking-[0.14em]"
              >
                Experience
              </h2>
              <ol className="divide-y divide-gray-200">
                {resumeExperience.map((entry) => (
                  <ResumeEntryRow key={entry.company} entry={entry} />
                ))}
              </ol>
            </section>

            <section aria-labelledby="resume-education" className="pb-3">
              {/* biome-ignore lint/correctness/useUniqueElementIds: stable resume section anchor */}
              <h2
                id="resume-education"
                className="border-gray-200 border-b py-5 font-mono font-semibold text-gray-500 text-xs uppercase tracking-[0.14em]"
              >
                Education
              </h2>
              <ol>
                <ResumeEntryRow entry={resumeEducation} />
              </ol>
            </section>
          </div>
        </div>
      </div>
    </article>
  )
}
