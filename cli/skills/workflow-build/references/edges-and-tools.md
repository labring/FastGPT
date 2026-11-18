# Edges and tools

Read this file when connecting execution flow, branches, catch paths, source outputs, tool-call nodes, or container children.

## Semantic port strings

Direct CLI edge options use `nodeId@port`.

Execution source ports:

| String | Structured source |
| --- | --- |
| `node@next` | `{ "kind": "next", "nodeId": "node" }` |
| `node@catch` | `{ "kind": "catch", "nodeId": "node" }` |
| `node@tools` | `{ "kind": "selectedTools", "nodeId": "node" }` |
| `node@branch:<key>` | `{ "kind": "branch", "nodeId": "node", "branchKey": "<key>" }` |
| `node@output:<key>` | `{ "kind": "sourceOutput", "nodeId": "node", "outputKey": "<key>" }` |

Execution target ports:

- `node@target` -> `{ "kind": "target", "nodeId": "node" }`
- `node@tools` -> `{ "kind": "selectedTools", "nodeId": "node" }`

Do not invent handle IDs or React Flow source/target handles. Core compiles semantic ports into Web edge handles.

## Query commands

| Command | Options |
| --- | --- |
| `edge list` | optional `--node`, `--kind` |
| `tool list` | `--tool-call <nodeId>` |
| `container children` | `--node <containerNodeId>` |

## Direct CLI mutation surface

Direct local commands and their options are listed below.

| Command | Options |
| --- | --- |
| `edge connect` | `--from <source> --to <target> [--dry-run]` |
| `edge disconnect` | `--from <source> --to <target> [--dry-run]` |
| `edge reconnect` | `--from <source> --old-to <target> --to <target> [--dry-run]` |
| `tool attach` | `--tool-call <id>` plus either `--tool-node <id>` or `--template <ref> --id <newId>`; optional position |
| `tool detach` | `--tool-call <id> --tool-node <id> [--dry-run]` |

## ChangeSet edge shapes

```json
{
  "type": "edge.connect",
  "edge": {
    "source": { "kind": "next", "nodeId": "start" },
    "target": { "kind": "target", "nodeId": "answer" }
  }
}
```

- `edge.disconnect` uses the same `edge` shape.
- `edge.reconnect` uses `oldEdge` and `newEdge`.
- `tool.attach` uses an existing `toolNodeId`, or a structured `template` plus `newNodeId`; never both.
- A system-tool template must be copied from the current template list and includes both `source` and `toolId`. Inspect the exact reference with `template show` before attaching it.
- `tool.detach` identifies both `toolCallNodeId` and `toolNodeId`.

## Graph rules

- Every ordinary executable node must be reachable from an entry execution path.
- A branch edge requires a branch key produced by the source node configuration. Configure the branch-producing input first, then connect the edge.
- Use the literal `ELSE` branch only when the inspected branch node contract exposes that fallback.
- Catch edges require the source node to have `catchError` enabled.
- Tool edges must connect `selectedTools` to `selectedTools`; do not mix tool ports with ordinary targets.
- A container child uses `parentNodeId`; connect internal execution from the container's inspected start child rather than guessing IDs.
- Preview diagnostics must confirm that new nodes are reachable and all edge endpoints are valid.

## Branch-producing nodes

- Branch keys come from the configured field named by `execution.branch.keyField`; configure the
  branch-producing input first.
- Branch labels and descriptions are not branch keys.
- A branch-producing node does not expose an ordinary next port unless the runtime descriptor explicitly says otherwise.

When `WORKFLOW_BRANCH_KEY_NOT_FOUND` occurs, inspect the producer configuration and replace the edge's `branchKey`. Do not add a placeholder branch and do not ask the user for an internal key.

When `WORKFLOW_NEXT_PORT_UNSUPPORTED` occurs, inspect the source's `execution.sourceKinds` and reconnect from a supported branch, catch, source-output, selected-tools, or next source. Never retry the same unsupported source.

When `WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM` occurs, remember that a data reference and an execution edge are separate contracts: repair the execution path so the source is guaranteed to run before the consumer, then apply the data reference after that edge exists, or select another compatible upstream output.
