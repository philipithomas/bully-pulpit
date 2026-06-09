import Link from 'next/link'
import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { allSendStats } from '@/lib/db/queries/email-sends'
import { subscriberStats } from '@/lib/db/queries/subscribers'

const newsletters = [
  { key: 'postcard', name: 'Postcard', dot: 'bg-indigo' },
  { key: 'contraption', name: 'Contraption', dot: 'bg-forest' },
  { key: 'workshop', name: 'Workshop', dot: 'bg-walnut' },
] as const

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="border border-gray-200 bg-white p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-2 font-serif text-3xl text-gray-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default async function OverviewPage() {
  await requireAdmin()
  const [stats, sends] = await Promise.all([subscriberStats(), allSendStats()])

  const totalSent = Object.values(sends).reduce((a, s) => a + s.sent, 0)
  const postsSent = Object.values(sends).filter((s) => s.sent > 0).length
  const pending = Object.values(sends).reduce((a, s) => a + s.pending, 0)

  return (
    <div>
      <PageHeader title="Overview" description="The newsletter at a glance." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label="Confirmed"
          value={stats.confirmed}
          sub={`${stats.total} total incl. unconfirmed`}
        />
        <Stat
          label="Emails sent"
          value={totalSent}
          sub={`across ${postsSent} posts`}
        />
        <Stat
          label="In flight"
          value={pending}
          sub={pending ? 'sending now' : 'nothing queued'}
        />
      </div>

      <h2 className="mt-10 mb-4 font-mono text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
        By newsletter
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {newsletters.map((nl) => (
          <div key={nl.key} className="border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${nl.dot}`} />
              <span className="text-sm font-medium text-gray-900">
                {nl.name}
              </span>
            </div>
            <p className="mt-3 font-serif text-2xl text-gray-950">
              {stats[nl.key]}
            </p>
            <p className="mt-1 text-xs text-gray-500">confirmed subscribers</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/printing-press/posts"
          className="text-sm font-medium text-gray-700 underline-offset-4 hover:text-gray-950 hover:underline"
        >
          Send a post →
        </Link>
        <Link
          href="/printing-press/subscribers"
          className="text-sm font-medium text-gray-700 underline-offset-4 hover:text-gray-950 hover:underline"
        >
          Browse subscribers →
        </Link>
      </div>
    </div>
  )
}
