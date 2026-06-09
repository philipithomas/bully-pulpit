import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth/admin'
import { getAllPosts } from '@/lib/content/loader'
import { allSendStats } from '@/lib/db/queries/email-sends'

// Posts older than this with no send history are archival: no "Not sent"
// badge (it reads as a problem when it isn't) and no link into the send flow.
// The send page itself stays reachable by URL as an escape hatch.
const SENDABLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export default async function PostsPage() {
  await requireAdmin()
  const posts = getAllPosts().filter((p) => !p.frontmatter.draft)
  const stats = await allSendStats()
  const cutoff = Date.now() - SENDABLE_WINDOW_MS

  return (
    <div>
      <PageHeader
        title="Posts"
        description="Pick a post to preview, test, and send to confirmed subscribers."
      />

      <div className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {posts.map((post) => {
          const s = stats[post.slug]
          const recent =
            new Date(post.frontmatter.publishedAt).getTime() >= cutoff
          const sendable = Boolean(s) || recent

          const body = (
            <>
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
                {s && (
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
                )}
                {!s && recent && <Badge variant="outline">Not sent</Badge>}
              </div>
            </>
          )

          if (!sendable) {
            return (
              <div
                key={`${post.newsletter}/${post.slug}`}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                {body}
              </div>
            )
          }

          return (
            <Link
              key={`${post.newsletter}/${post.slug}`}
              href={`/printing-press/send/${post.slug}`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-gray-050"
            >
              {body}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
