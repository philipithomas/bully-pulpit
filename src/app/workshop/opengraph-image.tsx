import { renderNewsletterSocialImage } from '@/lib/seo/newsletter-social-image'

export const alt = 'Workshop wordmark'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return renderNewsletterSocialImage('workshop')
}
