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
public and synthetic prompts against Bell's production model and a fixed
`openai/gpt-5.4-mini` baseline. The report identifies which model is production,
which is the baseline, every model that actually ran, tool use, and a review
checklist for each answer. Per-model provider errors stay in the report, and the
command exits nonzero when any generation fails. Attach that report, or its
relevant sections, to the pull request.

`--models` replaces the default production/baseline pair. Use it to compare
other models or narrow a review:

```bash
pnpm bell:eval:live -- --models openai/gpt-5.6-luna,openai/gpt-5.4-mini --case print-current-page
```

The live runner reads only checked-in public content and synthetic fixtures. It
does not read stored Bell conversations or subscriber data.
