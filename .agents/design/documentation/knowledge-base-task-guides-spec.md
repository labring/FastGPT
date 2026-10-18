# Knowledge Base Task Guides for FastGPT

Date: 2026-10-18 (Asia/Shanghai)

Status: Implementation authorized by the user on 2026-10-18. Twelve bilingual page pairs are implemented and locally validated. Product acceptance retains a pending team-selection prerequisite, tracked below. Tracker publication remains pending project setup.

## Problem Statement

FastGPT application builders need to follow the official documentation from importing their material to publishing a useful knowledge-backed application, maintaining its content, and recovering from common problems. Existing documentation already provides three reader entrances, bilingual content, a first-question-answering tutorial, and substantial feature coverage. The remaining difficulty is completing the steps between those entry points with enough information to recognize success and recover from failure.

Some pages combine configuration reference, implementation background, and operational advice. For example, retrieval guidance needs to explain when a setting actually takes effect and how a reranking fallback changes interpretation of the result. Data maintenance also requires distinct instructions for editing a Data chunk, uploading a replacement file, and reprocessing a stored source. Readers need observable checkpoints for these operations and for the transition from editor debugging to a Published version accessed through a Publishing channel.

The newly prepared engineering documentation provides a source-backed basis for these explanations. The user has designated that material as private. Public guides must express the relevant behavior through user tasks, conditions, and results, with evidence and implementation traceability retained in maintainer records.

## Solution

Improve the current documentation through a staged, task-oriented editorial program. Preserve the established Use FastGPT, Developers, and Deploy and Operate entrances, paired Chinese and English content, and continuity of effective topic URLs. The first delivery covers the Knowledge base journey: import material, verify retrieval, connect it to an Application, publish, update content, and troubleshoot.

The proposed first delivery optimizes eight existing bilingual page pairs and adds four bilingual how-to guide pairs. Each page has a primary Diataxis purpose: tutorial, how-to guide, reference, or explanation. Task navigation connects these pages in a usable sequence. Relevant historical material retains its version context.

Validate the key tasks by following the guides in an independent test team on official FastGPT SaaS. Use the existing fictional travel-policy example, known questions, an uncovered question, a controlled content update, and a reversible configuration failure. Validate the remaining page content against source behavior and the rendered reading paths. Keep source review, screenshot review, and successful product execution as separately recorded evidence.

## User Stories

