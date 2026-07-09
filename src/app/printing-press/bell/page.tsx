import { BellListClient } from '@/app/printing-press/bell/bell-list-client'
import { serializeBellSummary } from '@/app/printing-press/bell/serialize'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { listBellConversations } from '@/lib/db/queries/bell-conversations'

export default async function BellPage() {
  await requireAdmin()
  const result = await listBellConversations({ limit: 25 })

  return (
    <div>
      <PageHeader
        title="Bell"
        description="Conversations with Bell across the website and text messages."
      />
      <BellListClient
        initialData={{
          conversations: result.conversations.map(serializeBellSummary),
          nextCursor: result.nextCursor,
        }}
      />
    </div>
  )
}
