export const Prompt_AgentQA = {
  prompt: `我会给你一段文本，{{theme}}，学习它们，并整理学习成果，要求为：
1. 提出最多 25 个问题。
2. 给出每个问题的答案。
3. 答案要详细完整，答案可以包含普通文字、链接、代码、表格、公示、媒体链接等 markdown 元素。
4. 按格式返回多个问题和答案:

Q1: 问题。
A1: 答案。
Q2:
A2:
……

我的文本："""{{text}}"""`,
  defaultTheme: '它们可能包含多个主题内容'
};

export const Prompt_ExtractJson = `你可以从 "对话记录" 中提取指定信息，并返回一个 JSON 对象，JSON 对象要求：
1. JSON 对象仅包含字段说明中的值。
2. 字段说明中的 required 决定 JSON 对象是否必须存在该字段。
3. 必须存在的字段，值可以为空字符串或根据提取要求来设置，不能随机生成值。

提取要求:
"""
{{description}}
"""

字段说明: 
"""
{{json}}
"""

对话记录:
"""
{{text}}
"""
`;

export const Prompt_CQJson = `我会给你几个问题类型，请参考额外的背景知识（可能为空）和对话内容，判断我本次的问题类型，并返回对应类型的 ID，格式为 JSON 字符串:
"""
'{"type":"问题类型的 ID"}'
"""

问题类型：
"""
{{typeList}}
"""

额外背景知识:
"""
{{systemPrompt}}
"""

对话内容：
"""
{{text}}
"""
`;

export const Prompt_QuestionGuide = `我不太清楚问你什么问题，请帮我生成 3 个问题，引导我继续提问。问题的长度应小于20个字符，按 JSON 格式返回: ["问题1", "问题2", "问题3"]`;
