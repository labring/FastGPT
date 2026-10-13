# Complete English Documentation

Status: Completed and verified on 2026-10-13. See [the review index](./english-review.md) for all page results and acceptance evidence.

## Intended outcome

Provide complete, natural English documentation for every agreed public documentation surface. Use the Chinese to English Translator workflow to preserve meaning, technical facts, numbers, URLs, and code while improving English prose. The requested scope includes historical content.

## Verified baseline

The official documentation belongs to this repository's `document` package. The marketing website links to it as an external site. The documentation already supports Chinese and English routes, navigation, and search through Next.js and Fumadocs.

Inventory on 2026-10-13, based on `document/content`:

| Area | Chinese MDX files | English counterparts |
| --- | ---: | ---: |
| guide | 74 | 74 |
| self-host | 162 | 162 |
| openapi | 5 | 5 |
| plugin | 5 | 5 |
| faq | 2 | 2 |
| toc | 1 | 1 |
| Total | 249 | 249 |

The counts include landing and redirect pages. All English files are tracked in Git. There are also 39 paired navigation metadata files. The upgrade section contains 131 version records plus an upgrade guide and a version timeline; 69 entries are archived under `outdated`.

Representative English pages contain translated prose and serve successfully with English HTML language and canonical metadata. File coverage was already complete at baseline; semantic and media-guidance gaps drive the editorial work below.

Confirmed content gaps:

- `content/self-host/troubleshooting/model-errors.en.mdx` omits the Chinese page's two-stage tool-call tests and vector retrieval score guidance.
- `content/self-host/upgrading/4-14/4148.en.mdx` omits the Chinese page's `SANDBOX_TOKEN` configuration guidance.
- A preliminary comparison flags 18 page pairs with different heading, code-fence, or table counts. These differences are review leads; prose restructuring can legitimately change those counts.

Media and linked surfaces:

- English MDX files contain 492 Markdown image references across 94 pages. Image URL sequences match in 246 of the 249 page pairs.
- The shared quick-start image at `public/imgs/guide/getting-started/quick-start/image-01.png` contains Chinese interface labels.
- Workflow documentation links to a Bilibili video. Navigation also links to `https://video.fastgpt.cn/videos` and `https://solutions.fastgpt.cn/`.
- Application-generated API documentation at `/apidoc/devapi` and `/apidoc/systemopenapi` is a separate content surface outside the MDX inventory.

## Accepted decisions

The user accepted all three recommendations on 2026-10-13.

1. **Surface boundary.** Cover all 249 documentation pages, including historical upgrades, all 39 navigation metadata pairs, and the documentation site's reader-facing interface. The external video site, solutions site, and application-generated API documentation remain separate content surfaces. Their link labels and surrounding guidance on the documentation site are in scope.
2. **Existing English.** Audit every page, retain passages that meet the agreed standard, and use the Chinese to English Translator workflow to rewrite missing, outdated, or unnatural passages.
3. **Media acceptance.** Retain existing media and provide complete English procedures, captions, and explanations of instructional video content. Readers must be able to follow documented procedures using the English text. Shared screenshots and linked videos retain their original language.

The user's acceptance of all three recommendations settled the interview frontier and confirmed shared understanding. The concrete implementation and verification plan below carries out that accepted scope using the existing architecture.

## Implementation boundary

| Surface | Planned work | Verification |
| --- | --- | --- |
| `document/content/**/*.en.mdx` | Read all 249 source/counterpart pairs; repair omissions, inaccurate or unnatural prose, weak media guidance, and broken English links | Per-page review record, English regression check, MDX compilation, rendered pages |
| `document/content/**/meta.en.json` | Review all 39 English navigation metadata files and their page ordering | Existing reference checker, English regression check, rendered navigation |
| `document/i18n/en/common.json` and locale-aware layouts/components | Review reader-facing labels, search, table of contents, page controls, dialogs, and accessibility labels | Rendered English UI and search scenarios |
| `document/components/sideBar.tsx` | Localize the confirmed Chinese external-link accessibility label using the existing locale context | Type check and rendered accessible label |
| `document/app/[lang]/(docs)/[...slug]/page.tsx` and `document/app/sitemap.xml/route.ts` | Use the physical locale file for GitHub editing and modification dates | Existing sitemap regression plus all 249 generated English pages |
| `document/script/` | Add one focused English regression entry point using repository dependencies; retain existing reference and sitemap checks | A passing repository run plus small failing-input fixtures for new validation logic |
| `.agents/design/documentation/english-review.md` | Record one result per source/counterpart pair, including reviewed passages retained and corrected issues | All 249 pages have completed review outcomes |

The layouts involved in the UI review are `document/app/[lang]/layout.tsx` and `document/app/[lang]/(docs)/layout.tsx`. The existing search dialog, language switcher, upgrade timeline, and media components provide the necessary behavior. Source changes follow confirmed review findings.

The effective article link renderer is `createRelativeLink(source, page)` in `document/app/[lang]/(docs)/[...slug]/page.tsx`; it overrides the default link mapping from `mdx-components.tsx`. Fix verified content-link failures at their authored links while retaining the routing architecture.

Confirmed link corrections to include:

- `guide/build/publish/link.en.mdx` emits a raw relative `.en.mdx#response` URL whose intended API page also lacks that fragment. Link to the actual relevant English API reference section after verifying its current content.
- `self-host/upgrading/outdated/4813.en.mdx` retains a Chinese fragment for an English page. Its current English target is `/en/guide/build/general/fileInput#changes-to-file-upload-in-version-4813`.

## Editorial acceptance

- Read each complete Chinese source and English counterpart before making its review decision. Every prerequisite, action, warning, example, limitation, and version-specific setting must have an accurate English equivalent.
- Use direct, natural technical English and the existing product glossary. Preserve suitable existing prose and established technical names.
- Keep executable identifiers, API fields, numeric values, environment variable names, version labels, resource URLs, and code syntax stable. Translate explanatory comments and documentation prompt examples with their constraints intact; check any example whose behavior depends on matching human-readable strings.
- Preserve historical version context and caveats. Assess extra English statements against the source and available technical evidence.
- Review all 94 illustrated English pages. Add useful captions or steps where the current English explanation leaves actions dependent on Chinese labels in the image. Preserve already complete explanations and shared asset files.
- Explain instructional video content using verified source material. English readers must be able to complete the documented operation from the page text; optional video links keep clear labels.
- Retain healthy route paths and heading anchors. Validate language and fragments when correcting internal documentation links. Preserve deployment download paths and other non-page resources.
- Keep review status, translation provenance, and workflow notes in the design/review records. Public pages carry reader-facing guidance.

### Example of the accepted rewrite style

The missing V4.14.8 configuration guidance would read:

> fastgpt-sandbox now supports an optional authentication token. To use it, add `SANDBOX_TOKEN` to fastgpt-sandbox and to the corresponding FastGPT and FastGPT Pro services.

Its accompanying configuration example will retain the source's environment variable names and values, with English explanatory comments.

## Reuse and constraints

- Use the existing language routes, navigation structure, and search support.
- Preserve technical parity, version caveats, executable examples, configuration names, and existing healthy URLs.
- Reuse product terminology from `.agents/skills/system/i18n-translate/references/fastgpt-glossary.json`; the documentation glossary is in `document/CONTEXT.md`.
- The existing `document/i18n.js` skips existing English files and points at an older content directory. Its current behavior does not implement semantic synchronization.
- Preserve existing local changes in `document/lib/docs-locale.js`, `document/lib/fastgpt-home-url.ts`, and `document/middleware.ts`.

## Verification and execution environment

The existing `checkDocRefs.js` passes for 498 MDX files and all navigation metadata. The existing sitemap test passes both cases. These are baseline results, before content implementation.

The reference checker accepts either language when resolving a page and skips external URLs and fragments. The text lint configuration excludes English MDX and uses Chinese technical-writing rules. The new focused English check must therefore cover paired pages and navigation, inappropriate Chinese prose outside justified technical/proper-name cases, English internal targets, and actual rendered target fragments. Semantic completeness and naturalness are recorded through the page-by-page review.

For rendered acceptance, inspect the English quick start, a workflow guide, model troubleshooting, API introduction, V4.14.8, archived V4.8.13, and corrected publishing links. Exercise navigation, search, language switching, media guidance, accessible labels, canonical metadata, and target fragments. Validate internal English targets across the whole in-scope content set; use these representative pages for interactive behavior.

Documentation dependencies have been installed with the existing frozen lockfile and workspace resolution. The validation entry points are:

```bash
pnpm --filter @fastgpt/document install --frozen-lockfile --ignore-scripts
pnpm --dir document checkDocEnglish
node document/script/checkDocRefs.js
node --test document/script/sitemap-locale.test.js
pnpm --dir document exec fumadocs-mdx
pnpm --dir document exec tsc --noEmit --incremental false
FASTGPT_HOME_DOMAIN=https://fastgpt.io NEXT_PUBLIC_FASTGPT_HOME_DOMAIN=https://fastgpt.io NEXT_TELEMETRY_DISABLED=1 pnpm --dir document build
```

The focused English regression command includes its failing-input checks. Full documentation-package validation passed after the final content changes. The documentation uses a standalone Next.js build.

Use targeted formatting for changed files. The repository's broad formatting, table-of-contents refresh, timestamp refresh, image deletion, and commit hooks can change additional files; inspect any resulting diff and preserve unrelated work. The production workflow also rewrites asset hosts in a copied source tree, so any exact CI reproduction belongs in a temporary copy.

## Delivery

Deliver the source changes, a completed per-page review record, the runnable English regression entry point, and production-build/interactive verification results. Live deployment remains a separate release operation.

## TODO

- [x] Locate the authoritative documentation source and existing language support.
- [x] Inventory paired content and identify concrete parity gaps.
- [x] Record the documentation glossary and pending decisions.
- [x] Resolve the three decisions above with the user.
- [x] Complete the implementation design and verifiable execution plan.
- [x] Confirm shared understanding before content implementation.
- [x] Prepare the documentation dependencies using the existing lockfile.
- [x] Review and repair the 18 structural-drift candidates, then review every remaining page; maintain the 249-page review record.
- [x] Complete navigation, English UI, media-guidance, and internal-link review; apply only confirmed corrections.
- [x] Implement the focused English regression check and its failing-input cases.
- [x] Run complete documentation checks, the IO production build, and rendered/interactive acceptance.
- [x] Review the final diff against the accepted scope and deliver the results.
