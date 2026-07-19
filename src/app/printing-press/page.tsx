import Link from 'next/link'
import { requireAdmin } from '@/lib/auth/admin'
import { getAllPosts, getPostBySlug } from '@/lib/content/loader'
import { allSendStats, lastCompletedSend } from '@/lib/db/queries/email-sends'
import { subscriberStats } from '@/lib/db/queries/subscribers'
import { isNewsletterSendingEnabled } from '@/lib/newsletters'
import { isRecent, SEND_NUDGE_WINDOW_MS } from '@/lib/printing-press'

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
  const lastPost = last ? getPostBySlug(last.postSlug) : null

  // Recent posts with no send history at all — the ones worth a nudge.
  const readyToSend = getAllPosts().filter(
    (p) =>
      !p.frontmatter.draft &&
      isNewsletterSendingEnabled(p.newsletter) &&
      !sends[p.slug] &&
      isRecent(p.frontmatter.publishedAt, SEND_NUDGE_WINDOW_MS)
  )

  return (
    <div>
      <h1 className="sr-only">Overview</h1>

      <div className="max-w-xl space-y-5 font-serif text-gray-950">
        <p className="text-xl leading-relaxed sm:text-2xl">
          {stats.confirmed === 0 ? (
            <>No one has confirmed a subscription yet.</>
          ) : (
            <>
              You write to {n(stats.confirmed)}{' '}
              {stats.confirmed === 1 ? 'person' : 'people'}.{' '}
              <cite className="text-indigo">Postcard</cite> reaches{' '}
              {n(stats.postcard)} of them,{' '}
              <cite className="text-forest">Contraption</cite>{' '}
              {n(stats.contraption)},{' '}
              <cite className="text-walnut">Workshop</cite> {n(stats.workshop)},
              and <cite className="text-tidbits">tidbits</cite>{' '}
              {n(stats.tidbits)}.
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

        {readyToSend.map((post) => (
          <p key={post.slug} className="leading-relaxed text-gray-600">
            <em>
              <Link
                href={`/printing-press/send/${post.slug}`}
                className="text-gray-950 underline decoration-gray-300 underline-offset-4 transition-colors hover:decoration-current"
              >
                {post.frontmatter.title}
              </Link>
            </em>{' '}
            went up on{' '}
            <span className="font-mono text-[0.8125em]">
              {post.frontmatter.publishedAt}
            </span>{' '}
            and has not gone out yet.
          </p>
        ))}
      </div>
    </div>
  )
}
