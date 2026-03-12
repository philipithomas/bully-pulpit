import { z } from 'zod/v4'

export const newsletterSchema = z.enum(['contraption', 'workshop', 'postcard'])
export type Newsletter = z.infer<typeof newsletterSchema>

export const frontmatterSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  publishedAt: z.string().optional(),
  coverImage: z.string().optional(),
  coverImageAlt: z.string().optional(),
  subtitle: z.string().optional(),
  featured: z.boolean().optional().default(false),
  draft: z.boolean().optional().default(false),
})

export type Frontmatter = z.infer<typeof frontmatterSchema>

export interface Post {
  slug: string
  newsletter: Newsletter
  frontmatter: Frontmatter
  content: string
  excerpt: string
}

export interface Page {
  slug: string
  frontmatter: Frontmatter
  content: string
}
