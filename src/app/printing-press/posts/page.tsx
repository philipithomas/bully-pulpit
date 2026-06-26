import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth/admin'
import { getAllPosts } from '@/lib/content/loader'
import { allSendStats } from '@/lib/db/queries/email-sends'
import { activeSendRunSlugs } from '@/lib/email/send-guard'
import { isRecent, NOT_SENT_BADGE_WINDOW_MS } from '@/lib/printing-press'

/** "today", "yesterday", or "N days ago" — cadence awareness, not a metric. */
function sincePosted(publishedAt: string): string {
  const days = Math.floor(
    (Date.now() - new Date(publishedAt).getTime()) / (24 * 60 * 60 * 1000)
  )
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export default async function PostsPage() {
  await requireAdmin()
  const posts = getAllPosts().filter((p) => !p.frontmatter.draft)
  const [stats, activeRuns] = await Promise.all([
    allSendStats(),
    activeSendRunSlugs(),
  ])
  const latest = posts[0]

  return (
    <div>
      <PageHeader
        title="Posts"
        description={
          latest
            ? `Pick a post to preview, test, and send. The last post went up ${sincePosted(latest.frontmatter.publishedAt)}.`
            : 'Pick a post to preview, test, and send.'
        }
      />

      <div className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {posts.map((post) => {
          const s = stats[post.slug]
          const active = activeRuns.has(post.slug)
          // Every post links into the send flow. The "Not sent" badge only
          // appears on recent posts: on older ones it reads as a problem when
          // the post simply predates the email system.
          const showNotSent =
            !s &&
            !active &&
            isRecent(post.frontmatter.publishedAt, NOT_SENT_BADGE_WINDOW_MS)

          return (
            <Link
              key={`${post.newsletter}/${post.slug}`}
              href={`/printing-press/send/${post.slug}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-gray-050"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {post.frontmatter.title}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  <span className="capitalize">{post.newsletter}</span>
                  {post.frontmatter.publishedAt
                    ? ` · ${post.frontmatter.publishedAt}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s ? (
                  <>
                    {s.sent > 0 && (
                      <Badge variant="success">{s.sent} sent</Badge>
                    )}
                    {s.pending > 0 && (
                      <Badge variant="warning">{s.pending} pending</Badge>
                    )}
                    {s.failed > 0 && (
                      <Badge variant="destructive">{s.failed} failed</Badge>
                    )}
                  </>
                ) : null}
                {active ? <Badge variant="warning">Sending</Badge> : null}
                {showNotSent ? <Badge variant="outline">Not sent</Badge> : null}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
