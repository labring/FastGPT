# Workflow inspection

Read this file when inspecting workflow state, metadata, checksums, or validation.

## Query commands

| Command              | Options                       | Result purpose                                                                                      |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `inspect`            | none                          | Checksum, app metadata, nodes, edges, references, bindings, chatConfig, diagnostic counts and items |
| `meta show`          | none                          | Current app metadata                                                                                |
| `config list`        | none                          | Allowlisted ChatConfig paths and values                                                             |
| `config get`         | `--path <path>`               | One allowlisted ChatConfig value                                                                    |
| `variable list`      | none                          | Global workflow variables                                                                           |
| `node list`          | optional `--type`, `--parent` | Existing nodes                                                                                      |
| `node show`          | `--node <id>`                 | Complete node inputs and outputs                                                                    |
| `edge list`          | optional `--node`, `--kind`   | Execution edges                                                                                     |
| `tool list`          | `--tool-call <nodeId>`        | Tools attached to a tool-call node                                                                  |
| `container children` | `--node <containerNodeId>`    | Children of a container node                                                                        |
| `input available`    | `--node <id> --key <key>`     | Type-compatible upstream references for one input                                                   |
| `validate`           | none                          | Full Workflow Core diagnostics                                                                      |

Begin a modification by inspecting the current workflow. For a local ChangeSet, use the `checksum` from `inspect` as `baseChecksum`.

## Check the impact of edits

Before changing the graph, check the effects of removing or moving nodes, detaching a tool, removing an output, or clearing a required input. Use the existing graph to check whether each operation would leave existing nodes usable.

1. Removing a tool node → `tool list --tool-call <nodeId>` for the owning tool-call node. If zero
   tools remain and the node does not use the Agent Sandbox, the tool-call node will not execute.
2. Removing or reconfiguring a node/output → check `inspect` `references` (or `input available`) for
   other nodes referencing it. If any, the reference will dangle.
3. Removing a `loop-run-break` whose parent is a conditional loop → `container children --node
<loopNodeId>`. If zero breaks remain, the loop cannot terminate.
4. Removing a container node (loop, parallel, or conditional loop parent) → `container children
--node <containerNodeId>`. If it has children, removal cascades and deletes all of them. Check whether this impact is
   within the change scope the user asked for.

Fix consequences you can safely resolve yourself (adjust the reference source, add a replacement
tool, use another output). When an impact goes beyond the requested change scope and cannot be
avoided, explain it in business terms and let the user decide. Never expose diagnostic codes,
node IDs, or reference internals.

## Inspection and validation

1. Inspect the current document and identify the nodes, references, and templates affected by the request.
2. Read the relevant node and template descriptors. Inspect newly added nodes, dynamic outputs, edges, and container children in the resulting workflow.
3. Review validation diagnostics for graph reachability, references, ports, branch keys, template configuration, and required bindings.
4. Resolve diagnostics with severity `error` before applying a plan. Explain unresolved impacts in terms of workflow behavior, including any unbound resources that prevent execution.
