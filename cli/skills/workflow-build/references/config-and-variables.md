# Configuration and variables

Read this file for every workflow create or modify task: user-visible requirements may imply an
application-level setting even when the user does not mention system configuration. Also use it for
global workflow variable operations.

## System configuration

Configuration data lives in `WorkflowDocument.chatConfig`. The system-config canvas node is the editing surface; it is not a second configuration store.

Query `config list` first. Use `config get --path <path>` for a closer look at one setting.

Only paths returned by `config list` are valid. Each result is a runtime configuration descriptor
containing `path`, `description`, `valueSchema`, `capabilities`, and the current `value`. Treat the
descriptor as the source of truth for what the configuration controls, when the capability is
needed, and which JSON structure is accepted. Do not infer behavior from the path name.

Before changing a workflow, check the application capabilities it needs.

1. Derive a short checklist of the application-entry and conversation capabilities required by the
   complete business flow.
2. Use `config list` and compare each requested capability with descriptor `capabilities`,
   `description`, and current `value`. Use `config get` when the relevant object or accepted values
   need closer inspection. Do not infer configuration behavior from a path name.
3. Include any missing required configuration in the execution scope and ChangeSet. Preserve
   existing values and unrelated settings; change only fields needed for requested capabilities.
4. Apply a required configuration before adding nodes that depend on its side effects. For example,
   `user-file-input` creates the workflow-start `userFiles` output consumed by downstream file nodes.
   A file-processing node alone does not make files uploadable by the user.

Before delivery, verify the actual configuration values and any derived inputs and outputs. Check that the result covers the requested behavior as well as passing structural validation.

For local editing use `config set` and `config unset`. The equivalent ChangeSet commands are:

```json
{ "type": "config.set", "path": "<allowlisted-path>", "value": "<json-matching-valueSchema>" }
```

```json
{ "type": "config.unset", "path": "<allowlisted-path>" }
```

Preserve the JSON value type. Do not represent booleans or objects as strings. The value must match
the descriptor's `valueSchema`: boolean descriptors use `true` or `false`, while object descriptors
such as `fileSelectConfig` must be set with a complete JSON object based on its current value. Keep
unrequested file types and limits unchanged; do not enable every upload type by default.

Example:

```json
{
  "type": "config.set",
  "path": "fileSelectConfig",
  "value": {
    "maxFiles": 1,
    "canSelectFile": true,
    "canSelectImg": false,
    "canSelectVideo": false,
    "canSelectAudio": false,
    "canSelectCustomFileExtension": false,
    "customFileExtensionList": []
  }
}
```

The canonical welcome configuration is under `welcomeConfig`. Use
`welcomeConfig.welcomeQuestions` for short, complete questions shown below the opening message.
These are predefined questions users can click at the start of a conversation; they are different
from `questionGuide`, which generates follow-up suggestions after an answer. Preserve existing
welcome text and questions unless the user explicitly asks to replace them.

Example:

```json
{
  "type": "config.set",
  "path": "welcomeConfig.welcomeQuestions",
  "value": [
    "如何查询产品的退款规则？",
    "这个产品支持哪些支付方式？"
  ]
}
```

## Global variables

Run `variable list` before adding, renaming, updating, or removing a variable.

Direct CLI commands:

| Command           | Required options                | Optional options                                                                         |
| ----------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `variable add`    | `--key`, `--value-type`         | type, label, description, required, type config, default value, dry-run                  |
| `variable update` | `--key` and at least one update | new-key, type, value-type, label, description, required/optional, config, value, dry-run |
| `variable remove` | `--key`                         | dry-run                                                                                  |

A ChangeSet represents them with `variable.add`, `variable.update`, and `variable.remove` ChangeSet commands.

`variable.add` contains one complete variable object. `variable.update` contains the existing `key` and a partial `patch`. `variable.remove` contains `key`.

## Variable input types

- Omit `type` to use the CLI default inferred from `valueType`.
- `number` defaults to `numberInput`.
- `boolean` defaults to `switch`.
- `arrayString` defaults to `multipleSelect`.
- Other compatible text values default to `input`.
- CLI alias `external` maps to the stored custom variable type.

Supported type-specific fields include structured config, select options, `min`, `max`, `maxLength`, and `timeGranularity`. Put them directly in the ChangeSet variable object or patch; do not encode CLI flags.

## Content rules

- Variable keys are stable machine identifiers; use ASCII unless an existing key must be preserved.
- Labels and descriptions are user-facing and may be localized.
- Do not reuse a key that already exists.
- When renaming a variable, inspect references and rely on Core diagnostics to detect broken bindings.
- `custom`, `internal`, and `switch` variables cannot be marked required by the CLI contract.
- Default values must match `valueType` and the selected input type.
- Do not invent datasets, models, apps, tools, or secrets as default values. Follow the tool descriptor when configuring credentials. Resolve remote resources through authorized discovery available in the current environment, and report required bindings that remain unresolved.
