/**
 * 沙盒业务层：定义 sandbox 文件编辑工具。
 *
 * 只描述工具参数和执行逻辑，运行态准备由 toolCall 编排层负责。
 */
import z from 'zod';
import { defineTool } from './type';

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
    const results = await sandboxInstance.provider.replaceContent(
      params.entries.map((entry) => ({
        path: sandboxInstance.resolveRuntimePath(entry.path, { allowAbsolutePath: true }),
        oldContent: entry.oldContent,
        newContent: entry.newContent
      }))
    );

    // 非全部成功时逐条反馈，避免同文件的部分成功被误读为整份文件未修改。
    // 未知计数可能对应已生效的修改，必须引导先读取确认，不能直接判为未命中。
    if (
      results.some(
        (result) => result.error || result.replacedCount === null || result.replacedCount === 0
      )
    ) {
      return {
        response: results
          .map((result, index) => {
            const label = `Edit ${index + 1}`;
            if (result.error) {
              return `${label} failed: ${result.path}: ${result.error.message}`;
            }
            if (result.replacedCount === null) {
              return `${label} result unknown (replacement count unavailable): ${result.path}. Read the file to verify before retrying.`;
            }
            if (result.replacedCount === 0) {
              return `${label} not applied (oldContent not found): ${result.path}`;
            }
            return `${label} applied (replacement count: ${result.replacedCount}): ${result.path}`;
          })
          .join('\n')
      };
    }

    return {
      response: `Files edited successfully: ${params.entries.map((entry) => entry.path).join(', ')}`
    };
  }
});
