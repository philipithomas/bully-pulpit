import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'

export const NEWSLETTER_SOCIAL_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const

export const NEWSLETTER_SOCIAL_LOGO_WIDTH_RATIO = 0.42

const NEWSLETTER_SOCIAL_BACKGROUNDS = {
  contraption: '#f2f2f1',
  workshop: '#f3f0e9',
  postcard: '#f5f6fa',
  tidbits: '#f6eae9',
  tsundoku: '#f4f4f2',
} as const satisfies Record<Newsletter, string>

export function newsletterSocialImageSpec(newsletter: Newsletter) {
  const config = siteConfig.newsletters[newsletter]
  const width = Math.round(
    NEWSLETTER_SOCIAL_IMAGE_SIZE.width * NEWSLETTER_SOCIAL_LOGO_WIDTH_RATIO
  )

  return {
    alt: `${config.name} wordmark`,
    background: NEWSLETTER_SOCIAL_BACKGROUNDS[newsletter],
    logoPath: config.logo.src,
    logoWidth: width,
    logoHeight: Math.round(
      width * (config.logo.intrinsicHeight / config.logo.intrinsicWidth)
    ),
  }
}

export async function renderNewsletterSocialImage(
  newsletter: Newsletter
): Promise<ImageResponse> {
  const spec = newsletterSocialImageSpec(newsletter)
  const logoData = await readFile(
    join(process.cwd(), 'public', spec.logoPath.replace(/^\//, '')),
    'base64'
  )
  const logoSrc = `data:image/svg+xml;base64,${logoData}`

  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        backgroundColor: spec.background,
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: ImageResponse embeds the local SVG directly. */}
      <img
        src={logoSrc}
        alt=""
        width={spec.logoWidth}
        height={spec.logoHeight}
      />
    </div>,
    NEWSLETTER_SOCIAL_IMAGE_SIZE
  )
}
