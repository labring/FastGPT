# English Documentation Review Index

Scope confirmed on 2026-10-13: all 249 documentation page pairs, 39 navigation metadata pairs, and the documentation site's English interface. Existing screenshots and videos keep their original language; English procedures and captions supply the instructions readers need.

Status: Complete. Source validation, production build, generated HTML checks, and browser acceptance passed on 2026-10-13.

## Page and navigation coverage

| Cohort | Page pairs | Navigation pairs | Review record |
| --- | ---: | ---: | --- |
| Guide | 70 | 20 | [Guide review](./english-review-guide.md) |
| Guide long pages | 4 | Included above | [Long-page review](./english-review-guide-long.md) |
| Self-hosting, OpenAPI, plugins, FAQ | 41 | 12 | [Reference review](./english-review-reference.md) |
| Current and historical upgrades | 133 | 7 | [Upgrade review](./english-review-upgrading.md) |
| Documentation index | 1 | 0 | Recorded below |
| Total | 249 | 39 | All reviews complete |

Each cohort record identifies completed full source/counterpart reviews and the material content checked. A retained editorial outcome can still receive a mechanical internal-link repair during integration.

The ledger contains exactly 249 unique page results and 39 unique navigation results, matched against the source inventory. Editorial outcomes are 151 updated and 98 retained pages; navigation outcomes are eight updated and 31 retained files. Including mechanical link repairs, 165 English MDX files changed.

| Page under `document/content` | Result | Review evidence |
| --- | --- | --- |
| `toc.en.mdx` | Updated | Compared both complete generated indexes. Rewrote the English title/description and corrected five nonexistent `/index` links. Preserved all 242 healthy generated links and the existing index exclusions. Updated the generator to retain the corrected output. |

## Shared integration changes

- Normalize 86 verified relative English page links to their existing `/en/...` routes. The installed Fumadocs renderer resolves virtual `.mdx` paths, while `.en.mdx` and extensionless relative links were emitted unresolved. Retain fragments, media paths, downloads, external destinations, and healthy page routes.
- Correct the publishing response link to the actual `/en/openapi/chat#response` section and the archived V4.8.13 link to the English file-upload change heading.
- Use the physical `page.data._file.path` for GitHub editing, page modification dates, and sitemap modification dates. The normalized route path removes the `.en` suffix and previously selected the Chinese source file.
- Translate the sidebar's external-link accessibility label and polish the English last-updated label and metadata descriptions. Existing category navigation, search, language switcher, release timeline, contact dialog, and theme/page controls already provide English copy.
- Add `pnpm --dir document checkDocEnglish`, reusing the installed MDX parser and Fumadocs resolvers. It checks bilingual coverage, reader-facing Chinese residue, source release dates, English routes, and actual heading IDs. Tests exercise missing counterparts, wrong locales/index routes, invalid headings, physical/extensionless relative links, explicit IDs, code samples, and example endpoint URLs.

## Acceptance evidence

| Check | Result |
| --- | --- |
| `pnpm --dir document checkDocEnglish` | Four regression tests passed; 249 English pages, 39 navigation files, and 358 internal links passed. |
| `node document/script/checkDocRefs.js` | All 498 MDX files and all navigation metadata passed. |
| `node --test document/script/sitemap-locale.test.js` | Both sitemap/locale regression tests passed. |
| `pnpm --dir document exec fumadocs-mdx` | MDX types generated successfully. |
| `pnpm --dir document exec tsc --noEmit --incremental false` | Passed. |
| IO production build | Exit 0; all 505 static pages generated. Build used `FASTGPT_HOME_DOMAIN=https://fastgpt.io`, `NEXT_PUBLIC_FASTGPT_HOME_DOMAIN=https://fastgpt.io`, and `NEXT_TELEMETRY_DISABLED=1`. |
| Generated English HTML and sitemap | All 249 English pages have matching rendered titles, English HTML language, canonical URLs, both language alternates, physical English GitHub editing targets, and the correct English-source modification dates in Article schema and sitemap. |
| Browser acceptance against the final standalone build | Verified Quick Start, Workflow introduction, Model Troubleshooting, API introduction, V4.14.8, archived V4.8.13, Share Link Publishing, and Chat API. |
| Interactive flows | English search found the newly restored `authProxy` guidance and opened `/en/openapi/chat`; Chinese/English switching preserved that page. The Quick Start citation-limit link, archived file-upload link, and publishing response link reached their actual English heading IDs. |
| Media and accessibility | Quick Start renders all 40 original images with descriptive English labels and complete written steps. The sidebar announces `External link`; external Chinese videos and solutions are identified by language. |
| Diff and source preservation | `git diff --check` passed. Chinese content, shared image files, lockfile, and the user's three pre-existing routing-file changes remain unchanged by this task. |

The final standalone server was tested on local port 4187. The build retains the existing workspace-root inference warning caused by the separate `/Users/longnv/pnpm-lock.yaml`; compilation and standalone serving both succeed. The generated-HTML audit used system Python after the Homebrew Python XML extension failed to load; repository checks use the existing Node.js toolchain.

Existing English heading IDs are retained throughout, except the obsolete Agent V2 Dataset/file-upload section removed to match the current Chinese configuration scope. The same page drops its obsolete standalone-tool screenshot, and DingTalk Dataset regains two screenshots already present in the source. Shared asset files remain intact.

## Preserved source context and verification boundary

Source issues are listed with their affected pages in the cohort records. These include historical command inconsistencies, old deployment image examples, conflicting source release dates, and legacy terminology. Confirmed English drift has been corrected; source-derived historical limitations remain documented for technical owners.

Executable API calls, model services, database migrations, external provider UIs, and third-party video/solution sites are outside this documentation rendering check. The review preserves Chinese registered names, contributor handles, and intentional multilingual sample values where they identify the original entity or protocol example.

The existing local changes in `document/lib/docs-locale.js`, `document/lib/fastgpt-home-url.ts`, and `document/middleware.ts` belong to the user and are preserved. This delivery consists of local source changes and verification; deployment is a separate release action.

## Pull request integration with current upstream

Before opening the pull request, merged upstream commit `547b48fe5` into the reviewed branch. The original 249-page editorial ledger remains the record for its source snapshot. The integrated inventory includes eight additional bilingual pages and one additional navigation pair from upstream: 257 page pairs and 40 navigation pairs in total.

Resolved seven overlapping files while preserving upstream's current API authentication, SSO deployment, administrator navigation, model configuration, and object-storage behavior. Updated Dataset screenshot paths, retained English procedural context, and removed a duplicate SSO heading introduced by the merge. Fixed five invalid links in upstream's TokenDance, V4.16.2, and V4.17.1 pages and translated the number-unit example in V4.17.2.

Integration validation passed: four English regression tests; 257 pages, 40 navigation files, and 374 internal links; all 514 MDX references; both sitemap tests; MDX generation; TypeScript checking; and the Next.js 15.5.27 production build with all 522 pages generated. The build used the IO environment values listed above. The earlier full rendered-page and browser acceptance results apply to the pre-integration snapshot; interactive browser acceptance was not repeated for the newly imported upstream changes.
