import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export const SandboxReadFileToolSchema = z
  .object({
    path: z.string(),
    startLine: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional()
  })
  .refine(
    ({ startLine, endLine }) =>
      startLine === undefined || endLine === undefined || startLine <= endLine,
    {
      message: 'startLine must be less than or equal to endLine'
    }
  );

const decodeFileContent = (content: unknown) => {
  if (content instanceof Uint8Array) {
    return new TextDecoder('utf-8').decode(content);
  }
  return String(content ?? '');
};

export const sandboxReadFileTool = defineTool({
  zodSchema: SandboxReadFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();

    const [file] = await sandboxInstance.provider.readFiles([params.path]);
    if (!file || file.error) {
      throw new Error(`Failed to read file: ${file?.error?.message || params.path}`);
    }

    const content = decodeFileContent(file.content);
    const lines = content.split(/\r\n|\n|\r/);
    const startLine = params.startLine ?? 1;
    const endLine = params.endLine ?? lines.length;
    const selectedContent = lines.slice(startLine - 1, endLine).join('\n');

    return {
      response: JSON.stringify({
        path: params.path,
        startLine,
        endLine: Math.min(endLine, lines.length),
        totalLines: lines.length,
        content: selectedContent
      })
    };
  }
});

export const toolMap = {
  [SANDBOX_READ_FILE_TOOL_NAME]: sandboxReadFileTool
};
