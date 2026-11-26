# Diagnostics and self-repair

Read this file before any workflow mutation. Resolve technical workflow issues using diagnostics and descriptors. Ask for business information when it is required to determine the intended behavior.

## Repair loop

1. Read the diagnostic and identify the affected command, node, input, output, edge, or resource.
2. Inspect the smallest relevant descriptor and locate the rule in the repair map.
3. For a node created in the plan, derive its planned dynamic contract from the template descriptor and preceding configuration commands.
4. Fix the affected command while preserving unrelated changes and the intended behavior.
5. Generate or validate the revised plan again and check the diagnostics.

## Repair map

### Command and value shape

Examples: invalid tool arguments, unknown command fields, input value schema errors.

- Re-read `changesets-and-plans.md`.
- Inspect the target template or input descriptor.
- Use structured JSON values rather than CLI flag strings or serialized objects.
- Remove unsupported fields instead of inventing compatibility properties.

### Input mode and value type

Examples: input mode not allowed, value type mismatch, literal/reference mismatch.

- Run `input show` for the target input.
- For an existing target node, run `input available` before selecting an upstream value.
- Use `input.set` for literal values and `input.ref` for standalone references.
- Require the source output type to appear in the target descriptor's
  `referencePolicy.acceptedSourceValueTypes`.
- Do not stringify arrays or objects to bypass validation.
- Do not change a correctly typed target input merely to preserve a wrong source reference.

### Reference source

Examples: output not found, source not upstream, reference format invalid.

- Run `output list` on the source and `input available` on the target when both nodes exist.
- Use the source output's exact stable key, not its translated label.
- Ensure an execution path reaches the consumer from the source.
- If the intended source is downstream, repair the graph or choose a genuinely upstream source.

For nodes created in the same ChangeSet, current-workflow queries cannot see planned dynamic
outputs. Read `dynamicIO`, `effects`, and the field-definition `valueSchema` from the template
descriptor. Configure derived producers before consumers, and only plan outputs that the declared
derivation or manual-output contract can create.

### Branches and execution edges

Examples: branch key not found, unsupported next port, invalid catch/tool edge, unreachable node.

- Configure the branch-producing input before connecting branch edges.
- Read `execution.branch` from `template show`; use its `keyField` and never use translated branch
  labels as keys.
- Use only source and target kinds exposed by the runtime descriptor.
- Enable `catchError` before adding a catch edge.
- Attach tools with `tool.attach`; do not connect ordinary execution ports to tool ports.
- Ensure every ordinary node is reachable from an entry path.

### Dynamic inputs and outputs

Examples: dynamic IO unsupported, duplicate key, stale output reference.

- Read `dynamicIO` and `effects` from `template show`.
- When outputs are derived, configure the source input first and let Core synchronize them.
- When outputs are manual, use `output.add` with the exact key and type before binding consumers.
- Remove or reconnect references before deleting an output.
- Stable keys are ASCII identifiers; user-facing labels may be localized.

### Containers

Examples: invalid parent, cross-scope edge, loop-break parent missing, container children out of sync.

- Read the container descriptor and `container children`.
- Keep root-only containers at root.
- Put `loop-run-break` only inside a `loop-run`.
- Connect internal execution through inspected system children.
- Never invent system child IDs or edit container-maintained layout inputs.

### Checksum and concurrent edits

- Re-run `inspect`.
- Rebuild the ChangeSet against the latest checksum and current document.
- Preserve the user's requested intent while adapting to the latest graph.
- Do not ask the user to understand or resolve a checksum.

### External resources

Remote models, datasets, applications, tools, and secrets cannot be fabricated.

- Reuse an existing valid binding when the request preserves that node.
- Use a template default only when the descriptor explicitly provides one.
- Resolve the resource through authorized discovery when available. When a resource cannot be resolved, report the missing binding and its effect on execution.
