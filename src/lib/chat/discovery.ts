export const BELL_DISCOVERY_OPENED_KEY = 'bell-discovery-opened'
export const BELL_DISCOVERY_VIEWS_KEY = 'bell-discovery-page-views'

export function nextBellDiscoveryPageView(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 0
  const current = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  return Math.min(current + 1, 3)
}

export function shouldNudgeBellDiscovery(
  pageView: number,
  bellWasOpened: boolean
): boolean {
  return pageView === 2 && !bellWasOpened
}
