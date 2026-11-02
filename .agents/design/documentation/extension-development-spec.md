# Extension Author Documentation for FastGPT

Date: 2026-10-21 (Asia/Shanghai)

Status: The user has approved the audience, version policy, page structure, and product acceptance boundary. This specification captures that agreement. Public documentation implementation and product-operation acceptance remain subsequent work. Issue publication is pending project tracker and triage-label configuration.

Intended triage label: `ready-for-agent`.

## Problem Statement

An extension author needs to choose an extension mechanism, prepare a compatible development environment, create an extension, and verify its effect in FastGPT. The current extension-development section provides six plugin topics and a Skill development entry. Tutorials, how-to guides, reference material, and explanations are already represented.

Several gaps make the complete author journey difficult to reproduce. Plugin prerequisites describe broad version ranges, commands depend on an unspecified CLI version, and some SDK and packaging statements require confirmation against their owning project. The quick-start reaches a distributable package, while successful installation and invocation are left to follow-up reading. Model-preset instructions reach source validation and need an explicit route to a successful model request.

Skill authors have an illustrated example and separate initialization, publication, and application-integration guides. They need a copyable baseline and a concise author reference for package structure, metadata, packaged files, dependencies, and runtime expectations. Publication guidance also needs precise descriptions of default exclusion rules and the sequence of version selection and editor-workspace restoration.

The available engineering documentation and upstream source contain useful evidence with different dates and purposes. Authors need procedures tied to released capabilities, with explicit version context for changes found only on the main branch. Maintainers need a clear distinction between observed product behavior, source-backed behavior, and pending validation.

## Solution

Improve the existing extension-author journey for tool plugins, model presets, and Skills. Preserve the six plugin pages and their effective URLs. Strengthen the Skill development tutorial and add one bilingual reference topic, **Skill Package Format and Runtime Conventions**. Link the existing Skill initialization, version-management, and application-integration topics into a complete reading path while preserving their navigation ownership.

Use the Diataxis document types according to the reader's task: a tutorial delivers a first successful result; a how-to guide solves a concrete development or delivery problem; reference material describes author-facing contracts; explanation clarifies mechanism selection and lifecycle behavior.

The completion boundary is an extension producing its intended result in FastGPT. A tool plugin must be installed and invoked by an application, a model preset must support a successful request through a configured model instance, and a published Skill must execute through an application and return the expected result. Each journey will identify its prerequisites, tested version combination, expected output, and relevant failure checks.

The existing documentation glossary supplies product terminology. Tool plugins, model presets, and Skills will have explicit author-facing meanings and delivery outcomes. Main-branch capabilities will carry visible version-status information, and the main tutorial path will use a verified released combination.

## User Stories

