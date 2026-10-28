# Documentation Site SEO and Legacy URL Migration Specification

Date: 2026-10-29 (Asia/Shanghai)

Status: Synthesized from the documentation SEO and legacy URL migration audit. Issue tracker publication awaits repository tracker and triage-label setup via `/setup-matt-pocock-skills`.

Intended triage label: `ready-for-agent`.

## Problem Statement

Readers, search engines, and AI retrieval systems reach the FastGPT Documentation site through bookmarks, external backlinks, search results, product help links, and repository READMEs accumulated across multiple documentation generations. Following the reconstruction of the Documentation site around three reader entrances (**Use FastGPT**, **Developers**, and **Deploy and Operate**), several routing, indexing, international discovery, structured data, and on-page metadata gaps affect search visibility and link equity consolidation:

1. Two legacy redirect target groups (`external_channel_integration` / `external-integration` and `app-cases`) resolve to directory paths (`/guide/build/publish` and `/guide/getting-started/examples`) that have no index document, causing HTTP 301 permanent redirects to land on HTTP 404 pages.
2. Historical URLs from earlier documentation generations—including recently merged topics (V4.16.3 Archived upgrade guide merged into V4.17.0, common sandbox configuration merged into OpenSandbox, Chat Agent V2 startup merged into the virtual-machine guide, deployment attention notes, SigNoz observability, and commercial shopping-cart intros), 66 subfoldered pre-4.12 Archived upgrade guides (`/upgrading/4-{8,9,10,11}/*`), intermediate-generation prefix groups (`/guide/dashboard`, `/guide/workbench`, `/guide/knowledge_base`, `/guide/plugins`, `/guide/DialogBoxes`, `/guide/team_permissions`, `/guide/course`, `/development/*`), and lowercase locale prefixes (`/zh-cn/*`, `/zh/*`)—resolve to HTTP 404.
3. Trailing-slash URLs (`/zh-CN/openapi/intro/`) and explicit `/index` suffix URLs bypass redirect normalization when a locale prefix is already present, allowing duplicate URL variants alongside the canonical slug.
4. Cross-host and locale-completion redirects at the middleware boundary emit HTTP 308 while legacy route redirects emit HTTP 301, and several product help links and localization strings omit the locale prefix, requiring an extra redirect hop.
5. Layout and article metadata reference a social preview image (`/og-image.png`) that is absent from static public assets, and `TechArticle` structured data omits the article `image` property.
6. `BreadcrumbList` structured data duplicates the root getting-started URL when rendering topics under **Use FastGPT** and drops intermediate hierarchy levels that lack standalone folder index documents.
7. The MDX relative-link wrapper overrides the localized link component without composing it, leaving bare root-relative links in Chinese source pages unlocalized in rendered HTML.
8. Utility directory pages (`toc`) and deprecated legacy reference pages (`deprecated: true`) remain indexable and included in static search exports alongside active guides, six bilingual page pairs share duplicate frontmatter descriptions (including a V4.16.0.2 version label typo), twenty-four embedded images have empty `alt` text, and a stray nested timestamp JSON file exists under the documentation package directory.

## Solution

Consolidate all legacy URL handling into single-hop server-side HTTP 301 permanent redirects at the request-routing boundary, align technical indexing signals across both production hosts (`doc.fastgpt.cn` for Chinese source pages and `doc.fastgpt.io` for English counterparts), and standardize on-page metadata and structured data with full Technical parity:

