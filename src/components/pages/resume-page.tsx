import { ChevronDown, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { SetNewsletter } from '@/components/layout/newsletter-context'
import { serializeJsonLd } from '@/components/seo/json-ld'
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
    <details className="group mt-5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-2 font-sans font-semibold text-gray-700 text-sm transition-colors hover:text-gray-950 [&::-webkit-details-marker]:hidden">
        <span>
          Selected work and media
          <span className="ml-1 font-normal text-gray-500">
            ({entry.media.length})
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <ul className="mt-4 space-y-3">
        {entry.media.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/link grid gap-1 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3"
            >
              <span className="font-sans font-semibold text-gray-500 text-xs">
                {item.kind}
              </span>
              <span className="min-w-0">
                <span className="font-serif text-gray-700 leading-snug transition-colors group-hover/link:text-gray-950">
                  {item.title}
                </span>
                <span className="ml-2 inline-flex items-center gap-1 font-sans text-gray-500 text-xs">
                  {item.source}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </span>
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
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-5">
      <a
        href={entry.companyUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Visit ${entry.company}`}
        className="block size-10 self-start transition-opacity hover:opacity-70 sm:size-12"
      >
        <Image
          src={entry.logoSrc}
          alt=""
          width={48}
          height={48}
          className="size-full object-contain"
        />
      </a>

      <div className="min-w-0">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-8">
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

          <div className="shrink-0 font-sans text-gray-500 text-sm leading-snug tabular-nums md:text-right">
            <p className="font-semibold text-gray-700">
              <time dateTime={entry.start}>{entry.start}</time>
              <span aria-hidden="true"> to </span>
              <time dateTime={entry.end}>{entry.end}</time>
            </p>
            <p className="mt-1">{entry.location}</p>
          </div>
        </div>
      </div>

      <div className="col-span-2 mt-4 sm:col-start-2 sm:col-span-1">
        <ul className="list-disc space-y-2.5 pl-5 font-serif text-base text-gray-700 leading-relaxed marker:text-gray-400">
          {entry.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>

        <ResumeMedia entry={entry} />
      </div>
    </li>
  )
}

export function ResumePage() {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <SetNewsletter newsletter={null} />
      <ResumeJsonLd />

      <div className="container py-12 md:py-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <header className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-6xl">
              Philip I. Thomas
            </h1>
            <address className="flex flex-col items-start gap-1 font-serif text-base text-gray-700 not-italic sm:items-end sm:text-right">
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
          </header>

          <section
            aria-labelledby="resume-experience"
            className="mt-16 grid gap-8 md:mt-20 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
          >
            {/* biome-ignore lint/correctness/useUniqueElementIds: stable resume section anchor */}
            <h2
              id="resume-experience"
              className="font-sans font-semibold text-2xl text-gray-950 tracking-tight"
            >
              Experience
            </h2>
            <ol className="space-y-14 md:space-y-16">
              {resumeExperience.map((entry) => (
                <ResumeEntryRow key={entry.company} entry={entry} />
              ))}
            </ol>
          </section>

          <section
            aria-labelledby="resume-education"
            className="mt-20 grid gap-8 md:mt-24 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
          >
            {/* biome-ignore lint/correctness/useUniqueElementIds: stable resume section anchor */}
            <h2
              id="resume-education"
              className="font-sans font-semibold text-2xl text-gray-950 tracking-tight"
            >
              Education
            </h2>
            <ol>
              <ResumeEntryRow entry={resumeEducation} />
            </ol>
          </section>

          <section
            aria-labelledby="resume-security-research"
            className="mt-20 grid gap-8 md:mt-24 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-12"
          >
            {/* biome-ignore lint/correctness/useUniqueElementIds: stable resume section anchor */}
            <h2
              id="resume-security-research"
              className="font-sans font-semibold text-2xl text-gray-950 tracking-tight"
            >
              Security research
            </h2>
            <a
              href={resumeSecurityCredit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex max-w-2xl items-start gap-2 font-serif text-gray-700 text-lg leading-relaxed transition-colors hover:text-gray-950"
            >
              <span>
                <span className="underline decoration-gray-300 underline-offset-2 transition-colors group-hover:decoration-gray-900">
                  {resumeSecurityCredit.title}
                </span>
                <span className="mt-1 block font-sans text-gray-500 text-sm tabular-nums">
                  {resumeSecurityCredit.dates}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="mt-1.5 size-4 shrink-0"
              />
            </a>
          </section>
        </div>
      </div>
    </article>
  )
}
