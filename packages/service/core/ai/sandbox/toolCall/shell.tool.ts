import z from 'zod';
import { defineTool } from './type';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

const SandboxShellToolSchema = z.object({
  command: z.string(),
  timeout: z.number().int().min(1).max(600).optional()
});

export const sandboxShellTool = defineTool({
  zodSchema: SandboxShellToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    const result = await sandboxInstance.exec(params.command, params.timeout);
    return {
      response: JSON.stringify({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      })
    };
  }
});

export const toolMap = {
  [SANDBOX_SHELL_TOOL_NAME]: sandboxShellTool
};
