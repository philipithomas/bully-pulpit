import { PhoneClient } from '@/app/printing-press/phone/phone-client'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { listConversations } from '@/lib/db/queries/text-messages'
import {
  isE164,
  sitePhoneDisplayNumber,
  sitePhoneNumber,
} from '@/lib/phone/config'
import { serializeMessage } from '@/lib/phone/serialize'

export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{ number?: string | string[] }>
}) {
  await requireAdmin()
  const requestedNumber = (await searchParams).number
  const initialSelectedNumber =
    typeof requestedNumber === 'string' && isE164(requestedNumber)
      ? requestedNumber
      : null
  const conversations = await listConversations()
  const phoneNumber = sitePhoneNumber()
  const phoneDisplayNumber = sitePhoneDisplayNumber()

  return (
    <div>
      <PageHeader
        title="Phone"
        description="Text messages on the Twilio numbers. Replies send as SMS, and click-to-call rings your phone first."
      />
      <PhoneClient
        initialSelectedNumber={initialSelectedNumber}
        initialConversations={conversations.map((c) => ({
          number: c.number,
          lastMessage: serializeMessage(c.lastMessage),
        }))}
        phoneDisplayNumber={phoneDisplayNumber}
        phoneNumber={phoneNumber}
      />
    </div>
  )
}
