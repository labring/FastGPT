# English upgrade documentation review

Reviewed against each complete Chinese source and English counterpart on 2026-10-13 using the Chinese to English Translator workflow and the product glossary. This cohort covers 133 pages and the navigation metadata in `document/content/self-host/upgrading`.

Public paths, historical release context, executable configuration values, and shared media are preserved. Each row records a completed semantic review; retained rows include the concrete content verified.

## Source issues retained for separate confirmation

- `upgrade-instruction`: both sources describe the `v4.6.1` example as version `4.6.3`, and both contain `ghcr:` before the Alibaba Cloud Pro image. The translation review preserves these source values pending technical confirmation.
- `4-12/4120`, `4-12/4121`, and `4-12/4123`: source description dates differ from `releaseTime`; both original date fields remain intact.

- `4-15/41500`: the plugin setup requires a separate MongoDB database, while a later default example still uses `/fastgpt`.
- `4-15/41504`: the overview names plugin beta1 and the image list names beta2.
- `4-16/4160` and `4-16/41601`: the source service name `agent-sandbox-volumn` is retained exactly.
- `4-16/41602`: the description names the stable 4.16.0 release on a beta page.
- `outdated/45`: the historical SQL instructions advise closing the terminal during index creation; this guidance is retained for technical review.
- `outdated/468`: MongoDB environment credentials use `username/password`, while replica-set initialization uses `myusername/mypassword`.
- `outdated/4813`: the two identical pnpm-install fix entries are retained.
- `outdated/491`: the final parentPath fix has ambiguous source wording; the English text describes the authentication failure without inventing a clearing operation.
- `outdated/496`: prose uses `feconfigs` while the JSON example uses `feConfigs`.
- `outdated/4912`: the source shows `AES256_SECRET_KEY=` with no value or format requirement.
- `outdated/4110`: the international-domain migration names `fastgpt.io` as both the old and new domain.

## Page review

