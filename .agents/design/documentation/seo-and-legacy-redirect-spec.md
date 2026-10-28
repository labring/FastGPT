# Documentation Site SEO and Legacy URL Migration Specification

Date: 2026-10-28 (Asia/Shanghai)

Status: Synthesized from the documentation SEO and legacy URL migration audit. Issue tracker publication awaits repository tracker and triage-label setup via `/setup-matt-pocock-skills`.

Intended triage label: `ready-for-agent`.

## Problem Statement

Readers, search engines, and AI retrieval systems reach the FastGPT Documentation site through bookmarks, external backlinks, search results, product help links, and repository READMEs accumulated across multiple documentation generations. Following the reconstruction of the Documentation site around three reader entrances (**Use FastGPT**, **Developers**, and **Deploy and Operate**), several routing, indexing, international discovery, and on-page metadata gaps affect search visibility and link equity consolidation:

1. Four section landing routes (`guide`, `openapi`, `plugin`, and `faq`) retain client-side redirect stub pages alongside partial middleware rules. The `plugin` root landing serves an HTTP 200 empty document that relies on client-side navigation, and all four stub pages plus the HTML directory index page appear in the XML sitemap and machine-readable LLM export.
2. Historical URLs from earlier documentation hierarchies (granular FAQ topics, legacy model configuration pages, JSON configuration guides, pre-4.12 upgrade notes under legacy prefixes, early 4.15.0 upgrade notes, legacy system-plugin guides, sandbox node guides, application case studies, and custom-domain team pages) resolve to HTTP 404 after middleware prefix transformation.
3. Product help links, OpenAPI metadata examples, and multilingual README files point to legacy or locale-unqualified documentation URLs that require one or two redirect hops before reaching canonical destinations.
4. Language root routes issue temporary redirects (HTTP 307) at the entrance boundary.
5. The robot exclusion rules restrict Bing on the English production host and restrict Googlebot alongside a Yandex-specific host directive on the Chinese production host, narrowing search engine indexing and AI search citation coverage.
6. Multilingual metadata and the XML sitemap declare `zh-CN` and `en` alternates while needing the `x-default` fallback annotation and sitemap `<xhtml:link>` alternate entries.
7. The generated directory index page emits bare Chinese paths and retains `/index` suffixes that return HTTP 404.
8. Five bilingual page pairs render a second H1 heading inside the article body below the page title H1, four title pairs share generic labels (`Introduction`, `介绍`, `FAQ`, `常见问题`), roughly one hundred Chinese source pages carry brief descriptions under twenty characters, the JSON-LD publisher logo references `/logo.svg`, and article metadata relies on layout defaults for social preview images.

## Solution

Consolidate all legacy URL handling into single-hop server-side HTTP 301 permanent redirects at the request-routing boundary, align technical indexing signals across both production hosts (`doc.fastgpt.cn` for Chinese source pages and `doc.fastgpt.io` for English counterparts), and standardize on-page metadata and structured data with full Technical parity:

1. Handle all section landing redirects and historical path migrations directly in the request middleware with single-hop HTTP 301 responses, retire client-side redirect stub pages, and keep the XML sitemap and `llms.txt` export strictly limited to canonical substantive topics.
2. Complete the legacy exact and prefix redirect maps for all historical FAQ, deployment, model configuration, upgrade, plugin, workflow node, and example routes, ordered from most specific prefix to broadest prefix.
3. Update product help links, OpenAPI examples, and repository README links to point directly to their canonical destination paths.
4. Issue permanent HTTP 301 redirects for language root routes (`/[lang]`) to the default getting-started entrance.
5. Allow full crawler access for standard search engines and AI search crawlers on both production documentation hosts while restricting internal `/api/` search endpoints in `robots.txt`.
6. Declare `x-default` language alternates in page metadata and include full reciprocal `<xhtml:link rel="alternate" />` entries (`zh-CN`, `en`, and `x-default`) in the XML sitemap.
7. Generate canonical locale-prefixed URLs in the directory index generator with `/index` suffixes stripped.
8. Demote duplicate in-body H1 headings to H2, qualify generic page titles with their domain topic, expand short meta descriptions with task and capability keywords, point JSON-LD `TechArticle` publisher logos to the existing site icon asset, and include OpenGraph and Twitter preview images on every documentation page.

## User Stories

