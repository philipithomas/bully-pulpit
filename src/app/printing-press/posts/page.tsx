import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth/admin'
import { siteConfig } from '@/lib/config'
import { getAllPosts } from '@/lib/content/loader'
import { allSendStats } from '@/lib/db/queries/email-sends'
import { activeSendRunSlugs } from '@/lib/email/send-guard'
import { isNewsletterSendingEnabled } from '@/lib/newsletters'
import { isRecent, NOT_SENT_BADGE_WINDOW_MS } from '@/lib/printing-press'

type PostStatus = {
  label: string
  variant: 'destructive' | 'outline' | 'success' | 'warning'
}

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

      <div className="space-y-1 bg-card p-1">
        {posts.map((post) => {
          const s = stats[post.slug]
          const active = activeRuns.has(post.slug)
          const sendingEnabled = isNewsletterSendingEnabled(post.newsletter)
          // Every post links into the send flow. The "Not sent" badge only
          // appears on recent posts: on older ones it reads as a problem when
          // the post simply predates the email system.
          const showNotSent =
            !s &&
            !active &&
            sendingEnabled &&
            isRecent(post.frontmatter.publishedAt, NOT_SENT_BADGE_WINDOW_MS)
          let status: PostStatus | null = null
          if (active) {
            status = { label: 'Sending', variant: 'warning' }
          } else if (s?.failed) {
            status = { label: `${s.failed} failed`, variant: 'destructive' }
          } else if (s?.pending) {
            status = { label: `${s.pending} pending`, variant: 'warning' }
          } else if (showNotSent) {
            status = { label: 'Not sent', variant: 'outline' }
          } else if (!sendingEnabled) {
            status = { label: 'Archived', variant: 'outline' }
          } else if (s?.sent) {
            status = { label: `${s.sent} sent`, variant: 'success' }
          }
          const deliveryDetails = s
            ? [
                s.sent > 0 ? `${s.sent} sent` : null,
                s.pending > 0 ? `${s.pending} pending` : null,
                s.failed > 0 ? `${s.failed} failed` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : null

          return (
            <Link
              key={`${post.newsletter}/${post.slug}`}
              href={`/printing-press/send/${post.slug}`}
              className="flex min-h-16 items-center justify-between gap-3 bg-background px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground text-sm">
                  {post.frontmatter.title}
                </p>
                <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                  <cite className="font-serif">
                    {siteConfig.newsletters[post.newsletter].name}
                  </cite>
                  {post.frontmatter.publishedAt
                    ? ` · ${post.frontmatter.publishedAt}`
                    : ''}
                  {deliveryDetails ? ` · ${deliveryDetails}` : ''}
                </p>
              </div>
              {status ? (
                <Badge className="shrink-0" variant={status.variant}>
                  {status.label}
                </Badge>
              ) : null}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
