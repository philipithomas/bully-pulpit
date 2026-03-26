const SUBSCRIBER_COUNT_URL =
  'https://printing-press.contraption.co/api/v1/stats/subscribers/count'

export async function getSubscriberCount(): Promise<number> {
  try {
    const res = await fetch(SUBSCRIBER_COUNT_URL, {
      next: { revalidate: false },
    })
    if (!res.ok) {
      console.warn(
        `[subscriber-count] ${SUBSCRIBER_COUNT_URL} returned ${res.status}`
      )
      return 0
    }
    const data = await res.json()
    return data.count ?? 0
  } catch (err) {
    console.warn(
      `[subscriber-count] Failed to fetch ${SUBSCRIBER_COUNT_URL}:`,
      err instanceof Error ? err.message : err
    )
    return 0
  }
}