1. Point every legacy exact and prefix redirect rule to a verified, existing canonical documentation route that returns HTTP 200 in both language editions.
2. Expand the middleware redirect resolver to cover recently merged topics, subfoldered pre-4.12 Archived upgrade guides (`4-8`, `4-9`, `4-10`, `4-11`), intermediate-generation prefix hierarchies, and case-insensitive legacy locale prefixes (`/zh-cn`, `/zh`).
3. Normalize trailing slashes and trailing `/index` segments against the raw locale-stripped request path and standardize permanent redirects on HTTP 301 across legacy paths, language roots, trailing-slash normalization, and host-locale alignment.
4. Update remaining locale-unqualified documentation URLs in product UI configurations and localization dictionaries so every product link reaches its canonical destination in zero redirect hops.
5. Provide the 1200x630 OpenGraph and Twitter social preview image asset and include its absolute URL in both page metadata and `TechArticle` structured data.
6. Deduplicate `BreadcrumbList` structured data entries by URL and preserve section hierarchy labels for deep documentation pages.
7. Compose the localized link behavior into the MDX link resolver, qualify the remaining bare root-relative links in Chinese source pages, apply `noindex, follow` to the HTML directory index (`toc`) and deprecated pages (`deprecated: true`), exclude `toc` from the static search index export, and fix duplicate descriptions, empty image `alt` attributes, and stray build artifacts.

## User Stories

