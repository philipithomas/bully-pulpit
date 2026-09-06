import { getPhotoPosts } from '@/lib/content/photo-navigation'
import { tidbitsPaletteForPost } from '@/lib/tidbits/palette'

/** Same published ordering as the Tidbits landing page, evaluated at build time. */
export function latestTidbitsPalette() {
  return tidbitsPaletteForPost(getPhotoPosts('tidbits')[0]?.slug)
}
