import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_EDIT_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export const SandboxEditFileToolSchema = z.object({
  entries: z.array(
    z.object({
      path: z.string(),
      oldContent: z.string(),
      newContent: z.string()
    })
  )
});

export const sandboxEditFileTool = defineTool({
  zodSchema: SandboxEditFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    await sandboxInstance.provider.replaceContent(
      params.entries.map((entry) => ({
        path: entry.path,
        oldContent: entry.oldContent,
        newContent: entry.newContent
      }))
    );

    return {
      response: `Files edited successfully: ${params.entries.map((entry) => entry.path).join(', ')}`
    };
  }
});

export const toolMap = {
  [SANDBOX_EDIT_FILE_TOOL_NAME]: sandboxEditFileTool
};
