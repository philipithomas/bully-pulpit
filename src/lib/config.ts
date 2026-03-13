export const siteConfig = {
  title: 'Philip I. Thomas',
  description:
    'I build at the intersection of math, business, and software. I write about crafting digital tools at Contraption Company.',
  url: 'https://philipithomas.com',
  author: 'Philip I. Thomas',
  email: 'mail@philipithomas.com',
  image: '/og-image.png',
  favicon: '/favicon.ico',
  newsletters: {
    contraption: {
      name: 'Contraption',
      tagline: 'Projects and essays.',
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
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production',
} as const
