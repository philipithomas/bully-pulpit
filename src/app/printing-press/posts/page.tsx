import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth/admin'
import { getAllPosts } from '@/lib/content/loader'
import { allSendStats } from '@/lib/db/queries/email-sends'

export default async function PostsPage() {
  await requireAdmin()
  const posts = getAllPosts().filter((p) => !p.frontmatter.draft)
  const stats = await allSendStats()

  return (
    <div>
      <PageHeader
        title="Posts"
        description="Pick a post to preview, test, and send to confirmed subscribers."
      />

      <div className="divide-y divide-gray-100 border border-gray-200 bg-white">
        {posts.map((post) => {
          const s = stats[post.slug]
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
                ) : (
                  <Badge variant="outline">Not sent</Badge>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
