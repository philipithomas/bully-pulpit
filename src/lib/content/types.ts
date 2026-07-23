import { z } from 'zod/v4'

export const NEWSLETTERS = [
  'contraption',
  'workshop',
  'postcard',
  'tidbits',
  'tsundoku',
] as const
export const newsletterSchema = z.enum(NEWSLETTERS)
export type Newsletter = z.infer<typeof newsletterSchema>

export const photoMetadataSchema = z
  .strictObject({
    camera: z.string().trim().min(1).optional(),
    lens: z.string().trim().min(1).optional(),
    focalLength: z.string().trim().min(1).optional(),
    aperture: z.string().trim().min(1).optional(),
    apertureEstimated: z.boolean().optional(),
    exposureTime: z.string().trim().min(1).optional(),
    iso: z.number().int().positive().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.camera ||
          data.lens ||
          data.focalLength ||
          data.aperture ||
          data.exposureTime ||
          data.iso
      ),
    { message: 'photo must include at least one metadata value' }
  )
  .refine((data) => !data.apertureEstimated || Boolean(data.aperture), {
    message: 'apertureEstimated requires aperture',
    path: ['apertureEstimated'],
  })

export type PhotoMetadata = z.infer<typeof photoMetadataSchema>

export const frontmatterSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    publishedAt: z.string().optional(),
    coverImage: z.string().optional(),
    coverImageAlt: z.string().optional(),
    subtitle: z.string().optional(),
    featured: z.boolean().optional().default(false),
    draft: z.boolean().optional().default(false),
    sequence: z.number().int().optional(),
    location: z
      .object({
        name: z.string(),
        url: z.string().url(),
      })
      .optional(),
    photo: photoMetadataSchema.optional(),
  })
  .refine((data) => !data.coverImage || !!data.coverImageAlt, {
    message: 'coverImageAlt is required when coverImage is set',
    path: ['coverImageAlt'],
  })

export type Frontmatter = z.infer<typeof frontmatterSchema>

export interface ImageDimensions {
  width: number
  height: number
}

export interface Post {
  slug: string
  newsletter: Newsletter
  frontmatter: Frontmatter & { publishedAt: string }
  content: string
  excerpt: string
  coverDimensions?: ImageDimensions
}

export interface Page {
  slug: string
  frontmatter: Frontmatter
  content: string
}
