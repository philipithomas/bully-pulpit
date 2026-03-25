import type { GatewayLanguageModelOptions } from '@ai-sdk/gateway'
import { gateway } from '@ai-sdk/gateway'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
import { searchPosts } from '@/lib/chat/search-posts-tool'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!checkRateLimit(`chat:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429 }
    )
  }

  const { messages, pageContext, userName } = await request.json()

  const result = streamText({
    model: gateway('openai/gpt-5.4-mini'),
    providerOptions: {
      gateway: {
        byok: {
          openai: [{ apiKey: process.env.OPENAI_API_KEY }],
        },
      } satisfies GatewayLanguageModelOptions,
      openai: {
        serviceTier: 'priority',
        reasoningEffort: 'low',
      },
    },
    system: getSystemPrompt({ pageContext, userName }),
    messages: await convertToModelMessages(messages),
    tools: { searchPosts, fetchPost },
    stopWhen: stepCountIs(7),
    prepareStep: ({ steps }) => {
      const hasSearched = steps.some((step) =>
        step.toolCalls.some((tc) => tc.toolName === 'searchPosts')
      )

      // On the last step, disable tools to force a prose response
      if (steps.length >= 5) {
        return {
          activeTools: [],
          providerOptions: {
            openai: {
              serviceTier: 'priority',
              reasoningEffort: 'high',
            },
          },
        }
      }

      if (hasSearched) {
        return {
          providerOptions: {
            openai: {
              serviceTier: 'priority',
              reasoningEffort: 'high',
            },
          },
        }
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
