import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { type SendStats, sendStatsBySlug } from '@/lib/db/queries/email-sends'
import { smsSendStatsBySlug } from '@/lib/db/queries/sms-sends'
import { countEligibleSms } from '@/lib/db/queries/sms-subscribers'
import { countEligible, isNewsletter } from '@/lib/db/queries/subscribers'
import { isSendRunActive } from '@/lib/email/send-guard'

type CombinedSendStats = SendStats & { skipped: number }
type SmsStats = SendStats & { skipped: number }

function combineSendStats(email: SendStats, sms: SmsStats): CombinedSendStats {
  return {
    total: email.total + sms.total,
    sent: email.sent + sms.sent,
    pending: email.pending + sms.pending,
    failed: email.failed + sms.failed,
    skipped: sms.skipped,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { slug } = await params
  const post = getPostBySlug(slug)
  const newsletter =
    post && isNewsletter(post.newsletter) ? post.newsletter : null

  const [emailStats, smsStats, eligible, smsEligible, active] =
    await Promise.all([
      sendStatsBySlug(slug),
      smsSendStatsBySlug(slug),
      newsletter ? countEligible(newsletter, slug) : Promise.resolve(0),
      newsletter ? countEligibleSms(newsletter, slug) : Promise.resolve(0),
      isSendRunActive(slug),
    ])
  const stats = combineSendStats(emailStats, smsStats)

  return NextResponse.json({
    ...stats,
    emailStats,
    smsStats,
    eligible,
    smsEligible,
    active,
  })
}
