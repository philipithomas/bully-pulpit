import { gateway } from '@ai-sdk/gateway'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { checkBotId } from 'botid/server'
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

  // Rate-limit by IP first (cheap), then run the bot check.
  if (!(await checkRateLimit('chat', `ip:${ip}`, request))) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429 }
    )
  }

  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  // Cap the conversation the model sees — the client accumulates history in
  // sessionStorage, and an unbounded array is an easy token-burn vector.
  const { pageContext, userName } = body
  const messages = body.messages.slice(-40)

  const result = streamText({
    model: gateway('openai/gpt-oss-120b'),
    maxOutputTokens: 2048,
    experimental_telemetry: { isEnabled: true, functionId: 'bell-chat' },
    providerOptions: {
      // Experiment: pin gpt-oss-120b to Cerebras (fastest provider). Runs on
      // AI Gateway credits — no BYOK, no OPENAI_API_KEY.
      gateway: {
        only: ['cerebras'],
      },
      openai: {
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
              reasoningEffort: 'high',
            },
          },
        }
      }

      if (hasSearched) {
        return {
          providerOptions: {
            openai: {
              reasoningEffort: 'high',
            },
          },
        }
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