1. As an extension author, I want to choose among a tool plugin, a model preset, and a Skill, so that I can use the mechanism that matches my intended result.
2. As an extension author, I want the guide to identify the required development knowledge, permissions, and services, so that I can prepare before starting.
3. As a plugin author, I want a verified combination of FastGPT, Plugin service, CLI, SDK, and runtime versions, so that I can reproduce the tutorial.
4. As an author maintaining an older deployment, I want released behavior and main-branch additions to have clear version context, so that I can select instructions compatible with my environment.
5. As a first-time plugin author, I want a small, copyable tool example with a known input and output, so that I can establish a working baseline.
6. As a plugin author, I want to verify default values and invalid inputs through the actual development toolchain, so that I can trust the documented schema behavior.
7. As a plugin author, I want to build and locate the distributable package, so that I can hand a concrete artifact to the installer.
8. As a plugin author, I want to install the example and call it through a FastGPT application, so that I can verify the complete delivery path.
9. As a tool-set author, I want stable child-tool identifiers and clear input and output contracts, so that existing workflows can retain their references across updates.
10. As a plugin author, I want to understand ordinary inputs, secrets, execution context, and host capabilities, so that I can place each value in the correct interface.
11. As a plugin author, I want a compact example of an authenticated external API call, so that I can implement a common integration task.
12. As a plugin author, I want a documented way to return a file through the supported host capability, so that users can receive the artifact with the intended access behavior.
13. As a plugin author, I want a compact progress-output example with its version requirements, so that users can observe a longer operation.
14. As a plugin author, I want error, timeout, and repeated-call behavior explained for the example, so that I can account for external side effects.
15. As a plugin author, I want the local-debug and remote-debug prerequisites and observable coverage explained, so that I can select an available verification route.
16. As an author using remote debugging, I want edition, service, network, and permission conditions at the start of the guide, so that I can establish a working connection.
17. As an author investigating a failed invocation, I want a symptom-based troubleshooting sequence, so that I can identify whether configuration, connectivity, authorization, compatibility, or tool logic needs attention.
18. As a plugin author, I want SDK declarations and packaging arguments to match the selected dependency versions, so that the reference and examples agree.
19. As a plugin author, I want localized metadata and schema guidance to state the required capabilities, so that Chinese and English users receive the intended labels.
20. As a plugin maintainer, I want to verify an update against an existing workflow, so that I can detect changes that affect established callers.
21. As a plugin author, I want installation scope and availability conditions linked from delivery guidance, so that I can explain which users and applications can invoke the delivered tool.
22. As a model-preset author, I want the roles of a preset, a provider, a model instance, and a channel explained, so that I can change the correct configuration.
23. As a model-preset author, I want a route from a source change to a loaded preset and configured model instance, so that I can verify that the change reached FastGPT.
24. As a model-preset author, I want to perform a request that exercises the capability described by the example, so that I can verify the preset's practical behavior.
25. As a Skill author, I want a copyable entry document and supporting script with a deterministic example, so that I can reproduce a working Skill independently of model-generated file choices.
26. As a Skill author, I want the package layout and entry metadata rules in one reference, so that I can prepare a valid package containing one or several Skills.
27. As a Skill author, I want clear validation feedback for missing entry files and duplicate names, so that I can repair the package before publication.
28. As a Skill author, I want to prepare dependencies with a repeatable initialization script, so that the published execution environment can run my code.
29. As a Skill author, I want to understand initialization in editing and application execution, so that I can verify both environments deliberately.
30. As a Skill author, I want to understand how default and author-supplied exclusion rules combine, so that runtime-required files remain in the published artifact.
31. As a Skill author, I want an explicit check for credential files in the package, so that secrets remain outside distributed artifacts.
32. As a Skill author, I want to verify the published Skill through an application, so that I can confirm its inputs, execution, and returned result.
33. As a Skill maintainer, I want to understand when a selected version is adopted and when the editor workspace is restored, so that I can update and roll back deliberately.
34. As a Skill maintainer, I want to preserve editing work before switching versions and diagnose workspace-loading failures, so that I can recover the intended development state.
35. As an application builder using a Skill, I want Skill publication and application-configuration publication explained separately, so that I can publish the resource I changed.
36. As an English-speaking extension author, I want the same prerequisites, commands, limits, and expected results as the Chinese edition, so that both language editions support the same task.
37. As a returning documentation reader, I want existing topic URLs and useful anchors to remain valid, so that bookmarks and product help links still reach the relevant guidance.
38. As a documentation maintainer, I want evidence linked to the tested versions and scenarios, so that future updates can distinguish observed behavior, source-backed contracts, and pending checks.

## Implementation Decisions

1. **Audience and scope.** Serve authors of tool plugins, model presets, and Skills. The first-use procedures assume basic familiarity with the language used by the example. Source-code contribution and internal platform maintenance remain separate documentation workstreams.

2. **Existing plugin structure.** Retain the six existing plugin topics: overview, first-tool tutorial, tool-development guide, model-preset guide, debugging and publication guide, and package and SDK reference. Improve those topics in place and preserve effective URLs and useful anchors.

3. **Skill structure.** Strengthen the existing development tutorial and add exactly one reference topic with Chinese and English counterparts. Its sections cover package layout, entry metadata, multiple Skills in one resource, publication contents, dependency preparation, and runtime conventions. Existing initialization, version, and application-integration topics retain their detailed procedures.

4. **Navigation ownership.** Keep each substantive topic in one established navigation location. Connect the Skill author journey using explicit next-step links and cross-links. Team installation remains owned by usage guidance; system installation and service configuration remain owned by deployment and operations guidance.

