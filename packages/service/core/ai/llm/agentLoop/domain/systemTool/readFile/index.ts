import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import z from 'zod';

export const READ_FILES_TOOL_NAME = 'read_files';

export const ReadFilesToolParamsSchema = z.object({
  urls: z.array(z.string())
});

export const createReadFilesTool = ({
  maxFileAmount
}: {
  maxFileAmount: number;
}): ChatCompletionTool => ({
  type: 'function',
  function: {
    name: READ_FILES_TOOL_NAME,
    description: 'Read the content of specified files.',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          maxItems: maxFileAmount,
          items: {
            type: 'string'
          },
          description: 'Absolute HTTP(S) file URLs'
        }
      },
      required: ['urls']
    }
  }
});

export const isReadFilesToolName = (toolName: string) => toolName === READ_FILES_TOOL_NAME;
