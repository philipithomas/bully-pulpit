import { notFound } from 'next/navigation'
import { SendClient } from '@/app/printing-press/send/[slug]/send-client'
import { requireAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { sendStatsBySlug } from '@/lib/db/queries/email-sends'
import { countEligible, isNewsletter } from '@/lib/db/queries/subscribers'
import { renderNewsletterPreview } from '@/lib/email/send'
import { isSendRunActive } from '@/lib/email/send-guard'

export default async function SendPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const session = await requireAdmin()
  const { slug } = await params

  const post = getPostBySlug(slug)
  if (!post || !isNewsletter(post.newsletter)) {
    notFound()
  }

  const preview = await renderNewsletterPreview(slug)
  if (!preview) {
    notFound()
  }

  const [eligible, stats, active] = await Promise.all([
    countEligible(post.newsletter, slug),
    sendStatsBySlug(slug),
    isSendRunActive(slug),
  ])

  return (
    <SendClient
      slug={slug}
      adminEmail={session.email}
      subject={preview.subject}
      previewText={preview.previewText}
      newsletter={post.newsletter}
      previewHtml={preview.html}
      initialEligible={eligible}
      initialStats={stats}
      initialActive={active}
    />
  )
}
