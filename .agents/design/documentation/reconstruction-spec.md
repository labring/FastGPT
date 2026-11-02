# Reconstruct the bilingual FastGPT documentation around reader tasks

## Problem Statement

Application builders need a clear path from choosing a FastGPT application type to connecting knowledge, configuring capabilities, testing, publishing, and maintaining the result. The current documentation spreads these tasks across long tutorials, reference material, historical upgrades, and product descriptions with different levels of freshness. Readers must assemble their own learning path and determine which instructions match their environment.

The current inventory contains 257 Chinese pages and 257 English counterparts. Upgrade material accounts for 137 Chinese pages, approximately 53.3% of the inventory. The quick-start page combines several substantial examples, and the knowledge-base section introduces extensive retrieval theory before a first successful task. Several current capabilities need updated or dedicated guidance, including workflow Agent nodes, Skills, collection tag conditions, published versions, and MCP connections.

Developers need a reliable transition from authentication and a first successful request to current generated API references. Operators need a separate deployment and maintenance path. Both audiences must be able to recognize historical instructions, product-version requirements, and access conditions. Existing bookmarks, search results, product help links, and language counterparts must remain useful throughout the reconstruction.

## Solution

Reconstruct the documentation in Chinese and English around three stable reader entrances: **Use FastGPT**, **Developers**, and **Deploy and Operate**. Prioritize application builders on the home page, with a first knowledge-base question-answering task as the main starting point. Offer clear routes for application selection, a first workflow, a first Agent task, integration, and installation.

Use Dify's separation of task guidance, concepts, and reference material as an information-architecture reference. Organize FastGPT guidance around its own application types, knowledge objects, tools, Skills, publishing behavior, and management boundaries. Retain the existing Next.js and Fumadocs foundation and reuse the documentation site's components and checking tools.

Use the SaaS interface captured on 2026-10-15 for interaction wording and task order, cross-check behavior against FastGPT source, and state applicable version, deployment, licensing, plan, configuration, and permission conditions. Reconstruct the Chinese and English editions together with technical parity and independently understandable English procedures.

The recommended migration policy retains effective topic URLs, updates current guidance at those addresses, organizes historical material by version, and uses direct permanent redirects for justified page consolidations. Readers should reach a relevant current answer or a clearly identified historical reference from every retained entry point.

## User Stories

