import { siteConfig } from '@/lib/config'
import { getPostBySlugWithoutImages } from '@/lib/content/loader-without-images'
import { newsletterUsesCoverMms } from '@/lib/newsletters'
import { isNewsletterMmsCoverPath } from '@/lib/phone/newsletter-sms'

export const dynamic = 'force-dynamic'

const MMS_IMAGE_MAX_WIDTH = 1200
const MMS_IMAGE_QUALITY = 100
const MAX_MMS_IMAGE_BYTES = 4_500_000
const RESPONSE_HEADERS = {
  'Cache-Control':
    'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=2592000',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
}

type MmsImageContentType = 'image/jpeg' | 'image/png'

function mmsImageContentType(value: string | null): MmsImageContentType | null {
  const contentType = value?.split(';', 1)[0]
  return contentType === 'image/jpeg' || contentType === 'image/png'
    ? contentType
    : null
}

function contentDisposition(contentType: MmsImageContentType): string {
  const extension = contentType === 'image/png' ? 'png' : 'jpg'
  return `inline; filename="cover.${extension}"`
}

type RouteContext = { params: Promise<{ slug: string }> }

function isMmsPost(slug: string): boolean {
  const post = getPostBySlugWithoutImages(slug)
  return !!post && newsletterUsesCoverMms(post.newsletter)
}

function snapshotCoverPath(request: Request): string | null {
  const coverImage = new URL(request.url).searchParams.get('v')
  return isNewsletterMmsCoverPath(coverImage) ? coverImage : null
}

function optimizerUrl(origin: string, coverImage: string): string {
  const url = new URL('/_next/image', origin)
  url.searchParams.set('url', coverImage)
  url.searchParams.set('w', String(MMS_IMAGE_MAX_WIDTH))
  url.searchParams.set('q', String(MMS_IMAGE_QUALITY))
  return url.toString()
}

function optimizerRequests(
  request: Request,
  coverImage: string
): Array<{ headers: Record<string, string>; url: string }> {
  const publicRequest = {
    headers: { Accept: 'image/jpeg,image/png' },
    url: optimizerUrl(siteConfig.url, coverImage),
  }
  const requestUrl = new URL(request.url)
  if (!requestUrl.hostname.endsWith('.vercel.app')) return [publicRequest]

  const headers: Record<string, string> = {
    Accept: 'image/jpeg,image/png',
  }
  for (const name of ['cookie', 'x-vercel-protection-bypass']) {
    const value = request.headers.get(name)
    if (value) headers[name] = value
  }

  return [
    { headers, url: optimizerUrl(requestUrl.origin, coverImage) },
    publicRequest,
  ]
}

async function optimizedCover(
  request: Request,
  coverImage: string
): Promise<{ contentType: MmsImageContentType; image: Buffer } | null> {
  for (const candidate of optimizerRequests(request, coverImage)) {
    let response: Response
    try {
      response = await fetch(candidate.url, {
        cache: 'force-cache',
        headers: candidate.headers,
        redirect: 'error',
      })
    } catch {
      continue
    }

    const contentType = mmsImageContentType(
      response.headers.get('content-type')
    )
    if (!response.ok || !contentType) continue

    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > MAX_MMS_IMAGE_BYTES) continue

    const image = Buffer.from(await response.arrayBuffer())
    if (image.byteLength <= MAX_MMS_IMAGE_BYTES) return { contentType, image }
  }
  return null
}

async function coverResponse(
  request: Request,
  context: RouteContext,
  includeBody: boolean
): Promise<Response> {
  const { slug } = await context.params
  const coverImage = snapshotCoverPath(request)
  if (!coverImage || !isMmsPost(slug)) {
    return new Response('Not found', { status: 404 })
  }

  const optimized = await optimizedCover(request, coverImage)
  if (!optimized) return new Response('Not found', { status: 404 })

  return new Response(
    includeBody ? Uint8Array.from(optimized.image).buffer : null,
    {
      headers: {
        ...RESPONSE_HEADERS,
        'Content-Disposition': contentDisposition(optimized.contentType),
        'Content-Length': String(optimized.image.byteLength),
        'Content-Type': optimized.contentType,
      },
    }
  )
}

export function GET(request: Request, context: RouteContext) {
  return coverResponse(request, context, true)
}

export function HEAD(request: Request, context: RouteContext) {
  return coverResponse(request, context, false)
}
