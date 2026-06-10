import type { Newsletter } from '@/lib/content/types'

/**
 * Newsletter accent color applied to text on `group` hover: forest for
 * Contraption, walnut for Workshop, indigo for Postcard.
 */
export const accentHoverText: Record<Newsletter, string> = {
  contraption: 'group-hover:text-forest',
  workshop: 'group-hover:text-walnut',
  postcard: 'group-hover:text-indigo',
}
