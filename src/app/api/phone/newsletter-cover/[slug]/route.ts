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
  'Content-Disposition': 'inline; filename="cover.jpg"',
  'Content-Type': 'image/jpeg',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
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
    headers: { Accept: 'image/jpeg' },
    url: optimizerUrl(siteConfig.url, coverImage),
  }
  const requestUrl = new URL(request.url)
  if (!requestUrl.hostname.endsWith('.vercel.app')) return [publicRequest]

  const headers: Record<string, string> = { Accept: 'image/jpeg' }
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
): Promise<Buffer | null> {
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

    if (
      !response.ok ||
      response.headers.get('content-type')?.split(';', 1)[0] !== 'image/jpeg'
    ) {
      continue
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (declaredLength > MAX_MMS_IMAGE_BYTES) continue

    const image = Buffer.from(await response.arrayBuffer())
    if (image.byteLength <= MAX_MMS_IMAGE_BYTES) return image
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

  const image = await optimizedCover(request, coverImage)
  if (!image) return new Response('Not found', { status: 404 })

  return new Response(includeBody ? Uint8Array.from(image).buffer : null, {
    headers: {
      ...RESPONSE_HEADERS,
      'Content-Length': String(image.byteLength),
    },
  })
}

export function GET(request: Request, context: RouteContext) {
  return coverResponse(request, context, true)
}

export function HEAD(request: Request, context: RouteContext) {
  return coverResponse(request, context, false)
}
