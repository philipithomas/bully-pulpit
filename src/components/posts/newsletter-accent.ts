import type { Newsletter } from '@/lib/content/types'

/**
 * Newsletter accent color applied to text on `group` hover: forest for
 * Contraption, walnut for Workshop, indigo for Postcard, cochineal for
 * tidbits, and sun for Tsundoku.
 */
export const accentHoverText: Record<Newsletter, string> = {
  contraption: 'group-hover:text-forest',
  workshop: 'group-hover:text-walnut',
  postcard: 'group-hover:text-indigo',
  tidbits: 'group-hover:text-tidbits-ink',
  tsundoku: 'group-hover:text-sun',
}
