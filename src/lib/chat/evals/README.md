# Bell evaluations

The checked-in cases in `cases.ts` cover current-page summaries, chronology,
cross-post synthesis, images, app-page discovery, honest no-result behavior,
citations and anchors, SMS formatting, and prompt injection.

## Deterministic CI suite

Run:

```bash
pnpm bell:eval
```

This command never calls a model or embedding service. It checks the local
corpus, registry, BM25 results, page resolvers, anchors, message sanitization,
and SMS formatter. GitHub Actions runs it on every pull request.

## Live model comparison

When Bell's model, prompt, tools, search corpus, or page registry changes, run:

```bash
pnpm bell:eval:live -- --output /tmp/bell-eval.md
```

The command uses `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` and runs the same
public and synthetic prompts against Bell's production model and the named
`openai/gpt-5.4-mini-fast` reference. This is a paired head-to-head at generation
time, not an immutable longitudinal snapshot: provider behavior behind either
Gateway model ID can change between runs. The report identifies which model is
production, which is the reference, every model that actually ran, tool use,
and a review checklist for each answer. Per-model provider errors stay in the
report, and the command exits nonzero when any generation fails. Attach that
report, or its relevant sections, to the pull request.

`--models` replaces the default production/reference pair. Use it to compare
other models or narrow a review:

```bash
pnpm bell:eval:live -- --models openai/gpt-5.6-luna-fast,openai/gpt-5.4-mini-fast --case print-current-page
```

Every evaluation requests [AI Gateway fast mode](https://vercel.com/docs/ai-gateway/models-and-providers/fast-mode),
including explicit `--models` overrides. Reasoning remains `high` for web and
`xhigh` for SMS, and routing remains restricted to OpenAI with zero data
retention. Gateway can fall back to the same base model at standard speed when
fast capacity is unavailable; an override without a fast tier runs at standard
speed. The existing web Priority hint is retained. Realtime voice,
transcription, speech generation, and embeddings are separate paths without
applicable verified fast aliases.

The live runner reads only checked-in public content and synthetic fixtures. It
does not read stored Bell conversations or subscriber data.
