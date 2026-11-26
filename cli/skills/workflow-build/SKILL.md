---
name: fastgpt-workflow-build
description: Build, validate, and test FastGPT workflows from an external CLI workspace.
---

# Build a FastGPT workflow with the CLI

Use the installed `fastgpt workflow-build` commands to work with `workflow.json`. Use `fastgpt commands --command "<command>" --format json` or the command's `--help` to check exact options.

## Workflow

1. For a new workspace, run `fastgpt workflow-build init --dir ./flow`. It fetches the template bundle for the authenticated member. Use `--offline` with the built-in templates when working offline. To edit an existing App, run `fastgpt app pull <appId> --dir ./flow`.
2. Run `workflow-build inspect` and `config list` for the workspace. Match application entry points and conversation capabilities to the user request. Use `template list` and `template show` to find the actual templates and inspect their constraints. Refresh a workspace bundle with `workflow-build template load` when you need the server's current catalog.
3. Check the impact of edits on existing nodes, outputs, and dependent configuration. For a batch edit, put the intended commands and the current checksum in a ChangeSet. Run `workflow-build changeset plan --input changeset.json --output plan.json`, review diagnostics and changes, then run `workflow-build changeset apply --plan plan.json --confirm <targetChecksum>`. Use the same workspace for both commands. Local editing commands also have their own help and dry-run options.
4. Run `workflow-build validate` and check that the resulting workflow covers the requested behavior. Use `workflow-build build --output store-workflow.json` to export a compiled artifact. With an existing App ID and the appropriate authorization, `workflow diff`, `workflow debug`, and `app test` help verify remote behavior. Use `app save` for a requested draft save and `app publish` for a requested release.

## Reference reading

Run `fastgpt workflow-build skills <reference-id> --format text` to read one reference as Markdown. Use `--format json` for structured output. Read the references relevant to your task.

| Topic | Reference ID |
| --- | --- |
| Workspace, output, and command discovery | `cli-basics` |
| Current state and consequences of edits | `workflow-inspection` |
| Application settings and global variables | `config-and-variables` |
| Batch plans and validation errors | `changesets-and-plans`, `diagnostics-and-self-repair` |
| Templates, nodes, inputs, outputs, and references | `templates-and-nodes`, `inputs-outputs-references` |
| Execution edges and tool attachments | `edges-and-tools` |
| Node families | `ai-and-data-nodes`, `text-code-http-nodes`, `interactive-nodes`, `container-nodes` |
| Common graph patterns | `workflow-recipes` |
