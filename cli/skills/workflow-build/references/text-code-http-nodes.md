# Text, code, HTTP, and state nodes

Read this file for `workflow-start`, `text-editor`, `assigned-answer`, `code`, `http-request`, `custom-feedback`, or `variable-update`.

Always use the runtime descriptor for current keys, modes, types, defaults, and dynamic-IO behavior.

## Workflow start

- A workflow contains exactly one start node and one system-config node.
- Bind start-node outputs only to inputs whose `referencePolicy` accepts their declared type.
- Never clone or add another start node.

## Text editor

- The text input is literal textarea content.
- Use `{{$nodeId.outputKey$}}` for every inline reference, matching the canvas `/` picker.
- Global variables use `{{$VARIABLE_NODE_ID.variableKey$}}`, including `{{$VARIABLE_NODE_ID.FEISHU_HOOK_URL$}}` for a webhook URL. Never generate bare `{{name}}` placeholders.
- Do not use `input.ref` unless the current descriptor explicitly exposes reference mode.
- Use the text output for downstream `string` inputs.

## Assigned answer and custom feedback

- Both nodes expose an ordinary next port. They can reply or record feedback and then continue
  execution.
- Use a literal value when composing the response in place.
- Use `input.ref` only when the complete response is one compatible upstream value.
- Connect downstream work from `node@next` when the requested flow continues after the reply or
  feedback.

## Code

Set code before binding dynamic inputs or referencing dynamic outputs.

The code is the source of truth:

- `main` parameters become editable node inputs.
- Returned object keys become dynamic outputs.
- Parameter and property type annotations determine `valueType`.
- Output keys come from returned object keys, never from returned values or translated labels.

Preferred JavaScript shape:

```js
/**
 * @param {string} candidateName - Candidate name
 * @property {boolean} valid - Validation result
 * @property {string} normalizedName - Normalized name
 */
function main({ candidateName }) {
  const normalizedName = candidateName.trim();
  return { valid: normalizedName.length > 0, normalizedName };
}
```

Apply commands in this order:

1. add the code node;
2. set the complete code input;
3. bind the synchronized parameters with `input.ref` or literals allowed by the resulting descriptor;
4. reference only synchronized return keys from downstream nodes.

Do not preserve default `data1` or `data2` bindings when the new code no longer declares them. Do not bind an aggregate object to a scalar parameter; select a compatible field output or declare the parameter as an object only when the code genuinely consumes the whole object.

## HTTP request

- The URL is a literal absolute HTTP or HTTPS URL.
- Do not add the deprecated custom-variable input. Reference upstream values directly in the URL,
  headers, query parameters, and body with `{{$nodeId.outputKey$}}`.
- Build headers, query parameters, form fields, and body values from each input's
  `constraints.valueSchema`.
- Do not substitute a standalone node-reference value for an input that exposes only literal
  mode.
- Secrets use the secret/resource contract and must not be invented or exposed.
- Raw response and raw error outputs are structured values, not plain text.
- Response extraction outputs are manual dynamic outputs. Add exact keys and value types before downstream bindings.
- Enable catch handling before connecting a catch edge.

## Variable update

Build each update item from the update-list input's `constraints.valueSchema`. The schema defines
the target, supported operations, value mode, and stored value variants.

- Literal and reference modes must use the corresponding schema variant.
- A reference source must be compatible with the selected target type.
- Preserve numbers, booleans, arrays, and objects as their real JSON types.
- Use only operations exposed for the target type.
- Do not expose reference syntax to the user; infer the correct mode from the requested behavior.

## Repair checklist

- Reinspect dynamic code inputs and outputs after changing code.
- Reinspect HTTP and variable-update value schemas before retrying.
- Remove stale references when a dynamic key disappears.
- Never stringify a structured value merely to satisfy a scalar input.