| Page relative to upgrading | Result | Verified content and corrections |
| --- | --- | --- |
| `upgrade-instruction` | Updated | Restored the missing stable/beta version policy and consolidated migrations; aligned sandbox image names with the source; added independent Sealos external-address instructions and descriptive screenshot text. |
| `version-timeline` | Retained | Release-date listing and upgrade-guide purpose match the source; timeline UI is reviewed by the parent cohort. |
| `4-12/4120` | Retained | Verified FILE_TOKEN_KEY, commercial-only migration, image tags, permission changes, all 9 improvements and 4 fixes. |
| `4-12/4121` | Retained | Verified commercial-only log migration, SIGNOZ_STORE_LEVEL, tool descriptions, image tags and all fixes. |
| `4-12/4122` | Retained | Verified embedding concurrency default 1, 1536-dimension normalization behavior, 11 fixes and Doc2x response change. |
| `4-12/4123` | Retained | Verified global-variable types, RRF merge formula, app-evaluation output fix and plugin migrations. |
| `4-12/4124` | Retained | Verified owner-permission migration, sandbox tag, WeCom publishing and boolean-input fix. |
| `4-13/4130` | Retained | Verified S3 buckets and access modes, MongoDB/Redis configuration, HTTP Toolkit, all 11 fixes and tool update. |
| `4-13/4131` | Retained | Verified response limits, avatar isolation, loop-state reset, sub-workflow citations and plugin additions. |
| `4-13/4132` | Updated | Verified S3 variable renames, lifecycle migration caveat, all 13 plugin updates; corrected Lark Base product terminology. |
| `4-14/4140` | Updated | Verified custom-tool migration, plugin packaging and activation, one-hour S3 links, all 9 fixes; replaced duplicate prose with explicit Admin/Add Plugin steps and descriptive screenshot text. |
| `4-14/4141` | Retained | Verified directory-copy migration, Studio/tool rename, resume after depleted points and all 10 fixes. |
| `4-14/4142` | Updated | Corrected the bug description for missing global-variable input requirements on MCP-exported apps; verified cache duration and 9 plugin changes. |
| `4-14/4143` | Retained | Verified GridFS-to-S3 scope and extracted-image exclusion, QPM limit, added input types and all plugin fixes. |
| `4-14/4144` | Updated | Corrected the strict UID length bound to fewer than 200 characters; verified asynchronous feedback completion message and all 20 fixes. |
| `4-14/4145` | Updated | Clarified container loopback addresses in the storage comment; preserved all values, MongoDB security version, 3 field renames and migration behavior. |
| `4-14/41451` | Retained | Verified toolkit secret migration, CSV export, trackpad/paste changes and all 5 fixes. |
| `4-14/4146` | Updated | Aligned Lark Base terminology; verified all 10 system-tool updates, image tags and upload limits. |
| `4-14/4147` | Retained | Verified 6 OTEL settings, removed log settings, migration endpoint, 6-hour tracing default, API type-field change and all 11 fixes. |
| `4-14/4148` | Updated | Restored optional SANDBOX_TOKEN guidance and both service configuration examples; clarified MCP schema compatibility while preserving image tags and all 4 fixes. |
| `4-14/41481` | Updated | Restored the omitted API file Dataset title-to-URL fallback improvement; verified agent-version-list fix and image tags. |
| `4-14/4149` | Updated | Aligned main/Pro tags to v4.14.9.5; restored login security and nested-workflow termination fixes; clarified run-status display. Verified renamed sandbox variables and 16 fixes. |
| `4-14/41410` | Updated | Restored 5 service entries, network setup, both app services and server-proxy setting; aligned historical tags with Chinese source. Corrected global image repository and volume-manager hostname against the linked global Compose file. |
| `4-14/41411` | Updated | Restored the complete stable/beta naming policy and direct stable-maintenance upgrade guidance; verified all 5 configuration defaults and 11 fixes. |
| `4-14/41412` | Retained | Verified custom HTTP status, beta PI Agent, 3 fixes and skill API handling. |
| `4-14/41413` | Updated | Corrected single-quote mistranslation to an individual Dataset citation; verified OpenSandbox auth fix and nullable chatId. |
| `4-14/41414` | Retained | Verified WeChat polling decoupling, concurrency default 1000, peak-channel recommendation and DeepSeek compatibility. |
| `4-14/41415` | Retained | Verified both image tags and legacy system-tool compatibility fixes. |
| `4-14/41416` | Updated | Restored node-picker overflow and temporary creator-only evaluation-permission fixes; retained base64 embedding and OSS copy fixes. |
| `4-14/41417` | Retained | Verified parentId validation, Portal uploads and commercial file-parser/S3 endpoint dependency. |
| `4-14/41418` | Retained | Verified administrator publishing control, file-type filtering and stream-resume ordering. |
| `4-14/41419` | Updated | Reworded browser kernel as browser engine; verified upload payload and sandbox file-entry fixes. |
| `4-14/41420` | Updated | Restored required fastgpt-plugin v0.6.2 image update; verified Zod and defaultConfig fixes. |
| `4-14/41421` | Retained | Verified optional completions file name and OSS initialization fix. |
| `4-14/41422` | Updated | Restored the omitted mixed reasoning/non-reasoning context fix; verified model selection, autosave edges and admin notification fixes. |
| `4-14/41424` | Retained | Verified socket-reconnect abort handling and admin upload fallback without an external S3 URL. |
| `4-14/41425` | Retained | Verified deprecated tag and Portal/chat-log permissions fix. |
| `4-14/41426` | Retained | Verified Node.js pinning rationale and image tags. |
| `4-14/41427` | Updated | Restored the introductory context for historical migration repairs; verified MinIO module identity and both dataset_image corrections. |
| `4-14/41428` | Retained | Verified admin Node.js compatibility fix and image tags. |
| `4-14/41429` | Retained | Verified WeChat channel-ID authorization, type validation and SDK update. |
| `4-14/41430` | Retained | Verified deprecated tag and MCP SSE duplicate-header fix. |
| `4-14/41431` | Retained | Verified system initialization filtering of model API keys, request URLs and internal configuration. |
| `4-15/41500` | Updated | Reviewed all 473 English lines against 472 source lines: required secrets, full sandbox defaults, plugin runtime settings, all four dry-run/apply migrations and safety conditions, 25 features, 32 improvements, 15 fixes and 19 code changes. Clarified pre-4.8 condition, string units and synchronous processing; preserved training API identifier and localized API introduction link. |
| `4-15/41501` | Updated | Verified secrets, all 7 optional settings, beta limitations, 8 features and security improvements; corrected Code Sandbox product spelling. |
| `4-15/41502` | Retained | Verified persistent workspace-path change, duplicate dataId rejection, 2-minute Redis/30-minute MongoDB recovery safeguards and every stream-resume sub-bullet. |
| `4-15/41503` | Retained | Verified all 11 sandbox defaults and units, audio/video support, language switching, draft recovery and tooling versions. |
| `4-15/41504` | Updated | Restored automatic HTML preview feature and preserved the training API identifier; verified plugin secrets, database separation, reinstall procedure and runtime changes. Source beta1 overview and beta2 image-tag inconsistency retained. |
| `4-15/41505` | Updated | Corrected the malformed 32-bit JWT-secret translation to a 32-character instruction and safe placeholder; localized API introduction link. Verified proxy settings, archive endpoint, security caveats and all change lists. |
| `4-15/41506` | Updated | Corrected malformed sandbox tag v0.2.0.-beta3; restored sandbox registries feature, Alpine/arm64 PDF fallback and q/a/index API fix. Verified all 6 ownership/cleanup rules, orphan deletion scope, dry-run default and trace isolation risks. |
| `4-15/41507` | Updated | Restored mandatory beta7-before-stable sequence and beta7 image tags; restored sandbox-file API change and batch-node variable writeback fix. Verified every migration parameter, data-selection rule, validation safeguard and deletion limit; localized stable link and clarified pre-4.8 condition. |
| `4-15/4151` | Updated | Restored Community Edition exemption for Pro settings and clarified the scheme-bearing curl host placeholder. Verified PRO_TOKEN/FE_DOMAIN, WeCom default change, idempotent appName migration and loop/parallel commit semantics. |
| `4-15/4152` | Updated | Restored main/Pro/plugin image tags, realtime node errors and removed Next.js dependencies; localized OpenSandbox link and aligned Condition node terminology. Verified AGENT_ENGINE breaking values, download modes and runtime behavior. Retained extra streaming/Agent Loop English details after verifying release commit 7da518691. |
| `4-15/4153` | Retained | Verified WeChat polling fix and type-field restoration under stream=false/detail=true. |
| `4-15/4154` | Retained | Verified required FE_DOMAIN, complete MONGO_DEPRECATE_INDEX policy and custom-index warnings, staged cleanup procedure and all 7 fixes. Historical index policy remains tied to this release. |
| `4-15/4155` | Updated | Localized environment configuration link; verified SoMark priority, R2 support, ETag/404 fixes and all storage-adapter behavior. |
| `4-15/4156` | Retained | Verified direct-link chat history fix and both image tags. |
| `4-15/4157` | Retained | Verified MCP SSE fallback, 3-app Portal limit and published file-variable upload fix. |
| `4-15/4158` | Retained | Verified default-model sensitive-data filtering and both image tags. |
| `4-16/4160` | Updated | Translated all migration host/key placeholders; corrected variable references mistranslated as citations, restored left-toolbar location and narrowed the uninstalled-tool fix to source meaning. Verified preview origin warning, all defaults, model/HTTP/sandbox migrations, skipError boundaries, success criteria, retry/lock behavior and every release item. |
| `4-16/41601` | Updated | Translated all migration host/key placeholders, corrected variable references mistranslated as citations and narrowed uninstalled-tool fix wording. Verified full beta sandbox/HTTP migrations, origin isolation warning, resource defaults and login-limit rename. |
| `4-16/41602` | Updated | Translated migration host/key placeholders and restored left-toolbar location. Verified model cleanup defaults, cache refresh, invalidSamples behavior and all release items; source stable-version description on a beta page retained. |
| `4-16/4161` | Updated | Translated migration host/key placeholders and localized OpenSandbox link. Verified root/non-root runtime images, apt settings, required 4.16.0-before-4.16.1 migration order, type guards and process-mode security limitation; preserved established global registry examples. |
| `4-16/4162` | Retained | Verified in-progress status, Korean support, account deletion, more-than-5 identical-call criterion, backup CSV edge cases and XLSX limits. |
| `outdated/40` | Retained | Verified both collection renames, empty-collection warning, all 3 database scripts and all 3 initialization APIs with retry caveat. |
| `outdated/41` | Retained | Verified MongoDB/PostgreSQL URL fields, database-name preservation and chat-item migration. |
| `outdated/42` | Retained | Verified QAModel array-to-object conversion and all JSON values. |
| `outdated/421` | Retained | Verified custom-deployment scope, defaultToken/maxToken meanings and 3000-token guidance. |
| `outdated/43` | Retained | Verified file_id schema migration and FILE_TOKEN_KEY with 30-minute preview expiry. |
| `outdated/44` | Retained | Verified initialization endpoint and MongoDB field initialization. |
| `outdated/441` | Retained | Verified dataset.files initialization endpoint and data availability behavior. |
| `outdated/442` | Retained | Verified Bill TTL-index initialization endpoint and rationale. |
| `outdated/445` | Retained | Verified Variable/User Guide node migration, 3 follow-up questions and commercial API-key/share controls. |
| `outdated/446` | Retained | Verified App Call node, connection validation and anonymous suggestion identity fix. |
| `outdated/447` | Retained | Verified PostgreSQL indexes, file_id/manual migration, progress logging and source traceability changes. |
| `outdated/45` | Updated | Added descriptive alt text after inspecting all 4 screenshots. Verified all Sealos/Docker instructions, SQL statements and comments, 3–10x/48-hour historical performance example and screenshots; text fully describes the image-guided actions. Source advice to close a running SQL terminal retained as historical guidance. |
| `outdated/451` | Updated | Reworded timeout guidance to check actual log progress/results; verified field renames, per-file Collection migration and all release items. |
| `outdated/452` | Retained | Verified reusable node plugins and Dataset citation prompts. |
| `outdated/46` | Updated | Corrected multi-vector mapping from Dataset to a single data entry; clarified log-based completion check. Preserved irreversible-upgrade warning, script order, image versions and corrective migration. |
| `outdated/461` | Retained | Verified GPT-4V, Whisper and TTS streaming/cache changes. |
| `outdated/462` | Retained | Verified full-text indexing migration, Rerank requirement, community-edition caveat and planned plugin-source versions. |
| `outdated/463` | Updated | Restored GPT-4V model specificity for automatic URL/base64 conversion; verified field initialization, commercial site sync and image parsing fixes. |
| `outdated/464` | Retained | Verified createTime/feedback migration, 3-API SSO, API-key priority, MaxToken search behavior, links and all fixes. |
| `outdated/465` | Updated | Corrected Condition node mislabeled as Classifier; verified functionCall/toolChoice settings, shared model configuration and links. |
| `outdated/466` | Updated | Turned malformed PRO_URL explanatory assignment into clear prose and a dotenv example; verified RRF search, rerank deployment and all changes. |
| `outdated/467` | Retained | Verified image/Collection reassociation, null migration, variable hints, API link and historical February roadmap context. |
| `outdated/468` | Retained | Verified complete replica-set YAML and translated comments, credential preservation, commercial billing initialization and all 7 changes. Source credentials differ between environment and initialization commands; values retained for separate review. |
| `outdated/469` | Retained | Verified OneAPI settings, cleanup endpoint, price/totalPoints and token-field changes, 12 release items and target link. |
| `outdated/47` | Updated | Corrected reversed meaning of unused HTTP body fix: the fixed behavior sends undefined. Qualified BGE recommendation as historical release guidance; verified Cohere values, function/tool-call switches, HNSW precision caveat and all 19 items. |
| `outdated/471` | Retained | Verified cleanup endpoint, server-side parsing tradeoffs, timer/downtime behavior, CSV column change and all fixes. |
| `outdated/48` | Retained | Verified plugin-before-app rebuild sequence, continued operation until the next save, SMTP variable mapping and all 23 changes. |
| `outdated/481` | Retained | Verified empty dataset.trainings prerequisite, service pause, initialization/cleanup sequence and updateVariables event. |
| `outdated/482` | Retained | Verified SANDBOX_URL, port 3000, network isolation for the unauthenticated sandbox and historical v4.8.1 image tag. |
| `outdated/483` | Retained | Verified Milvus support, console.log output and Debug behavior. |
| `outdated/484` | Retained | Verified commercial domain requirement, /api/admin/init/484 endpoint and execution-pool contamination fix. |
| `outdated/485` | Updated | Corrected reversed percent-escape wording; verified backup, plugin-table preservation, extra commercial initialization and all 15 changes. |
| `outdated/486` | Retained | Verified permission inheritance, individual collection disabling, MongoDB secondary behavior and all 16 changes. |
| `outdated/487` | Retained | Verified independent plugin publication, local vision images and GPT-4o support. |
| `outdated/488` | Updated | Clarified upstream-output variable selection; verified inheritance migration, Lark/DuckDuckGo plugins, all 15 changes and original Whisper compatibility caveat. |
| `outdated/489` | Updated | Corrected the initialization exemption: internal-only deployments can skip multi-tenant notification setup. Verified commercial migration scope and all 20 changes. |
| `outdated/4810` | Updated | Clarified verification-code sending checks and recursive propagation of collection-directory disabled state. Verified both log settings, sandbox requirement, initialization endpoint and all 55 changes. |
| `outdated/4811` | Retained | Verified both complete o1 configurations, defaultConfig historical limits, 50-item serial loop, 20-level nesting, role migration, commercial member-group initialization and all 49 changes. |
| `outdated/4812` | Updated | Clarified FE_DOMAIN URL construction. Verified conditional Milvus/Zilliz rebuild, PostgreSQL exemption, dataId precision check, initialization endpoints and all 22 changes. |
| `outdated/4813` | Updated | Replaced Chinese file-upload fragment with the existing English heading fragment and clarified direct file inclusion in prompts. Verified two-version compatibility window, explicit nested file passing, FE_DOMAIN syntax and all 22 changes; duplicate source pnpm-install items retained. |
| `outdated/4814` | Updated | Added English descriptions of screenshot controls and execution order after inspecting both images. Verified Milvus image variant, automatic startup behavior, edit-history storage and all 20 changes. |
| `outdated/4815` | Updated | Added English API Dataset setup and HTML preview instructions plus descriptive alt text after inspecting all 5 screenshots. Verified migration endpoints, null-field cleanup, free-tier duration recalculation, script blocking and all 19 changes. |
| `outdated/4816` | Updated | Used the precise HMAC term for createHmac. Verified complete provider configuration, historical/current config distinction, DingTalk/Lark documentation targets and all 21 changes. |
| `outdated/4817` | Retained | Verified user-to-team OpenAI account migration, tokens-to-inputTokens/outputTokens response change, 200K-character Markdown guard and all 15 changes. |
| `outdated/4818` | Retained | Verified full-text search downtime during migration, progress logging, historical CORS default, HTML download behavior and all 15 changes. |
| `outdated/4819` | Retained | Verified beta image tags, avatar migration to member records, millisecond wait unit and all 15 changes. |
| `outdated/4820` | Updated | Clarified reserved output-token budget and restored FE_DOMAIN in image URL timing explanation. Verified ONEAPI_URL rename, config-file migration, 100+ presets and all 13 changes. |
| `outdated/4821` | Retained | Verified model parameters, normalization settings, reasoning output, strict Markdown parsing tradeoff and all 18 changes. |
| `outdated/4822` | Retained | Verified commercial SaaS-only migration scope, explicit reasoning opt-in, generated chatId behavior, HEAD fallback, extraction key rename and all 20 release items. |
| `outdated/4823` | Updated | Clarified inconsistent-data cleanup wording. Verified redundant full-text index cleanup, AI Proxy V1, day-boundary times and all 15 release items. |
| `outdated/490` | Updated | Corrected Model Channels UI label and clarified migration completion checks after an HTTP timeout. Verified full AI Proxy/PostgreSQL YAML, both migration methods, retained OneAPI-until-verified sequence, FastGPT migration, API deprecations and all 11 release items. |
| `outdated/491` | Updated | Corrected jieba library and model-channel terminology; narrowed ambiguous parentPath source wording to the documented authentication failure. Verified tokenizer migration, search/rerank weighting change and all 23 release items. |
| `outdated/492` | Updated | Rewrote unclear chunk-separator continuity wording. Verified direct-to-4.9.3 recommendation, ordered SSO backup/service migration, hnswEfSearch rename, all optional API fields and all 24 release items. |
| `outdated/493` | Retained | Verified all four image tags, Python 3 support, interaction nodes in Debug mode and workflow format conversion fix. |
| `outdated/494` | Updated | Added descriptive alt text after inspecting all 3 Redis screenshots; existing English text fully explains setup. Verified REDIS_URL on both services, Pro-only site-sync migration, finish_reason output and all 13 release items. |
| `outdated/495` | Retained | Verified granular creation/API-key permissions, nested interactive nodes, queue counter reset and all 11 release items. |
| `outdated/496` | Retained | Verified complete MCP Docker service, Sealos endpoint, community/Pro proxy settings, all image tags and 16 release items. Source feconfigs prose versus feConfigs JSON case mismatch retained for separate source review. |
| `outdated/497` | Updated | Standardized Streamable HTTP terminology. Verified NO_RECORD_HISTORIES, token-usage fallback, 1,000-message-pair export limit and all 29 release items. |
| `outdated/498` | Retained | Verified forced-stream override, password expiration/preLogin checks, token-worker loading, image-expiry fix and all 19 release items. |
| `outdated/499` | Retained | Verified required Pro license replacement, SessionId migration, concurrent-client setting, BasePath endpoint guidance and all 10 release items. |
| `outdated/4910` | Updated | Expanded 4c16g into CPU and RAM units and attributed the historical 7-million-entry/25-minute estimate. Verified full-text search downtime, table-sync requirement, 10-million citation cap and all 19 release items. |
| `outdated/4911` | Updated | Aligned Python sandbox security-risk wording with the source. Verified Pro-only API-config migration, async parsing, GridFS, 1,000-character boundary and all 15 release items. |
| `outdated/4912` | Updated | Aligned Condition node and Streamable HTTP terminology. Verified AES256_SECRET_KEY requirement on both services, credential-return behavior, raw schema, image TTL and all 22 release items. Source leaves key value/format unspecified; retained. |
| `outdated/4913` | Retained | Verified NodeId leading-character constraint, nested collection search, file-history conditions and all 7 release items. |
| `outdated/4914` | Updated | Aligned CSV dangerous-string wording with the source. Verified image descriptions in retrieval results, schema properties completion, session invalidation and all 15 release items. |
| `outdated/4100` | Updated | Added English access-key panel steps and descriptive alt text after inspecting the screenshot. Verified Docker/Sealos setup, internal plugin access, publicRead bucket, endpoint/key mappings and all 3 release items. |
| `outdated/4101` | Retained | Verified Pro-only auto-sync scheduling migration, exact main/Pro/plugin tags and all 14 release items. |
| `outdated/4110` | Updated | Restored some-node scope and saving failure detail; standardized SigNoz name. Verified evaluation defaults and admin Save action, all project/release items. Source international-domain change lists fastgpt.io as both old and new; retained for separate review. |
| `outdated/4111` | Updated | Standardized SigNoz name. Verified all image tags, automatic MCP refresh, account deletion, global-variable references and all 19 release items. |

