import type { DailyViews } from '@/lib/analytics/vercel-web-analytics'

// The chart scales uniformly with its container, so at the overview's prose
// width it renders close to these viewBox dimensions.
const WIDTH = 600
const HEIGHT = 140
const PAD = 6

function n(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * A quiet line chart of page views per day: one serif sentence, one forest
 * line with a faint area fill, and the first and last dates underneath. No
 * axes, no gridlines, no box. It is a sketch in the margin, not a dashboard.
 */
export function ViewsChart({ points }: { points: DailyViews[] }) {
  if (points.length === 0) return null

  const total = points.reduce((sum, p) => sum + p.views, 0)
  // A floor of 1 keeps an all-zero week from dividing by zero; the line just
  // rests on the baseline.
  const peak = Math.max(1, ...points.map((p) => p.views))
  const x = (i: number) =>
    points.length === 1
      ? WIDTH / 2
      : PAD + (i * (WIDTH - PAD * 2)) / (points.length - 1)
  const y = (views: number) =>
    HEIGHT - PAD - (views / peak) * (HEIGHT - PAD * 2)

  const coords = points.map(
    (p, i) => [x(i).toFixed(1), y(p.views).toFixed(1)] as const
  )
  const line = coords
    .map(([cx, cy], i) => `${i === 0 ? 'M' : 'L'}${cx} ${cy}`)
    .join(' ')
  const baseline = HEIGHT - PAD
  const area = `${line} L${coords[coords.length - 1][0]} ${baseline} L${coords[0][0]} ${baseline} Z`

  const firstDate = points[0].date
  const lastDate = points[points.length - 1].date

  return (
    <div>
      <p className="font-serif leading-relaxed text-gray-600">
        {n(total)} {total === 1 ? 'page view' : 'page views'} in the last seven
        days.
      </p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label={`Page views per day from ${firstDate} to ${lastDate}: ${n(total)} in total`}
      >
        {coords.length > 1 && (
          <path d={area} className="fill-forest" fillOpacity={0.07} />
        )}
        <path
          d={line}
          className="stroke-forest"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map(([cx, cy], i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed ordered series rendered once; date keys can collide on sub-day buckets
            key={i}
            cx={cx}
            cy={cy}
            r={3}
            className="fill-forest"
          />
        ))}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-xs text-gray-500">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  )
}
