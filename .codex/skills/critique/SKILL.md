---
name: critique
description: Give critical editorial feedback on an MDX post without editing it. Use when asked to critique a philipithomas.com blog draft for argument, structure, pacing, voice, style-guide fit, or fit within the site's existing body of work.
---

# Critique

Review one MDX post for philipithomas.com as a critical editor. Do not edit the file. Provide honest, specific feedback that helps the author decide what to rewrite.

## Input

Use the MDX file path supplied by the user. If no path is provided, ask which file to critique. Resolve relative paths from the repository root. The target should normally be under `content/contraption/`, `content/workshop/`, or `content/postcard/`.

## Context To Gather

1. Read the full target post and note its newsletter from the directory:
   - `contraption`: essays and launches.
   - `workshop`: work-in-progress notes and shorter reflections.
   - `postcard`: monthly personal updates.
2. Read the style guide section of `content/pages/colophon.mdx`. Use it to identify distracting patterns, not stray mechanical issues.
3. Read 4-6 other posts to calibrate the author's voice and quality bar:
   - 2-3 posts from the same newsletter.
   - 1-2 thematically related posts.
   - 1 strong post, preferring `featured: true` when available.
4. Build an internal-link index from `content/contraption/*.mdx`, `content/workshop/*.mdx`, and `content/postcard/*.mdx`. Extract each slug by stripping the date prefix and `.mdx` extension, and read each frontmatter title. Use this index to identify repeated topics and missed internal-link opportunities.

## What To Evaluate

### Argument And Ideas

- Identify the core thesis. Say whether it is clear and whether the post earns it.
- Quote unsupported, vague, or hand-wavy claims.
- Note repetition, missing evidence, missed opportunities, and whether the post has a real "so what".

### Structure And Pacing

- Assess whether the opening is concrete and whether it earns attention.
- Evaluate the arc, pacing, drag, padding, and ending.
- For longer posts, identify likely reader drop-off points.

### Voice And Consistency

- Compare the draft to the author's established first-person, reflective voice.
- Flag passages that feel generic, too formal, too casual, too hedged, or too breathless.
- Call out cliches, dead metaphors, or borrowed-feeling phrases.

### Fit Within The Site

- Say whether the draft belongs in its newsletter.
- Identify prior posts that overlap with or deepen the topic.
- Note where the draft repeats old ground or should link to earlier work.

### Style Guide Patterns

Only flag style issues when they are frequent or distracting. Do not turn the critique into a copyedit.

## Response Shape

Lead with the most important problems. Use short sections:

- Argument and ideas
- Structure and pacing
- Voice and consistency
- Fit within the site
- Style guide flags
- Strongest and weakest parts

Quote the single strongest passage and the single weakest passage, and explain why each works or fails. Do not suggest specific rewrites unless the user explicitly asks.
