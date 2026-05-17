import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import z from 'zod';

export const ReadFileToolSchema = z.object({
  ids: z.array(z.string())
});
export const readFileTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: SubAppIds.readFiles,
    description: '读取指定文件的内容',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '文件 ID'
        }
      },
      required: ['ids']
    }
  }
};
