# English Guide Long-Page Review

Status: Complete. Scope: four Chinese/English page pairs, with three updated and one retained. These are the four delegated pages referenced by `english-review-guide.md`.

Method: Read each complete Chinese source and English counterpart using paired comparisons. Preserve existing headings, route paths, media paths, executable identifiers, numeric constraints, and version context. Check illustrated procedures against the surrounding English instructions and inspect the configuration screenshots and diagrams that supply missing operational details.

| Page under `document/content/guide` | Result | Review notes |
| --- | --- | --- |
| `admin/sso` | Updated | Reviewed all provider prerequisites, permissions, callbacks, environment variables, OAuth requests, standard endpoint responses, organization/member schemas, and adapter-development instructions. Synchronized all five SSO service image tags with the source's v4.14.16 and corrected the image-version comment. Inspected the SSO diagrams, provider icons, and member-settings screenshot; added English login-flow and button/member-sync instructions. Explained the screenshot's multi-team selection and deployment-specific address. Corrected the team-mode link to the English route and the JSON response label. |
| `build/general/ai_settings` | Retained | Reviewed all model capabilities, parameter-entry instructions, history limits, token/temperature/top_p/stop/format settings, multimodal 500-character and four-link limits, seven reasoning-effort levels, budget ranges, and provider-specific OpenAI/Gemini/Claude/Ali/Qwen/GLM/Kimi/Zhipu/DeepSeek/Doubao/Moonshot mappings. The existing English includes the complete configuration procedures, caveats, and numerical constraints. |
| `dataset/rag` | Updated | Reviewed the full theory, retrieval/generation flow, use cases, examples, and references. Restored the detailed challenges, implementation methods, examples, and expected effects omitted from sections 5.1–5.4. Clarified that BERT supplies embeddings and Faiss indexes/searches them. Inspected all three diagrams, added meaningful labels, and aligned the LegalBench-RAG explanation with the figure's comparison of retrieved evidence against annotated passages. Preserved all established headings and resource URLs. |
| `getting-started/quick-start` | Updated | Reviewed all four complete cases, prompts, setup steps, validation cases, and selection guidance. Rewrote literal prose while retaining the documented examples and constraints. Restored the email prompt's 200–500-character limit. Inspected the actionable app/tool/Dataset/workflow/VM screenshots, supplied field names and variable bindings, explained the JSON/plain-label screenshot variation, and documented exact branch labels, output controls, human-choice paths, and SMTP confirmation steps. Clarified the token-based citation setting using the Dataset engine reference. Added descriptive labels for all 40 existing screenshots. |

## Media and technical fidelity

- All 99 existing heading lines across the four pages remain unchanged: 33 in SSO, 29 in RAG, 22 in Quick Start, and 15 in AI settings. The heading comparison excludes fenced examples.
- All 64 Markdown image destinations remain in the same order: 18 in SSO, three in RAG, 40 in Quick Start, and three in AI settings. Shared image files remain unchanged.
- Quick Start's English prompt labels `Safe`, `Sensitive but Rewritable`, and `Prohibited` match the documented decision conditions. Its three user-choice labels and their destination variables are explained in text.
- The SSO provider image tags, environment-variable names, endpoint values, authentication placeholders, and cron values match the current Chinese YAML after normalizing equivalent single/double quoting and explanatory comments.
- Seven SSO JSON examples parse successfully. Seven curl examples pass shell tokenization. All 36 fenced blocks across the four pages are balanced and retain their original count.

## Source issues and bounded corrections

- Quick Start describes the retrieval citation limit as 1–2 entries. The Dataset engine's `Citation Limit` section and the inspected UI establish that this setting is measured in tokens. The English edition retains the intent to retrieve 1–2 relevant chunks and explains how the token budget controls their total size. The Chinese source remains unchanged.
- Quick Start's review screenshot includes a JSON response variant while its prose prompt and decision screenshot use plain classification labels. The English procedure uses the supplied plain-label prompt consistently and identifies the illustrated variant. The source's example moderation rewrites retain `best` → `industry-leading` and `100% effective` → `most users report it effective`; evidence for those replacement claims requires a separate source-content review.
- The SSO member-settings screenshot uses a historical service address and displays multi-team mode. The current source's environment example uses `http://fastgpt-sso:3000`, and the team-mode guide identifies member sync mode for external synchronization. The English instructions explain the selector and refer readers to their deployment address.
- RAG's LegalBench-RAG captioned link points to the same Apexon healthcare/life-sciences article as the medical use case. The original resource URL remains present under the agreed source-fidelity boundary. The source also makes broad accuracy/hallucination claims and generalizes LIME/SHAP as answer-provenance techniques; a separate technical source review should assess those assertions. Newly restored optimization sections describe expected effects with appropriately qualified language.
- The LegalBench-RAG diagram compares retrieved evidence with annotated source passages before generation. Its former English description instead compared generated answers with previous answers. The English explanation now follows the inspected diagram and the nearby benchmark definition; the 6,858 query-answer-pair figure remains intact.

## Local verification

- `node document/script/checkDocRefs.js document/content/guide/admin/sso.en.mdx document/content/guide/dataset/rag.en.mdx document/content/guide/getting-started/quick-start.en.mdx document/content/guide/build/general/ai_settings.en.mdx` passed for all four pages and all navigation metadata.
- Scoped `git diff --check` passed for the four content files.
- Read-only checks confirmed heading preservation, image order, balanced code fences, absence of unexpected CJK text, valid SSO JSON, parseable curl quoting, and source-equivalent SSO YAML scalar values.
- Final whole-document checks, MDX compilation, rendered acceptance, and the production build are performed by the integration owner after all review cohorts are frozen.
