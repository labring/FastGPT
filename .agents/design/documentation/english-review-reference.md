# English Review: Self-Hosting and API References

Status: Complete. Scope: 41 page pairs (25 updated, 16 retained) and 12 navigation metadata pairs (all retained).

Method: Read each complete source and English counterpart using paired comparisons, displaying identical lines once and every changed line in both languages. Retain accurate prose and preserve routes, heading anchors, executable identifiers, numeric settings, and media assets.

| Page (relative to document/content) | Outcome | Review evidence and changes |
| --- | --- | --- |
| `self-host/index.en.mdx` | Retained | Retained the localized landing metadata and redirect target. |
| `self-host/design/dataset.en.mdx` | Retained | Retained GridFS/PostgreSQL design, special file_id values, immutable association, and all five import steps. |
| `self-host/migration/docker_db.en.mdx` | Retained | Retained service shutdown and complete pg/mongo directory-copy instructions. |
| `self-host/troubleshooting/methods.en.mdx` | Updated | Rewrote backend/frontend diagnostic steps and issue-reporting guidance for natural English. |
| `self-host/troubleshooting/s3-issues.en.mdx` | Updated | Clarified path-style configuration and Nginx Host forwarding; preserved error strings and heading anchors. Screenshots supplement fully stated fixes. |
| `openapi/index.en.mdx` | Retained | Retained OpenAPI landing metadata and redirect. |
| `openapi/intro.en.mdx` | Updated | Clarified API scope and BaseURL usage; added English steps for the screenshot after visual inspection; aligned Publishing Channels terminology. |
| `plugin/index.en.mdx` | Retained | Retained plugin landing metadata and redirect. |
| `faq/index.en.mdx` | Retained | Retained the established English FAQ label and redirect; Chinese source labels the category as use cases. |
| `faq/chat.en.mdx` | Retained | Retained publish-before-chat behavior, browser/OS permissions, microphone selection, and SSL prerequisite. |
| `self-host/config/model/minimax.en.mdx` | Updated | Aligned FastGPT model provider wording; retained all IDs, limits, and setup steps. |
| `self-host/config/model/siliconCloud.en.mdx` | Updated | Aligned provider wording; retained complete model, Dataset, citation, TTS, and STT procedures and all examples. |
| `self-host/config/sandbox/sealosdevbox.en.mdx` | Updated | Fixed spacing around inline settings; retained prerequisites, provider settings, registry behavior, and troubleshooting. |
| `self-host/config/signoz.en.mdx` | Updated | Polished local account creation guidance; retained deployment, port, logging, verification, and retention steps. |
| `self-host/custom-models/m3e.en.mdx` | Updated | Added explicit One API configuration from the inspected screenshot; retained integration, model limits, and same-model Dataset binding requirements. |
| `self-host/custom-models/marker.en.mdx` | Retained | Retained both version-specific configurations, commands, logging checks, screenshot explanations, and license caveat. |
| `self-host/custom-models/mineru.en.mdx` | Updated | Added English Admin navigation and save instructions from the inspected screenshot; retained requirements, configuration, tests, and license caveat. |
| `self-host/custom-models/bge-rerank.en.mdx` | Retained | Reviewed all three model/resource rows, source and Docker deployment, authentication, FastGPT integration, and troubleshooting. Media guidance is explicit. |
| `self-host/custom-models/chatglm2.en.mdx` | Updated | Added complete One API fields for the reused M3E screenshot; retained hardware, licensing, deployment, and legacy config examples. |
| `self-host/custom-models/chatglm2-m3e.en.mdx` | Updated | Restored the current AI Proxy documentation reference, explained the legacy One API screenshot, and preserved the Laf prompt meaning. Kept the established OneAPI heading anchor. |
| `self-host/custom-models/ollama.en.mdx` | Retained | Reviewed all Docker/host setup, AI Proxy/OneAPI/direct connection procedures, screenshots, and matching model IDs. Source-derived image issue is recorded below. |
| `self-host/custom-models/xinference.en.mdx` | Retained | Reviewed server/personal backends, dependencies, model launch, One API setup, complete config, and media instructions. |
| `self-host/troubleshooting/attention.en.mdx` | Retained | Reviewed upgrade/log checks and every trusted-proxy prerequisite, header, CIDR, Nginx example, and spoofed-IP test. |
| `self-host/troubleshooting/faq.en.mdx` | Updated | Restored all vectorModels refresh/recreation instructions; corrected chat/indexing mistranslations; rewrote awkward troubleshooting prose and preserved the historical rate-limit caveat. |
| `self-host/troubleshooting/model-errors.en.mdx` | Updated | Restored parameter/stream failure causes, request-body reproduction, both streaming tool-call rounds, response inspection, and normalized-vector score guidance. Corrected the pre-existing English curl quotation break and used a valid focused response shape for the malformed source sample. |
| `self-host/config/env.en.mdx` | Retained | Reviewed every secret, provider, sandbox, storage, database, logging, security, limit, Admin, parsing, and volume setting; retained all names, defaults, version caveats, and matching-value requirements. |
| `self-host/config/model/intro.en.mdx` | Updated | Added English explanations of request routing, custom-model form fields, and whole-configuration replacement with backup guidance after inspecting the screenshots. Retained channel procedures, all five model schemas, and migration examples. |
| `self-host/config/object-storage.en.mdx` | Updated | Restored the explicit HTTP 302 status for short-redirect; reviewed all provider settings, upload/download paths, endpoint requirements, and configuration examples. |
| `self-host/config/sandbox/opensandbox.en.mdx` | Retained | Reviewed service tokens, NO_PROXY, runtime architectures, preview isolation and capability warning, package registries, apt restoration behavior, lifecycle limits, and troubleshooting. Retained existing global-registry localization. |
| `self-host/config/remote-debug-suite.en.mdx` | Retained | Reviewed complete component flow, both registry images, ports, shared secrets, reverse proxy, developer connection, validation, and troubleshooting. |
| `self-host/dev.en.mdx` | Updated | Synchronized Node.js >=20 and pnpm 10.x prerequisites with the source, clarified the historical Node 18 workaround, and polished first-build guidance. Reviewed full setup, contribution, troubleshooting, and architecture sections. |
| `self-host/deploy/docker.en.mdx` | Updated | Corrected query optimization wording; reviewed all deployment choices, credential generation, sandbox settings, troubleshooting, resource tables, and media procedures. Verified extra English installer environment variables against install.sh. |
| `self-host/deploy/sealos.en.mdx` | Retained | Reviewed all regional deployment, login, model, billing, update, domain, variable, logo, and commercial configuration procedures. Existing text explains every screenshot's required action. |
| `self-host/migration/docker_mongo.en.mdx` | Updated | Reviewed every export, transfer, integrity, restore, and log check. Clarified B as the restore destination and added backup, stopped-database, and target-directory prerequisites adjacent to deletion. Preserved historical heading anchors and command identifiers; source command defects are recorded below. |
| `openapi/app.en.mdx` | Updated | Added the screenshot's explicit appId retrieval step after inspecting the browser URL; reviewed both log APIs, complete payloads, parameters, and response fields. |
| `plugin/intro.en.mdx` | Updated | Polished architecture and maintainer wording; reviewed complete concepts, repository responsibilities, installation scope, package protocol, runtime scheduling, default limits, and development/distribution guidance. |
| `plugin/model-presets.en.mdx` | Updated | Reviewed all five schemas, provider registration, capabilities, protocol IDs, assets, and validation. Restored intentional Chinese values for zh-CN/zh-Hant in the multilingual provider example. |
| `plugin/team-installation.en.mdx` | Updated | Restored local-package scope, where update controls appear, and System-label hover guidance. Reviewed every permission, installation, update, deletion, configuration, and safety requirement. |
| `plugin/system-tool-development.en.mdx` | Updated | Polished architecture and debugging prose; reviewed every prerequisite, SDK example, schema, icon convention, local/remote debug step, build command, publishing workflow, and FAQ. Existing English steps fully explain shared screenshots. |
| `openapi/chat.en.mdx` | Updated | Restored appId precedence and the authProxy >=v4.15.0 condition; translated request/response text and coherent SSE chunks; retained matching form keys. Added screenshot-derived appId steps, clarified interactive responses, corrected malformed version/field prose and a JSON comment inside curl, and preserved every endpoint, API field, numeric value, and heading anchor. |
| `openapi/dataset.en.mdx` | Updated | Added screenshot-derived Dataset/collection ID steps; translated mixed-language sample data and complete white-paper excerpts; rewrote the QA template while retaining its constraints. Restored the accessible QA-template tab, fixed curl quoting, clarified collection response paths and index updates, and aligned stale response fields with source/current schemas. |

