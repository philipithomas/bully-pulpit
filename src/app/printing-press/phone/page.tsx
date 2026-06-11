import { PhoneClient } from '@/app/printing-press/phone/phone-client'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { listConversations } from '@/lib/db/queries/text-messages'
import { serializeMessage } from '@/lib/phone/serialize'

export default async function PhonePage() {
  await requireAdmin()
  const conversations = await listConversations()

  return (
    <div>
      <PageHeader
        title="Phone"
        description="Text messages on the Twilio numbers. Replies send as SMS, and click-to-call rings your phone first."
      />
      <PhoneClient
        initialConversations={conversations.map((c) => ({
          number: c.number,
          lastMessage: serializeMessage(c.lastMessage),
        }))}
      />
    </div>
  )
}
