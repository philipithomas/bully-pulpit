import { NextResponse } from 'next/server'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'

interface Props {
  params: Promise<{ slug: string }>
}

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)
  const item = post ?? page

  if (!item) {
    return new NextResponse('Not found', { status: 404 })
  }

  const markdown = [
    `# ${item.frontmatter.title}`,
    item.frontmatter.description ? `\n> ${item.frontmatter.description}` : '',
    `\nDate: ${item.frontmatter.publishedAt}`,
    '\n---\n',
    item.content,
  ].join('\n')

  return new NextResponse(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