1. As a first-time application builder, I want a clear starting task, so that I can create a useful knowledge-backed Application with a small amount of material.
2. As a returning reader, I want task navigation through import, retrieval, integration, publication, and maintenance, so that I can enter at my current stage.
3. As an application builder, I want the required permissions and available models listed before a task, so that I can prepare the correct team and account.
4. As a SaaS user, I want feature conditions stated beside the affected step, so that I can recognize the effect of my team permissions and available capabilities.
5. As a self-hosted reader, I want applicable version and configuration conditions identified, so that I can assess how the SaaS-based procedure applies to my deployment.
6. As a beginner, I want a small fictional source document supplied with the tutorial, so that I can reproduce the example without using company material.
7. As a beginner, I want known questions and expected facts, so that I can judge whether my setup works.
8. As a reader with existing material, I want guidance on choosing an import method, so that I can use the appropriate entry for my source.
9. As a reader importing a file, I want the current interface path and required choices, so that I can submit the material correctly.
10. As a reader preparing an import, I want to inspect parsed content and chunk boundaries, so that important conditions stay with their conclusions.
11. As a reader waiting for processing, I want observable status checkpoints, so that I can determine when retrieval can be tested.
12. As a reader facing a processing failure, I want a short recovery procedure, so that I can correct the cause and verify the affected material again.
13. As a Knowledge base maintainer, I want to distinguish content, Collections, Data chunks, and retrieval indexes, so that I can select the correct maintenance action.
14. As a reader testing retrieval, I want to inspect the returned material, so that I can confirm the expected source is available to the Application.
15. As an application builder, I want separate checks for retrieval and answer generation, so that I can locate the stage responsible for an incorrect answer.
16. As a reader evaluating an answer, I want to check its cited material, so that I can confirm the source supports the stated facts.
17. As a reader testing an uncovered question, I want the guide to define an acceptable response, so that I can evaluate how the Application handles missing information.
18. As a reader tuning retrieval, I want a fixed set of test questions, so that I can compare changes consistently.
19. As a reader tuning retrieval, I want to adjust one factor at a time, so that I can identify which change affected the result.
20. As a reader choosing a search mode, I want practical selection criteria and links to detailed parameters, so that I can match the mode to my material and questions.
21. As a reader using a relevance threshold, I want its effective conditions explained, so that I can interpret a result when the threshold is inactive.
22. As a reader using reranking, I want fallback behavior and available checks explained, so that I can diagnose results after a model or service failure.
23. As a reader comparing retrieval results, I want scoring, ordering, and answer quality explained separately, so that I can evaluate each using appropriate evidence.
24. As a reader configuring context limits, I want the effect of the citation budget explained, so that I can retain relevant content within the model's available context.
25. As an application builder, I want a reusable guide for connecting a Knowledge base to a Chat Agent, so that I can repeat the task with my own Application.
26. As an application builder, I want a verification checklist for the configured Application, so that I can check its answer and references before publication.
27. As an application builder, I want the relationship between editing, debugging, and the Published version explained, so that I can make configuration changes available to actual users.
28. As an application builder, I want to verify a Publishing channel with a new conversation, so that I can check the configuration used by that access point.
29. As an application builder, I want data updates and Application configuration changes explained separately, so that I can perform the relevant activation and verification steps.
30. As a Knowledge base maintainer, I want to edit a Data chunk and update its indexes, so that corrected information becomes available for retrieval.
31. As a Knowledge base maintainer, I want the completion and write-protection states explained, so that I can tell when an update is ready for verification.
32. As a Knowledge base maintainer, I want the file replacement procedure explained, so that I can introduce a new source and handle the previous Collection deliberately.
33. As a Knowledge base maintainer, I want same-name upload behavior explained, so that I can recognize and manage duplicate or conflicting Collections.
34. As a Knowledge base maintainer, I want the source used by reprocessing identified, so that I can understand how it affects hand-edited Data chunks.
35. As a Knowledge base maintainer, I want the effect of editing a local source file explained, so that I can take the required upload or synchronization action.
36. As a Knowledge base maintainer, I want to retest an updated fact in retrieval and a new Application conversation, so that I can verify the full update path.
37. As a reader facing an empty result, I want checks for processing status, enabled content, retrieval scope, and permissions, so that I can restore access to the intended material.
38. As a reader facing an incorrect answer, I want checks organized by observable symptom, so that I can choose an effective corrective action.
39. As a reader recovering from a configuration mistake, I want a final verification step, so that I can establish that the task works again.
40. As a reader requesting assistance, I want guidance on which sanitized error and task details to collect, so that an administrator can reproduce the problem.
41. As a reader importing structured data, I want a canonical template and valid examples, so that I can prepare rows and metadata correctly.
42. As a reader using tags or Collection permissions, I want links to the maintained specialist guides, so that I can investigate access and filtering conditions in context.
43. As an English-language reader, I want equivalent prerequisites, steps, examples, and verification criteria, so that I can complete the same tasks independently.
44. As a reader viewing shared screenshots, I want matching textual instructions and captions, so that I can follow the task across interface languages.
45. As a reader following an old bookmark or product help link, I want the destination and useful anchors preserved, so that I can still reach the relevant topic.
46. As a reader finishing a page, I want a clear next task and links to the appropriate reference or explanation, so that I can continue without searching the entire site.
47. As a documentation maintainer, I want each page to have a primary purpose and a clear content owner, so that corrections can be maintained consistently.
48. As a documentation maintainer, I want source evidence and operating conditions recorded privately, so that I can update public instructions when behavior changes.
49. As a reviewer, I want to distinguish source-backed guidance from successfully executed tasks, so that I can assess the strength and limits of each claim.
50. As a reviewer, I want acceptance criteria based on visible results, so that I can evaluate the guides without relying on internal implementation details.
51. As a documentation maintainer, I want navigation and bilingual compatibility checked together, so that restructuring preserves the complete reading journey.
52. As a documentation maintainer, I want the first delivery to establish reusable editorial and acceptance rules, so that later task chains can follow a consistent standard.

