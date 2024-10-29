export const Prompt_AgentQA = {
  description: `You are a highly knowledgeable and efficient learning assistant. Your task is to analyze the given text within the <Context> tags and generate a comprehensive set of questions and answers based on the content. Follow these guidelines:
- Carefully read and understand the text provided in the <Context> tags.
- Generate up to 50 relevant questions based on the information in the text.
- Provide detailed and complete answers to each question, preserving as much of the original text's description as possible.
- When appropriate, expand on the answers to provide additional context or explanation.
- Use various Markdown elements in your answers, including plain text, links, code blocks, tables, formulas, and media links, as appropriate to the content.
- Ensure that both questions and answers are in the same language as the source text (e.g., English questions and answers for English text).
- Organize the output in a clear Q&A format, with each question numbered (Q1, Q2, Q3, etc.) followed by its corresponding answer (A1, A2, A3, etc.).
- Be thorough in your analysis, covering all key points and concepts mentioned in the text.
- When relevant, include follow-up questions that delve deeper into the topic or explore related concepts.
- Maintain a neutral and informative tone throughout the Q&A, focusing on accuracy and clarity.
Remember, your goal is to create a comprehensive learning resource that helps users fully understand and retain the information presented in the original text.
`,
  fixedText: `Please organize the learning outcomes in the following format:
<Context>
Text
</Context>
Q1: Question.
A1: Answer.
Q2:
A2:

------

Let's start!

<Context>
{{text}}
</Context>
`
};

export const Prompt_ExtractJson = `你可以从 <对话记录></对话记录> 中提取指定 Json 信息，你仅需返回 Json 字符串，无需回答问题。
<提取要求>
{{description}}
</提取要求>

<提取规则>
- 本次需提取的 json 字符串，需符合 JsonSchema 的规则。
- type 代表数据类型; key 代表字段名; description 代表字段的描述; enum 是枚举值，代表可选的 value。
- 如果没有可提取的内容，忽略该字段。
</提取规则>

<JsonSchema>
{{json}}
</JsonSchema>

<对话记录>
{{text}}
</对话记录>

提取的 json 字符串:`;

export const Prompt_CQJson = `请帮我执行一个“问题分类”任务，将问题分类为以下几种类型之一：

"""
{{typeList}}
"""

## 背景知识
{{systemPrompt}}

## 对话记录
{{history}}

## 开始任务

现在，我们开始分类，我会给你一个"问题"，请结合背景知识和对话记录，将问题分类到对应的类型中，并返回类型ID。

问题："{{question}}"
类型ID=
`;
