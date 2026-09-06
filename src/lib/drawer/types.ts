export const DRAWER_CATEGORIES = [
  'writing',
  'photograph',
  'diction',
  'contraption',
  'blogroll',
] as const

export type DrawerCategory = (typeof DRAWER_CATEGORIES)[number]

export interface DrawerImage {
  src: string
  alt: string
}

export interface DrawerItem {
  /** Stable content-derived key used by the seeded selector. */
  id: string
  category: DrawerCategory
  title: string
  description: string
  href?: string
  publishedAt?: string
  sourceLabel?: string
  image?: DrawerImage
  external?: boolean
  fallback?: boolean
}

export type DrawerCollections = Record<DrawerCategory, DrawerItem[]>

export interface DrawerCatalog {
  collections: DrawerCollections
  /** Oldest dated archive item, used to bound the Surprise me control. */
  earliestDate: string | null
}

export interface DrawerSelection {
  date: string
  items: DrawerItem[]
}
