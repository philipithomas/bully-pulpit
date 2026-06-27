---
name: copyedit
description: Copyedit MDX posts in content/ by adding relevant internal links and making light style-guide edits. Use when asked to copyedit, polish mechanically, add internal links, or apply the philipithomas.com colophon style guide to a blog post.
---

# Copyedit

Copyedit one MDX post for philipithomas.com. Make the smallest edits that satisfy the house style and internal-linking rules. Preserve the author's voice, structure, and meaning.

## Input

Use the MDX file path supplied by the user. If no path is provided, ask which file to copyedit. Resolve relative paths from the repository root. The target should normally be under `content/contraption/`, `content/workshop/`, or `content/postcard/`.

## Workflow

1. Read the full target post.
2. Read `content/pages/colophon.mdx`, especially the style guide section.
3. Read `content/pages/diction.mdx`; preserve words from the diction list and other precise, vivid word choices.
4. Build an internal-link index from `content/contraption/*.mdx`, `content/workshop/*.mdx`, and `content/postcard/*.mdx`. For each file, strip the date prefix and `.mdx` extension to get the slug, and read the frontmatter title. Exclude the target post.
5. Scan the target post body for linkable mentions of other posts:
   - Link exact or near-exact title matches.
   - Link distinctive proper nouns or product names from titles.
   - Link topic references that clearly point to a specific post.
   - Do not link generic words, existing links, headings, image alt text, or code blocks.
   - Do not add more than one link to the same post.
6. Make light style edits only:
   - Fix contractions.
   - Replace em dashes with other punctuation.
   - Remove the word `very`.
   - Add missing Oxford commas.
   - Remove exclamation points.
   - Replace `+` used in prose with `and`.
   - Fix `it is not X, it is Y` constructions.
   - Remove royal `we`.
   - Normalize dates to ISO-8601 when straightforward.
   - Convert imperial units to metric when straightforward.
7. Do not rewrite sentences for general improvement, change paragraph order, add or remove sections, alter meaning, or edit frontmatter unless the frontmatter itself violates the style guide.
8. Apply edits with the repo's normal file-editing workflow.

## Report

After editing, briefly report:

- Internal links added, with targets.
- Style edits made, grouped by rule.
- If no changes were needed, say so.

Do not paste a full diff.
