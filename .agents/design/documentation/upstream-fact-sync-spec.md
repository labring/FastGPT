# Sync upstream reader-facing facts into the FastGPT documentation

Date: 2026-10-25 (Asia/Shanghai)

Status: The user approved this scope and the editorial choices on 2026-10-25. This specification records that agreement for local implementation. Publication to an issue tracker waits until this repository has an issue-tracker configuration. The intended triage label is `ready-for-agent`.

Evidence baseline: `upstream/main` at `749809070` (2026-10-24). The documentation branch already contains the reader-task reconstruction, the knowledge-base task guides, and the extension-author guides. Product terms come from the documentation glossary, including Write permission and Manage permission.

## Problem Statement

Readers of the Documentation site are working from a reconstructed guide whose task structure is current, while `upstream/main` has since published reader-facing behavior that this branch does not yet explain. A workflow builder cannot look up why a connection point is hidden. A knowledge-base maintainer following the collection-tag guide is told to configure filtering directly under the knowledge-base card, after the product moved that control into the search-parameter dialog and added list filtering, operator rules, empty-value matching, JSON variable input, structured API tags, and an upgrade path for old string tags. An integrator reading the archived dataset reference still sees string-only tags, a collection-list page size of 30, and no tag-list filter. An operator reading the 4.17.3 upgrade guide misses the compatibility notes and later entries. A collaborator can mistake Write permission for permission to change the knowledge base or collection itself. Deployment and node guides omit the sandbox overcommit settings, dynamic options, and the HTTP node's non-2xx error text.

## Solution

Bring those reader-facing facts into the existing Documentation site. Keep the three reader entrances, the current task order, effective topic URLs, and the glossary. Add two bilingual topics: a workflow connection-rule reference, and an archived explanation of the old string-tag behavior. Update the current collection-tag how-to in place, keeping its travel example and existing screenshots. Update the archived dataset reference, the 4.17.3 Archived upgrade guide, the collection-permission guide, the environment reference, the user-selection and form-input node guides, the HTTP node guide, and the data-maintenance guide's synonym sentence. Mark the historical HTML-rendering topic as deprecated while keeping its historical title and alert.

Chinese source pages lead. Each English counterpart keeps technical parity: the same prerequisites, procedures, values, limits, examples, and results, written for an English reader.

The workflow rule topic is a reference. The current collection-tag topic remains a how-to. The old string-tag topic is an archived explanation. The upgrade guide, environment reference, and archived dataset reference remain reference material. Node and permission edits stay inside their existing how-to or reference pages.

## User Stories

