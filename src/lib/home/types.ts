import type { Newsletter } from '@/lib/content/types'

export interface HomePhoto {
  title: string
  src: string
  alt: string
  width: number
  height: number
  href: string
  publishedAt: string
  location?: string
  newsletter: Extract<Newsletter, 'tidbits' | 'tsundoku'>
}

export interface HomeCuriosity {
  title: string
  description: string
  href: string
}

export interface HomeWriting extends HomeCuriosity {
  publishedAt: string
  label: string
}

/** Small presentation payload; source collections and post bodies stay server-side. */
export interface HomeDrawer {
  date: string
  photos: HomePhoto[]
  word: HomeCuriosity | null
  contraption: HomeCuriosity | null
  writing: HomeWriting | null
}