## Navigation review

| File | Outcome | Review evidence |
| --- | --- | --- |
| `meta.en.json` | Retained | Verified natural English labels, description and identical page ordering. |
| `4-12/meta.en.json` | Updated | Made the source’s unmaintained status explicit; verified identical page ordering and empty description. |
| `4-13/meta.en.json` | Updated | Made the source’s unmaintained status explicit; verified identical page ordering and empty description. |
| `4-14/meta.en.json` | Updated | Made the source’s unmaintained status explicit; verified identical page ordering and empty description. |
| `4-15/meta.en.json` | Retained | Verified natural English labels, description and identical page ordering. |
| `4-16/meta.en.json` | Retained | Verified natural English labels, description and identical page ordering. |
| `outdated/meta.en.json` | Updated | Made the source’s unmaintained status explicit; verified identical page ordering and empty description. |

## Verification

- Completed full-source semantic review for all 133 Chinese/English pairs: 61 pages updated and 72 retained. The page table matches the 133-file English inventory exactly, with zero missing or duplicate rows.
- Reviewed all 7 navigation pairs: 4 updated and 3 retained. Every English pages array matches the Chinese order exactly.
- All 133 English files have zero CJK characters and zero empty or generic image alt text. Instructional screenshot text is covered by English prose and descriptive alt text.
- Compared every paired fenced code block after stripping comments. Block counts match. Remaining differences are translated placeholders/display labels, the corrected global Compose image/service references in 4.14.10, and the existing global-registry/Ubuntu-mirror examples in 4.16.1.
- Scoped reference validation passed: `node document/script/checkDocRefs.js <all 133 upgrading English files>` also validated all repository content metadata.
- `git diff --check -- document/content/self-host/upgrading .agents/design/documentation/english-review-upgrading.md` passed.
- At semantic-review handoff, this subtree has 65 changed files: 61 English pages and 4 English navigation metadata files. The review record is an additional file. Parent-owned link normalization and full Fumadocs rendering/build verification follow this cohort handoff.
- This review executed documentation validation only; database migration examples were read as documentation.
