# English Guide Review

Scope: All 74 Chinese/English Guide page pairs and their English navigation metadata. Reviewed against the current Chinese source, the accepted English documentation plan, and the FastGPT product glossary. Shared images and technical identifiers are preserved. Each entry records a complete source/counterpart read; ongoing rows are added only after review.

| Page under `document/content/guide` | Result | Review notes |
| --- | --- | --- |
| `build/agentv2/settings` | Updated | Restored the current prompt/VM/Skill scope, removed obsolete Dataset and standalone tool settings, clarified VM readiness and startup-script behavior, preserved the two surviving heading anchors, and added meaningful image labels. |
| `dataset/faq` | Updated | Restored file-parsing/OCR and missing-Embedding-model troubleshooting; checked token/context examples and retention caveats; labeled the screenshots. |
| `build/publish/wechat` | Updated | Restored the iOS/latest-WeChat prerequisite; verified QR login and reset commands; labeled each screenshot. |
| `chat/htmlRendering` | Updated | Removed a stray empty code block after the nested Markdown example and labeled the three display modes; retained sandbox/JavaScript limitations. |
| `build/workflow/nodes/ai_chat` | Updated | Checked model selection and parameter references; corrected punctuation and English documentation targets. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/content_extract` | Updated | Checked required/optional fields, history-dependent extraction, and JSON/string outputs. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/coreferenceResolution` | Updated | Checked pronoun-resolution example and long-context limitation. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/custom_feedback` | Updated | Checked debug behavior, chatId requirement, and 60-second logging delay. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/dataset_search` | Updated | Checked shared Embedding-model requirement and empty-array behavior; corrected English reference targets. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/document_parsing` | Updated | Checked file-upload prerequisite; linked the existing complete file-processing procedure. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/form_input` | Updated | Checked pause/resume behavior and required-field submission. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/knowledge_base_search_merge` | Updated | Checked RRF ordering, token limit, and multi-branch use case; made connection steps explicit. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/reply` | Updated | Checked fixed and variable-derived response modes. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/text_editor` | Updated | Checked string/number inputs and the prefix example. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/tfswitch` | Updated | Checked IF/ELSE semantics and multiple conditions. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/user-selection` | Updated | Checked interactive pause and selected-branch execution. Replaced empty image labels with contextual English descriptions. |
| `build/workflow/nodes/variable_update` | Updated | Checked output/global-variable scope; added a concise English configuration sequence. Replaced empty image labels with contextual English descriptions. |
| `build/general/chat_input_guide` | Updated | Restored the browser CORS requirement; checked appId, 50-character search limit, response shape, and stated five-result limit. The source example itself contains six entries; preserved its existing example semantics. |
| `build/general/voiceInput` | Retained | Verified settings entry, recognition, Auto Send, playback prerequisite, and review-before-send recommendation; English procedures and image labels are complete. |
| `build/general/welcomeText` | Retained | Verified Markdown and bracketed quick-question examples, edit path, and click-to-send behavior; English procedures and image labels are complete. |
| `build/evaluation` | Retained | Verified v4.11.0/beta scope, answer-accuracy caveat, CSV fields, 1,000-pair cap, scoring, and result inspection; screenshot-dependent actions are written in English. |
| `build/general/fileInput` | Updated | Verified the v4.8.9/v4.8.13 behavior changes, current-run parsing, chat-history handling, URL storage, multimodal distinctions, and explicit nested-file passing; labeled tool-call screenshots. |
| `build/faq` | Updated | Verified publishing, scheduled runs, prompt formatting, classification state, context comparisons, and formula syntax; added contextual screenshot labels. |
| `build/tools/mcp_tools` | Updated | Verified v4.9.6/SSE setup, Parse/Create actions, individual-tool debugging, and Toolkit connection; labeled the tool-selection examples. |
| `build/tools/system-plugins/upload_system_tool` | Updated | Verified root-only management, 100 MB/15-file limits, build command, upload steps, and refresh behavior; inspected the entry screenshot and added its navigation steps. |
| `build/agentv2/debug` | Updated | Restored Commercial Edition restriction and limited-context caveat; checked automatic configuration, annotation, run details, planning states, and VM debugging link. |
| `build/agentv2/vm` | Updated | Restored planned user-level isolation caveat; verified session persistence, file injection, startup order, SHA-256/version deduplication, 16,384-character/30-second/8KB/4,000-character limits; aligned reset wording and polished prose. |
| `build/skill/intro` | Updated | Verified two-spreadsheet example, instruction/code packaging, sandbox editors, production isolation, and sleep billing; corrected unnatural prose and restored production Workflow reference. |
| `build/skill/development` | Updated | Verified unchanged-template zero-points behavior, AI generation billing/default model, ZIP import/export, autosave, production isolation, terminal and chat editing; polished awkward terms. |
| `build/skill/initialization` | Updated | Verified entrypoint.sh placement, version deployment directory, state file, immutable-version deduplication, new-version execution, 30-second/8KB limits, and manual execution in edit mode; polished two sentences. |
| `build/skill/integration` | Retained | Verified Agent-only binding, published-Skill selection, automatic VM enablement, multiple Skills, model-dependent tool choice, and file viewer instructions. The Chinese source itself describes auto-enablement while the settings page documents a VM-not-ready warning; preserved both source statements. |
| `build/skill/version` | Updated | Verified live/debug separation, version naming, .gitignore defaults, package-size failure, and rollback of both workspace and live version; retained ignored-file recovery caveat. |
| `build/publish/dingtalk` | Updated | Verified v4.8.16 Commercial Edition support, Client credentials, HTTP callback, separate bot/app publishing, group mention, and case-sensitive Reset. Added descriptive screenshot labels. |
| `build/publish/feishu` | Updated | Restored the missing get-private-and-group-messages permission and English permission-selection steps; checked version/edition, credentials, callbacks, reset scopes, and input limitations. Added descriptive screenshot labels. |
| `build/publish/mcp_server` | Updated | Verified Streamable HTTP/SSE, client setup, owner-only identity proxy, member authorization, matching headers, reconnect behavior, per-call permission checks, compose service and environment variable. Added descriptive screenshot labels. |
| `build/publish/official_account` | Updated | Verified verified-account requirement, test-account AES limitation, both complete IP lists, encryption, callback and Reset; inspected credential screenshot and wrote its navigation sequence. Added descriptive screenshot labels. |
| `build/publish/openapi` | Updated | Verified member-scoped credentials, appId recommendation, apiKey-appId compatibility, quota/expiry guidance and configuration names; fixed English OpenAPI target. Added descriptive screenshot labels. |
| `build/publish/wecom` | Updated | Verified v4.12.4/v4.14.4 edition prerequisites, enterprise-domain constraint, super-admin permission, AES/token configuration, callback and troubleshooting; fixed English domain-guide target. Added descriptive screenshot labels. |
| `dataset/third-party/dingtalk_dataset` | Updated | Verified App Key/Secret/User ID retrieval, member access controls, four permission identifiers, online-document-only scope, recursive folder import, and manual sync; restored the two omitted introductory screenshots with English labels. |
| `dataset/third-party/lark_dataset` | Updated | Verified v4.8.16 Commercial Edition/beta scope, shared-folder limits, three permissions, group-based folder access and Folder Token extraction; inspected the credentials screenshot and added its navigation steps. Added descriptive screenshot labels. |
| `dataset/third-party/yuque_dataset` | Updated | Verified v4.8.16 Commercial Edition/beta scope, Dataset creation, document import, daily variable-time sync and manual sync; inspected personal-token scopes/UID and enterprise-token/UID screenshots, then wrote the English procedures. Added descriptive screenshot labels. |
| `dataset/collection_tags` | Updated | Verified Commercial Edition scope, tag management, collection filtering, null-tag behavior, $and precedence over $or, and timestamp format; added descriptive screenshot labels. |
| `dataset/websync` | Updated | Verified Commercial Edition scope, 200-page/same-domain/static-site limits, complete selector examples and app binding; made the screenshot-led setup and inspection sequence explicit in English and labeled the screenshots. |
| `admin/teamMode` | Updated | Verified all registration/default-team/root-team matrix cells, v4.9 behavior and external sync reference; clarified configuration navigation and labeled its screenshot. |
| `build/workflow/intro` | Updated | Verified all inputs/outputs, waiting/active/skip transitions, reset behavior, connection directions and merge options; retained the complete text procedure, identified the optional video as Chinese, and labeled all diagrams. |
| `build/workflow/nodes/question_classify` | Updated | Verified category definitions, context use, function enum mapping and source-matching billing prompt; labeled the node screenshot. |
| `build/workflow/nodes/tool` | Updated | Verified required/optional parameter behavior, description tuning, termination and custom variables; inspected the calling-loop diagram and supplied its full English sequence. Clarified the termination-node reference and labeled the diagrams. |
| `build/publish/link` | Updated | Verified 20-record/30-day local identity limits, share settings, uid byte/character restrictions, all three auth endpoints and examples; corrected the API fragment and token/tokens explanation, clarified version-specific price/totalPoints fields, explained the inspected flow diagram and the Chinese moderation-test character, and labeled screenshots. Translated human-readable demo queries, references and history while preserving protocol identifiers, numeric values and the exact legacy model label with an English explanation. |
| `build/workflow/nodes/http` | Updated | Verified system variables, ten-history limit, interpolation types/quoting, JSONPath examples, v4.6.8 string formatting and service sample; clarified output extraction, linked the syntax reference and labeled the screenshot. Translated sample string values and verified the interpolated result and all 12 JSONPath extraction results. |
| `build/workflow/nodes/loop` | Updated | Verified v4.8.11 scope, array types, ordered collection of loop outputs, all batch-translation steps and complete segmentation example; documented precise English meanings and expected output for the intentional Chinese translation fixtures and polished the regex reference. The historical regex example is preserved as supplied by the source. |
| `build/workflow/nodes/loop_run` | Updated | Verified v4.15.0 scope, zero-based array index/one-based loop count, required break node, last-iteration outputs, writeback/rollback/checkpoints, nesting restriction and 100-iteration default; restored the refinement action and standardized example node labels. |
| `build/workflow/nodes/parallel_run` | Updated | Verified v4.14.11 scope, concurrency/retry defaults and bounds, ordered outputs, all three status values, writeback races, array cap, nesting/interaction restrictions, deployment settings and streaming recommendation; polished prose and documented precise English meanings and expected output for the intentional Chinese translation fixtures. |
| `build/workflow/nodes/sandbox-v2` | Updated | Restored the requirement that Python node input names match main parameters, with arbitrary order; verified v4.14.8 scope, runtime/HTTP limits, all JS/Python allowed modules and complete usage examples. |
| `chat/quoteList` | Updated | Verified v4.9.1 scope, full-text positioning, citation navigation/scoring, read-permission export requirement, share visibility, annotation and on-demand rendering; inspected the export menu and wrote its English actions. Added descriptive image labels and polished introductory prose. |
| `dataset/dataset_engine` | Updated | Verified multi-vector storage/deduplication, complete image-model capability matrix, RRF/rerank flow, filter scope, query-rewriting latency and all tuning cases; clarified default Dataset-wide search scope, polished prose and labeled diagrams/screenshots. |
| `dataset/template` | Retained | Verified required/repeatable headers, q/a constraints, escaped CSV/Excel examples, single worksheet/file rules, metadata JSON requirements and troubleshooting; English import steps and screenshot labels are complete. |
| `dataset/third-party/api_dataset` | Updated | Verified all four endpoints, bearer authentication, optional basePath, response fields, content/previewUrl priority and caching; restored two collapsed parameter lists and labeled screenshots. |
| `dataset/third-party/third_dataset` | Updated | Verified all four public endpoints and five adapter methods; inspected all 21 screenshots and wrote explicit English instructions for types, dispatch, public configuration, i18n, icons, menus, forms and root-path validation/writeback. Corrected two type-definition paths against the current checkout and the misplaced integration-document source path; explained historical layout/authentication variants while preserving example identifiers. |
| `index` | Retained | Verified the localized User Guide title/description and the shared Redirect destination to the getting-started route. |
| `getting-started/index` | Updated | Verified the complete Agent/Workflow/Dataset/Skill capability overview, cloud links and community channels; inspected overview screenshots and the core architecture diagram, added English stage descriptions and meaningful media labels. |
| `workspace/customDomain` | Retained | Verified v4.14.4 Cloud scope, plan eligibility, ICP/three-provider prerequisite, CNAME verification, daily checks, reconfiguration and WeCom example; complete English steps and image labels are present. |
| `workspace/team/invitation_link` | Updated | Verified v4.9.1 migration behavior, three expiry choices, single-use/unlimited limits, login/accept/ignore flow, ten-active-link cap and 30-day cleanup; corrected disabled-link scope and labeled screenshots. |
| `workspace/team/team_roles_permissions` | Updated | Verified resource permission tables, admin restrictions, ownership transfer, root access, all-member defaults and MongoDB schema; inspected the authorization diagram to clarify individual overrides and fallback, added collaborator/team permission actions, and scoped automatic team creation to default multi-team mode. |
| `version/cloud/intro` | Updated | Verified international/mainland service links, tracking parameters and separate-account caveat; polished the Mainland China label. |
| `version/cloud/faq` | Updated | Verified both login-provider lists, September 2024 phone-registration cutoff, account-switching advice, Lark support and the source's current Cloud model restriction; polished the Mainland China label. |
| `version/cloud/privacy` | Updated | Verified the March 3, 2024 date and every collection, disclosure, security, deletion, rights, minors, transfer and contact clause; preserved the no-training/no-extra-backup commitment and restored the policy-review purpose. |
| `version/cloud/terms` | Updated | Corrected stale English source date from March 3, 2024 to May 28, 2026 and stale Zhuhai entity to the source's Guangzhou entity, retaining the exact Chinese registered name beside its English transliteration. Verified all seven articles, 99% SLA, restrictions, fees, liability and IP provisions; restored describing/facilitating grooming and actual-or-perceived protected-characteristic language. |
| `version/opensource/intro` | Retained | Verified Community Edition scope, core features, license condition and repository/deployment/development references. |
| `version/opensource/license` | Retained | Verified Apache 2.0 additional conditions, multi-tenant SaaS authorization, logo/copyright constraints, contributor terms, design-patent statement and licensing contact. |
| `version/commercial` | Updated | Verified every edition-comparison cell, all deployment prices/terms/resources, six assisted upgrades, license delivery, technical service rate and support commitments; expanded the collapsed deployment notes, inspected all four screenshots, transcribed the displayed Sealos rates with their original units and added descriptive labels. |

## Delegated Guide Pairs

The remaining four complete source/counterpart reviews are owned by the dedicated long-page reviewer and recorded in [English Guide Long-Page Review](./english-review-guide-long.md): `admin/sso`, `build/general/ai_settings`, `dataset/rag`, and `getting-started/quick-start`. This ledger contains the other 70 page pairs.

## Navigation Metadata Review

All 20 Guide metadata pairs were read in full. Page order, folder references, root flags, icons, and numeric ordering are preserved.

| English metadata path under `document/content/guide` | Result | Review notes |
| --- | --- | --- |
| `admin/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/agentv2/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/general/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/publish/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/skill/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/tools/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/tools/system-plugins/meta.en.json` | Updated | Aligned System Tools capitalization and description with the current Chinese terminology. |
| `build/workflow/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `build/workflow/nodes/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `chat/meta.en.json` | Updated | Used a natural English label for the chat usage section. |
| `dataset/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `dataset/third-party/meta.en.json` | Updated | Used a natural plural category label; verified all five source types and page order. |
| `getting-started/meta.en.json` | Updated | Identified external videos and example solutions as Chinese; preserved their URLs and ordering. |
| `meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `version/cloud/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `version/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `version/opensource/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `workspace/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |
| `workspace/team/meta.en.json` | Retained | Verified translated title/description and all navigation structure against the Chinese metadata. |

## Validation and Handoff

- Read all 70 owned Chinese/English body pairs and all 20 Chinese/English navigation metadata pairs in full. The four delegated body pairs have a separate review ledger linked above.
- Confirmed that the body review ledger identifies 70 unique owned pages.
- Ran `node document/script/checkDocRefs.js` with all 70 owned English MDX paths. The check passed for those pages and all navigation metadata files.
- Ran `git diff --check` against the 70 owned body paths and 20 English navigation metadata paths. The whitespace check passed.
- Checked the 70 owned English bodies for empty image alternative text and the placeholder `alt text`; the scan found zero remaining matches.
- Handed the completed bodies to the parent task for final internal-link normalization to verified `/en/...` URLs. The existing reference checker discards fragments and accepts either language counterpart; the parent's locale-aware loader, heading, and rendering checks provide the additional release coverage.

This review did not run a production build, deployment, browser acceptance check, external API call, or documentation code example. The parent task owns the combined build, rendered-page, and locale-aware link validation. Historical examples were checked for source fidelity; the Batch Processing regular expression remains as supplied by the Chinese source, and the share-link callback's historical `price`/`totalPoints` field difference is explained in the English body.

## Residual-Language Follow-Up

- Retained the three Chinese input strings in each Batch Processing and Parallel Run translation example to preserve the original translation-into-English behavior. Added each string's precise English meaning and the expected ordered English output beside both examples. These literals are intentional bilingual fixtures.
- Translated all human-readable HTTP sample values, including the matching Bearer interpolation and response/JSONPath result values. Translated the share callback's queries, query expansion, citation question/answer, and complete history prompt/reply. Preserved the recorded protocol keys, identifiers, model names, numbers, line breaks, prompt delimiters and reference separators.
- Retained the intentional moderation character and its explanation. Preserved the exact legacy model label and supplied its English meaning. Those are the only remaining Chinese text in the share-link page.
- Passed targeted validation of 10 JSON objects, HTTP request interpolation, all 12 JSONPath extractions, three shell command blocks, and syntax for both translation-array JavaScript examples. Confirmed the callback's query/expansion, citation/answer and history relationships, and compared all protocol data and links against the pre-edit snapshot.
- Re-ran `checkDocRefs.js` for the four edited pages and `git diff --check` for their paths; both passed. This follow-up checks parsing and deterministic example relationships; it does not execute an external request or an AI translation.
