import { siteConfig } from '@/lib/config'

export async function getSubscriberCount(): Promise<number> {
  const res = await fetch(
    `${siteConfig.printingPressUrl}/api/v1/stats/subscribers/count`,
    { next: { revalidate: false } }
  )
  if (!res.ok) return 0
  const data = await res.json()
  return data.count ?? 0
}
