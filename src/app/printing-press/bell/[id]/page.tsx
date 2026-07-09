import { notFound } from 'next/navigation'
import { isBellConversationId } from '@/app/api/printing-press/bell/route-utils'
import { BellThreadClient } from '@/app/printing-press/bell/[id]/bell-thread-client'
import { serializeBellDetail } from '@/app/printing-press/bell/serialize'
import { requireAdmin } from '@/lib/auth/admin'
import { getBellConversationDetail } from '@/lib/db/queries/bell-conversations'

export default async function BellConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  if (!isBellConversationId(id)) notFound()

  const detail = await getBellConversationDetail(id)
  if (!detail) notFound()

  return <BellThreadClient initialDetail={serializeBellDetail(detail)} />
}
