# AI and data nodes

Read this file for `ai-chat`, `dataset-search`, `question-optimization`, `content-extract`, `read-files`, `dataset-concat`, or `call-app`.

Always run `template show` for each new node. The rules below explain stable semantics; the descriptor provides the current inputs, outputs, types, defaults, and resource requirements.

## AI chat

- Bind the user question and history only from source types listed in each input's
  `referencePolicy.acceptedSourceValueTypes`.
- Knowledge references and file links use their own typed inputs; do not pass ordinary strings into structured inputs.
- When a downstream AI node consumes dataset search results, bind the upstream `quoteQA` output to the AI node's knowledge-reference input with a typed reference.
- A model is a remote resource. Reuse an existing valid model only when preserving a node, or use an explicit descriptor default. Never invent a model identifier.
- Use outputs only with consumers whose reference policy accepts the output's declared type.
- Keep system prompts as literal text; embed node outputs with the documented inline syntax only when the input is in literal text mode.

## Dataset search

- The dataset selection is a remote resource binding. Resolve the identifier using authorized discovery when available.
- The search input expects the type exposed by the descriptor. Convert or compose the user's text through an upstream node rather than falsifying the input type.
- Connect the `dataset-search` query input and quote outputs to downstream consumers such as `ai-chat` or `dataset-concat`. Set `datasetSelectList` when a verified binding is available.
- Configure optional rerank or query-extension models only with valid remote model bindings.
- Report any unresolved dataset binding and how it affects execution.

## Question optimization

This legacy node (`builtin:question-optimization`) is deprecated. Use current templates for new nodes. If the user asks for question optimization, rewrite, or query extension, use an `ai-chat` node with appropriate system prompts instead.

## Content extraction

- Configure extraction requirements and source text separately.
- Build extraction fields from the schema published by the descriptor.
- Follow `dynamicIO` to identify the field-definition input and whether outputs are manual.
- Add one output for each field that downstream nodes need, using the same key and type declared
  by the field definition.
- The full extraction result is not interchangeable with an individual scalar field.
- Configure fields and outputs before creating downstream references.

## Read files

- Bind the file input only from a type listed in
  `referencePolicy.acceptedSourceValueTypes`. A scalar source is valid when the policy lists its
  type; never serialize an array merely to bypass the contract.
- Do not pass uploaded file metadata objects unless the descriptor explicitly accepts that type.
- Use the text output for extracted content and the raw-response output only for consumers expecting structured file results.

## Dataset concatenation

- Add quote inputs only through the dynamic input contract.
- Each quote input must reference a source type accepted by the resulting dynamic input.
- Use the merged quote output for downstream AI knowledge-reference inputs.

## Application call

- The selected application is a remote resource binding. Use the exact ID returned by authorized App discovery when available.
- Bind user question and history with their exact compatible types.
- Use answer text for plain-text consumers and history for chat-history consumers.
- Configure the node and its input/output connections. Set `runAppSelectApp` when a verified binding is available and report any remaining binding.

## Repair checklist

- Inspect the target input before binding.
- Use `input available` for existing nodes.
- Verify that text, history, dataset quotes, file arrays, and structured results are not interchanged.
- Never replace a missing remote resource with a guessed identifier or placeholder object.