1. As a first-time application builder, I want a clear starting task on the home page, so that I can produce a useful result without first surveying every feature.
2. As a first-time application builder, I want to choose among Chat Agent, Chat Agent V2, and Workflow, so that my application type matches the task I want to accomplish.
3. As a new knowledge-base user, I want to create a small question-answering application from my own material, so that I can verify the value of retrieval with a concrete example.
4. As a new workflow builder, I want a short complete workflow tutorial, so that I can understand inputs, connections, execution, and outputs together.
5. As a new Agent user, I want a complete Agent task with clear prerequisites and expected results, so that I can evaluate its planning and tool-use behavior.
6. As a reader arriving with a specific goal, I want task-oriented home-page links, so that I can enter the relevant guide directly.
7. As a returning reader, I want stable navigation and meaningful breadcrumbs, so that I can orient myself from a bookmarked article.
8. As a reader learning a procedure, I want concepts and parameter details linked from the relevant step, so that I can resolve questions while preserving my place in the task.
9. As a Chat Agent builder, I want accurate guidance for instructions, model selection, and associated knowledge, so that I can configure a useful conversational application.
10. As a Chat Agent V2 builder, I want to understand tools, knowledge, Skills, and execution-environment requirements, so that I can configure capabilities available to my account.
11. As a workflow builder, I want to understand the Agent node as a workflow capability, so that I can combine planned steps with autonomous task execution.
12. As a workflow builder, I want node references with inputs, configuration, outputs, and boundaries, so that I can connect nodes correctly.
13. As a workflow builder, I want a complete document-parsing example, so that I can understand how parsed content enters a working flow.
14. As a workflow builder, I want clear examples of variables, branching, data transformations, and interaction, so that I can build and debug a predictable process.
15. As an application maintainer, I want the distinction between editor drafts, the initial published version, and subsequent publishing explained, so that I know which changes reach users.
16. As an application maintainer, I want to distinguish a published version from a publishing channel, so that I can manage application behavior and access separately.
17. As a knowledge-base owner, I want a guide to creating a knowledge base and choosing an import method, so that I can bring in the appropriate source material.
18. As a knowledge-base owner, I want to understand collections, folder collections, data chunks, and retrieval indexes, so that I can organize and maintain my content.
19. As a knowledge-base owner, I want to preview segmentation and understand processing status, so that I can assess imported material before relying on it.
20. As a knowledge-base owner, I want to run a retrieval test and interpret its results, so that I can improve the material returned to an application.
21. As an application builder, I want to associate a knowledge base with an application and test a question, so that I can verify the complete retrieval-to-answer path.
22. As a knowledge-base maintainer, I want current guidance for collection tags and filter conditions, so that I can control the scope of retrieval.
23. As a knowledge-base maintainer, I want guidance for updates, synchronization, permissions, and failures, so that I can keep connected applications reliable.
24. As a tool user, I want to distinguish system tools, workflow tools, HTTP tools, and MCP tools, so that I can choose the right integration approach.
25. As a workflow-tool author, I want to understand its inputs, outputs, calling behavior, and independent execution, so that I can reuse a workflow effectively.
26. As an HTTP-tool user, I want setup and troubleshooting guidance based on verified behavior, so that I can diagnose connection and execution problems.
27. As an MCP-tool user, I want current connection guidance covering Streamable HTTP and compatible SSE behavior, so that I can connect external capabilities successfully.
28. As a Skill author, I want to understand how instructions and supporting files are managed and published together, so that I can create a reusable Skill resource.
29. As a Skill user, I want separate integration guidance for Chat Agent V2 and workflow Agent nodes, so that I can configure Skills in the correct place.
30. As a Skill user, I want accurate initialization and runtime troubleshooting guidance, so that I can investigate failures in the applicable environment.
31. As an application publisher, I want guidance for publishing changes and choosing an access channel, so that users receive the intended application behavior.
32. As an application publisher, I want clear sharing-link and website-embedding procedures, so that I can make an application accessible to its audience.
33. As an integration owner, I want to distinguish an external MCP tool from a FastGPT MCP service, so that I configure the correct direction of integration.
34. As an integration owner, I want API, MCP, and third-party channel guides to explain their own prerequisites, so that I can choose and configure a supported access method.
35. As an application maintainer, I want to inspect conversation logs, execution details, and feedback, so that I can understand real application behavior.
36. As an application maintainer, I want evidence-backed evaluation and troubleshooting guidance, so that I can investigate quality problems and assess improvements.
37. As a team administrator, I want to understand team roles and resource collaborator permissions, so that I can grant the appropriate access.
38. As a team administrator, I want model, portal, usage, billing, and domain guidance with clear availability conditions, so that I can manage the features available to my team.
39. As a developer, I want a first API request with address, credentials, application selection, and expected output explained, so that I can establish a working integration.
40. As a developer, I want guidance for streaming results and errors, so that my integration can handle successful and failed requests predictably.
41. As a developer, I want current application, conversation, and knowledge-base integration guides, so that I can implement common tasks from maintained instructions.
42. As a developer, I want to understand the purposes of System OpenAPI and Dev API, so that I choose the appropriate reference for my integration.
43. As a developer maintaining an older integration, I want the current application-selection convention and legacy compatibility behavior explained, so that I can migrate deliberately.
44. As an integration developer, I want API identity-proxy body fields and MCP identity-proxy headers documented separately, so that I can pass the intended member identity correctly.
45. As an integration developer, I want identity-proxy enablement, active-member requirements, resource permissions, and trusted-server responsibilities explained, so that my integration respects the user's access.
46. As an API credential owner, I want credential limits and expiration conditions documented accurately, so that I can understand the controls available in my edition.
47. As an extension developer, I want clear entry points for tool, model, and Skill development, so that I can find the relevant extension contract and workflow.
48. As a deployment operator, I want a separate installation path with prerequisites and expected startup results, so that I can bring up FastGPT in my chosen environment.
49. As a deployment operator, I want configuration guidance for models, channels, storage, databases, and execution environments, so that I can connect the required services.
50. As a platform administrator, I want root administration, commercial licensing, SSO, and team-mode boundaries explained, so that I can manage the platform at the correct scope.
51. As a deployment operator, I want guidance for monitoring, backups, restoration, migration, and common failures, so that I can maintain an existing deployment.
52. As an upgrading operator, I want a current upgrade entry point and preserved version-specific instructions, so that I can select the steps appropriate to my installed version.
53. As a reader following an existing bookmark, search result, or product help link, I want the address to resolve to the same relevant topic or a precise successor, so that I can continue my task.
54. As a reader searching for an older version, I want historical pages and search snippets to show their version context, so that I can identify applicable instructions.
55. As an English-language reader, I want complete procedures with matching prerequisites, examples, limitations, and results, so that I can perform the same tasks as a Chinese-language reader.
56. As a bilingual reader, I want language switching to reach the corresponding topic, so that I can change language while preserving context.
57. As an English-language reader viewing shared Chinese screenshots, I want independently understandable English steps and captions, so that I can follow the procedure accurately.
58. As a reader using a mobile device or keyboard navigation, I want usable navigation, search, article controls, and content, so that I can complete the same reading tasks across devices.
59. As a reader using site search, I want relevant results with recognizable current or historical context, so that I can select an applicable answer.
60. As a reader arriving through a search engine, I want accurate titles, descriptions, language metadata, and final destinations, so that I can identify the relevant FastGPT guidance.
61. As a user consuming machine-readable documentation, I want language-specific exports, so that my tools receive the requested language consistently.
62. As a documentation maintainer, I want a disposition and review record for every existing page pair, so that I can demonstrate complete coverage.
63. As a documentation maintainer, I want shared terminology, page templates, evidence records, and contribution guidance, so that future product changes can be documented consistently.
64. As a documentation maintainer, I want automated checks and reader-focused acceptance scenarios, so that broken references, language drift, and discovery regressions are detected before release.