1. As a returning reader following a bookmarked `/docs/...` URL, I want a single server-side HTTP 301 redirect to the current canonical topic URL with query parameters preserved, so that my browser opens the target guide immediately.
2. As a search engine crawler visiting `/zh-CN/plugin` or `/en/plugin`, I want a direct HTTP 301 redirect to the plugin introduction topic, so that link equity transfers directly to the substantive guide.
3. As a search engine crawler visiting `/zh-CN/guide`, `/zh-CN/openapi`, or `/zh-CN/faq`, I want the server-side HTTP 301 redirect to serve as the sole routing mechanism, so that redirect stubs stay out of the content inventory.
4. As a search engine crawler reading `sitemap.xml`, I want every listed `<loc>` URL to return HTTP 200 and match its self-referencing canonical URL, so that indexing coverage reports remain clean.
5. As an AI agent or LLM ingestion pipeline fetching `/{lang}/llms.txt`, I want the export to contain only substantive documentation topics in the requested language, so that context tokens are spent on real product guidance.
6. As a reader following a historical link to `/faq/app` or `/introduction/FAQ/app`, I want a direct HTTP 301 redirect to the application-building FAQ page, so that I land on application troubleshooting answers.
7. As a reader following a historical link to `/faq/dataset` or `/introduction/FAQ/dataset`, I want a direct HTTP 301 redirect to the Knowledge base FAQ page, so that I land on retrieval and indexing answers.
8. As a reader following a historical link to `/faq/external_channel_integration` or `/introduction/FAQ/external_channel_integration`, I want a direct HTTP 301 redirect to the application publishing guide, so that I find third-party channel instructions.
9. As a reader following a historical link to `/faq/other` or `/faq/points_consumption`, I want a direct HTTP 301 redirect to the cloud service FAQ page, so that I find billing and account answers.
10. As a reader following a historical link to `/introduction/FAQ/chat`, I want the `/introduction/FAQ` prefix rule to resolve to `/faq/chat`, so that conversation troubleshooting links stay working.
11. As a reader following a historical link to `/introduction/FAQ/docker`, `/introduction/FAQ/error`, or `/introduction/FAQ/privateDeploy`, I want a direct HTTP 301 redirect to the self-hosted troubleshooting FAQ page, so that deployment troubleshooting links reach operator guidance.
12. As a deployment operator following a historical link to `/self-host/config/json` or `/introduction/development/configuration`, I want a direct HTTP 301 redirect to the environment configuration reference, so that I reach the current configuration documentation.
13. As a deployment operator following a historical link to `/introduction/development/modelConfig/...`, I want a direct HTTP 301 redirect to the corresponding `/self-host/config/model/...` route, so that model setup links stay valid.
14. As a deployment operator following a historical link to `/self-host/config/model/ai-proxy`, `/self-host/config/model/one-api`, or `/self-host/config/model/ppio`, I want a direct HTTP 301 redirect to the model configuration overview, so that retired provider pages lead to current model setup guidance.
15. As a deployment operator following a historical link to `/introduction/development/proxy/cloudflare`, `/introduction/development/proxy/http_proxy`, or `/introduction/development/proxy/nginx`, I want a direct HTTP 301 redirect to the Docker deployment or troubleshooting guide, so that reverse-proxy bookmarks land on active operator documentation.
16. As a deployment operator following a historical link to `/self-host/upgrading/4-15/4150`, I want a direct HTTP 301 redirect to `/self-host/upgrading/4-15/41500`, so that 4.15.0 upgrade links open the Archived upgrade guide.
17. As a deployment operator following a historical link to `/introduction/development/upgrading/{40..4111}`, I want a direct HTTP 301 redirect to `/self-host/upgrading/outdated/{40..4111}`, so that pre-4.12 upgrade bookmarks resolve to their archived version notes.
18. As a workflow builder following a historical link to `/guide/build/workflow/nodes/sandbox`, `/introduction/guide/dashboard/workflow/sandbox`, or `/guide/build/workflow/nodes/laf`, I want a direct HTTP 301 redirect to the current code sandbox node guide, so that code-execution bookmarks reach the active node reference.
19. As a tool user following a historical link to `/guide/build/tools/system-plugins/{bing_search_plugin,doc2x_plugin_guide,google_search_plugin_guide,searxng_plugin_guide}`, I want a direct HTTP 301 redirect to the team plugin installation guide, so that individual plugin bookmarks reach the unified marketplace installation workflow.
20. As an application builder following a historical link to `/use-cases/app-cases/...`, I want a direct HTTP 301 redirect to the getting-started examples section, so that historical case-study links lead to maintained tutorials.
21. As a team administrator following a historical link to `/introduction/guide/team_permissions/customDomain`, I want a direct HTTP 301 redirect to `/guide/workspace/customDomain`, so that custom-domain bookmarks reach the workspace domain guide.
22. As an application builder following a historical link to `/introduction/guide/course/{collection_tags,welcomeText,voiceInput}`, I want a direct HTTP 301 redirect to the corresponding Collection tags or general configuration guide, so that early course links resolve cleanly.
23. As a FastGPT product user clicking the share-link documentation link in the publishing interface, I want the link to request `/guide/build/publish/link` directly, so that the help page opens in a single request.
24. As a GitHub visitor clicking documentation links in any repository README, I want the links to use the canonical locale path on the target documentation domain, so that navigation reaches the destination in a single request.
25. As a visitor requesting `/zh-CN` or `/en`, I want an HTTP 301 permanent redirect to `/zh-CN/guide/getting-started` or `/en/guide/getting-started`, so that search engines consolidate root-level authority into the primary landing page.
26. As a user or AI search assistant querying Bing, ChatGPT Search, Copilot, or Google for FastGPT documentation in English or Chinese, I want `robots.txt` on both `doc.fastgpt.io` and `doc.fastgpt.cn` to permit crawling of all documentation pages and restrict `/api/`, so that both language editions are indexed and cited accurately.
27. As an international search engine indexing `doc.fastgpt.cn` and `doc.fastgpt.io`, I want every page's HTML head and XML sitemap entry to include reciprocal `zh-CN`, `en`, and `x-default` (`https://doc.fastgpt.io/en/...`) alternate links alongside a self-referencing canonical tag, so that regional search results serve the matching language edition.
28. As a documentation reader or crawler visiting the directory index (`/zh-CN/toc` or `/en/toc`), I want every listed link to include its locale prefix and use the clean canonical slug, so that every link on the directory page returns HTTP 200 directly.
29. As a search engine or screen-reader user reading any documentation article, I want a single H1 heading supplied by the page title and H2-and-below headings in the article body, so that the document outline follows a clear hierarchy.
30. As a search user comparing FastGPT Cloud, Community Edition, Skill, and Application FAQ pages in search results, I want each page to have a distinct, topic-qualified `<title>` and a descriptive 50–155 character meta description, so that I can identify the exact page before clicking.
31. As a search engine parsing page structured data, I want a valid `TechArticle` and `BreadcrumbList` JSON-LD payload whose publisher logo URL resolves to an existing SVG/PNG asset on the documentation host, so that rich result validation succeeds.
32. As a developer sharing a deep documentation link in a chat channel or social platform, I want the page metadata to include OpenGraph and Twitter card preview image tags, so that shared links render with the official FastGPT visual card.

