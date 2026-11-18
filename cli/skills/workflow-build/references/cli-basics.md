# CLI basics

Run the local authoring commands under `fastgpt workflow-build`. Use `--dir <path>` to identify the workspace or run in its directory. Inspect the registered options with `fastgpt commands --command "workflow-build <command>" --format json`.

- `init` creates `workflow.json` and `template-bundle.json`. Use a session token or personal API key for the default template fetch, or `--offline` for built-in templates.
- `template load` refreshes the workspace template snapshot. Template list and show read the active snapshot.
- `import --input <path>` decompiles StoreWorkflow into the workspace. `build --output <path>` validates the working document and compiles a StoreWorkflow artifact.
- `app pull`, `workflow diff`, `app save`, `app test`, and `app publish` connect a workspace to an existing App.

## Output

Use `--format json` for machine-readable output. Successful commands return `schemaVersion: "fastgpt-cli-result/v1"`, `ok: true`, `command`, `changed`, and optional `data`, `meta`, and `warnings`. Errors return an `error` object with `code`, `message`, optional `hint`, and diagnostic details when available. Check the result diagnostics for validation status.

| Exit code | Meaning |
| --- | --- |
| `0` | Command completed |
| `1` | Internal failure |
| `2` | Invalid arguments, JSON, or workflow validation |
| `3` | Authentication or permission failure |
| `4` | Business API failure |
| `5` | Network or TLS failure |

## Value options

When a command offers the value-source options, choose one of `--value`, `--value-json`, `--value-file`, or `--value-env`. Use JSON for arrays and objects. Workflow ChangeSet values carry their actual JSON types. Use the input or configuration descriptor to verify the accepted value and reference modes.