## Navigation metadata

All 12 source/counterpart pairs were read in full. Page order, root flags, and ordering metadata match; translated separators preserve their position. All English navigation metadata is retained.

| Metadata (relative to document/content) | Outcome | Review evidence |
| --- | --- | --- |
| `faq/meta.en.json` | Retained | FAQ title, description, root flag, and chat entry. |
| `openapi/meta.en.json` | Retained | OpenAPI title, root flag, and all four page entries. |
| `plugin/meta.en.json` | Retained | Plugin title, description, root flag, order 2, and four page entries. |
| `self-host/meta.en.json` | Retained | All five separators, expanded sections, root flag, description, and page order. |
| `self-host/config/meta.en.json` | Retained | Configuration title, description, and six page/directory entries. |
| `self-host/config/model/meta.en.json` | Retained | Model Configuration title and all three entries. |
| `self-host/config/sandbox/meta.en.json` | Retained | Sandbox title, description, and both providers. |
| `self-host/custom-models/meta.en.json` | Retained | Local Models title and eight model/parser entries. |
| `self-host/deploy/meta.en.json` | Retained | Deployment title, description, and both deployment methods. |
| `self-host/design/meta.en.json` | Retained | Design Documentation title and Dataset entry. |
| `self-host/migration/meta.en.json` | Retained | Migration & Backup title and both migration entries. |
| `self-host/troubleshooting/meta.en.json` | Retained | Troubleshooting title, description, and five page entries. |

