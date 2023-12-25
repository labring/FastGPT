import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getAIApi } from '../config';

const prompt = `
您的任务是生成根据用户问题，从不同角度，生成两个不同版本的问题，以便可以从矢量数据库检索相关文档。例如：
问题: FastGPT如何使用？
OUTPUT: ["FastGPT使用教程。","怎么使用FastGPT？"]
-------------------
问题: FastGPT如何收费？
OUTPUT: ["FastGPT收费标准。","FastGPT是如何计费的？"]
-------------------
问题: 怎么FastGPT部署？
OUTPUT: ["FastGPT的部署方式。","如何部署FastGPT？"]
-------------------
问题 question: {{q}}
OUTPUT: 
`;

export const searchQueryExtension = async ({ query, model }: { query: string; model: string }) => {
  const ai = getAIApi(undefined, 480000);

  const result = await ai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: replaceVariable(prompt, { q: query })
      }
    ],
    stream: false
  });

  const answer = result.choices?.[0]?.message?.content || '';
  if (!answer) {
    return {
      queries: [query],
      model,
      inputTokens: 0,
      responseTokens: 0
    };
  }

  try {
    return {
      queries: JSON.parse(answer) as string[],
      model,
      inputTokens: result.usage?.prompt_tokens || 0,
      responseTokens: result.usage?.completion_tokens || 0
    };
  } catch (error) {
    return {
      queries: [query],
      model,
      inputTokens: 0,
      responseTokens: 0
    };
  }
};
