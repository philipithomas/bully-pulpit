import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

export default function HealthLoading() {
  return (
    <div>
      <PageHeader
        title="Health"
        description={<Skeleton className="h-5 w-96" />}
      />
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-36 w-full" />
        ))}
      </div>
    </div>
  )
}
