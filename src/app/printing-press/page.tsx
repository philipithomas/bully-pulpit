import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { allSendStats, lastCompletedSend } from '@/lib/db/queries/email-sends'
import { subscriberStats } from '@/lib/db/queries/subscribers'

function n(value: number): string {
  return value.toLocaleString('en-US')
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export default async function OverviewPage() {
  await requireAdmin()
  const [stats, sends, last] = await Promise.all([
    subscriberStats(),
    allSendStats(),
    lastCompletedSend(),
  ])

  const pending = Object.values(sends).reduce((a, s) => a + s.pending, 0)
  const unconfirmed = stats.total - stats.confirmed
  const lastPost = last ? getPostBySlug(last.postSlug) : null

  return (
    <div>
      <PageHeader title="Overview" description="Keeping in touch." />

      <div className="max-w-xl space-y-5 font-serif text-gray-950">
        <p className="text-xl leading-relaxed sm:text-2xl">
          {stats.confirmed === 0 ? (
            <>No one has confirmed a subscription yet.</>
          ) : (
            <>
              You write to {n(stats.confirmed)}{' '}
              {stats.confirmed === 1 ? 'person' : 'people'}.{' '}
              <span className="text-indigo">Postcard</span> reaches{' '}
              {n(stats.postcard)} of them,{' '}
              <span className="text-forest">Contraption</span>{' '}
              {n(stats.contraption)}, and{' '}
              <span className="text-walnut">Workshop</span> {n(stats.workshop)}.
            </>
          )}
        </p>

        <p className="leading-relaxed text-gray-600">
          {last ? (
            <>
              The last letter out was{' '}
              <em>{lastPost?.frontmatter.title ?? last.postSlug}</em>, sent to{' '}
              {n(last.sent)} {last.sent === 1 ? 'reader' : 'readers'} on{' '}
              <span className="font-mono text-[0.8125em]">
                {iso(last.lastSentAt)}
              </span>
              .
            </>
          ) : (
            <>You have not sent anything from here yet.</>
          )}
        </p>

        {unconfirmed > 0 && (
          <p className="leading-relaxed text-gray-600">
            Another {n(unconfirmed)}{' '}
            {unconfirmed === 1 ? 'person has' : 'people have'} signed up but not
            confirmed yet.
          </p>
        )}

        {pending > 0 && (
          <p className="leading-relaxed">
            <Link
              href="/printing-press/posts"
              className="underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-current"
            >
              A send is under way: {n(pending)}{' '}
              {pending === 1 ? 'email' : 'emails'} queued.
            </Link>
          </p>
        )}
      </div>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link
          href="/printing-press/posts"
          className="text-sm font-medium text-gray-700 underline-offset-4 hover:text-gray-950 hover:underline"
        >
          Send a post →
        </Link>
        <Link
          href="/printing-press/subscribers"
          className="text-sm font-medium text-gray-700 underline-offset-4 hover:text-gray-950 hover:underline"
        >
          Browse subscribers →
        </Link>
      </div>
    </div>
  )
}
