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

    // `oldContent` that never matched leaves the file untouched. Saying "edited" anyway
    // makes the agent believe its change landed and continue on a wrong assumption.
    const unmatched = results
      .filter((result) => result.replacedCount === 0)
      .map((result) => result.path);
    if (unmatched.length > 0) {
      return {
        response: `Files not edited (oldContent not found): ${unmatched.join(', ')}`
      };
    }

    return {
      response: `Files edited successfully: ${params.entries.map((entry) => entry.path).join(', ')}`
    };
  }
});