5. **Document types.** Keep the first-tool and first-Skill lessons focused on a successful result. Put development recipes and troubleshooting in how-to material. Concentrate declarative contracts in reference material. Use the overview and existing lifecycle explanations for mechanism selection and conceptual relationships.

6. **Terminology.** Reuse the maintained meanings of Application, Tool, Workflow tool, Skill, MCP tool, MCP service, and Published version. Clarify a tool plugin's packaged delivery, a model preset's configuration contribution, and a Skill's versioned instructions and support files. Glossary maintenance should remain limited to terms needed by these author journeys.

7. **Version policy.** Use verified released capabilities for the primary instructions. Clearly identify main-branch additions, including their observed revision or release status. Record the actual compatible toolchain used for each executable example. Determine the plugin toolchain from its owning CLI and SDK releases; the main FastGPT repository's runtime requirement supplies evidence for the main application only.

8. **Evidence ownership.** Use engineering documents to locate behavior and explain author-visible consequences. Verify implementation-sensitive statements against the relevant release and owning source. Maintain a concise author reference and link versioned full SDK contracts. Generated API reference and internal architecture remain maintained by their existing owners.

9. **Plugin tutorial.** Preserve the small greeting example and its default-value and invalid-input checks. Extend its completion path through package creation, installation, and a successful FastGPT application invocation. Link installation details from their existing owner.

10. **Plugin recipes.** Add compact recipes for an authenticated external request, a returned file, and progress output where supported by the selected released toolchain. State each recipe's expected result, prerequisites, and relevant error behavior. Explain author responsibility for repeated side effects using the actual host and provider behavior.

11. **SDK and CLI verification.** Resolve the secret-schema declaration location and the interpretation of relative packaging output arguments against the selected factory SDK and CLI implementations. Treat the two findings as verification tasks until that evidence is available. Align the overview, examples, reference, and both language editions with the result.

12. **Debugging and delivery.** State remote-debug edition and infrastructure requirements at the author entry point and link the existing deployment instructions. Retain local debugging as a useful logic and schema check. Add a short troubleshooting sequence and an installed-tool verification step. Exercise the tutorial's update against an existing application reference where the guide describes update behavior.

13. **Model presets.** Preserve the distinction between preset metadata, provider identity, model instances, and channel protocol support. Extend the guide from source validation through loading the change, configuring the model instance, and making a successful request. Use a controlled service environment that can load the changed preset.

14. **Skill baseline.** Retain the current empty-workspace creation flow and the email-extraction example. Supply a canonical entry document and script alongside AI-assisted authoring, with a known input and ordered, deduplicated result. Preserve useful existing screenshots and their recorded environment context.

15. **Skill package contract.** Explain the top-level skill collection, required entry document in each first-level Skill directory, required and unique names, and the supported metadata syntax. Describe the observable validation failures authors can correct. Verify syntax and limits against the selected release before presenting the contract as current.

16. **Publication contents.** Explain that system default exclusions are always combined with author-supplied exclusions. Identify the dependency and build-output categories affected by the defaults, describe the supported exclusion syntax, and require inspection of the resulting artifact. Include explicit exclusion of environment-based credential files and verification that necessary runtime files are present.

17. **Initialization.** Reuse the existing initialization guide. Explain dependency preparation, the execution working directory, success-based deduplication for each Skill version, subsequent attempts after failure, and the separate checks needed in the editor and application environment. Application-level startup-script deduplication remains a separately described mechanism.

18. **Version lifecycle.** Describe selecting the current Skill version, restarting and restoring the editor workspace, and adoption during subsequent application preparation as ordered stages. Include preserving desired editing content before a switch and waiting for the workspace to finish loading. Explain recovery when workspace loading fails after the version selection succeeds. Keep Skill publication and application-configuration publication distinct.

19. **Availability conditions.** Describe Skill availability using the actual execution-service configuration, application settings, permissions, and applicable plan capabilities. State remote-plugin-debug commercial availability at its own operation boundary. Use links for provider-specific deployment instructions.

20. **Language and presentation.** Update Chinese and English together, preserving technical parity and established terminology. Use existing documentation components and version notices. Add media only when it helps authors identify an operation or verify an outcome.

