import { replaceVariable } from '@fastgpt/global/common/string/tools';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';

export const getPromptToolCallPrompt = (tools: ChatCompletionTool['function'][]) => {
  const prompt = `<ToolSkill>
你是一个智能机器人，除了可以回答用户问题外，你还掌握工具的使用能力。有时候，你可以依赖工具的运行结果，来更准确的回答用户。

工具使用了 JSON Schema 的格式声明，格式为：{name: 工具名; description: 工具描述; parameters: 工具参数}，其中 name 是工具的唯一标识，parameters 包含工具的参数、类型、描述、必填项等。

请你根据工具描述，决定回答问题或是使用工具。你的每次输出都必须以0,1开头，代表是否需要调用工具：
0: 不使用工具，直接回答内容。
1: 使用工具，返回工具调用的参数。

## 回答示例

- 0: 你好，有什么可以帮助你的么？
- 1: ${JSON.stringify({ name: 'searchToolId1' })}
- 0: 现在是2022年5月5日，星期四，中午12点。
- 1: ${JSON.stringify({ name: 'searchToolId2', arguments: { city: '杭州' } })}
- 0: 今天杭州是晴天。
- 1: ${JSON.stringify({ name: 'searchToolId3', arguments: { query: '杭州 天气 去哪里玩' } })}
- 0: 今天杭州是晴天，适合去西湖、灵隐寺、千岛湖等地玩。

## 可用工具列表

"""
{{toolSchema}}
"""
</ToolSkill>
`;

  const schema = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));

  return replaceVariable(prompt, {
    toolSchema: JSON.stringify(schema)
  });
};
