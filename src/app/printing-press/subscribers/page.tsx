import { SubscribersClient } from '@/app/printing-press/subscribers/subscribers-client'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { listSubscribers, subscriberStats } from '@/lib/db/queries/subscribers'

export default async function SubscribersPage() {
  await requireAdmin()
  const [{ rows, total }, stats] = await Promise.all([
    listSubscribers({ limit: 50 }),
    subscriberStats(),
  ])

  return (
    <div>
      <PageHeader
        title="Subscribers"
        description={`${stats.confirmed.toLocaleString('en-US')} ${
          stats.confirmed === 1 ? 'person' : 'people'
        }`}
      />
      <SubscribersClient initialRows={rows} initialTotal={total} />
    </div>
  )
}