## Implementation Decisions

1. **Audience and priority.** Application builders remain the primary audience. Dedicated developer and operator entrances retain their roles. Prioritize the reader's ability to complete a task, with examples, result checks, and recovery instructions.

2. **Delivery scope.** The first delivery comprises eight existing bilingual page pairs and four new bilingual how-to guide pairs. The page-level inventory formalizes the proposed scope discussed with the user. Future batches can apply the same rules to Workflow, Tool, developer, and deployment topics.

3. **Existing page dispositions.**

   | Existing topic | Primary purpose | Intended change |
   | --- | --- | --- |
   | Create the first Knowledge base Q&A | Tutorial | Retain the complete guided lesson; verify its steps, media, expected facts, and published result through SaaS execution. |
   | Create and maintain a Knowledge base | Task entry | Provide the import-to-maintenance reading path and checkpoints, with links to focused guides. |
   | Knowledge base search strategy and parameters | Reference | Concentrate parameter meanings, defaults where verified, effective conditions, result interpretation, and relevant limitations. |
   | Template import | Reference with a short import procedure | Preserve the supported structured-data workflow; clarify canonical examples, column handling, metadata, and format errors. |
   | Knowledge base and RAG fundamentals | Explanation | Explain the relationships between source content, processing, indexes, retrieval, and answers using concepts that inform user decisions. |
   | Knowledge base frequently asked questions | Troubleshooting how-to | Organize symptoms into inspection points, corrective actions, and recovery checks. |
   | Published versions and Publishing channels | Publication how-to | Strengthen the configuration-publication and fresh-conversation checks needed by the Knowledge base journey. |
   | Sharing through an unauthenticated window | Sharing how-to | Strengthen the creation, access, and citation checks needed by the Knowledge base journey. |

4. **New page dispositions.**

   | New topic | Intended result |
   | --- | --- |
   | Import material and confirm processing is complete | The reader chooses the import entry, checks parsed content and chunks, understands status, and recovers from a failed item. |
   | Test retrieval and improve matching | The reader establishes fixed questions, changes one factor at a time, checks actual results, and interprets effective parameters. |
   | Connect a Knowledge base to an Application | The reader configures a Chat Agent, validates its answer and citations, and follows the existing publication guides. Relevant Workflow instructions remain linked to the maintained node guide. |
   | Update material and confirm the change takes effect | The reader selects the appropriate update method, waits for the relevant completion condition, and verifies retrieval and a fresh conversation. |

5. **Information architecture.** Keep the three established reader entrances. Place the focused tasks within the existing Knowledge base topic, with first-use, reference, explanation, and troubleshooting links placed where the reader needs them. Preserve valid topic URLs and useful anchors. Any justified consolidation uses an explicit successor mapping and the established permanent-redirect convention.

6. **Tutorial contract.** Use a fixed, small example with prerequisites, exact interface steps, intermediate checkpoints, expected facts, and a final published result. Keep the tutorial focused on a successful first journey and direct detailed choices to the relevant task or reference page.

7. **How-to contract.** Each guide states the task, prerequisites, relevant conditions, steps, expected observations, corrective actions, and verification after recovery. Include the next task and links to the relevant parameter reference or explanation.

8. **Reference contract.** Give each documented setting a clear meaning, relevant type or unit, verified default when applicable, effective conditions, and links to the tasks that use it. Tie model-dependent behavior and feature conditions to the actual environment and supported evidence.

9. **Explanation contract.** Explain how material, Collections, Data chunks, indexes, retrieval, citations, and model answers relate. Describe mechanisms only to the depth needed for configuration, diagnosis, maintenance, or an informed choice.

10. **Private evidence boundary.** The engineering documentation is private. Public pages contain task-oriented explanations and reader-accessible links. Maintainer records retain source anchors, implementation investigation, unresolved behavior, and acceptance evidence. Keep private filesystem links and engineering-document exports within the maintainer boundary.

