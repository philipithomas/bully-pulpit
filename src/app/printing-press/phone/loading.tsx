import { PageHeader } from '@/components/printing-press/page-header'
import { Skeleton } from '@/components/ui/skeleton'

const CONVERSATIONS = ['a', 'b', 'c', 'd', 'e']
const MESSAGES = ['a', 'b', 'c']

export default function PhoneLoading() {
  return (
    <div>
      <PageHeader
        title="Phone"
        description={<Skeleton className="h-5 w-96 max-w-full" />}
      />
      <div className="mb-5 flex w-full bg-muted p-1 sm:w-fit">
        <Skeleton className="h-11 flex-1 sm:h-9 sm:w-24" />
        <Skeleton className="h-11 flex-1 sm:h-9 sm:w-32" />
      </div>
      <div className="flex h-[70dvh] min-h-[400px] max-h-[700px] overflow-hidden border border-border bg-card">
        <div className="w-full shrink-0 space-y-1 p-2 sm:w-64">
          <div className="flex min-h-12 items-center justify-between px-3 py-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-10" />
          </div>
          {CONVERSATIONS.map((conversation) => (
            <div
              key={conversation}
              className="min-h-16 space-y-2 bg-background px-3 py-3"
            >
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          ))}
        </div>
        <div className="hidden min-w-0 flex-1 flex-col sm:flex">
          <div className="flex-1 space-y-3 px-4 py-5">
            {MESSAGES.map((message, index) => (
              <Skeleton
                key={message}
                className={`h-16 ${index % 2 === 0 ? 'ml-auto w-2/3' : 'w-3/4'}`}
              />
            ))}
          </div>
          <div className="flex gap-2 bg-background p-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}
