import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import z from 'zod';

export const READ_FILES_TOOL_NAME = 'read_files';

export const ReadFilesToolParamsSchema = z.object({
  ids: z.array(z.string())
});

export const createReadFilesTool = (): ChatCompletionTool => ({
  type: 'function',
  function: {
    name: READ_FILES_TOOL_NAME,
    description: 'Read the content of specified files.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'File IDs'
        }
      },
      required: ['ids']
    }
  }
});

export const isReadFilesToolName = (toolName: string) => toolName === READ_FILES_TOOL_NAME;
