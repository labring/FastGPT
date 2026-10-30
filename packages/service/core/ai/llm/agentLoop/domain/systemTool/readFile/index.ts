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
    description:
      'Read and parse only files marked as document from absolute HTTP(S) URLs. Do not use this tool for files marked as unknown, image, audio, or video.',
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
