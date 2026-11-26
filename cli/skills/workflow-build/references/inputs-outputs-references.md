# Inputs, outputs, and references

Read this file when setting literal values, binding upstream values, or changing dynamic inputs and outputs.

## Query commands

| Command | Options | Purpose |
| --- | --- | --- |
| `input list` | `--node <id>` | All node inputs |
| `input show` | `--node <id> --key <key>` | One input descriptor; secret values are redacted |
| `input available` | `--node <id> --key <key>` | Type-compatible upstream references |
| `output list` | `--node <id>` | Node outputs |

Before writing an input command, inspect the target input and use `input available` for references. Before referencing an output, confirm it with `node show` or `output list`.

## Tool authorization

`system_input_config` is configurable through `input.set`. Read its `constraints.valueSchema` from the template descriptor for the current tool's authorization fields. Manual configuration uses `{ "type": "manual", "value": { "<fieldKey>": { "value": "<user-provided value>" } } }`; field names and types must come from that descriptor. Each field uses a value wrapper, including application IDs that are not secrets. Preserve existing fields and ciphertext when changing another field; never invent ciphertext.

Confirm that the available credential source matches the tool descriptor. Report missing credentials that prevent the workflow from running. Use `{ "type": "system" }` when the user requests existing platform credentials; their availability is checked when applying/running, so do not infer availability or invent private values. The `team` source is not implemented.

## Literal text, global variables, and node references

These are three different representations. Choose the one that matches the target input:

Plain literal input:

```json
{
  "type": "input.set",
  "nodeId": "answer",
  "inputKey": "text",
  "value": "Hello"
}
```

Global variable embedded in text:

```json
{
  "type": "input.set",
  "nodeId": "text-editor",
  "inputKey": "system_textareaInput",
  "value": "Hello {{$VARIABLE_NODE_ID.name$}}"
}
```

Use the same node/output reference representation as the canvas `/` picker. A global variable uses the reserved node ID `VARIABLE_NODE_ID`, so `{{$VARIABLE_NODE_ID.name$}}` references the declared global variable `name`. For example, an HTTP URL stored in `FEISHU_HOOK_URL` is `{{$VARIABLE_NODE_ID.FEISHU_HOOK_URL$}}`. Never generate the bare `{{name}}` form.

Node output embedded in text:

```json
{
  "type": "input.set",
  "nodeId": "text-editor",
  "inputKey": "system_textareaInput",
  "value": "Topic: {{$validateCode.topic$}}"
}
```

`{{$validateCode.topic$}}` is the canonical inline node-output syntax, also used for a complete text-field value. Use it when a textarea, HTTP URL, header, request body, or other literal text field includes a variable. WorkflowDocument uses output keys; compilation converts them to output IDs for the canvas and runtime.

Standalone reference input:

```json
{
  "type": "input.ref",
  "nodeId": "answer",
  "inputKey": "text",
  "ref": {
    "nodeId": "start",
    "outputKey": "userChatInput"
  }
}
```

Use `input.ref` only when the complete input value is one upstream node output and the target input supports the `reference` mode. Do not put `{{node.output}}`, `node.output`, or a two-item array into `input.set` to imitate this standalone reference.

The following forms must not be generated:

```text
{{validateCode.topic}}
{{FEISHU_HOOK_URL}}
```

They bypass the canvas node/output representation. Use `{{$validateCode.topic$}}` and `{{$VARIABLE_NODE_ID.FEISHU_HOOK_URL$}}` respectively. Do not invent a variable or output when repairing a reference; query the current workflow first.

Some node-specific templates define their own placeholders, such as citation formatting tokens. Those are not workflow-variable references; follow that input's descriptor and preserve its template contract.

At the CLI adapter boundary, `--from start.userChatInput` maps to the structured `ref` above. The last `.` separates the output key, so node IDs may contain dots.

In WorkflowDocument storage, a reference input becomes `[nodeId, outputKey]` and its selected render mode is `reference`. A literal remains its typed value and uses a compatible literal render type. Keep `renderType` and `value` semantics aligned.

## Direct CLI mutation surface

For direct CLI edits use the options below. In a batch plan, use the corresponding ChangeSet command.

| Command | Required options | Other rules |
| --- | --- | --- |
| `input add` | `--node`, `--key`, `--value-type`, `--mode` | mode is `literal`, `reference`, or `both`; optional label, description, required |
| `input remove` | `--node`, `--key` | Dynamic inputs only |
| `input set` | `--node`, `--key`, exactly one value option | Literal value only |
| `input ref` | `--node`, `--key`, `--from node.output` | Reference only |
| `input unset` | `--node`, `--key` | Removes current value |
| `output add` | `--node`, `--key`, `--value-type` | Optional label and description |
| `output remove` | `--node`, `--key` | Dynamic outputs only |

## Dynamic IO command shapes

`input.add` contains a complete input object. At minimum include:

- `key`, `label`, `valueType`, `renderTypeList`, `required`, and `canEdit`.
- Use literal render support, reference support, or both according to the user-visible mode.

`output.add` contains a complete output object. At minimum include:

- stable `id` and `key`, user-facing `label`, output `type`, and `valueType`.

## Type and content rules

- Preserve numbers, booleans, arrays, and objects as JSON types; do not stringify structured values.
- Read `referencePolicy.acceptedSourceValueTypes` from the target descriptor. For existing nodes,
  `input available` is the preferred compatibility query.
- Never bind an input to a node that is not guaranteed to execute before the consumer.
- Required inputs must be configured unless the template explicitly marks them as user-provided or remotely validated.
- For code nodes, inspect the actual returned object keys and create outputs with those exact keys.
- For interactive forms and user selection, also read `interactive-nodes.md`.

## Compatibility decisions

Choose the source by semantic meaning and the target's runtime `referencePolicy`, not by a similar
label or a static type table. Array targets can accept scalar sources when
`acceptedSourceValueTypes` lists the scalar type; do not manually wrap or serialize the reference.

For a new source and target created in the same ChangeSet:

1. Read both template descriptors.
2. Configure any derived dynamic IO before the reference command.
3. Track the planned output key and type from the earlier command.
4. Bind only when the target's `acceptedSourceValueTypes` contains the planned source type.

Do not ask the user which internal output key or `valueType` to use. Infer it from the business field and descriptors.

## Dynamic IO ordering

- For derived IO, read `dynamicIO.inputs.derivedFromInputKeys` and
  `dynamicIO.outputs.derivedFromInputKeys`, configure those inputs first, then reinspect the node.
- For manual dynamic IO, use `input.add` or `output.add` only when the corresponding `manual` flag
  is true.
- Follow the selected node-family reference for stable producer behavior such as code parsing,
  form-field synchronization, extraction outputs, HTTP extraction, and loop collection.

When a diagnostic reports a stale, missing, or mismatched dynamic output, repair the producing configuration or select the correct output. Never resubmit the unchanged reference.
