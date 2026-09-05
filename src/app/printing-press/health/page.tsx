import { PageHeader } from '@/components/printing-press/page-header'
import { requireAdmin } from '@/lib/auth/admin'
import { type CronHealthStatus, cronHealthSnapshot } from '@/lib/cron/jobs'
import { listCronJobHealth } from '@/lib/db/queries/cron-job-health'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<CronHealthStatus, string> = {
  healthy: 'Healthy',
  running: 'Running',
  pending: 'Awaiting first run',
  failing: 'Last run failed',
  stale: 'Overdue',
  missing: 'Not registered',
}

const STATUS_CLASSES: Record<CronHealthStatus, string> = {
  healthy: 'bg-forest/10 text-forest',
  running: 'bg-indigo/10 text-indigo',
  pending: 'bg-brass/15 text-walnut',
  failing: 'bg-red-100 text-red-800',
  stale: 'bg-red-100 text-red-800',
  missing: 'bg-red-100 text-red-800',
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export default async function HealthPage() {
  await requireAdmin()
  const snapshot = cronHealthSnapshot(await listCronJobHealth())

  return (
    <div>
      <PageHeader
        title="Health"
        description="Last-observed runs for the scheduled jobs that maintain subscriber delivery, backups, and Bell retention. Times are UTC."
      />

      <div className="space-y-3">
        {snapshot.jobs.map((job) => (
          <section key={job.name} className="border border-gray-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-sans font-semibold text-gray-950 text-lg">
                  {job.label}
                </h2>
                <p className="mt-1 font-serif text-gray-600 text-sm">
                  {job.cadence}
                </p>
              </div>
              <span
                className={cn(
                  'px-2.5 py-1 font-sans font-semibold text-xs',
                  STATUS_CLASSES[job.status]
                )}
              >
                {STATUS_LABELS[job.status]}
              </span>
            </div>

            <dl className="mt-5 grid gap-4 border-gray-200 border-t pt-4 font-sans text-sm sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">Last started</dt>
                <dd className="mt-1 font-mono text-gray-950 text-xs">
                  {formatTimestamp(job.lastStartedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Last succeeded</dt>
                <dd className="mt-1 font-mono text-gray-950 text-xs">
                  {formatTimestamp(job.lastSucceededAt)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Last failed</dt>
                <dd className="mt-1 font-mono text-gray-950 text-xs">
                  {formatTimestamp(job.lastFailedAt)}
                  {job.lastFailureCode ? ` · ${job.lastFailureCode}` : ''}
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