1. As a returning reader following a bookmarked `/docs/...` URL, I want a single server-side HTTP 301 redirect to the current canonical topic URL with query parameters preserved, so that my browser opens the target guide immediately.
2. As a search engine crawler visiting `/zh-CN/plugin` or `/en/plugin`, I want a direct HTTP 301 redirect to the plugin introduction topic, so that link equity transfers directly to the substantive guide.
3. As a search engine crawler visiting `/zh-CN/guide`, `/zh-CN/openapi`, or `/zh-CN/faq`, I want the server-side HTTP 301 redirect to serve as the sole routing mechanism, so that redirect stubs stay out of the content inventory.
4. As a search engine crawler reading `sitemap.xml`, I want every listed `<loc>` URL to return HTTP 200, include an ISO 8601 `<lastmod>` timestamp, and match its self-referencing canonical URL, so that indexing coverage reports remain clean.
5. As an AI agent or LLM ingestion pipeline fetching `/{lang}/llms.txt`, I want the export to contain only substantive documentation topics in the requested language, so that context tokens are spent on real product guidance.
6. As a reader following a historical link to `/faq/app` or `/introduction/FAQ/app`, I want a direct HTTP 301 redirect to the application-building FAQ page, so that I land on application troubleshooting answers.
7. As a reader following a historical link to `/faq/dataset` or `/introduction/FAQ/dataset`, I want a direct HTTP 301 redirect to the Knowledge base FAQ page, so that I land on retrieval and indexing answers.
8. As a reader following a historical link to `/faq/external_channel_integration`, `/introduction/FAQ/external_channel_integration`, or `/use-cases/external-integration`, I want a direct HTTP 301 redirect to an active Publishing channel topic that returns HTTP 200, so that I land on working publishing instructions.
9. As a reader following a historical link to `/faq/other` or `/faq/points_consumption`, I want a direct HTTP 301 redirect to the cloud service FAQ page, so that I find billing and account answers.
10. As a reader following a historical link to `/introduction/FAQ/chat`, I want the `/introduction/FAQ` prefix rule to resolve to `/faq/chat`, so that conversation troubleshooting links stay working.
11. As a reader following a historical link to `/introduction/FAQ/docker`, `/introduction/FAQ/error`, or `/introduction/FAQ/privateDeploy`, I want a direct HTTP 301 redirect to the self-hosted troubleshooting FAQ page, so that deployment troubleshooting links reach operator guidance.
12. As a deployment operator following a historical link to `/faq/attention` or `/docs/faq/attention`, I want a direct HTTP 301 redirect to the self-hosted deployment attention guide, so that pre-deployment checklists remain reachable.
13. As a deployment operator following a historical link to `/self-host/config/json`, `/introduction/development/configuration`, or `/self-host/configuration`, I want a direct HTTP 301 redirect to the environment configuration reference, so that I reach the current configuration documentation.
14. As a deployment operator following a historical link to `/introduction/development/modelConfig/...` or `/development/modelConfig/...`, I want a direct HTTP 301 redirect to the corresponding model configuration route, so that model setup links stay valid.
15. As a deployment operator following a historical link to `/self-host/config/model/ai-proxy`, `/self-host/config/model/one-api`, `/self-host/config/model/ppio`, or `/development/one-api`, I want a direct HTTP 301 redirect to the model configuration overview, so that retired provider pages lead to current model setup guidance.
16. As a deployment operator following a historical link to `/introduction/development/proxy/cloudflare`, `/introduction/development/proxy/http_proxy`, or `/introduction/development/proxy/nginx`, I want a direct HTTP 301 redirect to the Docker deployment guide, so that reverse-proxy bookmarks land on active operator documentation.
17. As a deployment operator following a historical link to `/self-host/upgrading/4-15/4150` or `/self-host/upgrading/4-16/4163`, I want a direct HTTP 301 redirect to the corresponding 4.15.0 or 4.17.0 Archived upgrade guide, so that consolidated release notes remain reachable.
18. As a deployment operator following a historical link to `/introduction/development/upgrading/{40..4111}` or subfoldered `/upgrading/4-{8,9,10,11}/{40..4111}`, I want a direct HTTP 301 redirect to `/self-host/upgrading/outdated/{40..4111}`, so that all pre-4.12 upgrade bookmarks resolve to their archived version notes.
19. As a deployment operator following a historical link to `/self-host/config/sandbox/common` or `/introduction/development/signoz`, I want a direct HTTP 301 redirect to the OpenSandbox configuration guide or the SigNoz observability guide, so that merged operator guides resolve cleanly.
20. As a workflow builder following a historical link to `/guide/build/workflow/nodes/sandbox`, `/introduction/guide/dashboard/workflow/sandbox`, or `/guide/build/workflow/nodes/laf`, I want a direct HTTP 301 redirect to the current code sandbox node guide, so that code-execution bookmarks reach the active node reference.
21. As an application builder following a historical link to `/guide/build/agentv2/startup`, I want a direct HTTP 301 redirect to the Chat Agent V2 virtual-machine and runtime guide, so that merged runtime lifecycle instructions open directly.
22. As a tool user following a historical link to `/guide/build/tools/system-plugins/{bing_search_plugin,doc2x_plugin_guide,google_search_plugin_guide,searxng_plugin_guide}`, I want a direct HTTP 301 redirect to the team plugin installation guide, so that individual plugin bookmarks reach the unified marketplace installation workflow.
23. As an application builder following a historical link to `/use-cases/app-cases/...`, I want a direct HTTP 301 redirect to an existing getting-started tutorial page that returns HTTP 200, so that historical case-study links lead to maintained tutorials.
24. As a reader following intermediate-generation URLs under `/guide/dashboard/...`, `/guide/workbench/...`, `/guide/knowledge_base/...`, `/guide/plugins/...`, `/guide/DialogBoxes/...`, `/guide/team_permissions/...`, `/guide/course/...`, `/development/...`, `/shopping_cart/intro`, or lowercase `/zh-cn/...` and `/zh/...` prefixes, I want a single-hop HTTP 301 redirect to the canonical topic, so that older community posts and issue links keep working.
25. As a crawler or user requesting a documentation URL with a trailing slash or `/index` suffix (such as `/zh-CN/openapi/intro/` or `/zh-CN/guide/getting-started/index`), I want a single-hop HTTP 301 redirect to the clean canonical URL without trailing slash or `/index`, so that duplicate URL variants are consolidated.
26. As a team administrator following a historical link to `/introduction/guide/team_permissions/customDomain`, I want a direct HTTP 301 redirect to `/guide/workspace/customDomain`, so that custom-domain bookmarks reach the workspace domain guide.
27. As an application builder following a historical link to `/introduction/guide/course/{collection_tags,welcomeText,voiceInput}`, I want a direct HTTP 301 redirect to the corresponding Collection tags or general configuration guide, so that early course links resolve cleanly.
28. As a FastGPT product user clicking documentation links in the application publishing UI, admin SSO configuration, marketplace, or localization prompts, I want every link to include its canonical locale prefix and target slug, so that the help page opens in a single request.
29. As a GitHub visitor clicking documentation links in any repository README, I want the links to use the canonical locale path on the target documentation domain, so that navigation reaches the destination in a single request.
30. As a visitor requesting `/`, `/zh-CN`, or `/en`, or hitting a production host without a matching locale prefix, I want an HTTP 301 permanent redirect to the canonical localized URL on the owning host, so that search engines consolidate authority consistently.
31. As a user or AI search assistant querying Bing, ChatGPT Search, Copilot, or Google for FastGPT documentation in English or Chinese, I want `robots.txt` on both `doc.fastgpt.io` and `doc.fastgpt.cn` to permit crawling of all documentation pages and restrict `/api/`, so that both language editions are indexed and cited accurately.
32. As an international search engine indexing `doc.fastgpt.cn` and `doc.fastgpt.io`, I want every page's HTML head and XML sitemap entry to include reciprocal `zh-CN`, `en`, and `x-default` (`https://doc.fastgpt.io/en/...`) alternate links alongside a self-referencing canonical tag, so that regional search results serve the matching language edition.
33. As a documentation reader or crawler visiting the directory index (`/zh-CN/toc` or `/en/toc`) or a deprecated reference page (`deprecated: true`), I want every link on the directory page to return HTTP 200 directly while the page itself carries `noindex, follow`, so that crawlers discover internal links while search results prioritize active documentation topics.
34. As a search engine or screen-reader user reading any documentation article, I want a single H1 heading supplied by the page title, H2-and-below headings in the article body, and descriptive `alt` text on every image, so that the document outline and visual media remain accessible and indexable.
35. As a search user comparing FastGPT Cloud, Community Edition, Skill, troubleshooting, and Archived upgrade guides in search results, I want each page to have a distinct, topic-qualified `<title>` and a unique frontmatter description, so that I can identify the exact page before clicking.
36. As a search engine parsing page structured data, I want valid `TechArticle` and deduplicated `BreadcrumbList` JSON-LD payloads whose publisher logo and article image URLs resolve to existing static assets on the documentation host, so that rich result validation succeeds.
37. As a developer sharing a deep documentation link in a chat channel or social platform, I want the OpenGraph and Twitter card preview image (`/og-image.png`) to return HTTP 200 with a 1200x630 visual card, so that shared links render properly.

