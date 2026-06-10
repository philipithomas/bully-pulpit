import type { Metadata } from 'next'
import Link from 'next/link'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Print edition, concluded',
  description:
    'The print edition ran as an experiment in sending the newsletters by postal mail. The experiment has now concluded.',
  alternates: { canonical: '/print', types: feedDiscovery() },
}

export default function PrintPage() {
  return (
    <div className="bg-offwhite-cool" data-bg="offwhite-cool">
      <div className="container">
        <div
          className="flex items-center justify-center py-16"
          style={{ minHeight: 'calc(100vh - 88px)' }}
        >
          <div className="max-w-xl text-center">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-500">
              An experiment, concluded
            </p>

            <h1 className="mt-6 font-serif text-4xl sm:text-5xl tracking-tight leading-tight text-gray-950 text-pretty">
              The print edition
            </h1>

            <div
              className="mx-auto mt-8 h-px w-12 bg-gray-300"
              aria-hidden="true"
            />

            <p className="mt-8 font-serif text-lg sm:text-xl leading-relaxed text-gray-600 text-pretty">
              The print edition ran as an experiment in sending the newsletters
              on this site through the postal mail: each essay printed, folded,
              and delivered as a paper letter. It began on 2025-12-10 and has
              now concluded. The{' '}
              <Link
                href="/introducing-the-print-edition"
                className="underline underline-offset-4 decoration-indigo hover:text-indigo transition-colors duration-300"
              >
                launch essay
              </Link>{' '}
              tells the full story.
            </p>

            <p className="mt-10 font-serif text-sm text-gray-500">
              The writing continues. Subscribe by email on the{' '}
              <Link
                href="/"
                className="underline underline-offset-4 decoration-indigo hover:text-indigo transition-colors duration-300"
              >
                home page
              </Link>
              , or follow along by{' '}
              <Link
                href="/feed/rss.xml"
                className="underline underline-offset-4 decoration-indigo hover:text-indigo transition-colors duration-300"
              >
                RSS
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
