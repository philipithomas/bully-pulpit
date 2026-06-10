import { cn } from '@/lib/utils'

export function Progress({
  value = 0,
  className,
}: {
  value?: number
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      className={cn('relative h-2 w-full overflow-hidden bg-muted', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
