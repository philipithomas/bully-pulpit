const baseUrl =
  process.env.WORKFLOW_SMOKE_BASE_URL ?? process.env.VERCEL_BRANCH_URL
const secret = process.env.CRON_SECRET

if (!baseUrl || !secret) {
  console.error(
    'Usage: WORKFLOW_SMOKE_BASE_URL=https://<deployment> CRON_SECRET=<secret> pnpm workflow:smoke'
  )
  process.exit(1)
}

const url = new URL(
  '/api/cron/workflow-smoke',
  baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
)
const response = await fetch(url, {
  method: 'POST',
  headers: { authorization: `Bearer ${secret}` },
})
const text = await response.text()
console.log(text)

if (!response.ok) {
  process.exit(1)
}

export {}