## Implementation Decisions

1. **Audience and languages — confirmed.** Application builders are the default audience. Developers and operators receive dedicated entrances. Chinese and English content, navigation, terminology, and reader-facing UI are delivered together with technical parity.

2. **Product baseline — confirmed.** SaaS screenshots from 2026-10-15 establish the interface baseline. Source behavior is cross-checked against the researched revision, whose application version field is 4.17.3. Availability is described through separate version, deployment, license, plan, configuration, permission, and model-capability conditions. A source implementation and a captured screen each have a defined evidentiary scope.

3. **Primary information architecture.** Use the following task groupings within three stable sections:

   | Section | Groups |
   | --- | --- |
   | Use FastGPT | Get started; Build applications; Workflow node reference; Knowledge bases; Tools and Skills; Publish and integrate; Run and improve; Team and account |
   | Developers | API getting started; Integration tasks; Current generated references; Extension development; Historical API parameters and migration |
   | Deploy and Operate | Deployment choices and installation; System configuration; Platform administration; Operations and troubleshooting; Versions and upgrades |

4. **Home-page hierarchy.** Make the first knowledge-base question-answering task the primary action. Include application selection and a first workflow near the starting point. Follow with task cards covering construction, knowledge, capabilities, publication, and improvement, plus clear developer and deployment entrances. Keep terminology consistent with the product's visible interface.

5. **Navigation implementation.** Reuse Fumadocs metadata, cross-directory references, exclusions, and section grouping. Keep navigation ownership, section switching, breadcrumbs, selected state, and previous/next links consistent after regrouping. The research prototype preserved all existing URLs while grouping each substantive page once; implementation must verify the rendered result.

6. **Affected module boundaries.** Work reaches bilingual content and navigation, the home page and section controls, the sidebar, search presentation, language switching, metadata and discovery outputs, selected media, documentation checks, and contribution guidance. Product help links are compatibility consumers. The existing Next.js/Fumadocs foundation, MDX components, cards, search, language controls, and version timeline remain the implementation foundation.

7. **Inventory and migration accounting.** Track one disposition per existing Chinese/English page pair. The current plan classifies 110 pairs for current-content review, 138 for historical preservation, three API pairs for current-guide replacement plus historical parameter archives, and six entry/index pairs. Historical preservation includes 137 upgrade pages and one older rendering guide. Reconcile any intervening repository changes before implementation and extend the inventory for each new bilingual topic.

