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
    const [file] = await sandboxInstance.provider.writeFiles([
      {
        path: params.path,
        data: params.content
      }
    ]);
    if (!file || file.error) {
      throw new Error(`Failed to write file: ${file?.error?.message || params.path}`);
    }

    return {
      response: `File written successfully: ${params.path}`
    };
  }
});

export const toolMap = {
  [SANDBOX_WRITE_FILE_TOOL_NAME]: sandboxWriteFileTool
};
