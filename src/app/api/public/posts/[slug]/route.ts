import { publicError, publicJson, publicOptions } from '@/lib/public-api/http'
import { readPublicPost } from '@/lib/public-api/posts'

interface Props {
  params: Promise<{ slug: string }>
}

export function OPTIONS() {
  return publicOptions()
}

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params

  try {
    return publicJson(readPublicPost({ slug }))
  } catch (error) {
    return publicError(error)
  }
}
