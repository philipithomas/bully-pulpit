import type { MetadataRoute } from 'next'
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from '@/lib/pwa/config'
import { siteIdentity } from '@/lib/site-identity'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteIdentity.name,
    short_name: siteIdentity.name,
    description: siteIdentity.description,
    id: '/',
    start_url: '/',
    scope: '/',
    lang: 'en-US',
    dir: 'ltr',
    display: 'standalone',
    orientation: 'any',
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    prefer_related_applications: false,
    categories: ['lifestyle', 'news', 'photo'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Postcard',
        short_name: 'Postcard',
        description: "What I'm up to.",
        url: '/postcard',
      },
      {
        name: 'Contraption',
        short_name: 'Contraption',
        description: 'Projects and essays.',
        url: '/contraption',
      },
      {
        name: 'Photography',
        short_name: 'Photography',
        description: 'Browse photographs from across the site.',
        url: '/photography',
      },
    ],
  }
}
