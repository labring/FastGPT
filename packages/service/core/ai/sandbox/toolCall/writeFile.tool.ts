import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_WRITE_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export const SandboxWriteFileToolSchema = z.object({
  path: z.string(),
  content: z.string()
});

export const sandboxWriteFileTool = defineTool({
  zodSchema: SandboxWriteFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    await sandboxInstance.provider.writeFiles([
      {
        path: params.path,
        data: params.content
      }
    ]);

    return {
      response: `File written successfully: ${params.path}`
    };
  }
});

export const toolMap = {
  [SANDBOX_WRITE_FILE_TOOL_NAME]: sandboxWriteFileTool
};
