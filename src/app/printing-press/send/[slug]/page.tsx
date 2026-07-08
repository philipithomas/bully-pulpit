import { notFound } from 'next/navigation'
import { SendClient } from '@/app/printing-press/send/[slug]/send-client'
import { requireAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { type SendStats, sendStatsBySlug } from '@/lib/db/queries/email-sends'
import { smsSendStatsBySlug } from '@/lib/db/queries/sms-sends'
import { countEligibleSms } from '@/lib/db/queries/sms-subscribers'
import { countEligible, isNewsletter } from '@/lib/db/queries/subscribers'
import { renderNewsletterPreview } from '@/lib/email/send'
import { isSendRunActive } from '@/lib/email/send-guard'

function combineSendStats(email: SendStats, sms: SendStats): SendStats {
  return {
    total: email.total + sms.total,
    sent: email.sent + sms.sent,
    pending: email.pending + sms.pending,
    failed: email.failed + sms.failed,
  }
}

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

  const [eligible, smsEligible, emailStats, smsStats, active] =
    await Promise.all([
      countEligible(post.newsletter, slug),
      countEligibleSms(post.newsletter, slug),
      sendStatsBySlug(slug),
      smsSendStatsBySlug(slug),
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
      initialSmsEligible={smsEligible}
      initialStats={combineSendStats(emailStats, smsStats)}
      initialActive={active}
    />
  )
}
