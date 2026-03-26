interface YouTubeEmbedProps {
  video: string
  title?: string
}

export function YouTubeEmbed({ video, title }: YouTubeEmbedProps) {
  const src = `https://www.youtube.com/embed/${video}`
  return (
    <iframe
      width="100%"
      style={{ aspectRatio: '16/9', borderRadius: '12px' }}
      src={src}
      title={title ?? 'YouTube Video'}
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      loading="lazy"
    />
  )
}
