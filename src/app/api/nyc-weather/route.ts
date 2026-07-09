import { NextResponse } from 'next/server'
import {
  fetchNycWeatherSnapshot,
  WEATHER_REVALIDATE_SECONDS,
} from '@/lib/weather/nyc'

const WEATHER_CACHE_CONTROL = `public, max-age=60, s-maxage=${WEATHER_REVALIDATE_SECONDS}, stale-while-revalidate=1800`

export async function GET() {
  try {
    const snapshot = await fetchNycWeatherSnapshot()

    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': WEATHER_CACHE_CONTROL,
      },
    })
  } catch (err) {
    console.error('Failed to fetch NYC weather:', err)

    return NextResponse.json(
      { error: 'Weather unavailable' },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}
