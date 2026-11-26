# Tool-call and container nodes

Read this file for `tool-call`, `parallel-run`, `loop-run`, or `loop-run-break`.

Always inspect the template descriptor and current container children. Container system children and layout fields are maintained by Core and the Web editor.

## Tool call

- A tool-call node uses a valid remote model binding.
- Attach tools with `tool.attach`; do not create ordinary execution edges between the tool-call node and its tools.
- Attach only templates or existing nodes that expose the selected-tools target contract.
- A tool-call node requires at least one attached tool unless the current descriptor explicitly enables another execution capability such as Sandbox.
- Use the answer-text output for downstream string inputs.

## Parallel run

- Bind the container input only from a source type listed by its `referencePolicy`.
- Parallel-run is root-only.
- Place business nodes inside the container through `parentNodeId`.
- Connect internal execution from the inspected system start child.
- Use success results, full results, and status only with consumers expecting their declared types.
- Do not edit child-ID lists or Web layout dimensions.

## Loop run

- Configure loop mode and bind a source accepted by the input's `referencePolicy` before wiring
  child behavior.
- Loop-run is root-only.
- The inspected start child exposes the current item, index, and iteration outputs.
- Put loop body nodes inside the loop container and keep their edges within the same scope.
- Custom collected outputs are manual dynamic outputs declared in pairs: `input.add` the same
  key and value type first (an editable dynamic-input declaration with `canEdit: true`), then
  `output.add` the collected output with the matching key and type. The Web editor derives
  dynamic outputs from the declared editable inputs and removes any dynamic output that has no
  matching declaration when the canvas loads, so an output without its input declaration is
  deleted. Add the exact keys and types before downstream references.
- The collected-output input declaration must carry a `value` reference to a loop-body node
  output (`[bodyNodeId, outputKey]`). The runtime snapshots that reference once per iteration
  and returns the collected values, so a declaration without a reference collects `undefined`
  at runtime even though the canvas renders the output. Bind the declaration only after the
  body producer node exists and its output is confirmed with `node show`.
- Reference the loop start child by mode: use `currentIndex`/`currentItem` in array mode and
  `currentIteration` in conditional mode only. A body reference to a start output the active
  mode does not expose is deleted together with its edge when the canvas loads (the container
  removes the mode's start outputs and syncs edges), so generate start-output references that
  match the configured mode.
- Use only the loop outputs declared by the configured collection behavior.
- Enable catch handling before connecting a catch edge.

## Loop break

- `loop-run-break` is valid only inside a `loop-run`.
- It is terminal inside the loop body and has no ordinary next edge.
- Do not place it at root, in a parallel container, or in another unsupported parent.
- Use it only when the business condition genuinely requires early termination.

## Repair checklist

- For invalid tool edges, replace ordinary edges with `tool.attach`.
- For cross-scope edges, move the node or reconnect within the correct container.
- For invalid parents, read the descriptor's allowed parent types.
- For missing loop outputs, configure or add the output before binding it.
- For loop collected outputs, `input.add` the declaration with a body-node output reference
  before `output.add`; never declare the output without its collecting input.
- For loop start references, bind only the active mode's outputs (`currentIndex`/`currentItem`
  for array, `currentIteration` for conditional) and never mix modes.
- Never invent system child IDs, selected-tools ports, or container-maintained inputs.
