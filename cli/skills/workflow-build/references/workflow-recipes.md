# Workflow recipes

Read this file only when a complete composition example is useful. These recipes describe topology and command ordering, not current template fields. Inspect every referenced template and input before creating the ChangeSet.

## Minimal AI answer

```text
workflow-start@next
  -> ai-chat@target
```

Typical ChangeSet order:

1. `node.add` AI chat with `connectFrom` set to workflow-start next.
2. `input.ref` AI user question from `workflow-start.userChatInput`.
3. Configure the model only when the current template descriptor and available resource provide a valid value.

## Knowledge retrieval and AI answer

```text
workflow-start@next
  -> dataset-search@target
  -> ai-chat@target
```

Also bind:

- Dataset query from the workflow-start user input.
- AI question from the workflow-start user input.
- AI retrieval/context input from the inspected dataset-search output.

A dataset is a remote resource binding. Configure the search node and wiring, then use a verified dataset binding when available. Describe the missing binding if the current environment cannot resolve it.

## Branching

```text
workflow-start@next
  -> classifier-or-condition@target
      -> branch:<key> -> branch-node@target
      -> branch:ELSE  -> fallback-node@target
```

Command order:

1. Add the branch node and configure its complete branch definition.
2. Add destination nodes.
3. Connect only branch keys confirmed by the configured branch list.
4. Preview and repair branch-key and reachability diagnostics.

## Tool call

```text
workflow-start@next
  -> tool-call@target
       @tools -> selected-tool@tools
```

Use `tool.attach` rather than an ordinary execution edge. Configure the tool from its inspected template or attach an existing compatible tool node.

## Code with dynamic outputs and catch path

```text
workflow-start@next
  -> code@target
       @next  -> success@target
       @catch -> recovery@target
```

1. Add the code node and set its source code as a literal input.
2. Add outputs whose keys exactly match the returned object keys.
3. Enable `catchError` before connecting the catch edge.
4. Bind downstream inputs with `input.ref` to the exact output keys.

## Loop/container

1. Inspect the loop template and its `container children` result.
2. Add child nodes with `parentNodeId` set to the loop container.
3. Connect internal flow from the inspected container start child.
4. Use the loop break template only inside a compatible loop container.

## Interactive input

For form input or user selection, read `interactive-nodes.md`. Configure complete option/field arrays before connecting dependent branch or output references.

## Recipe rule

Never copy a recipe blindly. Current template descriptors, node IDs, input keys, output keys, value types, and required resources always override the example.