11. **Terminology.** Follow the maintained product glossary for Knowledge base, Collection, Data chunk, Chat Agent, Application, Published version, and Publishing channel. Distinguish Application configuration, source content, indexed content, and conversation state when describing activation and maintenance.

12. **Retrieval guidance.** Explain how processing status, selected material, filtering, permissions, search mode, reranking, and citation budgets can affect the observed result. Explain actual-use conditions and fallback behavior supported by source evidence. Only instruct ordinary readers to inspect fields or interface controls that the target environment makes available to them.

13. **Data chunk edits.** Current source supports editing a Data chunk and explicitly updating its indexes. Describe the relevant write permission, progress or write-protection states, and completion check. Use this as the primary content-update acceptance path and verify the interface in the SaaS test team.

14. **File updates.** Current source treats another local upload, including a same-name upload, as creation of a new Collection. Explain how to introduce the replacement, validate its content, and handle the older Collection, including the permission and data consequences of each available action. Make clear that local-file changes enter the system through the relevant upload workflow.

15. **Reprocessing.** Current source reprocesses the server-held uploaded source when training settings are adjusted. Explain regeneration of Data chunks and the consequences for hand-edited content. Present this as a distinct task choice and retain the source-versus-runtime evidence distinction until verified in the selected environment.

16. **Publication and freshness.** Explain how editing and debugging relate to the Published version, and how source-content changes differ from Application configuration changes. Use a new conversation to verify the publishing access point and an updated fact. State results in terms of factual correctness, relevant citations, and the applicable configuration.

17. **Example continuity.** Reuse the existing fictional travel-policy example and its questions. The initial policy states a 15-calendar-day submission period and the required supporting documents. The update scenario changes the period to 30 days. Keep the fixture, prompt intent, expected facts, and source references equivalent across languages.

18. **Controlled recovery example.** Use a reversible change to the test Collection's enabled state to exercise an empty-result investigation and recovery, subject to confirming the available SaaS controls and permissions. Limit the exercise to the independent team's designated test resources.

19. **Bilingual delivery.** Update Chinese and English together. Review prerequisites, procedures, examples, conditions, expected results, and recovery steps as a pair. Shared media requires captions and instructions that allow each language edition to stand on its own.

20. **Media and evidence.** Reuse relevant inspected assets and refresh media when the verified procedure requires it. Record the environment, date, available capabilities, selected model, action, and observed result privately. Public screenshots contain only the information needed to explain the task.

21. **Target environment.** The user selected official FastGPT SaaS with an independent test team for key-task acceptance. Use its actual interface and observed results for the public procedures. Use source behavior to explain mechanisms and qualify deployment-specific differences. Establish the exact team, access method, relevant permissions, and model availability before product operations begin.

22. **Existing platform and ownership.** Use the existing Next.js/Fumadocs content, navigation, and validation facilities. Maintain official-documentation ownership of user tasks and public references. Product behavior and API contracts remain owned by their current application modules.

23. **Execution sequence.** Reconcile the twelve page pairs and their dependencies; prepare linked bilingual drafts; execute the key tasks and refine the affected text and media; review the remaining content against source; run focused documentation checks and reader-path acceptance; record the resulting evidence and remaining limitations.

## Testing Decisions

1. **Confirmed primary seam.** Use the complete reader journey as the highest practical seam: a reader starts from a rendered guide, performs the documented actions in the independent SaaS test team, and checks the promised observable result. The user explicitly selected key-task product execution, source and reading-path checks for remaining pages, and the official SaaS test environment. These choices satisfy the test-boundary confirmation for this specification.

2. **Good tests.** Assert visible processing states, relevant retrieved content, supported answer facts, useful citations, publishing-channel behavior, update freshness, and successful recovery. Evaluate generated answers against facts and required handling of missing information. Record the selected model and conditions so that variation can be interpreted.