## Implementation Decisions

1. **Unified server-side HTTP 301 permanent redirect boundary.** The request middleware owns all legacy URL resolution, section landing redirects, trailing-slash and `/index` stripping, and host-locale alignment. Every legacy path, `/docs/*` prefixed path, lowercase locale prefix (`/zh-cn`, `/zh`), and section root shorthand resolves through the iterative redirect resolver and returns a single-hop HTTP 301 response to the final canonical locale-prefixed URL on its owning production host, preserving query parameters.

2. **Retirement of client-side redirect stubs and soft-404 helpers.** Remove the four pairs of client-side redirect stub pages (`guide`, `openapi`, `plugin`, `faq`) and the client-side redirect helper components. Update the navigation checker's compatibility-landing set to track only the directory index utility page, and keep every route in the page loader inventory as a substantive content page.

3. **Comprehensive historical route mapping with verified HTTP 200 targets.** Ensure every redirect target in the middleware resolves to an existing page in both language editions. Map publishing channel legacy routes (`/faq/external_channel_integration`, `/introduction/FAQ/external_channel_integration`, `/use-cases/external-integration`) to `/guide/build/publish/versions` and legacy application case studies (`/use-cases/app-cases/*`) to `/guide/getting-started`. Extend the exact and prefix redirect maps to cover recently merged topics, intermediate-generation prefixes, and subfoldered pre-4.12 upgrade notes:

```ts
// Prototype-verified redirect rule additions (trimmed to decision-critical mappings)
const exactMapAdditions = {
  '/plugin': '/plugin/intro',
  '/faq/app': '/guide/build/faq',
  '/faq/dataset': '/guide/dataset/faq',
  '/faq/external_channel_integration': '/guide/build/publish/versions',
  '/faq/other': '/guide/version/cloud/faq',
  '/faq/points_consumption': '/guide/version/cloud/faq',
  '/faq/attention': '/self-host/troubleshooting/attention',
  '/shopping_cart/intro': '/guide/version/commercial',
  '/self-host/config/json': '/self-host/config/env',
  '/self-host/config/sandbox/common': '/self-host/config/sandbox/opensandbox',
  '/introduction/development/configuration': '/self-host/config/env',
  '/introduction/development/signoz': '/self-host/config/signoz',
  '/self-host/config/model/ai-proxy': '/self-host/config/model/intro',
  '/self-host/config/model/one-api': '/self-host/config/model/intro',
  '/self-host/config/model/ppio': '/self-host/config/model/intro',
  '/development/one-api': '/self-host/config/model/intro',
  '/development/docker': '/self-host/deploy/docker',
  '/development/sealos': '/self-host/deploy/sealos',
  '/development/intro': '/self-host/dev',
  '/self-host/upgrading/4-15/4150': '/self-host/upgrading/4-15/41500',
  '/self-host/upgrading/4-16/4163': '/self-host/upgrading/4-17/4170',
  '/guide/build/agentv2/startup': '/guide/build/agentv2/vm',
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

   For pre-4.12 upgrade notes accessed via `/self-host/upgrading/{40..4111}` or subfoldered `/self-host/upgrading/4-{8,9,10,11}/{40..4111}` (after `/upgrading` or `/introduction/development` prefix expansion), match `/^\/self-host\/upgrading\/(?:4-(?:8|9|10|11)\/)?(4(?:[0-9]|1[01])\d*)$/` and resolve directly to `/self-host/upgrading/outdated/{slug}`. Map `/use-cases/app-cases` prefix to `/guide/getting-started`, and include intermediate-generation prefix mappings (`/guide/dashboard/workflow`, `/guide/workbench/workflow`, `/guide/knowledge_base`, `/guide/plugins`, `/guide/DialogBoxes`, `/guide/team_permissions`, `/development/openapi`).

4. **Canonical link hygiene across product and repository references.** Update the share-link help target in the application publishing UI from `/openapi/share` to `/guide/build/publish/link`, update the OpenAPI marketplace example URL from `/docs/plugin` to `/en/plugin/intro`, and align documentation links in root README files, system constants, admin SSO tips, marketplace links, and localization dictionaries with their owning domain and canonical locale-prefixed path.

5. **Clean XML sitemap, `llms.txt`, and static search discovery outputs.** Filter `toc` out of `sitemap.xml`, `llms.txt`, and `static.json` so machine-readable discovery and search endpoints emit only canonical documentation articles. Declare `xmlns:xhtml="http://www.w3.org/1999/xhtml"` in `sitemap.xml` and attach `<xhtml:link rel="alternate" hreflang="zh-CN" .../>`, `<xhtml:link rel="alternate" hreflang="en" .../>`, and `<xhtml:link rel="alternate" hreflang="x-default" .../>` (pointing to the `https://doc.fastgpt.io/en/...` counterpart) to every `<url>` entry with ISO 8601 `<lastmod>` timestamps.

6. **Open crawler policy in `robots.txt` and page-level `noindex` for utility/deprecated pages.** Configure `robots.txt` on both `doc.fastgpt.cn` and `doc.fastgpt.io` with `User-Agent: *`, `Allow: /`, `Disallow: /api/`, and `Sitemap: ${domain}/sitemap.xml`. In article metadata generation, emit `robots: { index: false, follow: true }` when a page is the directory index (`toc`) or carries `deprecated: true` in frontmatter, preventing keyword cannibalization between legacy and active guides.