1. As a workflow builder, I want one reference for ordinary connections and tool connections, so that I can tell which connection points are allowed to meet.
2. As a workflow builder, I want the rule that a node cannot connect to itself and that an identical connection cannot be created twice, so that I can understand a rejected connection.
3. As a workflow builder, I want branch, output-field, and error-capture connections limited to exits that currently exist, so that I can fix a connection after changing a node configuration.
4. As a workflow builder, I want the boundary between the main workflow and a tool workflow explained, so that I can see why a normal connection cannot cross that boundary.
5. As a workflow builder, I want each tool entry to belong to one tool-call node, so that I can move a tool workflow by deleting the old tool connection first.
6. As a workflow builder, I want container boundaries for loop and parallel nodes explained, so that I connect inner nodes only within their container.
7. As a workflow builder, I want the difference between a forbidden serial loop and an allowed conditional return explained, so that I can build a controlled retry without a pure serial cycle.
8. As a workflow builder, I want the rule topic linked from the existing tool-call guidance, so that I can move from a task to the connection reference.
9. As an English-language workflow builder, I want the same connection rules and limits as the Chinese source page, so that I can validate a canvas without relying on the Chinese page.
10. As a knowledge-base maintainer, I want the current collection-tag how-to to keep the travel example and its existing screenshots, so that the verified task path remains available.
11. As a Chat Agent builder, I want tag filtering reached from the knowledge-base parameter dialog, so that I can open the control where the product now places it.
12. As a workflow builder, I want tag filtering reached from the knowledge-base search node, so that I can enable it on the node that performs retrieval.
13. As a knowledge-base maintainer, I want list filtering by tag explained, including OR within one tag and AND across tags, so that I can narrow the collection list predictably.
14. As a knowledge-base maintainer, I want the operators for option, number, and date tags listed with their matching rules, so that I can choose a comparison that means what I intend.
15. As a knowledge-base maintainer, I want empty-tag matching explained for positive and negative comparisons, so that I can predict whether an untagged collection is retrieved.
16. As a workflow builder, I want to pass one JSON filter through a variable reference, so that an upstream step can build a condition the visual editor cannot express.
17. As an API integrator, I want structured collection tags documented alongside the older string-array form, so that I can send the current payload and still recognize old data.
18. As an integrator importing tags by name, I want the guide to state that an unknown tag name can be created from the value shape, so that I know the import may add a tag definition.
19. As a knowledge-base maintainer upgrading old string tags, I want to know they become a `default_tag` option tag, so that I can rename that tag and update saved filters.
20. As a knowledge-base maintainer renaming a tag or option, I want to know that saved filters match on names and option text, so that I can update the applications that use the old names.
21. As an application builder filtering several knowledge bases, I want to know that the shared tag list contains only tags whose names and attribute types match, so that I can explain a missing tag in the dropdown.
22. As a reader with an old string-tag bookmark, I want an archived explanation that points to the current collection-tag how-to, so that I can tell which instructions match my version.
23. As an English-language knowledge-base maintainer, I want the same tag procedures, operators, JSON fields, and upgrade results as the Chinese source page, so that I can complete the task from the English counterpart.
24. As an integrator using the archived dataset reference, I want the collection-list page size limit stated as 100, so that I can request a page the interface accepts.
25. As an integrator using the archived dataset reference, I want `tagFilters` documented for collection listing, so that I can filter by tag id and values.
26. As an integrator following the current dataset integration guide, I want that guide to remain a task guide and link to the collection-tag topic, so that I can finish an import without reading the archived parameter list.
27. As an operator upgrading to 4.17.3, I want the upstream upgrade guide's compatibility section and later entries on the existing upgrade topic, so that I can see sandbox limits, single-knowledge-base export, dynamic options, and audit events before I upgrade.
28. As an operator reading the 4.17.3 guide in Chinese, I want its assisted-generation link to use the Chinese documentation route, so that the link opens the existing topic.
29. As an English-language operator, I want the English 4.17.3 counterpart to carry the same entries and an English route to assisted generation, so that both languages describe the same upgrade.
30. As a collection collaborator, I want Write permission described as changing knowledge content, including synchronization and training parameters, so that I can tell what my role allows.
31. As a collection collaborator, I want Manage permission described as changing the knowledge base or collection's own information and assigning collaborator permissions, so that I know who can rename, disable, or administer the resource.
32. As a collection collaborator, I want the permission guide's role table to use those two meanings, so that the page and the product wording agree.
33. As a deployment operator, I want the CPU and memory overcommit factors documented with default 1, minimum 1, and the OpenSandbox Kubernetes condition, so that I can set a request below the limit only where it takes effect.
34. As a deployment operator, I want the environment reference to keep `AGENT_SANDBOX_SHOW_FREE_TIP` as the documented name, so that I configure the primary variable the service reads.
35. As a deployment operator, I want the same row to mention that the application also accepts `AGENT_SANDBOX_FREE_TIP`, so that an existing deployment using the alias still matches the reference.
36. As a workflow builder, I want the user-selection guide to explain options supplied by a variable, so that I can generate choices at run time.
37. As a workflow builder, I want the form-input guide to explain variable-supplied single-choice and multiple-choice options, so that I can use the same behavior on form fields.
38. As a workflow builder, I want an empty dynamic option list to be described as a clear error, so that I can recognize a failed configuration.
39. As a workflow builder, I want the HTTP node guide to state that a non-2xx response whose body lacks `message` or `msg` includes a capped snippet of that body in the node error text, so that I can use the error to diagnose the response.
40. As a knowledge-base maintainer, I want the data-maintenance guide to present synonym-index rebuild only when synonym capability is enabled, so that I do not look for a control that the default configuration hides.
41. As a deployment operator, I want `DATASET_SYNONYM_ENABLED` recorded as defaulting off, so that I know the capability stays out of search and writing until it is turned on.
42. As a reader of the historical HTML-rendering topic, I want its title and alert to keep identifying it as historical, and the sidebar to show it as deprecated, so that I continue to the current HTML guide.
43. As a returning reader, I want existing topic URLs and the collection-tag heading anchors preserved, so that bookmarks and product help links still land on the same topic.
44. As a reader using the sidebar, I want the new rule topic and the archived tag topic to appear once, inside the existing workflow and knowledge-base groups, so that the three reader entrances stay stable.
45. As a documentation maintainer, I want the published directory index regenerated by the existing documentation command, so that the new topics are discoverable without a hand-copied list.
46. As a documentation maintainer, I want one content gate to fail on a missing English counterpart, a broken reference, a duplicated substantive page, or a Chinese label in the English navigation, so that structural regressions are caught before review.
47. As a bilingual reader, I want screenshots already published on the current tag guide to remain, so that the verified travel task stays illustrated.
48. As a reader of a new or updated step that has no reviewed screenshot, I want the written path and expected result to be sufficient, so that I can follow the step without an unreviewed image.