3. **Key product acceptance scenarios.**

   | Scenario | Procedure and observable completion criteria |
   | --- | --- |
   | First successful journey | Import the travel policy, inspect the material, wait for the relevant processing completion, verify the expected source with the known questions, connect a Chat Agent, publish its configuration, and repeat the checks through the sharing access point in a new conversation. Answers contain the 15-day period and the required supporting documents, with relevant citations. |
   | Missing information | Ask about an accommodation allowance that the supplied policy leaves unspecified. The Application explains the missing policy information, and the reviewer checks the answer against the actual source. |
   | Updated content | Edit the test Data chunk to change the submission period from 15 to 30 days, update indexes, wait for the observable completion state, repeat retrieval, and ask again in a new conversation. The retrieved content, answer, and citation passage reflect the new period. |
   | Recoverable configuration failure | Temporarily disable the designated test Collection, follow the documented checks to identify the unavailable material, restore the enabled state, and repeat retrieval and the relevant question. Record the failure symptom and recovered result. |

4. **Affected surfaces.** Review the tutorial, Knowledge base task entry, four new how-to guides, search and template references, RAG explanation, troubleshooting page, and the relevant publication and sharing instructions. Verify their navigation, contextual links, localized counterparts, and supported incoming anchors together.

5. **Existing test prior art.** Reuse the documentation link/reference checker, English-counterpart and content checker, navigation-coverage checker, their existing Node test-runner fixtures, and rendered-site HTTP acceptance. Existing locale, sitemap, and redirect checks provide regression coverage when navigation or routing changes touch those behaviors. Existing shell-example checks apply if the edited material changes those examples.

6. **Documentation checks.** Run the relevant documentation checks, MDX compilation through the existing build, and type checking for any affected site integration. Inspect the key rendered reading paths in both languages, including tables, figures, mobile navigation, and contextual links. Add a focused regression case only when changed behavior creates a concrete coverage gap. Repository-wide business tests remain governed by the project's final-acceptance rule.

7. **Private-reference checks.** Inspect new and edited public pages and their exports for links to private engineering material, local filesystem addresses, and maintainer-only evidence. Verify that reader-facing links have the intended public or generated-reference destination.

8. **Source-backed checks.** Cross-check effective retrieval conditions, update methods, permissions, processing states, and publication semantics against their current owners. Reconcile source and SaaS differences explicitly. Mark remaining operational gaps as such in maintainer records and qualify affected public instructions by their actual evidence.

9. **Bilingual acceptance.** Check that each language edition supports the same prerequisite, action, result, and recovery path. Product-task evidence should identify which written procedure was followed. Translation review should compare technical meaning and task completeness in addition to structure and terminology.

10. **Completion criteria.** Account for all eight existing and four new bilingual page pairs; complete the four key product scenarios or record a concrete unresolved prerequisite; preserve the relevant reading paths and compatible entry points; pass the affected documentation checks; and retain a per-topic evidence record. A task with an unresolved product prerequisite retains its pending acceptance state.

## Out of Scope

- Full rewrites of the Workflow, Tool, Skill, developer-integration, and deployment topic families during this first delivery. These remain later batches in the broader program.
- Public distribution of the private engineering documentation or its source-tracing inventory.
- Product-runtime changes, database or index migrations, application API changes, and deployment configuration changes.
- Replacing the documentation framework, search infrastructure, component system, or content-management platform.
- Broad rewrites of sharing authentication and callback protocols beyond the first Knowledge base journey's publication and access checks.
- Applying current behavior to historical upgrade instructions. Historical content retains its original version scope.
- Exhaustive execution of every provider, format, deployment backend, permission matrix, or infrastructure-failure scenario. Source review and documented conditions cover the remaining first-delivery material.
- Changes to existing customer resources, operational experiments outside the designated test team, or general production operations.
- Publishing the documentation website, deploying application changes, or starting implementation merely by preparing or publishing this specification.
- SEO traffic measurement, analytics integration, and ranking targets. Established URL and language-compatibility requirements remain part of documentation acceptance.

## Further Notes