21. **Delivery order.** First resolve plugin compatibility and contract questions and complete the plugin author path. Next add the Skill reference and refine publication and lifecycle guidance. Finally complete the three product acceptance journeys, relevant documentation checks, and evidence updates. A failed acceptance step returns the affected instructions to revision before completion is recorded.

## Testing Decisions

1. **Confirmed primary seam.** Use one product-level acceptance boundary: an author follows the official instructions and the delivered extension produces its intended effect in FastGPT. The user explicitly approved this boundary for all three extension types. Existing product surfaces, CLI commands, and service interfaces provide the seam.

2. **Good-test definition.** Verify externally observable behavior: documented inputs, validation feedback, package contents, installed availability, application execution, version adoption, and returned results. Assert stable facts and output structure while allowing model wording to vary. An SDK substitute can support a small isolated check; product acceptance requires the actual selected toolchain and service.

3. **Tool-plugin scenario.** Create the documented minimal tool with the selected released toolchain, verify its default and invalid-input behavior, build and inspect the distributable artifact, install it in an isolated test scope, and invoke it from a FastGPT application. Record the expected output and inspect the execution evidence. Validate an update through an existing application reference when documenting that path.

4. **Plugin recipe checks.** For the new recipes, verify authentication failure or a missing required secret, a successful returned file, and supported progress output using the real versioned SDK. Choose a minimal controlled external interaction. Check failure and repetition behavior at the observable interface described in the guide.

5. **Model-preset scenario.** Load a known preset change into the selected Plugin service, observe the available preset in FastGPT, configure a usable model instance and channel, and execute a request. Validate a capability actually exercised by the example. Record the configured identifiers and observed result with credentials omitted from evidence.

6. **Skill scenario.** Follow the copyable email-extraction example, verify its deterministic script output in the editor, inspect the published package, publish the Skill, associate it with an application, and verify the same ordered unique addresses through application execution. Inspect execution details to establish that the Skill ran. Verify initialization in the application environment where the guide describes it.

7. **Skill publication and version checks.** Use harmless fixture files to confirm default exclusions, author-supplied exclusions, explicit credential-file exclusion, and required runtime-file inclusion. Check a missing entry document and duplicate metadata name through existing validation surfaces. In an isolated example, publish a second distinguishable version, select the earlier version, wait for editor restoration, and confirm the version used during subsequent application execution.

8. **Environment contract.** Record FastGPT, Plugin service, CLI, SDK, language runtime, and execution-provider versions relevant to each scenario. Establish a controlled test environment with the required services, permissions, quota, and disposable resources. A custom model-preset scenario requires a service whose preset source can be changed. Reuse one environment where it supports all journeys; record scenario-specific environments when necessary.

9. **Documentation guardrails.** Reuse the existing documentation-reference, English-parity, navigation, and browser-based site checks. Verify new and changed topic links, useful anchors, single navigation ownership, language counterparts, readable code examples, and the complete next-step path. Run the documentation type and build checks when required by the actual change.

10. **Prior art.** Existing documentation checks already cover local references, English content, navigation ownership, and rendered reading paths. Recorded SaaS evidence already covers Skill workspace use, Python execution, publication, and an Agent invocation. Earlier plugin tutorial checks used SDK substitutes; full CLI and plugin-service execution remains pending. Reuse earlier evidence for unchanged steps with its provenance and environment limits stated, and execute the newly introduced or corrected behavior.

11. **Scope.** Run checks covering changed documentation and affected shared navigation or rendering behavior. Keep unrelated monorepo tests outside this work. A complete repository test run follows the repository's user-acceptance requirement.

12. **Evidence and completion.** Record each scenario as observed, source-reviewed, or pending, together with its version context, input, expected result, observed result, and relevant artifact. Remove credentials and transient access tokens from captured evidence. Completion requires all three primary journeys to pass in their recorded environments, applicable documentation checks to pass, and bilingual instructions to reflect those results. A missing service or permission remains an explicit pending acceptance item.

## Out of Scope

