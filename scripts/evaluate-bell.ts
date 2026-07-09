import fs from 'node:fs'
import path from 'node:path'
import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import {
  BELL_FALLBACK_MODEL_IDS,
  BELL_MODEL_ID,
  bellReasoning,
  bellStopWhen,
  bellTools,
  getBellProviderOptions,
  prepareBellStep,
} from '@/lib/chat/bell-generation'
import { bellEvalCases } from '@/lib/chat/evals/cases'
import { runDeterministicBellEvals } from '@/lib/chat/evals/deterministic'
import { getPageContextContent } from '@/lib/chat/page-context'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { formatBellSmsBody } from '@/lib/phone/bell-sms'

interface CliOptions {
  models: string[]
  output: string | null
  caseIds: Set<string>
}

function usage(): string {
  return [
    'Usage: pnpm bell:eval:live [options]',
    '',
    'Options:',
    '  --models <ids>  Comma-separated Gateway model IDs',
    '  --case <id>      Run one case. Repeat to run several cases',
    '  --output <path>  Write the Markdown report to a file',
    '  -h, --help       Show this help',
  ].join('\n')
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    models: [BELL_MODEL_ID, ...BELL_FALLBACK_MODEL_IDS],
    output: null,
    caseIds: new Set(),
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '-h' || argument === '--help') {
      console.log(usage())
      process.exit(0)
    }
    if (argument === '--models') {
      options.models = requireValue(argv, index, argument)
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean)
      index++
      continue
    }
    if (argument === '--case') {
      options.caseIds.add(requireValue(argv, index, argument))
      index++
      continue
    }
    if (argument === '--output') {
      options.output = requireValue(argv, index, argument)
      index++
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }

  if (options.models.length === 0)
    throw new Error('At least one model is required')
  return options
}

function exactModelProviderOptions(surface: 'web' | 'sms', caseId: string) {
  const providerOptions = getBellProviderOptions({
    surface,
    pseudonymousUser: `bell-eval:${caseId}`,
  })
  const { models: _fallbackModels, ...gatewayOptions } = providerOptions.gateway
  return {
    ...providerOptions,
    gateway: gatewayOptions,
  }
}

function quoted(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      'bell:eval:live requires AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN'
    )
  }

  const deterministic = await runDeterministicBellEvals()
  const failures = deterministic.filter((result) => !result.passed)
  if (failures.length > 0) {
    throw new Error('Run pnpm bell:eval and fix deterministic failures first')
  }

  const cases = bellEvalCases.filter(
    (testCase) => options.caseIds.size === 0 || options.caseIds.has(testCase.id)
  )
  if (cases.length === 0) throw new Error('No Bell evaluation cases selected')

  const unknownCases = [...options.caseIds].filter(
    (caseId) => !bellEvalCases.some((testCase) => testCase.id === caseId)
  )
  if (unknownCases.length > 0) {
    throw new Error(`Unknown Bell evaluation case: ${unknownCases.join(', ')}`)
  }

  const report = [
    '# Bell model comparison',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Models: ${options.models.join(', ')}`,
    `Cases: ${cases.map((testCase) => testCase.id).join(', ')}`,
    '',
    'The deterministic Bell contract suite passed before these generations ran.',
  ]
  let generationFailures = 0

  for (const testCase of cases) {
    report.push('', `## ${testCase.category}: ${testCase.id}`, '')
    report.push(`Prompt: ${testCase.prompt}`, '', 'Review:')
    for (const item of testCase.review) report.push(`- [ ] ${item}`)

    const pageContent = testCase.page?.content
      ? {
          slug: `eval-${testCase.id}`,
          title: testCase.page.title,
          content: testCase.page.content,
          truncated: false,
        }
      : getPageContextContent(testCase.page?.path)
    const system = getSystemPrompt({
      surface: testCase.surface,
      pageContext: testCase.page,
      pageContent,
    })
    const prompt =
      testCase.surface === 'sms'
        ? `Here is the recent SMS history with this visitor.\n\nVisitor: ${testCase.prompt}`
        : testCase.prompt

    for (const modelId of options.models) {
      const startedAt = performance.now()
      try {
        const result = await generateText({
          model: gateway(modelId),
          reasoning: bellReasoning,
          providerOptions: exactModelProviderOptions(
            testCase.surface,
            testCase.id
          ),
          maxOutputTokens: 2048,
          system,
          prompt,
          tools: bellTools,
          stopWhen: bellStopWhen,
          prepareStep: prepareBellStep,
        })
        const tools = Array.from(
          new Set(
            result.steps.flatMap((step) =>
              step.toolCalls.map((call) => call.toolName)
            )
          )
        )
        const answer =
          testCase.surface === 'sms'
            ? formatBellSmsBody(result.text)
            : result.text

        report.push(
          '',
          `### ${modelId}`,
          '',
          `- Duration: ${Math.round(performance.now() - startedAt)} ms`,
          `- Finish reason: ${result.finishReason}`,
          `- Tools: ${tools.length > 0 ? tools.join(', ') : 'none'}`,
          '',
          quoted(answer)
        )
      } catch (error) {
        generationFailures++
        const message = error instanceof Error ? error.message : String(error)
        report.push(
          '',
          `### ${modelId}`,
          '',
          `- Duration: ${Math.round(performance.now() - startedAt)} ms`,
          '- Generation error',
          '',
          quoted(message)
        )
      }
    }
  }

  const markdown = `${report.join('\n')}\n`
  if (options.output) {
    const outputPath = path.resolve(options.output)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, markdown)
    console.log(`Wrote ${outputPath}`)
  } else {
    process.stdout.write(markdown)
  }
  if (generationFailures > 0) {
    console.error(`${generationFailures} live Bell generation(s) failed`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error(usage())
  process.exit(1)
})