- **Confirmed by the user:** task completion is the primary objective; the engineering documentation stays private; public content is rewritten around user tasks; Knowledge base import-to-maintenance is the first task chain; key tasks receive product execution while remaining content receives source and reading-path checks; and the product acceptance environment is official SaaS with an independent test team.
- **Inherited decisions:** application builders are the primary audience, with dedicated developer and operator entrances; Chinese and English are maintained together; effective topic URLs remain stable; existing product terminology and version-specific historical material are preserved.
- **Page-level scope:** the eight-plus-four page-pair plan captures the implementation proposal discussed immediately before the request for this specification. This document provides the concrete delivery and acceptance scope for implementation authorization.
- **Evidence baseline:** the inspected official content contains 281 Chinese/English page pairs, including 137 historical upgrade pairs. The private engineering documentation was sourced at revision 32918084743600bc255a988b55103bf4660b6037. The public procedures will carry the conditions of the actual SaaS acceptance environment.
- **Current evidence:** planning involved read-only documentation and source investigation. The four product scenarios in this specification are future acceptance work. Existing screenshots and source-backed behavior retain their recorded evidence boundaries.
- **Operational prerequisites:** the exact SaaS test-team entry, access method, usable model configuration, permissions, and available quota are established at execution time. Use fictional material and clearly identifiable test resources.
- **Tracker publication:** the existing draft identifies GitHub Issues in yangchuansheng/FastGPT as the intended destination. Completed tracker and triage-label configuration remains pending in the repository instructions. Run `/setup-matt-pocock-skills` to record the project configuration, then publish this specification to the configured tracker with `ready-for-agent`. Publication remains pending.
- **Implementation authorization:** the user invoked `implement` for this specification on 2026-10-18, authorizing the scoped documentation changes, product-task acceptance, review, and a local commit. Website publication and Git push remain outside this delivery.


### Implementation and acceptance ledger — 2026-10-18

This ledger accompanies the specification and the existing reconstruction inventory. Public procedures follow the approved `documentation-writer` contracts. The approved documentation glossary in `document/CONTEXT.md` governs this batch; UI labels are quoted only where established. Engineering material remains private.

| Page pair (under `document/content/`) | Primary purpose / owner | Evidence and disposition |
| --- | --- | --- |
| `guide/getting-started/knowledge-qa` | Tutorial / official documentation | Existing fixture and media retained; processing, citation, missing-information, and published-result checkpoints added. Product execution pending. |
| `guide/dataset/lifecycle` | Task navigation / official documentation | Links import → retrieval → integration → publication → maintenance, with completion checkpoints. |
| `guide/dataset/import-data` | How-to / official documentation | New local-file procedure, source choices, progress states, recovery, and same-name upload boundary. |
| `guide/dataset/test-retrieval` | How-to / official documentation | New fixed-question baseline, one-factor changes, effective parameters, and reversible recovery exercise. |
| `guide/dataset/connect-application` | How-to / official documentation | New Chat Agent procedure, known and uncovered questions, citation checks, and Workflow handoff. |
| `guide/dataset/update-data` | How-to / official documentation | New chunk-edit, replacement-upload, and stored-source reprocessing paths; permissions and freshness checks. |
| `guide/dataset/dataset_engine` | Reference / official documentation | Effective score conditions, rerank fallback, citation budget, modes, scope, and model-dependent image behavior. Legacy headings retained as aliases. |
| `guide/dataset/template` | Reference / official documentation | Canonical CSV/XLSX examples retained; header normalization, compatible index column, single-column expansion, empty rows, and verification added. |
| `guide/dataset/rag` | Explanation / official documentation | Relationships and decision consequences; legacy heading aliases preserve bookmarks. |
| `guide/dataset/faq` | Troubleshooting how-to / official documentation | Empty results, incorrect answers, stale data, recovery verification, and sanitized escalation details. |
| `guide/build/publish/versions` | How-to / official documentation | Distinguishes content indexing from configuration publication and checks a new channel conversation. |
| `guide/build/publish/link` | How-to / official documentation | Basic access and citation verification; authentication/callback material retains its existing scope. |

Source evidence at baseline `32918084743600bc255a988b55103bf4660b6037`:

