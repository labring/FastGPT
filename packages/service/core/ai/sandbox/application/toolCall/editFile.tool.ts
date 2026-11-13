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

    if (results.every((result) => result.status === 'replaced')) {
      return {
        response: `Files edited successfully: ${params.entries.map((entry) => entry.path).join(', ')}`
      };
    }

    // 未命中、未知和跳过都是模型可处理的业务结果，逐条回填 tool response。
    // 部分修改可能已经生效，统一提示先读文件再重试，避免重复执行已完成的编辑。
    return {
      response: [
        ...results.map((result, index) => {
          const label = `Edit ${index + 1}`;
          switch (result.status) {
            case 'replaced':
              return `${label} applied (replacement count: ${result.replacedCount}): ${result.path}`;
            case 'unmatched':
              return `${label} not applied (oldContent not found): ${result.path}`;
            case 'unknown':
              return `${label} result unknown (replacement count unavailable): ${result.path}`;
            case 'skipped':
              return `${label} skipped (an earlier edit did not match): ${result.path}`;
          }
        }),
        'Read the files to verify their current contents before retrying.'
      ].join('\n')
    };
  }
});
