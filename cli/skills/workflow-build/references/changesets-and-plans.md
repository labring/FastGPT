# ChangeSets and WorkflowPlans

Use this reference to prepare an ordered batch of workflow changes and review a plan.

## WorkflowChangeSet

```json
{
  "schemaVersion": "fastgpt-workflow-changeset/v1",
  "baseChecksum": "sha256:<64 lowercase hex characters>",
  "commands": []
}
```

- Copy `baseChecksum` from the current `inspect` success envelope.
- `commands` is a non-empty ordered array.
- Use structured JSON values and references. Do not encode CLI flag strings inside commands.
- All commands execute on an in-memory copy. A command failure returns no partial document.

For a multi-node change, preserve this order:

1. Add, update, move, or clone nodes.
2. Set the structural producer inputs identified by the template descriptor and configure dynamic
   outputs.
3. Connect execution edges, including branch edges whose keys now exist.
4. Set data references and remaining literal inputs after the execution path and producer outputs are valid.
5. Attach tools and configure container relationships after all referenced nodes exist.

When retrying, fix the commands that caused the failure and generate a new plan.

## Command catalog

### Nodes

```text
node.add        { nodeId, template, name?, position?, parentNodeId?, connectFrom?, inputOverrides? }
node.update     { nodeId, name?, position?, catchError? }
node.move       { nodeId, position?, parentNodeId? }
node.insert     { nodeId, template, from, to, position? }
node.clone      { sourceNodeId, nodeId, position?, offset? }
node.remove     { nodeId }
```

`template` is one structured template reference:

```json
{ "kind": "builtin", "templateId": "ai-chat" }
```

`node.add.connectFrom` is also structured. To connect a new node after the workflow start:

```json
{ "kind": "next", "nodeId": "workflow-start-node-id" }
```

Do not pass only the node ID or a `node@port` CLI string in a ChangeSet. Read `edges-and-tools.md` for every supported execution source shape.

Other supported shapes use `teamApp/appId`, `systemTool/source/toolId`, or `tool/toolId`, with optional version or parent fields defined by the current runtime resource. `systemTool.source` is required and must be copied with `toolId` from the current template query result.

### Edges

```text
edge.connect     { edge }
edge.disconnect  { edge }
edge.reconnect   { oldEdge, newEdge }
```

An edge contains structured `source` and `target` semantic ports. Read `edges-and-tools.md`.

### Inputs and outputs

```text
input.set      { nodeId, inputKey, value }
input.ref      { nodeId, inputKey, ref: { nodeId, outputKey } }
input.unset    { nodeId, inputKey }
input.add      { nodeId, input }
input.remove   { nodeId, inputKey }
output.add     { nodeId, output }
output.remove  { nodeId, outputKey }
```

Read `inputs-outputs-references.md` for literal/reference and dynamic IO rules.

### Tools

```text
tool.attach  { toolCallNodeId, toolNodeId }
tool.attach  { toolCallNodeId, template, newNodeId, position? }
tool.detach  { toolCallNodeId, toolNodeId }
```

Use exactly one `tool.attach` mode.

### Metadata, configuration, and variables

```text
config.set       { path, value }
config.unset     { path }
variable.add     { variable }
variable.update  { key, patch }
variable.remove  { key }
```

The complete variable object and patch follow the runtime variable schema. See `config-and-variables.md`.

## WorkflowPlan

```json
{
  "schemaVersion": "fastgpt-workflow-plan/v1",
  "baseChecksum": "sha256:<base>",
  "targetChecksum": "sha256:<target>",
  "changeSet": {},
  "changes": [],
  "diagnostics": []
}
```

Use `changeset plan --input changeset.json --output plan.json` to generate the plan artifact. Review `changes` and `diagnostics` before applying. A successful plan command can still contain blocking validation errors.

`changeset apply --plan plan.json --confirm <targetChecksum>` rechecks the current document's base checksum, rebuilds the target, verifies the target checksum, and writes the validated document atomically. Regenerate the plan against the latest workspace if the base changed. Use `diagnostics-and-self-repair.md` to repair blocking diagnostics and plan again.