7. **Multilingual `x-default` metadata and social preview asset completeness.** Add `'x-default'` (pointing to the English production URL on `doc.fastgpt.io`) to `alternates.languages` in both the locale root layout and article `generateMetadata`. Provide the static 1200x630 `/og-image.png` asset in public files and reference it in `openGraph.images`, `twitter.images`, and `TechArticle` structured data.

8. **Structured data accuracy and breadcrumb deduplication.** Emit `@type: 'TechArticle'` with `image: "${origin}/og-image.png"` and `${origin}/favicon/favicon.svg` for `publisher.logo.url`. Deduplicate `BreadcrumbList` items by URL so the getting-started landing page and **Use FastGPT** topics emit each breadcrumb URL once.

9. **Directory index generation and MDX link localization.** Update the TOC generation script so Chinese URLs include the `/zh-CN` prefix and both Chinese and English URLs strip trailing `/index` segments. Pass the localized link component as the override link to the MDX relative-link helper and add explicit locale prefixes to the remaining root-relative links in Chinese source pages.

10. **On-page heading hierarchy, distinct titles, unique descriptions, and image alt text.**
    - Convert in-body `#` H1 headings to `##` H2 headings across the five bilingual page pairs (`fileInput`, `quoteList`, `team_roles_permissions`, legacy `chat` API reference, and self-host troubleshooting attention notes).
    - Disambiguate the four colliding title pairs with topic-qualified titles in Chinese and English (`FastGPT 云服务介绍` / `FastGPT Cloud Overview`, `FastGPT 社区版介绍` / `FastGPT Community Edition Overview`, `Skill 技能简介` / `Skills Overview`, `应用构建常见问题` / `Application Building FAQ`, and `云服务常见问题` / `FastGPT Cloud FAQ`).
    - Expand frontmatter `description` fields that have fewer than twenty characters in Chinese source pages into 45–150 character task-oriented summaries, disambiguate the six remaining duplicate description pairs (including V4.16.0.2, troubleshooting methods, and legacy OpenAPI references), supply descriptive `alt` text for the twenty-four images with empty `alt` attributes, and remove the stray nested timestamp JSON file.

## Testing Decisions

1. **Primary verification seam.** Reuse the existing two-part documentation verification gate as the single acceptance seam:
   - **Static content and route-handler gate**: runs the documentation package's reference checker, English counterpart checker, navigation ownership checker, and isolated sitemap/robots/middleware unit tests.
   - **Rendered HTTP and HTML acceptance gate**: exercises the built documentation server over HTTP to verify status codes, `Location` headers on legacy 301 redirects, HTTP 200 reachability of every redirect destination, `/og-image.png` asset availability, canonical and `hreflang` (`zh-CN`, `en`, `x-default`) `<link>` tags, JSON-LD `TechArticle` and deduplicated `BreadcrumbList` scripts, `noindex` on utility/deprecated and 404 routes, `robots.txt` directives, `sitemap.xml` structure, and `/{locale}/llms.txt` exports.

2. **What makes a good test.** Tests assert externally observable HTTP responses, response headers (`status`, `location`, `content-type`), and rendered HTML/XML/plain-text contracts, including verifying that every configured redirect target resolves to an existing documentation page.

3. **Prior art.** Extend the existing documentation HTTP acceptance suite, sitemap locale unit test suite, navigation checker, and reference checker following their established `node:test` and `node:assert/strict` patterns. Add table-driven assertions covering historical route categories, redirect target existence, single-H1 enforcement, unique localized titles and descriptions, and `x-default` alternate links.

## Out of Scope

