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
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-gray-200',
        className
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-gray-900 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