## Implementation Decisions

1. **Unified server-side permanent redirect boundary.** The request middleware owns all legacy URL resolution and section landing redirects. Every legacy path, `/docs/*` prefixed path, and section root shorthand (`/guide`, `/openapi`, `/plugin`, `/faq`, `/use-cases`, `/upgrading`, `/development`, `/introduction`) resolves through the iterative redirect resolver and returns a single-hop HTTP 301 response to the final canonical locale-prefixed URL, preserving query parameters. Language root requests (`/[lang]`) also return HTTP 301 to the localized default home path.

2. **Retirement of client-side redirect stubs and soft-404 helpers.** Remove the four pairs of client-side redirect stub pages (`guide`, `openapi`, `plugin`, `faq`) and the client-side redirect helper components. Update the navigation checker's compatibility-landing set to track only the directory index utility page, and keep every route in the page loader inventory as a substantive content page.

3. **Comprehensive historical route mapping.** Extend the middleware exact and prefix redirect maps to cover all verified historical routes from earlier documentation layouts. Order prefix rules from longest/most specific prefix to shortest prefix so nested legacy paths (`/introduction/FAQ`, `/introduction/development/modelConfig`, `/introduction/development/upgrading`, `/introduction/guide/team_permissions/customDomain`) match their specific targets before general `/introduction` or `/introduction/development` prefixes run:

```ts
// Prototype-verified redirect rule additions (trimmed to decision-critical mappings)
const exactMapAdditions = {
  '/plugin': '/plugin/intro',
  '/faq/app': '/guide/build/faq',
  '/faq/dataset': '/guide/dataset/faq',
  '/faq/external_channel_integration': '/guide/build/publish',
  '/faq/other': '/guide/version/cloud/faq',
  '/faq/points_consumption': '/guide/version/cloud/faq',
  '/self-host/config/json': '/self-host/config/env',
  '/introduction/development/configuration': '/self-host/config/env',
  '/self-host/config/model/ai-proxy': '/self-host/config/model/intro',
  '/self-host/config/model/one-api': '/self-host/config/model/intro',
  '/self-host/config/model/ppio': '/self-host/config/model/intro',
  '/self-host/upgrading/4-15/4150': '/self-host/upgrading/4-15/41500',
  '/guide/build/workflow/nodes/sandbox': '/guide/build/workflow/nodes/sandbox-v2',
  '/guide/build/workflow/nodes/laf': '/guide/build/workflow/nodes/sandbox-v2',
  '/guide/build/tools/system-plugins/bing_search_plugin': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/doc2x_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/google_search_plugin_guide': '/plugin/team-installation',
  '/guide/build/tools/system-plugins/searxng_plugin_guide': '/plugin/team-installation',
  '/introduction/guide/team_permissions/customDomain': '/guide/workspace/customDomain',
  '/introduction/guide/course/collection_tags': '/guide/dataset/collection_tags',
  '/introduction/guide/course/welcomeText': '/guide/build/general/welcomeText',
  '/introduction/guide/course/voiceInput': '/guide/build/general/voiceInput'
};
```

   For pre-4.12 upgrade notes accessed via `/self-host/upgrading/{40..4111}` (after `/introduction/development` prefix expansion), resolve two-to-four-digit version slugs prior to `4120` directly to `/self-host/upgrading/outdated/{slug}`. Map `/use-cases/app-cases` prefix to `/guide/getting-started/examples` and `/introduction/development/modelConfig` prefix to `/self-host/config/model`.

4. **Canonical link hygiene across product and repository references.** Update the share-link help target in the application publishing UI from `/openapi/share` to `/guide/build/publish/link`, update the OpenAPI marketplace example URL from `/docs/plugin` to `/en/plugin/intro`, and align documentation links in root README files and system constants with their owning domain and canonical path.

5. **Clean XML sitemap and `llms.txt` discovery outputs.** Filter `toc` out of `sitemap.xml` and `llms.txt` so both machine-readable discovery endpoints emit only canonical, indexable documentation articles. Declare `xmlns:xhtml="http://www.w3.org/1999/xhtml"` in `sitemap.xml` and attach `<xhtml:link rel="alternate" hreflang="zh-CN" .../>`, `<xhtml:link rel="alternate" hreflang="en" .../>`, and `<xhtml:link rel="alternate" hreflang="x-default" .../>` (pointing to the `https://doc.fastgpt.io/en/...` counterpart) to every `<url>` entry.

6. **Open crawler policy in `robots.txt`.** Configure `robots.txt` on both `doc.fastgpt.cn` and `doc.fastgpt.io` with `User-Agent: *`, `Allow: /`, `Disallow: /api/`, and `Sitemap: ${domain}/sitemap.xml`, enabling indexing by Google, Bing, Baidu, and AI search crawlers while relying on self-referencing canonicals and reciprocal `hreflang` tags for cross-domain language targeting.

