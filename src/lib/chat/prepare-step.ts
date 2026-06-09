/**
 * Per-step adjustments for the Bell chat agent.
 *
 * The final-step branch disables tools AND says so in the system prompt.
 * gpt-oss keeps trying to call tools that silently disappear, and the unbound
 * call JSON ({"slug":...}) streams into the visible reply — observed live, so
 * the instruction is load-bearing, not decoration.
 */

const FORCE_PROSE_AFTER_STEPS = 5

const HIGH_REASONING = { openai: { reasoningEffort: 'high' } }

const FINAL_STEP_NOTE = `## Final step

Your research budget is used up and the searchPosts and fetchPost tools are disabled. Do not attempt any tool call; it will not run, and the call text would appear in your reply. Write your complete final answer now in prose, based only on what you already retrieved.`

type StepLike = { toolCalls: ReadonlyArray<{ toolName: string }> }

export function prepareChatStep(steps: readonly StepLike[], system: string) {
  if (steps.length >= FORCE_PROSE_AFTER_STEPS) {
    return {
      activeTools: [],
      system: `${system}\n\n${FINAL_STEP_NOTE}`,
      providerOptions: HIGH_REASONING,
    }
  }

  const hasSearched = steps.some((step) =>
    step.toolCalls.some((tc) => tc.toolName === 'searchPosts')
  )
  if (hasSearched) {
    return { providerOptions: HIGH_REASONING }
  }
  return undefined
}
