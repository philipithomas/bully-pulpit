import { gateway } from '@ai-sdk/gateway'
import {
  convertToModelMessages,
  type ModelMessage,
  stepCountIs,
  streamText,
} from 'ai'
import { checkBotId } from 'botid/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
import { getPageContextContent } from '@/lib/chat/page-context'
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
  // Narrow client-supplied fields at the trust boundary — they are
  // interpolated into the system prompt.
  const path =
    typeof body.pageContext?.path === 'string'
      ? body.pageContext.path
      : undefined
  const title =
    typeof body.pageContext?.title === 'string'
      ? body.pageContext.title
      : undefined
  const userName = typeof body.userName === 'string' ? body.userName : null

  // Cap the conversation the model sees — the client accumulates history in
  // sessionStorage, and an unbounded array is an easy token-burn vector.
  let messages: ModelMessage[]
  try {
    messages = await convertToModelMessages(body.messages.slice(-40))
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // When the visitor is on a known post or page, inject its content into the
  // system prompt so on-page questions answer without tool calls.
  const pageContent = getPageContextContent(path)
  const system = getSystemPrompt({
    pageContext: { path, title },
    pageContent,
    userName,
  })

  const result = streamText({
    // Runs on AI Gateway credits — no BYOK. Replaced gpt-oss-120b/Cerebras:
    // it leaked unbound tool-call JSON into the visible reply and made
    // redundant duplicate tool calls.
    model: gateway('anthropic/claude-haiku-4.5'),
    providerOptions: {
      // Gateway falls back to these models in order when the primary model
      // or its provider is unavailable.
      gateway: { models: ['openai/gpt-5.4-mini'] },
    },
    maxOutputTokens: 2048,
    // Stop upstream generation when the visitor hits Stop or disconnects.
    abortSignal: request.signal,
    // recordInputs/recordOutputs put full prompts and responses on the AI
    // spans in Vercel Observability (Project → Observability → AI). Flip
    // both to false to stop recording visitor messages.
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'bell-chat',
      recordInputs: true,
      recordOutputs: true,
      metadata: { path: path ?? 'unknown' },
    },
    system,
    messages,
    tools: { searchPosts, fetchPost },
    stopWhen: stepCountIs(7),
    // The last step runs without tools so the loop always ends in prose
    // instead of a dangling tool call.
    prepareStep: ({ stepNumber }) =>
      stepNumber >= 6 ? { activeTools: [] } : undefined,
  })

  return result.toUIMessageStreamResponse({
    // The default onError forwards raw error text (provider internals) to
    // the visitor. Log it server-side and send a friendly message instead.
    onError: (error) => {
      console.error('[chat] stream error:', error)
      return 'Something went wrong. Please try again.'
    },
  })
}