- Post-deployment Search Console property verification, sitemap submission operations in external webmaster portals, and external backlink outreach belong to production marketing operations.
- Rewriting substantive tutorial steps, changing the three-entrance sidebar hierarchy, or capturing new product screenshots belong to their respective content workstreams.
- Modifying deployment YAML manifests or container orchestration files belongs to infrastructure administration under the repository's deployment-configuration confirmation policy.

## Further Notes

- **Glossary alignment:** All title, description, and metadata updates follow the maintained definitions in the documentation glossary (`Application`, `Chat Agent`, `Chat Agent V2`, `Workflow`, `Tool`, `Workflow tool`, `Skill`, `MCP tool`, `MCP service`, `Knowledge base`, `Collection`, `Data chunk`, `Published version`, `Publishing channel`, `Team management`, `Platform administration`, `System OpenAPI`).
- **Issue tracker setup:** Run `/setup-matt-pocock-skills` to configure the project's issue tracker and triage-label mapping when ready to publish this specification to an external tracker with the `ready-for-agent` label.

## Todo

- [x] Add `/plugin` and initial historical routes to the request middleware redirect maps (`exactMap`, `prefixMap`, and pre-4.12 upgrade version resolution), and convert `/[lang]` root redirects to HTTP 301.
- [x] Remove the 4 pairs of client-side redirect stub pages (`guide`, `openapi`, `plugin`, `faq`) and client-side redirect components, and update the navigation checker's compatibility-landing set.
- [x] Filter `toc` out of the XML sitemap and `llms.txt` route handlers, and add `xmlns:xhtml` with `zh-CN`, `en`, and `x-default` `<xhtml:link>` tags to `sitemap.xml`.
- [x] Update the `robots.txt` route handler to allow standard search and AI crawlers on both domains while restricting `/api/`.
- [x] Add `'x-default'` to `alternates.languages` in the locale layout and article metadata generator, and add OpenGraph/Twitter image and `modifiedTime` metadata to article pages.
- [x] Update the JSON-LD schema generator to emit `TechArticle` and use `${domain}/favicon/favicon.svg` for `publisher.logo.url`.
- [x] Update the TOC generator script to emit `/zh-CN` prefixes and strip `/index` suffixes, and regenerate both localized TOC pages.
- [x] Demote duplicate in-body `#` H1 headings to `##` across the 5 bilingual page pairs, disambiguate the 4 duplicate title pairs, and expand short frontmatter descriptions across bilingual pages.
- [x] Update direct documentation links in the application publishing UI, OpenAPI marketplace schema examples, and repository README files.
- [x] Expand the documentation HTTP acceptance suite and sitemap unit tests to verify initial SEO, redirect, and metadata contracts.
- [x] Fix the `/guide/build/publish` and `/guide/getting-started/examples` redirect targets so all legacy redirects land on HTTP 200 pages, and assert target existence in tests.
- [x] Add middleware redirects for recently merged routes (`4163`, `sandbox/common`, `agentv2/startup`, `faq/attention`, `signoz`, `shopping_cart/intro`), subfoldered pre-4.12 upgrade paths (`4-8`..`4-11`), intermediate-generation prefixes, and lowercase locale prefixes (`/zh-cn`, `/zh`).
- [x] Normalize trailing slashes and `/index` suffixes against the raw locale-stripped path, unify permanent redirects on HTTP 301, and add locale prefixes to remaining product/i18n documentation links.
- [x] Add the 1200x630 `/og-image.png` static asset, include `image` in `TechArticle` JSON-LD, and deduplicate `BreadcrumbList` items.
- [x] Pass `LocalizedLink` to `createRelativeLink`, add locale prefixes to the 3 bare root-relative MDX links, and set `noindex, follow` on `toc` and `deprecated: true` pages while excluding `toc` from `static.json`.
- [x] Disambiguate the 6 duplicate frontmatter descriptions, fill in the 24 empty image `alt` attributes, and remove the stray nested `doc-last-modified.json` file.
