export const Prompt_AgentQA = {
  description: `<context></context> 标记中是一段文本，学习和分析它，并整理学习成果：
- 提出问题并给出每个问题的答案。
- 答案需详细完整，给出相关原文描述。
- 答案可以包含普通文字、链接、代码、表格、公示、媒体链接等 markdown 元素。
- 最多提出 30 个问题。
`,
  fixedText: `最后，你需要按下面的格式返回多个问题和答案:
Q1: 问题。
A1: 答案。
Q2:
A2:
……

<context>
{{text}}
<context/>
`
};

export const Prompt_ExtractJson = `你可以从 <对话记录></对话记录> 中提取指定 JSON 信息，你仅需返回 JSON 字符串，无需回答问题。
<提取要求>
{{description}}
</提取要求>

<字段说明>
1. 下面的 JSON 字符串均按照 JSON Schema 的规则描述。
2. key 代表字段名；description 代表字段的描述；required 代表字段是否必须；enum 是可选值，代表可选的 value。
3. 如果字段内容为空，你可以返回空字符串。

{{json}}
</字段说明>

<对话记录>
{{text}}
</对话记录>
`;

export const Prompt_CQJson = `我会给你几个问题类型，请参考背景知识（可能为空）和对话记录，判断我“本次问题”的类型，并返回一个问题“类型ID”:
<问题类型>
{{typeList}}
</问题类型>

<背景知识>
{{systemPrompt}}
</背景知识>

<对话记录>
{{history}}
</对话记录>

Human："{{question}}"

类型ID=
`;

export const Prompt_QuestionGuide = `我不太清楚问你什么问题，请帮我生成 3 个问题，引导我继续提问。问题的长度应小于20个字符，按 JSON 格式返回: ["问题1", "问题2", "问题3"]`;
