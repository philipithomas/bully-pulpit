---
name: copyedit
description: Copyedit an MDX post — add internal links to other posts mentioned in the text, and lightly edit for style following the colophon style guide.
user_invocable: true
argument: file path to the MDX post (relative or absolute)
---

# Copyedit

You are copyediting an MDX blog post for philipithomas.com.

## Input

The user provides a file path as the argument: `$ARGUMENTS`

If no argument is provided, ask the user which file to copyedit.

Resolve the path relative to the project root (`/Users/philip/code/working/bully-pulpit/`) if it is not absolute. The file should be an MDX file in `content/contraption/`, `content/workshop/`, or `content/postcard/`.

## Steps

### 1. Read the target post

Read the full contents of the file.

### 2. Read the style guide

Read `content/pages/colophon.mdx` and pay close attention to the **Style guide** section. The rules are:

- Active voice
- No contractions
- No em dashes (use other punctuation instead)
- Never use the word "very"
- Avoid exclamation points
- Oxford commas (always use the serial comma)
- Sentence case for titles
- Do not use "+" in place of "and"
- No redundant questions
- Dates in ISO-8601 format
- Units in metric, temperatures in Celsius
- Assume international readers (country codes on phone numbers, country in addresses)
- Never use the structure "it is not (this), it is (that)"
- Avoid the royal "we"

### 3. Build the internal link index

Glob for all MDX files across `content/contraption/*.mdx`, `content/workshop/*.mdx`, and `content/postcard/*.mdx`. For each file:

- Extract the slug from the filename by stripping the date prefix (`YYYY-MM-DD-`) and extension (`.mdx`). Example: `2026-02-02-openclaw-is-my-new-coworker.mdx` becomes slug `openclaw-is-my-new-coworker`, URL `(/openclaw-is-my-new-coworker)`.
- Read the frontmatter `title` field from each file (you can do this efficiently by reading just the first 10 lines of each file).
- Build a lookup of post titles and slugs. Also note distinctive keywords or proper nouns in titles (e.g., "OpenClaw", "Booklet", "Postcard", "Frctnl", "Chroma", "Moonlight", "Almost Perfect", "Workshop", "Printing Press", "Toolbox", "Mac Mini").

Exclude the target post itself from the index.

### 4. Find linkable mentions

Scan the post body (not frontmatter) for mentions of other posts. Look for:

- Exact or near-exact title matches (case-insensitive)
- Distinctive proper nouns or product names that appear in post titles (e.g., "OpenClaw", "Booklet", "Frctnl", "Chroma")
- Topic references that clearly refer to a specific post (e.g., "mini data center" referring to the "A mini data center" post)

**Do NOT link:**
- Generic words that happen to appear in titles (e.g., do not link every use of "work" just because a post has "work" in the title)
- Mentions that are already linked (check for existing `[text](/slug)` or `<a>` markup)
- More than one link to the same post — link the first meaningful mention only
- Mentions inside headings, image alt text, or code blocks

When adding a link, use standard MDX/Markdown link syntax: `[visible text](/slug)`. Preserve the author's original phrasing as the visible text.

### 5. Preserve interesting diction

Read the author's diction list at `content/pages/diction.mdx`. This is a collection of words the author values and considers part of his voice. When copyediting:

- **Never simplify or replace** words that appear on the diction list (e.g., do not change "disparate" to "different", "sanguine" to "optimistic", "rigmarole" to "hassle")
- **Never simplify or replace** other unusual, precise, or vivid word choices, even if they are not on the list. The author's style favors specific and interesting diction over plain language. Words like "enigmatic", "conceivably", "meticulously", "surmises" are intentional choices, not errors.
- If in doubt about whether a word is intentionally chosen or a mistake, leave it alone.

### 6. Style review

Review the post for style guide violations. Make **light, surgical edits** only. You are a copyeditor, not a rewriter. Preserve the author's voice, structure, and meaning. Specifically:

- Fix contractions (e.g., "don't" to "do not")
- Replace em dashes (—) with alternative punctuation
- Remove the word "very"
- Fix missing Oxford commas
- Remove exclamation points (replace with periods, or rephrase)
- Fix "+" used in place of "and"
- Fix the "it is not X, it is Y" pattern
- Fix the royal "we" (replace with "I" or rephrase)
- Correct non-ISO date formats if present in prose
- Convert imperial units to metric if straightforward

**Do NOT:**
- Rewrite sentences for "improvement" beyond the style rules
- Change the structure or flow of the post
- Add or remove paragraphs
- Change the meaning or emphasis of any sentence
- Modify frontmatter (title, description, etc.) unless it contains a style violation
- Add comments, annotations, or suggestions — just make the edits

### 7. Apply edits

Use the Edit tool to apply all changes to the file. Group related edits logically.

### 8. Report

After editing, give the user a brief summary:

- Number of internal links added, with the link targets
- Number of style edits made, grouped by rule (e.g., "2 contractions fixed, 1 em dash replaced")
- If no changes were needed, say so

Do not show a full diff — the user can review with `git diff`.