7. **Multilingual `x-default` metadata and social preview completeness.** Add `'x-default'` (pointing to the English production URL on `doc.fastgpt.io`) to `alternates.languages` in both the locale root layout and article `generateMetadata`. In article `generateMetadata`, include `openGraph.images` (`/og-image.png`, 1200x630), `openGraph.modifiedTime` (derived from the physical locale file's last-modified timestamp), and `twitter` (`summary_large_image` with title, description, and `/og-image.png`).

8. **Structured data accuracy.** Update the article JSON-LD generator to emit `@type: 'TechArticle'` and reference `${domain}/favicon/favicon.svg` for `publisher.logo.url`.

9. **Directory index generation (`toc.mdx` / `toc.en.mdx`).** Update the TOC generation script so Chinese URLs include the `/zh-CN` prefix and both Chinese and English URLs strip trailing `/index` segments, then regenerate both TOC files.

10. **On-page heading hierarchy, distinct titles, and enriched descriptions.**
    - Convert in-body `#` H1 headings to `##` H2 headings across the five bilingual page pairs (`fileInput`, `quoteList`, `team_roles_permissions`, legacy `chat` API reference, and self-host troubleshooting attention notes).
    - Disambiguate the four colliding title pairs with topic-qualified titles in Chinese and English (`FastGPT 云服务介绍` / `FastGPT Cloud Overview`, `FastGPT 社区版介绍` / `FastGPT Community Edition Overview`, `Skill 技能简介` / `Skills Overview`, `应用构建常见问题` / `Application Building FAQ`, and `云服务常见问题` / `FastGPT Cloud FAQ`).
    - Expand frontmatter `description` fields that have fewer than twenty characters in Chinese source pages (and any overly brief English counterparts) into 45–150 character task-oriented summaries that naturally include primary feature keywords while maintaining Technical parity.

## Testing Decisions

1. **Primary verification seam.** Reuse the existing two-part documentation verification gate as the single acceptance seam:
   - **Static content and route-handler gate**: runs the documentation package's reference checker, English counterpart checker, navigation ownership checker, and isolated sitemap/robots unit tests.
   - **Rendered HTTP and HTML acceptance gate**: exercises the built documentation server over HTTP to verify status codes, `Location` headers on legacy 301 and cross-host 308 redirects, canonical and `hreflang` (`zh-CN`, `en`, `x-default`) `<link>` tags, JSON-LD `TechArticle` and `BreadcrumbList` scripts, HTTP 404 + `noindex` responses on unknown routes, `robots.txt` directives, `sitemap.xml` structure, and `/{locale}/llms.txt` exports.

2. **What makes a good test.** Tests assert externally observable HTTP responses, response headers (`status`, `location`, `content-type`), and rendered HTML/XML/plain-text contracts.

3. **Prior art.** Extend the existing documentation HTTP acceptance suite, sitemap locale unit test suite, navigation checker, and reference checker following their established `node:test` and `node:assert/strict` patterns. Add table-driven assertions covering historical route categories, single-H1 enforcement, unique localized titles, and `x-default` alternate links.

## Out of Scope

- Post-deployment Search Console property verification, sitemap submission operations in external webmaster portals, and external backlink outreach belong to production marketing operations.
- Rewriting substantive tutorial steps, changing the three-entrance sidebar hierarchy, or capturing new product screenshots belong to their respective content workstreams.
- Modifying deployment YAML manifests or container orchestration files belongs to infrastructure administration under the repository's deployment-configuration confirmation policy.

## Further Notes

- **Glossary alignment:** All title, description, and metadata updates follow the maintained definitions in the documentation glossary (`Application`, `Chat Agent`, `Chat Agent V2`, `Workflow`, `Tool`, `Workflow tool`, `Skill`, `MCP tool`, `MCP service`, `Knowledge base`, `Collection`, `Data chunk`, `Published version`, `Publishing channel`, `Team management`, `Platform administration`).
- **Issue tracker setup:** Run `/setup-matt-pocock-skills` to configure the project's issue tracker and triage-label mapping when ready to publish this specification to an external tracker with the `ready-for-agent` label.

## Todo

- [x] Add `/plugin` and all historical routes to the request middleware redirect maps (`exactMap`, `prefixMap`, and pre-4.12 upgrade version resolution), and convert `/[lang]` root redirects to HTTP 301.
- [x] Remove the 4 pairs of client-side redirect stub pages (`guide`, `openapi`, `plugin`, `faq`) and client-side redirect components, and update the navigation checker's compatibility-landing set.
- [x] Filter `toc` out of the XML sitemap and `llms.txt` route handlers, and add `xmlns:xhtml` with `zh-CN`, `en`, and `x-default` `<xhtml:link>` tags to `sitemap.xml`.
- [x] Update the `robots.txt` route handler to allow standard search and AI crawlers on both domains while restricting `/api/`.
- [x] Add `'x-default'` to `alternates.languages` in the locale layout and article metadata generator, and add OpenGraph/Twitter image and `modifiedTime` metadata to article pages.
- [x] Update the JSON-LD schema generator to emit `TechArticle` and use `${domain}/favicon/favicon.svg` for `publisher.logo.url`.
- [x] Update the TOC generator script to emit `/zh-CN` prefixes and strip `/index` suffixes, and regenerate both localized TOC pages.
- [x] Demote duplicate in-body `#` H1 headings to `##` across the 5 bilingual page pairs, disambiguate the 4 duplicate title pairs, and expand short frontmatter descriptions across bilingual pages.
- [x] Update direct documentation links in the application publishing UI, OpenAPI marketplace schema examples, and repository README files.
- [x] Expand the documentation HTTP acceptance suite and sitemap unit tests to verify all new SEO, redirect, and metadata contracts.
