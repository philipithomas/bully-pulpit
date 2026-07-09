import { convertToModelMessages, type ModelMessage, streamText } from 'ai'
import { checkBotId } from 'botid/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  bellModel,
  bellProviderOptions,
  bellStopWhen,
  bellTools,
  prepareBellStep,
} from '@/lib/chat/bell-generation'
import { getPageContextContent } from '@/lib/chat/page-context'
import { sanitizeChatMessages } from '@/lib/chat/sanitize-messages'
import { sanitizePageTitle } from '@/lib/chat/sanitize-title'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  // The rate-limit check (a Vercel Firewall self-fetch), the BotID
  // classification call, and body parsing are independent. Both checks read
  // only request headers, so all three run concurrently instead of paying
  // two sequential network round trips before the model call starts.
  // Rejection precedence is unchanged: rate limit, then bot check, then body.
  const [allowed, { isBot }, body] = await Promise.all([
    checkRateLimit('chat', `ip:${ip}`, request),
    checkBotId(),
    request.json().catch(() => null),
  ])

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many messages. Please try again later.' },
      { status: 429 }
    )
  }

  if (isBot) {
    return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
  }

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  // Narrow client-supplied fields at the trust boundary — they are
  // interpolated into the system prompt. The path must look like a site path
  // (leading slash, then only letters, digits, hyphen, underscore, slash,
  // length-bounded); the title is made inert by sanitizePageTitle. Anything
  // invalid is silently dropped so the chat never fails over page context.
  const rawPath = body.pageContext?.path
  const path =
    typeof rawPath === 'string' &&
    rawPath.length <= 200 &&
    /^\/[a-zA-Z0-9/_-]*$/.test(rawPath)
      ? rawPath
      : undefined
  const title = sanitizePageTitle(body.pageContext?.title)
  const userName = typeof body.userName === 'string' ? body.userName : null

  // Sanitize before conversion: convertToModelMessages would turn a crafted
  // { role: 'system' } message in the client payload into a real system
  // message, so only user and assistant messages with expected part shapes
  // survive. The slice caps the conversation the model sees — the client
  // accumulates history in sessionStorage, and an unbounded array is an easy
  // token-burn vector.
  const sanitizedMessages = sanitizeChatMessages(body.messages).slice(-40)
  if (sanitizedMessages.length === 0) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  let messages: ModelMessage[]
  try {
    messages = await convertToModelMessages(sanitizedMessages)
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
    model: bellModel,
    providerOptions: bellProviderOptions,
    maxOutputTokens: 2048,
    // Stop upstream generation when the visitor hits Stop or disconnects.
    abortSignal: request.signal,
    // recordInputs/recordOutputs put full prompts and responses on the AI
    // spans in Vercel Observability (Project → Observability → AI). Flip
    // both to false to stop recording visitor messages.
    runtimeContext: { path: path ?? 'unknown' },
    telemetry: {
      isEnabled: true,
      functionId: 'bell-chat',
      recordInputs: true,
      recordOutputs: true,
      includeRuntimeContext: { path: true },
    },
    system,
    messages,
    tools: bellTools,
    stopWhen: bellStopWhen,
    prepareStep: prepareBellStep,
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
