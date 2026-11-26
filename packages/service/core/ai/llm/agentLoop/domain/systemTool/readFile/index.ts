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
      'Read and parse text content from document files only (such as PDF, DOCX, TXT, CSV, etc.) at absolute HTTP(S) URLs. Only use this tool for document files whose content is not yet in the conversation. Image, audio, and video attachments provided in the message are already available to understand directly without calling this tool; unknown, image, audio, and video files are not supported by this tool.',
    parameters: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          maxItems: maxFileAmount,
          items: {
            type: 'string'
          },
          description:
            'Absolute HTTP(S) document URLs (document files only; do not pass image, audio, video, or unknown URLs)'
        }
      },
      required: ['urls']
    }
  }
});

export const isReadFilesToolName = (toolName: string) => toolName === READ_FILES_TOOL_NAME;