8. **Page types.** Task guides contain a goal, prerequisites, interface path and steps, expected results, problem handling, and a next step. Reference pages contain responsibility, inputs, configuration, outputs, boundaries, and a verified example. Concept pages explain relationships and selection criteria. Long tutorials become an entry page plus focused task guides while preserving useful existing entry points and anchors.

9. **Application terminology.** Product guides define Application through Chat Agent, Chat Agent V2, and Workflow. An Agent node is a workflow capability. A workflow tool is a reusable callable workflow that can also execute independently. Developer documentation explains the supported resource scope of application identifiers per interface.

10. **Knowledge terminology and lifecycle.** A Knowledge base contains Collections. Content collections hold imported or manually added Data chunks; folder collections organize other collections. Retrieval indexes provide searchable representations. Cover creation, import, segmentation preview, processing status, retrieval testing, association with applications, tagging, permissions, and maintenance in a connected path.

11. **Tool and Skill boundaries.** A Tool is a callable operation with defined inputs and outputs. A Skill is a reusable versioned resource that publishes one or more sets of instructions and supporting files together. An MCP tool brings external capabilities into FastGPT. An MCP service exposes selected FastGPT capabilities to another client. Explain each direction and each integration surface explicitly.

12. **Publication behavior.** Explain the initial published version created with an application, draft behavior during editing and debugging, and publishing changes for actual access. Separate the Published version from the Publishing channel. Identify which behavior belongs to the published configuration, current application metadata, or existing conversation state.

13. **Current-content corrections.** Address workflow Agent-node references and Skill integration; complete document-parsing guidance; document current collection-tag conditions; correct Skill initialization troubleshooting; explain current MCP transports; and add or strengthen task coverage for HTTP tools, versions, logs, portals, team models, and scheduled triggers where evidence supports the instructions.

14. **API documentation ownership.** The documentation site owns integration tasks, authentication guidance, examples, migration explanations, and the route to generated references. Application-generated System OpenAPI describes explicitly API-key-accessible contracts; Dev API serves the internal development surface. Generated-reference gaps found during research are documented as known cross-surface limitations and tracked separately when they require application contract changes.

15. **API and identity-proxy correctness.** Explain the verified application-selection order: request-body application identifier, Bearer suffix, then legacy key binding. Recommend the current team-level-key and explicit-application convention. Describe API identity-proxy fields in the request body and MCP identity-proxy fields in headers separately. Cover owner enablement, creator disablement, active members in the same team, resource and conversation permissions, compatible credential conditions, and identity derivation by a trusted server. Preserve exact executable field names when implementation examples are authored and verified.

16. **Accepted URL and SEO migration policy.** Preserve addresses for topics that remain relevant and update their content in place. Turn the existing application, chat, and knowledge-base API topic pages into current integration guides, and place older parameter details in clearly identified archives with reciprocal links. Keep version-specific upgrade URLs and their own canonical identities. For justified consolidation, map each old address directly to the corresponding final page with a server-side 301 or 308, update internal links, and retain the redirect for the long term. The user explicitly accepted this recommended URL policy on 2026-10-16.

17. **Language and discovery outputs.** Preserve the Chinese documentation host at doc.fastgpt.cn and the English host at doc.fastgpt.io. Align canonical URLs, reciprocal hreflang links, sitemaps, language switching, and final destinations with those host assignments. Preserve useful heading anchors. Give current pages accurate titles and descriptions; identify historical version context in titles, descriptions, article content, and search results. Generate machine-readable exports for the requested language.

18. **Bilingual editorial contract.** Review prerequisites, procedures, values, examples, limitations, and expected results together for both languages. Keep historical instructions in their original version context. Assess suitable existing prose for retention. English procedures and captions must support the task independently when media uses Chinese UI labels. Keep editorial review records and evidence provenance in maintainer-facing materials.

19. **Media selection.** Keep all 899 screenshots in the research inventory and select the subset that explains actual steps. Validate every published image for legibility, relevance, accessibility text, and sensitive fields. Shared media is acceptable when both languages provide complete instructions. Research coverage, full-resolution field review, and a successfully executed product flow are recorded as distinct evidence levels.