## Source issues

- Dataset API: the source labels the apiCollection request as form-data despite showing JSON. The English page follows the example and the current handler's body schema. English-only `overToken`, `repeat`, and `error` response fields were stale; current `CreateCollectionWithResultResponseSchema` and `PushDataResponseSchema` confirm the source's insertLen-only shape. The source's unfinished index-update sentence is completed using its earlier dataId/incremental-update explanation. The search response now shows one complete result as valid JSON.
- Intentional Chinese technical values remain in multilingual plugin schemas, chat form keys and their matching submission, the Chinese-filename upload example, and Dataset source filenames. Their surrounding explanations and sample content are in English.

- MongoDB dump migration: the original guide alternates between MongoDB and FastGPT container names, labels several restore operations as Environment C although B is the destination, and includes a malformed `docker cp` destination with a trailing `>`. Command identifiers and paths remain unchanged under this review's fidelity scope; prose now consistently identifies B as the destination and explains backup and shutdown prerequisites around destructive cleanup.

- Local development: the source still gives a Node 18 workaround below the current Node.js >=20 prerequisite. The English page labels that workaround as historical and directs readers to their release's runtime requirements. The source's `vectorMaxProcess` phrase about a "120" account does not define its quota unit; the English recommendation retains the explicit 10–15 process setting for a 2c4g host.

- Ollama: both language editions use `intel/oneapi-hpckit` as a OneAPI image. This is the Intel toolkit name and requires a separate source correction; the authorized identifier-preservation rule keeps the existing commands intact in this review.
- Model troubleshooting: the Chinese tool-call response sample has invalid JSON nesting and a mismatched function name. The English page now shows a focused, valid streaming `tool_calls` shape using the requested function name, while preserving both request examples and teaching actual response-ID matching.

## Local verification

- Parsed all 27 curl JSON request payloads and all 36 JSON response examples in the two long API pages (allowing documented JSON comments); no syntax errors remain.

- `checkDocRefs.js` passed for all 25 changed English pages plus all navigation metadata.
- Scoped `git diff --check` passed.

## Verification limits

API calls, model services, Docker deployment, and external service UIs have not been executed during this editorial review. Shared screenshots retain their original language. English procedures are checked against the source and relevant screenshots. Production build, rendered links, and overall validation are coordinated by the parent task.
