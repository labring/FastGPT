# FastGPT documentation

The documentation uses Next.js, Fumadocs, and paired Chinese/English MDX content. The reader entrances are **Use FastGPT**, **Developers**, and **Deploy and Operate**.

## Run locally

Use the repository's Node and pnpm versions. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --dir document dev
```

Set `FASTGPT_HOME_DOMAIN` in `document/.env.local` to `https://fastgpt.cn` or `https://fastgpt.io` to select the deployment's primary locale. The Chinese production owner is `https://doc.fastgpt.cn`; the English owner is `https://doc.fastgpt.io`. Local previews support both `/zh-CN/` and `/en/` paths.

## Write paired content

Content lives in `document/content/`. Pair `topic.mdx` with `topic.en.mdx`, and pair `meta.json` with `meta.en.json`. Keep technical prerequisites, procedures, examples, limits, and expected outcomes equivalent. English instructions must remain understandable when a shared screenshot uses Chinese labels.

Follow [the domain glossary](./CONTEXT.md). Use these page contracts:

- Task: goal, prerequisites, interface path and steps, expected outcome, troubleshooting, next task.
- Reference: responsibility, inputs, configuration, outputs, boundaries, verified example.
- Concept: object relationships, selection criteria, links to tasks and references.

Frontmatter supports `title`, `description`, `icon`, `releaseTime`, `sidebarTag`, and `upgradeTags`. Quote values containing a colon. Use descriptive image alt text, inspect media for credentials and private data, and keep research screenshots separate from approved public assets.

```mdx
---
title: Choose an application type
description: Choose Chat Agent, Chat Agent V2, or Workflow for a task.
---

[Continue to your first workflow](/en/guide/getting-started/first-workflow)
```

Use explicit locale routes for internal content links. Preserve useful heading IDs when reorganizing sections. Existing links should reach the same topic or a precise successor. For a justified consolidation, add a direct permanent redirect in `document/middleware.ts` and update callers. Deployment YAML edits require explicit user confirmation.

## Navigation and discovery

`content/meta.json` and `content/meta.en.json` own the three section roots. Fumadocs metadata supports cross-directory references, `...folder` expansion, and `!entry` exclusions. Put each substantive page in one section. The normalized source tree supplies sidebar, section selection, breadcrumbs, and adjacent-page navigation.

Keep historical release pages at their existing URLs with version-specific titles and descriptions. Current API task guides link to application-generated System OpenAPI and Dev API. Frozen handwritten parameters live in `content/openapi/legacy/` with reciprocal current-guide links.

Canonical URLs and language alternates use each locale's production host. The sitemap follows the configured primary locale; `/<locale>/llms.txt` exports the requested language. Search uses Fumadocs's locale-aware index.

## Validate changes

```bash
pnpm --dir document check:docs
pnpm --dir document test:checks
pnpm --dir document typecheck
pnpm --dir document build
```

The local checks include shell expansion of the API curl examples with a stubbed curl function; they make no API request.

For HTTP acceptance, start the site, then run:

```bash
DOCS_TEST_ORIGIN=http://localhost:3210 pnpm --dir document test:site
```

Use a browser to inspect both editions: first-task links, cross-directory section ownership, search results, language switching, keyboard access, mobile navigation, tables, and media. Production-host routing tests send explicit Host headers to the local server.

Record per-topic disposition, semantic review, evidence, and runtime limitations with the [reconstruction inventory](../.agents/design/documentation/reconstruction-pages.csv). Published-media inspection levels and removals are tracked in the [media inventory](../.agents/design/documentation/reconstruction-public-media.csv). A structural check establishes structural coverage; source review and a successful product execution are separate evidence levels. Full repository tests follow final user acceptance.

Reuse the [UTM attribution contract](./UTM_ATTRIBUTION.md) for links to the FastGPT marketing sites.