20. **Maintenance contract.** Update the contribution guidance and shared domain glossary. Record page dispositions, semantic review outcomes, evidence references, historical context, and unresolved operational examples together with the reconstruction work. Retain existing user changes and use the established documentation tooling and dependencies.

21. **Implementation sequence.** First complete bilingual main-path drafts and navigation prototypes; then review and reconstruct current content and API guides; then complete site navigation, media, SEO, and discovery behavior; finally reconcile the complete inventory and run compatibility, build, and reader-task acceptance. Historical pages participate in coverage, language, navigation, and compatibility checks while retaining their version-specific meaning.

22. **Execution boundary.** The earlier planning request authorized specification preparation. The subsequent `/goal $implement` request on 2026-10-16 authorizes bilingual content rewrites, documentation-site implementation, scoped verification, review, and a commit on the current branch. Production publishing remains a separate action.

## Testing Decisions

1. **Confirmed primary seam.** The user confirmed acceptance at the rendered documentation-site boundary on 2026-10-16. Test the behavior readers observe through URLs, navigation, search, language selection, rendered content, and discovery responses. Prefer the existing site boundary and checking tools; add focused regression coverage when changed logic introduces an uncovered behavior.

2. **Good tests.** Assert destinations, visible content, language, expected status, accessible controls, and public metadata. A useful failure identifies a broken reader task, missing counterpart, invalid reference, wrong locale, or incorrect response. Evaluate semantic content through page review against source and screenshots; automated structural checks establish structural evidence.

3. **Prior art.** Reuse the documentation reference and navigation-coverage checker, the English counterpart and content checker with Node test-runner fixtures, and the sitemap locale regression tests. Existing fixtures cover missing language counterparts, translated heading anchors, unresolved relative links, reader-facing language leakage, and release-date parity. Existing sitemap tests exercise response status, content type, locale selection, generated URLs, and modification dates. Preserve these behavioral contracts when extending coverage.

4. **Inventory and compatibility coverage.** Account for all 514 existing language pages and each added page. Verify direct availability or the recorded final redirect target for migrated addresses, useful legacy fragments, and product help-link destinations. Verify each substantive page's intended navigation placement and the correspondence of language pairs. Check external documentation and generated-reference links selected for the primary tasks.

5. **Reader-task acceptance.** Exercise the following scenarios in Chinese and English:

   | Scenario | Expected observable result |
   | --- | --- |
   | First visit and application selection | The reader can identify the starting task and choose among the three application types using their stated use cases. |
   | First knowledge-base question-answering task | The guide provides prerequisites, a connected creation-to-publishing sequence, expected results, and usable next steps. |
   | First workflow and Agent task | Each has a complete reading path, clear application/node terminology, and relevant capability requirements. |
   | Developer integration | A reader reaches authentication, first-call, streaming/error guidance, and the appropriate current reference. |
   | Deployment and upgrade | An operator reaches installation/configuration guidance and identifies the applicable version-specific upgrade material. |
   | Old URL and product help entry | The destination retains its relevant topic or reaches the precise mapped successor, with usable navigation and anchors. |
   | Search and section navigation | Relevant current or historical results are recognizable; selected section, breadcrumbs, and adjacent-page links remain coherent. |
   | Language switching | The corresponding topic opens on the correct language host with complete localized navigation and text. |
   | Mobile and keyboard use | Navigation, search, article controls, tables, media, and content remain usable at the tested widths and focus order. |

6. **SEO and machine-readable responses.** Validate canonical and reciprocal language metadata, sitemap locale and URLs, final redirect destinations, title/description version context, and language-specific documentation exports. Test both configured language hosts in the appropriate local or preview environment. Where redirects are introduced, check the status and direct final destination and detect loops or chains.

7. **Editorial and media acceptance.** Record a result for every existing page pair and each new pair. Current topics must be checked for technical accuracy against the agreed evidence baseline; historical topics must preserve applicable facts and caveats. Review every selected public image for sensitive data, readable instructions, useful alt text, and complete English media guidance. Distinguish a documented procedure from a separately observed successful product execution.

