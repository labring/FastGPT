/**
 * 沙盒业务层：定义 sandbox 文件写入工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';

export const SandboxWriteFileToolSchema = z.object({
  path: z.string(),
  content: z.string()
});

export const sandboxWriteFileTool = defineTool({
  zodSchema: SandboxWriteFileToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    await sandboxInstance.runWithRecovery(async () => {
      const targetPath = sandboxInstance.resolveRuntimePath(params.path, {
        allowAbsolutePath: true
      });
      await sandboxInstance.opensandbox.writeFiles([
        {
          path: targetPath,
          data: params.content
        }
      ]);
    });

    return {
      response: `File written successfully: ${params.path}`
    };
  }
});
