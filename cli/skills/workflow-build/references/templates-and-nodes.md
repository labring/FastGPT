# Templates and nodes

Read this file when the request creates, updates, moves, inserts, clones, removes, or nests nodes.

## Query commands

| Command | Options |
| --- | --- |
| `template list` | optional `--kind builtin\|teamApp\|systemTool\|tool` |
| `template show` | required `--template <kind:id>` |
| `node list` | optional `--type <flowNodeType>`, `--parent <nodeId>` |
| `node show` | required `--node <nodeId>` |
| `container children` | required `--node <containerNodeId>` |

Template string references use these canonical forms:

- `builtin:<templateId>`
- `teamApp:<appId>`
- `systemTool:<encodedSource>/<encodedToolId>`
- `tool:<toolId>`

`template list` returns `total`, per-kind `counts`, and lightweight `items`. Each item includes an exact `ref` string plus its structured template identity, name, intro, and `flowNodeType`. For system tools, `source` and `toolId` are URI-component encoded independently so debug and toolset-child identities remain unambiguous. Copy `items[].ref` exactly; do not hand-build, decode, shorten, or guess it.

Use `template list --kind systemTool` to find authorized system tools in the active template catalog. Inspect the chosen tool using its exact reference.

Always run `template show` for every template used by a new node. The returned descriptor is the source of truth for:

- `flowNodeType`, default name, inputs, outputs, execution ports, dynamic IO, container behavior,
  and side effects.
- Each input's meaning, required state, default policy, supported modes, enum, examples, and
  structured value schema.
- Resource bindings such as model, dataset, app, tool, or secret.
- Reference compatibility through `referencePolicy.acceptedSourceValueTypes`.

The template list contains only templates available for new nodes. A template that is absent
from the list must not be guessed or submitted manually; historical workflows may still contain
legacy nodes that remain compatible with the runtime. Existing legacy nodes may be edited, but
must not be cloned into new nodes.

Do not infer a parameter from its key or copy its contract from a recipe. The descriptor is built
from the current FastGPT node template plus Core automation metadata, so it tracks the node version
loaded by the running system.

## Direct CLI mutation surface

Use these options for direct local edits. The next section shows the equivalent ChangeSet commands.

| Command | Required options | Optional options |
| --- | --- | --- |
| `node add` | `--node`, `--template` | `--name`, `--after`, `--parent`, `--position`, `--dry-run` |
| `node update` | `--node` and at least one update | `--name`, `--position`, `--catch-error`, `--no-catch-error`, `--dry-run` |
| `node move` | `--node` and one destination | `--position`, `--parent`, `--root`, `--dry-run` |
| `node insert` | `--from`, `--to`, `--template`, `--id` | `--position`, `--dry-run` |
| `node clone` | `--node`, `--id` | exactly one of `--position` or `--offset`, `--dry-run` |
| `node remove` | `--node` | `--dry-run` |

## ChangeSet node command rules

- `node.add`: provide `nodeId` and structured `template`; optionally `name`, `{x,y}` position, `parentNodeId`, `connectFrom`, and `inputOverrides`.
- `connectFrom` must be a structured execution source port object, never a node ID or `node@port` string. The normal next-port shape is `{ "kind": "next", "nodeId": "<sourceNodeId>" }`; use the source shapes documented in `edges-and-tools.md` for branch, catch, selected-tools, or source-output ports.
- `node.update`: provide `nodeId`; optionally change `name`, `{x,y}` position, or `catchError`.
- `node.move`: provide `nodeId` and at least one of `position` or `parentNodeId`; use `parentNodeId: null` to move to root.
- `node.insert`: provide a new `nodeId`, `template`, source `from`, target `to`, and optional position. It replaces an existing edge with source -> inserted node -> target.
- `node.clone`: provide `sourceNodeId`, new `nodeId`, and optional absolute position or offset. The source node type must still be allowed for creation.
- `node.remove`: provide `nodeId`. Core removes related edges and invalid references according to command rules.

## Content rules

- Use stable ASCII node IDs. Keep user-facing names localized.
- Do not create a second workflow-start or system-config node.
- Place ordinary nodes at root unless the selected template or request requires a container.
- When adding a container child, inspect `container children` and the container template first.
- `inputOverrides` is only for template-supported initial values. Prefer explicit `input.set` or `input.ref` ChangeSet commands for reviewed bindings.
- Dynamic inputs and outputs require explicit `input.add` or `output.add`; never invent them from a label.
- Code node output names must match keys returned by the code object. Do not translate or derive output keys from values.
