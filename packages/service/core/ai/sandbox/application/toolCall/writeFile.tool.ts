/**
 * 沙盒业务层：定义 sandbox 文件写入工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
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
    const providerPath = sandboxInstance.resolveRuntimePath(params.path, {
      allowAbsolutePath: true
    });
    const [file] = await sandboxInstance.provider.writeFiles([
      {
        path: providerPath,
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
