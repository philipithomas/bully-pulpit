import type { Newsletter } from '@/lib/content/types'

/**
 * Newsletter accent color applied to text on `group` hover: forest for
 * Contraption, walnut for Workshop, indigo for Postcard, orange for
 * umami, and sun for Tsundoku.
 */
export const accentHoverText: Record<Newsletter, string> = {
  contraption: 'group-hover:text-forest',
  workshop: 'group-hover:text-walnut',
  postcard: 'group-hover:text-indigo',
  umami: 'group-hover:text-[#A6400F]',
  tsundoku: 'group-hover:text-sun',
}
