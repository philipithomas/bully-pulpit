import { PressContent } from '@/app/print/press-content'
import { publicAppPage } from '@/lib/public-pages'
import { createPublicPageMetadata } from '@/lib/seo/metadata'

const printPage = publicAppPage('/print')

export const metadata = createPublicPageMetadata({
  path: '/print',
  title: printPage.title,
  description: printPage.description,
})

export default function PressPage() {
  return <PressContent />
}
