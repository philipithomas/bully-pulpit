import { expect, test } from '@playwright/test'

test('homepage has correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Philip I. Thomas')
})

test('homepage has h1', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('h1')
  await expect(h1).toHaveText('Crafting digital tools')
})

test('homepage has OG tags', async ({ page }) => {
  await page.goto('/')
  const ogTitle = page.locator('meta[property="og:title"]')
  await expect(ogTitle).toHaveAttribute('content', 'Philip I. Thomas')
})

test('feeds return correct content type', async ({ request }) => {
  const rss = await request.get('/feed/rss.xml')
  expect(rss.headers()['content-type']).toContain('application/rss+xml')

  const json = await request.get('/feed/feed.json')
  expect(json.headers()['content-type']).toContain('application/json')
})

test('newsletter pages load', async ({ page }) => {
  await page.goto('/contraption')
  await expect(page.locator('h1')).toHaveText('Contraption')

  await page.goto('/workshop')
  await expect(page.locator('h1')).toHaveText('Workshop')

  await page.goto('/postcard')
  await expect(page.locator('h1')).toHaveText('Postcard')
})

test('posts index redirect: /posts -> /contraption', async ({ request }) => {
  const resp = await request.get('/posts', { maxRedirects: 0 })
  expect(resp.status()).toBe(308)
  expect(resp.headers().location).toBe('/contraption')
})

test('postcard redirect: /posts/what-i-m-up-to-{month}-{year} -> /{year}-{mm}', async ({
  request,
}) => {
  const resp = await request.get('/posts/what-i-m-up-to-march-2026', {
    maxRedirects: 0,
  })
  expect(resp.status()).toBe(308)
  expect(resp.headers().location).toBe('/2026-03')
})

test('philipithomas.com legacy post redirects', async ({ request }) => {
  const cases: [string, string][] = [
    ['/posts/buyers-define-marketplaces', '/buyers-define-marketplaces'],
    ['/posts/moonlight-s-pitch-deck', '/moonlight-s-pitch-deck'],
    [
      '/posts/advice-for-marketplace-startups',
      '/advice-for-marketplace-startups',
    ],
    [
      '/posts/sharing-a-project-i-built-postcard',
      '/sharing-a-project-i-built-postcard',
    ],
    [
      '/posts/when-are-low-code-prototypes-useful-evaluating-startup-market-and-implementation-risks',
      '/when-are-low-code-prototypes-useful-evaluating-startup-market-and-implementation-risks',
    ],
    [
      '/posts/why-i-built-postcard-a-calmer-alternative-to-social-networks',
      '/why-i-built-postcard-a-calmer-alternative-to-social-networks',
    ],
    [
      '/posts/how-to-replace-social-media-with-a-personal-newsletter',
      '/how-to-replace-social-media-with-a-personal-newsletter',
    ],
    ['/posts/slow-travel-in-paris-discovering-substance-cafe', '/slow-travel'],
    // Not migrated — redirect to /contraption
    [
      '/posts/hacking-dopamine-for-entrepreneurial-success-lessons-from-neuroscience',
      '/contraption',
    ],
    [
      '/posts/openai-the-path-for-openai-powered-startups-and-the-ai-hype-cycle',
      '/contraption',
    ],
  ]
  for (const [source, destination] of cases) {
    const resp = await request.get(source, { maxRedirects: 0 })
    expect(resp.status()).toBe(308)
    expect(resp.headers().location).toBe(destination)
  }
})

test('redirected postcard URL resolves to a real page', async ({ page }) => {
  await page.goto('/posts/what-i-m-up-to-january-2025')
  await expect(page).toHaveURL('/2025-01')
  await expect(page.locator('h1')).toHaveText("What I'm up to - January 2025")
})

test('redirected contraption URL resolves to a real page', async ({ page }) => {
  await page.goto('/posts/advice-for-marketplace-startups')
  await expect(page).toHaveURL('/advice-for-marketplace-startups')
  await expect(page.locator('h1')).toContainText('Advice')
})

test('terms page loads', async ({ page }) => {
  await page.goto('/terms')
  await expect(page).toHaveTitle(/Terms of Service/)
  await expect(page.locator('h1')).toHaveText('Terms of Service')
})

test('privacy page loads', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page).toHaveTitle(/Privacy Policy/)
  await expect(page.locator('h1')).toHaveText('Privacy Policy')
})

test('contraption.co legacy redirects', async ({ request }) => {
  const cases: [string, string][] = [
    ['/projects', '/'],
    ['/security', '/policies'],
    ['/cancellation', '/policies'],
    ['/recruitment', '/policies'],
    ['/rss', '/feed/rss.xml'],
  ]
  for (const [source, destination] of cases) {
    const resp = await request.get(source, { maxRedirects: 0 })
    expect(resp.status()).toBe(308)
    expect(resp.headers().location).toBe(destination)
  }
})

test('new content pages load', async ({ page }) => {
  await page.goto('/policies')
  await expect(page.locator('h1')).toHaveText('Policies')

  await page.goto('/contact')
  await expect(page.locator('h1')).toHaveText('Contact')

  await page.goto('/blogroll')
  await expect(page.locator('h1')).toHaveText('Blogroll')

  await page.goto('/media')
  await expect(page.locator('h1')).toHaveText('Media')

  await page.goto('/audio')
  await expect(page.locator('h1')).toHaveText('Audio')
})

test('press page shows retired notice', async ({ page }) => {
  await page.goto('/press')
  await expect(page.locator('h1')).toHaveText('Print Edition')
  await expect(
    page.locator('a[href="/introducing-the-print-edition"]')
  ).toBeVisible()
})

test('sitemap includes pages and posts', async ({ request }) => {
  const resp = await request.get('/sitemap.xml')
  expect(resp.status()).toBe(200)
  expect(resp.headers()['content-type']).toContain('application/xml')
  const body = await resp.text()
  expect(body).toContain('/terms')
  expect(body).toContain('/privacy')
  expect(body).toContain('/contraption')
  expect(body).toContain('/workshop')
  expect(body).toContain('/postcard')
  expect(body).toContain('/policies')
  expect(body).toContain('/blogroll')
  expect(body).toContain('/media')
  expect(body).toContain('/contact')
  expect(body).toContain('/audio')
  expect(body).toContain('/press')
})
