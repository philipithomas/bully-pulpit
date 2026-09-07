import { generateText, isStepCount } from 'ai'
import {
  BELL_GENERATION_MAX_RETRIES,
  BELL_MAX_OUTPUT_TOKENS,
} from '@/lib/chat/bell-generation'
import {
  bellModel,
  getBellProviderOptions,
  getBellReasoning,
} from '@/lib/chat/bell-model'
import { fetchPage } from '@/lib/chat/fetch-page-tool'

/** Exercise the deployed SMS model, archive tool, and ZDR route without delivery. */
export async function bellSmokeStep() {
  'use step'
  const result = await generateText({
    model: bellModel,
    reasoning: getBellReasoning('sms'),
    providerOptions: getBellProviderOptions({ surface: 'sms' }),
    maxOutputTokens: BELL_MAX_OUTPUT_TOKENS,
    maxRetries: BELL_GENERATION_MAX_RETRIES,
    abortSignal: AbortSignal.timeout(60_000),
    prompt:
      'Read the homepage with fetchPage using path "/", then identify whose website this is in one sentence.',
    tools: { fetchPage },
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? { toolChoice: 'required' as const }
        : { toolChoice: 'none' as const, activeTools: [] },
  })
  if (!result.text.trim() || result.finishReason !== 'stop') {
    throw new Error('Bell smoke did not produce a complete answer')
  }
  const archiveRead = result.steps.some((step) =>
    step.toolResults.some((tool) => {
      if (
        tool.dynamic ||
        tool.toolName !== 'fetchPage' ||
        tool.input.path !== '/'
      ) {
        return false
      }
      try {
        const page = JSON.parse(tool.output)
        return (
          page?.type === 'page' &&
          page.url === '/' &&
          typeof page.title === 'string' &&
          page.title.length > 0 &&
          typeof page.content === 'string' &&
          page.content.length > 0
        )
      } catch {
        return false
      }
    })
  )
  if (!archiveRead) throw new Error('Bell smoke did not read the archive tool')
  if (
    !result.steps.every(
      (step) =>
        step.providerMetadata?.gateway?.enabledZeroDataRetention === true
    )
  ) {
    throw new Error('Bell smoke did not confirm zero data retention')
  }
  return {
    model: result.response.modelId,
    steps: result.steps.length,
    archiveRead,
    zeroDataRetention: true,
    checkedAt: new Date().toISOString(),
  }
}

bellSmokeStep.maxRetries = 1

export async function bellSmokeWorkflow() {
  'use workflow'
  return bellSmokeStep()
}
