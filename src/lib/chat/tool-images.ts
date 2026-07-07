export type ToolImage = {
  id?: string
  src: string
  alt?: string
  url?: string
  description?: string
}

export type ToolResultWithImages = {
  title?: string
  url?: string
  coverImage?: string
  image?: ToolImage
  images?: ToolImage[]
}

export type ToolImageCard = {
  src: string
  alt: string
  url: string
  label: string
}

function parseToolOutput(output: unknown): ToolResultWithImages[] {
  const parsed =
    typeof output === 'string'
      ? (() => {
          try {
            return JSON.parse(output) as unknown
          } catch {
            return null
          }
        })()
      : output
  if (Array.isArray(parsed)) return parsed as ToolResultWithImages[]
  if (parsed && typeof parsed === 'object')
    return [parsed as ToolResultWithImages]
  return []
}

export function toolImageCardsFromOutput(
  output: unknown,
  limit = 4
): ToolImageCard[] {
  return parseToolOutput(output)
    .flatMap((result) => {
      const images =
        result.image !== undefined
          ? [result.image]
          : result.images && result.images.length > 0
            ? result.images
            : result.coverImage
              ? [
                  {
                    src: result.coverImage,
                    alt: result.title,
                    url: result.url,
                    description: result.title,
                  },
                ]
              : []
      return images.map((image) => ({
        src: image.src,
        alt: image.alt || result.title || 'Search result image',
        url: image.url || result.url || '/',
        label: image.description || image.alt || result.title || 'Image',
      }))
    })
    .filter((image) => image.src)
    .filter(
      (image, index, all) =>
        all.findIndex((candidate) => candidate.src === image.src) === index
    )
    .slice(0, limit)
}
