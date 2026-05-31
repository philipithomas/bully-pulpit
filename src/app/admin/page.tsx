import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { getAllPosts } from '@/lib/content/loader'
import { allSendStats } from '@/lib/db/queries/email-sends'

const newsletterBadge: Record<
  string,
  'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'
> = {
  contraption: 'secondary',
  workshop: 'secondary',
  postcard: 'secondary',
}

export default async function AdminPage() {
  const posts = getAllPosts().filter((p) => !p.frontmatter.draft)
  const stats = await allSendStats()

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-950 mb-2">
        Send a newsletter
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Pick a post to preview, test, and send to confirmed subscribers.
      </p>

      <div className="border border-gray-200 bg-white divide-y divide-gray-100">
        {posts.map((post) => {
          const s = stats[post.slug]
          return (
            <Link
              key={`${post.newsletter}/${post.slug}`}
              href={`/admin/send/${post.slug}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {post.frontmatter.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="capitalize">{post.newsletter}</span>
                  {post.frontmatter.publishedAt
                    ? ` · ${post.frontmatter.publishedAt}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                <Badge
                  variant={newsletterBadge[post.newsletter] ?? 'secondary'}
                >
                  {post.newsletter}
                </Badge>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
