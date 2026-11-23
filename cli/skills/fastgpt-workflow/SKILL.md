---
name: fastgpt-workflow
description: Author, validate, inspect, diff, debug, save, and publish FastGPT workflows using app pull/save/publish/test, workflow diff/debug, and workflow-build commands.
---

# FastGPT Workflow Authoring & GitOps (`workflow`, `workflow-build`, `app`)

Use this skill to edit local `workflow.json` workspaces deterministically and sync changes with FastGPT Apps. Built-in detailed guides live inside the CLI itself via `workflow-build skills`.

## 1. Read Detailed Workflow References Offline

- Index and overview: `fastgpt workflow-build skills --format text`
- Specific reference guides (`--format text` or `--format json`):
  - `fastgpt workflow-build skills cli-basics --format text`
  - `fastgpt workflow-build skills workflow-inspection --format text`
  - `fastgpt workflow-build skills changesets-and-plans --format text`
  - `fastgpt workflow-build skills templates-and-nodes --format text`
  - `fastgpt workflow-build skills inputs-outputs-references --format text`
  - `fastgpt workflow-build skills edges-and-tools --format text`
  - `fastgpt workflow-build skills diagnostics-and-self-repair --format text`

## 2. End-to-End Authoring & Release Loop

1. **Initialize or pull workspace**:
   - New offline workspace (`authModes: ['none']` with `--offline`): `fastgpt workflow-build init --offline --dir ./flow --name "Support Flow"`
   - New workspace using member templates (`token` or `personalKey`): `fastgpt workflow-build init --dir ./flow --name "Support Flow"`
   - Existing App (`token` only): `fastgpt app pull <appId> --dir ./flow --format json`
2. **Inspect workspace & templates** (local commands use `authModes: ['none']`):
   - `fastgpt workflow-build inspect --dir ./flow --format json`
   - `fastgpt workflow-build template list --dir ./flow --format json`
   - `fastgpt workflow-build template show --dir ./flow --template builtin:ai-chat --format json`
   - Refresh remote template bundle when needed (`token` or `personalKey`): `fastgpt workflow-build template load --dir ./flow`
3. **Edit graph, metadata, config, variables, I/O & tools**:
   - Metadata & config: `fastgpt workflow-build meta show --dir ./flow`, `fastgpt workflow-build meta set --dir ./flow --name "Support Flow"`, `fastgpt workflow-build config list --dir ./flow`, `fastgpt workflow-build variable list --dir ./flow`
   - Nodes & edges: `fastgpt workflow-build node list --dir ./flow`, `fastgpt workflow-build node add --dir ./flow --node chat1 --template builtin:ai-chat --after start@next`, `fastgpt workflow-build edge list --dir ./flow`, `fastgpt workflow-build edge connect --dir ./flow --from start@next --to chat1@target`
   - Inputs, outputs & tools: `fastgpt workflow-build input available --dir ./flow --node chat1 --key model`, `fastgpt workflow-build input set --dir ./flow --node chat1 --key model --value glm-4`, `fastgpt workflow-build tool list --dir ./flow --tool-call <nodeId>`
   - Atomic batch edits via ChangeSet:
     ```bash
     fastgpt workflow-build changeset plan --dir ./flow --input ./changeset.json --output ./plan.json --format json
     fastgpt workflow-build changeset apply --dir ./flow --plan ./plan.json --confirm <targetChecksum> --format json
     ```
4. **Validate, compile, diff, debug & test**:
   - Local validation & artifact export: `fastgpt workflow-build validate --dir ./flow --format json` and `fastgpt workflow-build build --dir ./flow --output ./store-workflow.json` (or decompile with `fastgpt workflow-build import --dir ./flow --input ./store-workflow.json`)
   - Remote comparison & single-round debug (`token` only):
     - `fastgpt workflow diff --dir ./flow --format json`
     - `fastgpt workflow debug --dir ./flow --query "How do I reset my password?" --format json` (supports `--remote`, `--variables`, `--variables-file`, `--history-file`, `--entry-nodes`, `--chat-id`, `--usage-id`, `--timeout`, `--dry-run`)
   - Multi-case test assertions (`token` only):
     - `fastgpt app test --dir ./flow --cases ./workflow-tests.json --format json`
5. **Save draft & publish** (`token` only):
   - Preview then save draft: `fastgpt app save --dir ./flow --dry-run --format json` then `fastgpt app save --dir ./flow --format json`
   - Publish live version: `fastgpt app publish --dir ./flow --version-name v1.0.0 --format json`
