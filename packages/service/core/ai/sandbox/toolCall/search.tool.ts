import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_SEARCH_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export const SandboxSearchToolSchema = z.object({
  pattern: z.string(),
  path: z.string().optional()
});

export const sandboxSearchTool = defineTool({
  zodSchema: SandboxSearchToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.ensureAvailable();
    const results = await sandboxInstance.provider.search(params.pattern, params.path);

    return {
      response: JSON.stringify(
        (results ?? []).map((result: string | { path: string }) =>
          typeof result === 'string' ? result : result.path
        )
      )
    };
  }
});

export const toolMap = {
  [SANDBOX_SEARCH_TOOL_NAME]: sandboxSearchTool
};
