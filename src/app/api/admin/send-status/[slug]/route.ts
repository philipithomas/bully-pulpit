import { type NextRequest, NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { getPostBySlug } from '@/lib/content/loader'
import { sendStatsBySlug } from '@/lib/db/queries/email-sends'
import { countEligible, isNewsletter } from '@/lib/db/queries/subscribers'

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

  const [stats, eligible] = await Promise.all([
    sendStatsBySlug(slug),
    newsletter ? countEligible(newsletter, slug) : Promise.resolve(0),
  ])

  return NextResponse.json({ ...stats, eligible })
}