## Implementation Decisions

1. **Scope.** Sync reader-facing facts present on `upstream/main` at `749809070` into the current Documentation site. Leave the three reader entrances, task grouping, and effective URLs in place.

2. **Languages.** Update each Chinese source page and its English counterpart together. Technical parity covers prerequisites, steps, values, limits, examples, and expected results.

3. **Workflow connection reference.** Add one bilingual reference topic for connection types, workflow boundaries, tool-entry ownership, container boundaries, and conditional returns. Place it in the workflow group after the workflow introduction and before assisted generation. Link it with the existing tool-call topic. Describe ordinary connections and tool connections as distinct connection kinds that cannot be mixed.

4. **Collection tags.** Keep the current how-to, its travel example, its heading anchors, and its published screenshots. Add the parameter-dialog entry for a Chat Agent, the knowledge-base-search-node entry for a Workflow, list filtering, the operator tables, empty-tag matching, JSON variable input, structured API tags, shared-tag dropdown behavior, and the `default_tag` upgrade result. Do not replace the page with the upstream article and do not import the upstream tag screenshots.

5. **Archived string tags.** Add one bilingual archived explanation for the historical string-tag behavior. Place it immediately after the current collection-tag topic in the knowledge-base group. Mark it deprecated, keep its version context, and point readers to the current collection-tag how-to. Leave the rest of the knowledge-base navigation order unchanged.

6. **Dataset reference ownership.** Leave the current dataset integration topic as a task guide that links to collection tags. Record the structured `tags` payload, compatibility with the old string array, the collection-list page size of 100, and `tagFilters` in the archived dataset reference.

7. **4.17.3 upgrade guide.** Replace the current short 4.17.3 topic with the upstream guide's full reader-facing content. Retarget its assisted-generation link to the locale-qualified route already used by neighboring upgrade guides: the Chinese source page uses the Chinese route, and the English counterpart uses the English route. That topic already exists. Do not split the new entries into separate specialist pages in this batch.

8. **Permissions.** Use the glossary definitions. Write permission changes knowledge content, including synchronization and training parameters. Manage permission changes a knowledge base or collection's own information and assigns collaborator permissions. Update the collection-permission role table to those meanings. State that renaming, disabling, or otherwise changing the resource itself requires Manage permission. The interface wording to reflect is "可变更数据集内容（同步/调整训练参数）" and "可管理整个数据集的信息与权限".

