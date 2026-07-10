import type { MetadataRoute } from 'next'
import { siteIdentity } from '@/lib/site-identity'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteIdentity.name,
    short_name: siteIdentity.name,
    description: siteIdentity.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F3F0',
    theme_color: '#2B4A3E',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