8. **Build and local regression gates.** Run the affected documentation reference, English, and sitemap checks; MDX compilation; TypeScript checking; and the documentation production build. Run focused positive and negative cases for any added nontrivial validation or routing behavior. Broaden checks only when further changes or unresolved failures justify them. Follow the repository rule that full-repository tests occur after final user acceptance.

9. **Scope of product verification.** Content accuracy is reviewed against source and captured UI. The confirmed seam does not assert live success for flows whose runtime evidence is missing. Record such limitations by topic, and perform additional product-operation validation only within separately authorized implementation work.

10. **Completion criteria.** Deliver the full page accounting, bilingual technical parity review, working entry paths, compatible old links and anchors, readable selected media, aligned discovery outputs, passing documentation checks and build, and recorded browser acceptance results. Report any remaining evidence limitation with its affected topic and practical consequence.

## Out of Scope

- The implementation request covers the documentation site and content. Product application changes, production publishing, and deployment remain separate execution steps.
- Product runtime changes, database schema changes, application API contract changes, and deployment-configuration edits belong to separately scoped work. Any deployment YAML change requires the repository's explicit confirmation procedure.
- The documentation framework, component system, and search infrastructure remain on the existing stack. A new framework, dependency set, CMS, or independent validation platform falls outside this reconstruction.
- The external marketing, video, and solutions sites, and the application-generated reference renderer are separate content surfaces. Their documentation link labels, usage guidance, and compatibility remain in scope.
- English acceptance covers complete prose, captions, and explanations alongside selected shared media. Re-capturing every image in English and translating all external video assets are separate projects.
- Historical guidance retains its original version context. Updating every historical procedure to current product behavior falls outside archival maintenance.
- Search Console integration, traffic attribution, and ranking guarantees fall outside the current static-evidence plan. Subsequent migration monitoring can use user-supplied exports or explicitly available analytics access.
- Running destructive product scenarios, spending on paid operations, publishing unreviewed research screenshots, and modifying unrelated worktree changes fall outside this scope.

## Further Notes

- **Accepted decisions:** application builders first; dedicated developer and operator entrances; synchronous Chinese/English reconstruction; reuse of Next.js/Fumadocs with content, home-page, and navigation redesign; SaaS interactions cross-checked against source; and the rendered-site testing seam described above.
- **Decision status:** the user accepted the recommended URL policy on 2026-10-16; effective topic URLs are retained and mapped legacy entries use direct permanent redirects.
- **Publication status:** the specification is ready locally. Repository instructions have yet to establish the project issue-tracker destination and triage-label configuration. The invoked skill requires running `/setup-matt-pocock-skills` when that configuration is missing. Once configured, publish this specification to the designated tracker and apply `ready-for-agent`. Issue publication is separate from the subsequent authorized local implementation.
- **Evidence baseline:** 257 Chinese/English page pairs; 137 upgrade pages; 899 research screenshots reviewed through 71 contact sheets; 46 selected original images examined across all 29 captured functional groups; and source review at revision b5ba02728. Inventory classification establishes coverage. Implementation review records are maintained in `reconstruction-pages.csv`, with published-media evidence in `reconstruction-public-media.csv`.
- **Evidence limitations:** the screenshot set contains 880 distinct file hashes, partial and transitional captures, and differences in metadata completeness. Field-level findings are limited to readable inspected details. Runtime gaps include Skill/VM execution, successful evaluation, self-hosted model management, successful HTTP requests, third-party synchronization, external bot callbacks, the complete role matrix, payment/invoice completion, and some native control or scrolling states.
- **SEO evidence:** recommendations currently use repository structure, topic continuity, product tasks, and Google's migration guidance. Search Console clicks, impressions, query, indexing, and backlink data have yet to establish a traffic baseline. Permanent redirects can transmit migration signals; URL changes can still cause temporary indexing and ranking fluctuations while search engines process them.
- **Research references:** [Dify documentation index](https://docs.dify.ai/llms.txt), [Dify quick start](https://docs.dify.ai/en/quick-start), [Dify key concepts](https://docs.dify.ai/en/learn/key-concepts), [Google site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes), and [Google redirect guidance](https://developers.google.com/search/docs/crawling-indexing/301-redirects). The companion reconstruction proposal, page inventory, screenshot inventory, and glossary retain the detailed local evidence.
