# FastGPT Product Translation Guidelines

## Translation objective

Make the interface feel written for its target market, not translated from Chinese. Preserve the Chinese source's product intent while rewriting its phrasing to fit the target locale.

## English style

- Use contemporary North American product English.
- Prefer short, concrete UI copy. Remove Chinese filler such as “进行”, “相关”, “即可”, and repeated “please” when English does not need it.
- Use sentence case for buttons, labels, headings, statuses, and messages unless a proper noun or established acronym requires capitals.
- Use an imperative for actions: `Create app`, `Retry`, `Select a Dataset`.
- Use a noun phrase for fields and navigation: `Model provider`, `Usage details`.
- Make errors state the problem and, when useful, the recovery action: `Upload failed. Try again.`
- Use contractions where they make user-facing copy sound natural, but avoid slang.
- Prefer `you` and `your` over passive or bureaucratic wording.
- Do not add promises, constraints, or explanations that are absent from the source and unsupported by the product.

## Terminology decision rules

Use [fastgpt-glossary.json](fastgpt-glossary.json) as the canonical terminology source. Search the current English locale only for sentence structure and context; existing translations never override the glossary.

- Match the longest Chinese term first.
- Apply a glossary `contextOverrides` entry when the same Chinese text has a different meaning at a specific namespace path.
- Use `Node` for both `节点` and `模块`; FastGPT product UI has no `Module` concept.
- Translate `调试` as `Debug` and `试运行` as `Test Run`.
- Translate user-visible `引用` as `Citation`, including `知识库引用` as `Dataset citations`.
- Preserve the glossary term's spelling while adapting capitalization and number to the sentence.

Keep brand and protocol names official: `FastGPT`, `OpenAI`, `MCP`, `API`, `HTTP`, `JSON`, `Lark`, `WeCom`, and `DingTalk`.

For `zh-Hant`, prefer clear, region-neutral Traditional Chinese and follow terminology already used consistently in FastGPT. Do not normalize the entire product toward Taiwan-, Hong Kong-, or another region-specific vocabulary as part of one namespace translation. When existing terms conflict and the UI context cannot resolve them, ask the user instead of guessing.

For `ko-KR`, use the canonical Korean product terminology in `localeGlossaries.ko-KR`. Prefer concise native SaaS wording, standard Korean spacing, and consistent transliterations. In particular, preserve FastGPT's distinction between a top-level Dataset (`데이터셋`) and a Collection inside it (`컬렉션`).

## Using n8n and Dify as references

When a workflow, agent, node, execution, credential, plugin, or knowledge-product term remains ambiguous:

1. Search only the official English documentation or current official product UI for n8n and Dify.
2. Compare the underlying behavior, not just the Chinese label.
3. Adopt wording only when the concept and user action match FastGPT.
4. Prefer FastGPT's established term when it is already clear and consistent.
5. Record the source consulted in the final response only when it materially resolved a terminology decision.

Starting points:

- n8n documentation: <https://docs.n8n.io/>
- Dify documentation: <https://docs.dify.ai/en/>

Examples of useful patterns include n8n's `Workflow`, `Node`, `Execution`, and `Credential`, and Dify's `Workflow`, `Agent`, `Tool`, `Knowledge Base`, and `Test Run`. These are comparison points, not a glossary to copy wholesale.

## Runtime invariants

Never translate or alter:

- JSON keys or their order;
- interpolation names and delimiters, for example `{{count}}`;
- rich-text tag names and structure, for example `<bold>...</bold>`;
- URLs, file extensions, command names, code, protocol names, or identifiers;
- meaningful line-break structure or literal `\\n` sequences;
- numeric limits, units, or feature behavior.

Translate text inside rich-text tags while leaving the tags intact. Preserve the semantic distinction between `%`, MB, tokens, points, requests, records, and other units.

## Context-sensitive examples

| Chinese | Avoid | Prefer |
| --- | --- | --- |
| 创建应用 | Create an application | Create app |
| 工作流运行失败，请重试 | Workflow operation failed, please retry | Workflow failed. Try again. |
| 暂无数据 | There is no data for now | No data yet |
| 选择需要使用的知识库 | Select the knowledge base that needs to be used | Select a Dataset |
| 开启后即可使用 | After opening, it can be used | Turn this on to use the feature. |

Judge every example by its actual UI role. A page heading, button, tooltip, and error may require different wording even when their Chinese text is similar.