- Source-code contributor tutorials, internal service maintenance, custom workflow-node implementation, and publication of internal SDKs or experimental workflow tooling.
- A broad rewrite of API integration, SSE clients, identity proxy, MCP integration, or generated API field reference. Relevant existing topics remain available through links.
- Application, backend, database, SDK, CLI, or plugin-runtime feature changes. Product defects discovered during verification become separately scoped work.
- Deployment YAML changes, infrastructure provisioning, commercial-feature activation, and changes to production service configuration.
- A new documentation framework, global navigation redesign, new test framework, or new acceptance-only product interfaces.
- Exhaustive testing of all providers, model types, execution backends, editions, historical releases, and dependency combinations.
- A separate gallery or repository of extension examples. Compact examples belong to their relevant existing topics and the single new Skill reference.
- Business-resource changes and operational experiments outside an explicitly established test scope.
- Documentation-site deployment, production publication, Git push, or starting public documentation implementation merely by creating this specification.

## Further Notes

- **User decisions:** Q1 selected the existing extension-author scope. Q2 selected released capabilities in the main instructions with explicit main-branch version marking. Q3 approved preserving the six plugin topics, adding one Skill reference, and connecting the existing Skill lifecycle topics through links. Q4 approved real FastGPT effects as the completion boundary for tool plugins, model presets, and Skills.
- **Specification authorization:** the user invoked `to-spec` after approving those decisions. This authorizes synthesis and publication through the configured issue tracker. The earlier instruction to keep public documentation unchanged continues to govern this specification-preparation step.
- **Local evidence baseline:** the inspected worktree is at `1277e8fa8c9b1d9633750f26e5343b16d6f11735`. The engineering-document tree identifies `32918084743600bc255a988b55103bf4660b6037` and 2026-10-18 as its source baseline. Its content is an evidence index for the public author journey.
- **Upstream baseline:** online verification found main at [46d6fe040d84b1f5f131386e81394286b861dcc3](https://github.com/labring/FastGPT/commit/46d6fe040d84b1f5f131386e81394286b861dcc3), dated 2026-10-21 in Asia/Shanghai. The latest stable GitHub release observed during planning was [v4.17.2](https://github.com/labring/FastGPT/releases/tag/v4.17.2), published on 2026-10-09. Verify the selected baseline again when implementation starts.
- **Version-sensitive example:** plugin metadata and schema localization changed on main on 2026-10-19. This is concrete evidence for verifying release availability before presenting localized behavior as generally supported.
- **Existing guidance to preserve:** the local Skill creation tutorial already follows the empty-workspace behavior present in the inspected stable code. The upstream prose still describes an older creation flow. Preserve the local correction when consulting upstream material. The local initialization guide already describes version-based success deduplication and failure checks.
- **Open contract checks:** the factory SDK's secret declaration interface and the CLI's relative packaging-output interpretation remain unresolved. Verify them in the corresponding dependency versions before revising examples. These are investigation items with clear owning sources.
- **Current evidence limits:** this discussion used documentation and source inspection. Related-page checks found 118 local links and image targets resolving to files. Earlier recorded Skill SaaS execution covers its stated scenario; rollback, plugin CLI execution, and the new three-journey acceptance run remain pending.
- **Related maintained material:** preserve the terminology in the [documentation glossary](../../../document/CONTEXT.md), the ownership boundaries in the [documentation reconstruction design](reconstruction.md) and [specification](reconstruction-spec.md), and the topic evidence in the [existing page inventory](reconstruction-pages.csv).
- **Tracker publication:** this checkout and the primary checkout currently lack the project issue-tracker and triage-label configuration. Related specifications record the same pending setup. Run `/setup-matt-pocock-skills` to establish the destination and label mapping, then publish this specification with `ready-for-agent`. Issue publication is pending; this local document is the reviewable specification.

### Delivery Checklist

- [x] Capture the approved audience, version policy, page structure, and product acceptance boundary.
- [x] Record the existing evidence and remaining contract-verification tasks.
- [ ] Establish project tracker and triage-label configuration and publish this specification.
- [ ] Verify the released plugin toolchain, SDK declarations, and packaging arguments.
- [ ] Improve the six plugin topics and their Chinese and English counterparts.
- [ ] Add the bilingual Skill reference and update the development, publication, and lifecycle reading path.
- [ ] Pass tool-plugin, model-preset, and Skill product acceptance in the recorded test environments.
- [ ] Pass relevant documentation checks and update the existing evidence inventory.