- Import and processing: `projects/app/src/pageComponents/dataset/detail/CollectionCard/Header.tsx`, `projects/app/src/pages/api/core/dataset/collection/create/localFile.ts`, `packages/service/core/dataset/collection/controller.ts`, and `projects/app/src/service/core/dataset/queues/datasetParse.ts`.
- Retrieval: `projects/app/src/pages/api/core/dataset/searchTest.ts`, `packages/service/core/dataset/search/index.ts`, and `packages/service/core/dataset/search/defaultRecall/{index,rerank,result}.ts`. Score filtering uses actual rerank state, pure semantic score fallback, and retention of candidates without the selected score.
- Updates: `projects/app/src/pageComponents/dataset/detail/DataCard.tsx`, `projects/app/src/pages/api/core/dataset/data/update.ts`, `projects/app/src/service/core/dataset/data/data.ts`, `projects/app/src/pages/api/core/dataset/collection/create/reTrainingCollection.ts`, and `packages/service/core/dataset/read.ts`.
- Permissions: `packages/service/support/permission/dataset/auth.ts`, `projects/app/src/pages/api/core/dataset/collection/delete.ts`, and the maintained Collection-permission guide. Public instructions retain identity-dependent access conditions.
- Template parsing and publication evidence remain linked by topic in `reconstruction-pages.csv`; this batch extends those records rather than replacing previous evidence.

Product acceptance environment: `https://cloud.fastgpt.cn`, accessed through user-requested `ego-browser`, displayed version 4.17.3 on 2026-10-18. Existing login works. The current team is `fastgpt 团队`, member label `QA test`. Team authorization for newly isolated test resources is pending the user's response; no product mutations have been made. Models will be recorded when selected. Account identifiers and credentials are excluded from this ledger.

| Product scenario | Status | Required evidence |
| --- | --- | --- |
| First usable published answer | Pending team selection | Imported fixture, completed indexes, known retrieval, Chat Agent answer, shared-link new conversation, supporting citations |
| Missing information | Pending team selection | Hotel-allowance question and answer checked against the actual source |
| Update from 15 to 30 days | Pending team selection | Chunk update, index completion, new retrieval, answer, and cited passage |
| Disable and restore test Collection | Pending team selection | Failure symptom, identified disabled state, restored retrieval and answer |

Local validation: documentation reference, bilingual, and three-entrance navigation checks passed (285 pairs); all 12 existing documentation check tests and all 12 HTTP acceptance tests passed; TypeScript check and the final production build passed (579 generated pages). All 24 affected article routes rendered through ego-browser with matching localized headings and no private links. A focused MDX-parser check preserved all 203 existing heading IDs and verified edited fragment destinations. Desktop Chinese import and English retrieval layouts, tables, loaded media, and contextual links were inspected. At a 390 × 844 viewport, the English mobile navigation displayed all four new guides with readable wrapping and the correct active page; the viewport override was cleared afterwards. Full repository business tests are deferred until final user acceptance. Existing public screenshots retain their previous evidence level; this batch has produced local-site review screenshots only. Build output retains pre-existing workspace-root and standalone-start warnings; production deployment remains outside this task.

Review outcomes, kept as separate axes:

- **Standards:** two findings, both fixed in Chinese and English. Recovery now requires Collection write permission; general import and integration guides explicitly distinguish the travel fixture from the reader's own question set.
- **Spec:** three findings, all fixed in Chinese and English. Search testing starts from the target Knowledge base without assuming a Collection selector; reprocessing uses the opened Collection's top action with the correct English label; rebuilding requires reselecting a fixed Collection filter and republishing affected Workflow configuration.
- **Remaining acceptance prerequisite:** the four product scenarios require confirmation of the current team's isolated test resources or identification of another test team. Login and read-only inspection succeeded. No SaaS mutations or model requests were performed.

Implementation checklist:

- [x] Draft eight existing and four new page pairs with paired navigation.
- [x] Preserve existing topic URLs and legacy headings in the rewritten references.
- [x] Keep private engineering references outside public MDX.
- [x] Complete production build and rendered bilingual reading paths.
- [x] Retain the concrete team-selection prerequisite for each SaaS scenario; execution remains pending.
- [x] Resolve Standards and Spec review findings.
- [x] Prepare the scoped local commit on `documentation/reconstruction`; the Git history records the completed commit.
