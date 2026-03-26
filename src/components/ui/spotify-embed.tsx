interface SpotifyEmbedProps {
  episode?: string
  src?: string
  title?: string
}

export function SpotifyEmbed({ episode, src, title }: SpotifyEmbedProps) {
  const embedSrc =
    src ?? `https://open.spotify.com/embed/episode/${episode}?utm_source=oembed`
  return (
    <iframe
      style={{ borderRadius: '12px' }}
      width="100%"
      height="152"
      title={title ?? 'Spotify Episode'}
      frameBorder="0"
      allowFullScreen
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      src={embedSrc}
    />
  )
}
