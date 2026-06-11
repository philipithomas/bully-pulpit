// Daily page views from Vercel Web Analytics. There is no official API for
// Web Analytics, so this calls the undocumented dashboard endpoint the Vercel
// frontend itself uses. The endpoint only accepts a classic account access
// token (vercel.com/account/settings/tokens) and answers wrong token types
// with an empty-body 404, so every failure mode here — missing token, non-200,
// unparsable body, timeout, shape drift — degrades silently to null and the
// admin overview renders without the chart.

// Identifiers from .vercel/repo.json. They name the project, not a secret.
const PROJECT_ID = 'prj_qpIxQWaEAXc0PNdefAYbpZGmNZGn'
const TEAM_ID = 'team_Axozqs0tBzA8ZbwDMpVUUhX2'

export type DailyViews = {
  date: string
  views: number
}

/**
 * The day buckets out of a timeseries response body. The shape has changed at
 * least once: the current response nests rows under data.groups.all, an older
 * one put the array directly on data. Accept both, reject everything else.
 */
function rowsFrom(json: unknown): unknown[] | null {
  if (typeof json !== 'object' || json === null) return null
  const data = (json as { data?: unknown }).data
  if (Array.isArray(data)) return data
  if (typeof data !== 'object' || data === null) return null
  const groups = (data as { groups?: unknown }).groups
  if (typeof groups !== 'object' || groups === null) return null
  const all = (groups as { all?: unknown }).all
  return Array.isArray(all) ? all : null
}

/**
 * Parses a timeseries response into date/views points, or null when the body
 * is not a shape this module knows how to read.
 */
export function parseTimeseries(json: unknown): DailyViews[] | null {
  const rows = rowsFrom(json)
  if (rows === null) return null
  const points: DailyViews[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) return null
    const { key, total } = row as { key?: unknown; total?: unknown }
    if (typeof key !== 'string' || typeof total !== 'number') return null
    if (!Number.isFinite(total)) return null
    points.push({ date: key.slice(0, 10), views: total })
  }
  return points
}

/**
 * Page views per day for the last seven days including today, or null when
 * VERCEL_API_TOKEN is unset or anything at all goes wrong. The fetch is capped
 * at five seconds and cached for thirty minutes so the admin overview never
 * hangs on it and the upstream sees at most two requests an hour. This
 * function must never throw.
 */
export async function fetchDailyViews(): Promise<DailyViews[] | null> {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) return null
  try {
    const to = new Date()
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - 6)
    from.setUTCHours(0, 0, 0, 0)
    const params = new URLSearchParams({
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      environment: 'production',
      granularity: 'day',
      from: from.toISOString(),
      to: to.toISOString(),
    })
    const response = await fetch(
      `https://vercel.com/api/web-analytics/timeseries?${params}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5_000),
        next: { revalidate: 1800 },
      }
    )
    if (!response.ok) return null
    return parseTimeseries(await response.json())
  } catch {
    return null
  }
}
