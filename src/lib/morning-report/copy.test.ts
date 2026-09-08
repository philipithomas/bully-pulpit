import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importActual) => ({
  ...(await importActual<typeof import('ai')>()),
  generateText: vi.fn(),
}))

import { generateText } from 'ai'
import { buildMorningReportContent } from '@/lib/morning-report/content'
import {
  generateMorningReportCopy,
  MORNING_REPORT_MODEL,
} from '@/lib/morning-report/copy'

const content = buildMorningReportContent('2026-09-08', {
  posts: [],
  words: [{ term: 'Word', definition: 'A definition.' }],
  contraptions: [{ term: 'Tool', definition: 'A useful object.' }],
})
beforeEach(() => vi.clearAllMocks())
describe('morning report creative copy', () => {
  it('uses Astra with bounded retries, structured output, high reasoning and ZDR-compatible provider fallback', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        subject: 'A small discovery',
        preheader: 'Words and tools',
        introduction: 'Good morning.',
      },
      response: { modelId: MORNING_REPORT_MODEL },
      providerMetadata: {},
    } as never)
    expect(await generateMorningReportCopy(content)).toMatchObject({
      model: MORNING_REPORT_MODEL,
      copy: { subject: 'A small discovery' },
    })
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: 'high',
        maxRetries: 2,
        timeout: 120_000,
        maxOutputTokens: 16_384,
        providerOptions: {
          openai: { reasoningSummary: null },
          gateway: {
            zeroDataRetention: true,
            order: ['openai'],
            tags: ['feature:morning-report', 'surface:email'],
          },
        },
        prompt: JSON.stringify(content),
      })
    )
  })
  it('rejects empty or multiline subjects so malformed output follows the retry/fallback path', async () => {
    for (const subject of ['', 'Good\nBcc: someone@example.com']) {
      vi.mocked(generateText).mockResolvedValue({
        output: {
          subject,
          preheader: 'A preview',
          introduction: 'Good morning.',
        },
        response: { modelId: MORNING_REPORT_MODEL },
      } as never)
      await expect(generateMorningReportCopy(content)).rejects.toThrow()
    }
  })
})
