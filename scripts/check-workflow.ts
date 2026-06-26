import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Trigger = {
  type?: string
  topic?: string
  consumer?: string
  retryAfterSeconds?: number
  initialDelaySeconds?: number
}

const root = process.cwd()
const workflowDir = join(root, 'src/app/.well-known/workflow/v1')

function fail(message: string): never {
  console.error(`[workflow:check] ${message}`)
  process.exit(1)
}

function readJson(path: string): unknown {
  if (!existsSync(path)) {
    fail(`Missing ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertFile(path: string) {
  if (!existsSync(path)) {
    fail(`Missing ${path}`)
  }
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} is not an object`)
  }
  return value as Record<string, unknown>
}

function assertQueueTrigger(
  value: unknown,
  topic: string,
  label: string
): void {
  const config = assertObject(value, label)
  const triggers = config.experimentalTriggers
  if (!Array.isArray(triggers)) {
    fail(`${label} has no experimentalTriggers array`)
  }

  const trigger = triggers.find(
    (candidate): candidate is Trigger =>
      Boolean(candidate) &&
      typeof candidate === 'object' &&
      (candidate as Trigger).type === 'queue/v2beta' &&
      (candidate as Trigger).topic === topic &&
      (candidate as Trigger).consumer === 'default' &&
      (candidate as Trigger).retryAfterSeconds === 5 &&
      (candidate as Trigger).initialDelaySeconds === 0
  )

  if (!trigger) {
    fail(`${label} is missing the ${topic} queue trigger`)
  }
}

function assertExport(
  manifestSection: unknown,
  file: string,
  name: string,
  label: string
) {
  const section = assertObject(manifestSection, label)
  const exportsForFile = assertObject(section[file], `${label}.${file}`)
  if (!exportsForFile[name]) {
    fail(`${label} is missing ${file}:${name}`)
  }
}

assertFile(join(workflowDir, 'flow/route.js'))
assertFile(join(workflowDir, 'step/route.js'))
assertFile(join(workflowDir, 'webhook/[token]/route.js'))

const config = assertObject(
  readJson(join(workflowDir, 'config.json')),
  'Workflow config'
)
assertQueueTrigger(config.workflows, '__wkf_workflow_*', 'Workflow handler')
assertQueueTrigger(config.steps, '__wkf_step_*', 'Step handler')

const manifest = assertObject(
  readJson(join(workflowDir, 'manifest.json')),
  'Workflow manifest'
)
assertExport(
  manifest.workflows,
  'src/workflows/send-newsletter.ts',
  'sendNewsletterWorkflow',
  'workflows'
)
assertExport(
  manifest.steps,
  'src/workflows/send-newsletter.ts',
  'enqueueRecipients',
  'steps'
)
assertExport(
  manifest.steps,
  'src/workflows/send-newsletter.ts',
  'sendBatch',
  'steps'
)
assertExport(
  manifest.workflows,
  'src/workflows/workflow-smoke.ts',
  'workflowSmokeWorkflow',
  'workflows'
)
assertExport(
  manifest.steps,
  'src/workflows/workflow-smoke.ts',
  'smokeStep',
  'steps'
)

if (process.env.CHECK_VERCEL_WORKFLOW_OUTPUT === '1') {
  const outputDir = join(
    root,
    '.vercel/output/functions/.well-known/workflow/v1'
  )
  const flowConfig = assertObject(
    readJson(join(outputDir, 'flow.func/.vc-config.json')),
    'Vercel flow function config'
  )
  const stepConfig = assertObject(
    readJson(join(outputDir, 'step.func/.vc-config.json')),
    'Vercel step function config'
  )

  assertQueueTrigger(
    flowConfig,
    '__wkf_workflow_*',
    'Vercel flow function config'
  )
  assertQueueTrigger(stepConfig, '__wkf_step_*', 'Vercel step function config')
}

console.log('[workflow:check] Workflow handlers and queue triggers are present')
