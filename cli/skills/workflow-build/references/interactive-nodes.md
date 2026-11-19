# Branch and interactive nodes

Read this file when the requested workflow uses `if-else`, `question-classification`, `form-input`, or `user-select`.

Configure branch-producing inputs before branch edges. Stable branch keys are internal identifiers; labels and descriptions are user-facing text.

## If/else

- Inspect `builtin:if-else`, the branch input's `constraints.valueSchema`, and
  `execution.branch`.
- Build every branch and condition from the returned schema. Use
  `execution.branch.keyField` as the stable execution key and preserve user-facing labels
  separately.
- Use only source types listed by the relevant input or nested reference policy. A literal
  comparison and an upstream comparison must use their respective schema variants.
- Configure all branches before connecting `branch` edges.
- Use the descriptor's fallback key exactly; do not translate or invent it.

When a condition reference is missing, has the wrong type, or is not upstream, repair the reference or graph. Do not ask the user to provide an internal variable path.

## Question classification

- Inspect `builtin:question-classification`.
- Configure a valid model resource and bind the question from a source type accepted by the
  descriptor.
- Build classification items from the input's `constraints.valueSchema`.
- Use `execution.branch.keyField` as the execution branch key and keep labels user-facing.
- Configure categories before connecting branch edges.
- Use the classification-result output only with consumers that accept its descriptor type; it
  does not replace branch execution.

## Form input

Always inspect `builtin:form-input` first. A usable form requires all of the following:

1. Add the node from `builtin:form-input`.
2. Connect it from the intended previous execution source, or insert it into an existing execution edge.
3. Read `dynamicIO.outputs.derivedFromInputKeys` to locate the field-definition input, then set
   its complete value with a separate `input.set` command. Do not rely on
   `node.add.inputOverrides`, because dynamic outputs are synchronized by `input.set`.
4. Preview the ChangeSet and resolve both `WORKFLOW_FORM_INPUT_CONFIGURATION_INVALID` and `WORKFLOW_NODE_NOT_REACHABLE` before producing the final plan.

The field-definition input's `constraints.valueSchema` is the sole source of truth for item
properties, required fields, types, limits, and option shapes. Preserve the user's field intent
and create stable ASCII keys. When the requested form purpose does not determine its fields, ask
the user instead of creating an empty form or inventing business requirements.

Use one `input.set` command whose `value` is the complete field array. The workflow core will synchronize field keys into node outputs.

Form output semantics:

- The configured field keys become dynamic outputs according to `dynamicIO`.
- Reinspect the node after setting the field definitions; the current outputs and their
  `valueType` values are authoritative.
- Bind a consumer to a compatible field output. Use the aggregate output only when its descriptor
  type is accepted by the consumer.

Set the field-definition input before binding its dynamic outputs. If a failed ChangeSet used an
incompatible aggregate output, replace that reference before retrying.

## User select

Always inspect `builtin:user-select` first.

- Configure the options input with a complete value matching its `constraints.valueSchema`.
- Use `execution.branch.keyField` as the execution branch key and keep option labels user-facing.
- Configure options before connecting branch edges.
- Bind the selection-result output only to consumers that list its type as compatible; branch
  edges represent the selected execution path.
- Repair branch, reachability, or key diagnostics internally before retrying.