9. **Environment reference.** Add the CPU and memory overcommit factors. Each defaults to 1, must be at least 1, and applies when the Agent sandbox provider is OpenSandbox on Kubernetes and the OpenSandbox server is at least v0.2.1. The factor lowers the reservation by dividing the limit; the limit stays unchanged. A change applies to sandboxes created or rebuilt afterward. Keep `AGENT_SANDBOX_SHOW_FREE_TIP` as the documented name, and mention `AGENT_SANDBOX_FREE_TIP` as an application-accepted alias on that same row. Do not reformat the environment tables.

10. **Node guides.** In the user-selection guide, document options supplied by a variable reference. In the form-input guide, document the same behavior for single-choice and multiple-choice fields. State that an empty dynamic option list returns a clear error. In the HTTP node guide, state the non-2xx behavior only after the error-text helper confirms it: when the response body has neither `message` nor `msg`, the node error text includes a capped snippet of the body.

11. **Synonym sentence.** In the data-maintenance guide, attach the synonym-index rebuild action to the enabled state of `DATASET_SYNONYM_ENABLED`. In the environment reference, record that variable as defaulting off, with search and writing leaving synonym configuration unread while it is off. Do not add a synonym task topic.

12. **Deprecated historical HTML guide.** Add the optional deprecated flag to documentation frontmatter and pass it through the page tree. Render a deprecated sidebar item with a line through its label by extending the current sidebar tag reading. Set the flag on the historical HTML-rendering topic and the archived string-tag topic. Keep the historical HTML title's "旧" marker and its alert to the current HTML guide.

13. **Discovery.** Regenerate the published directory index with the existing documentation command. Each new substantive topic appears once in its owning group.

14. **Media.** Publish no new screenshot in this batch. A step without a reviewed image is carried by its written path and expected result.

15. **Glossary.** Write permission and Manage permission are already defined in the documentation glossary. Implementation uses those definitions and does not introduce a second pair of terms.

## Testing Decisions

1. **One automated seam.** The documentation content gate is the acceptance seam: reference checking, English-counterpart checking, and navigation checking, run together through the documentation package's existing docs check. A useful failure names a broken reader path: a missing counterpart, an unresolved reference, a substantive page that appears more than once, a page outside the three reader entrances, or a Chinese label in the English navigation.

2. **Prior art.** Reuse the current reference checker, English checker, and navigation checker, including their existing test fixtures. The navigation checker already expects three reader entrances and one placement for each substantive page.

3. **No new runner.** Semantic claims are reviewed against the upstream documentation text at the evidence baseline and against the glossary. That review covers operators, permission wording, upgrade entries, environment values, and node sentences. It does not add a second test command or a browser seam.

4. **Deprecated presentation.** The strikethrough is part of the existing sidebar item renderer. Review that renderer with the content gate; do not open a site-level browser suite for this batch.

5. **HTTP sentence.** Confirm the non-2xx wording against the shared HTTP error-text behavior before editing the node guide. If the helper disagrees with the upgrade note, the helper's reader-visible result is the sentence that gets published, and the upgrade entry keeps the same result.

## Out of Scope

- New topics for synonym administration, audit logs, targeted API resource refresh, and folder ancestor paths.
- A second information-architecture pass, URL moves, or redirects.
- Replacing the current dataset integration guide with the old parameter reference.
- Importing upstream collection-tag screenshots or refreshing the previously deferred screenshot sources.
- Reformatting the environment-variable tables or renaming `AGENT_SANDBOX_SHOW_FREE_TIP`.
- Back-porting every 4.17.3 optimization and fix into its specialist page.
- Production publishing, issue-tracker publication, and a full repository test run.

## Further Notes

The collection-tag entry names come from the upstream guide. During implementation, match them to the current interface labels when those labels differ by a control name. The HTTP error sentence stays unpublished until the shared error-text behavior is read. The 4.17.3 page is adopted whole; specialist pages change only where this specification names them.
