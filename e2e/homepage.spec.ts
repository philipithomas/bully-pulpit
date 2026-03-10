import { expect, test } from '@playwright/test'

test('homepage has correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Philip I. Thomas')
})

test('homepage has h1', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('h1')
  await expect(h1).toHaveText('Philip I. Thomas')
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
