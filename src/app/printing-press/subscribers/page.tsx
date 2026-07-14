import { SubscriberTabsClient } from '@/app/printing-press/subscribers/subscriber-tabs-client'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { listSmsSubscribers } from '@/lib/db/queries/sms-subscribers'
import { listSubscribers } from '@/lib/db/queries/subscribers'

export default async function SubscribersPage() {
  await requireAdmin()
  const [emailSubscribers, smsSubscribers] = await Promise.all([
    listSubscribers({ limit: 50 }),
    listSmsSubscribers({ limit: 50 }),
  ])

  return (
    <div>
      <PageHeader
        title="Subscribers"
        description="Email and SMS newsletter subscriptions."
      />
      <SubscriberTabsClient
        initialEmailRows={emailSubscribers.rows}
        initialEmailTotal={emailSubscribers.total}
        initialSmsRows={smsSubscribers.rows}
        initialSmsTotal={smsSubscribers.total}
      />
    </div>
  )
}
