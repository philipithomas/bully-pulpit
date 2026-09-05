import { getPostsByNewsletter } from '@/lib/content/loader'
import { tidbitsPaletteForPost } from '@/lib/tidbits/palette'

/** Same published ordering as the Tidbits landing page, evaluated at build time. */
export function latestTidbitsPalette() {
  return tidbitsPaletteForPost(getPostsByNewsletter('tidbits')[0]?.slug)
}
