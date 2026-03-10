export const siteConfig = {
  title: 'Philip I. Thomas',
  description:
    'Personal website and blog of Philip I. Thomas — essays, launches, and notes on work in progress.',
  url: 'https://philipithomas.com',
  author: 'Philip I. Thomas',
  email: 'mail@philipithomas.com',
  image: '/images/portrait.jpg',
  favicon: '/favicon.ico',
  newsletters: {
    contraption: {
      name: 'Contraption',
      tagline: 'Essays and launches.',
      slug: 'contraption',
      color: 'forest',
    },
    workshop: {
      name: 'Workshop',
      tagline: 'Journal about work in progress.',
      slug: 'workshop',
      color: 'walnut',
    },
    postcard: {
      name: 'Postcard',
      tagline: "What I'm up to.",
      slug: 'postcard',
      color: 'indigo',
    },
  },
  printingPressUrl: process.env.PRINTING_PRESS_URL ?? 'http://localhost:8080',
  m2mApiKey: process.env.M2M_API_KEY ?? 'dev-api-key',
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production',
} as const
