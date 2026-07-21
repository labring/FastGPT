/**
 * 沙盒业务层：定义 sandbox 文件临时下载链接工具。
 *
 * 校验 workspace 文件存在后签发短期只读预览链接，不复制文件内容。
 */
import z from 'zod';
import path from 'path';
import { defineTool } from './type';
import {
  buildSandboxPreviewFileUrl,
  createSandboxPreviewSession,
  resolveSandboxPreviewPath
} from '../preview';

const SandboxGetFileUrlToolSchema = z.object({
  paths: z.array(z.string())
});

export const sandboxGetFileUrlTool = defineTool({
  zodSchema: SandboxGetFileUrlToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    if (params.paths.length === 0) {
      return { response: '[]' };
    }

    const sandboxId = sandboxInstance.getSandboxId();
    const { sourceType, sourceId, userId, chatId } = sandboxInstance.getContext();

    if (!sourceId || userId === undefined || !chatId) {
      return { response: 'Sandbox file preview context is not available.' };
    }

    const files = params.paths.map((inputPath) => {
      const filePath = sandboxInstance.resolveRuntimePath(inputPath, {
        allowAbsolutePath: true
      });
      return {
        filePath,
        ...resolveSandboxPreviewPath(filePath)
      };
    });
    const fileInfoMap = await sandboxInstance.provider.getFileInfo(
      files.map(({ providerPath }) => providerPath)
    );
    for (const { providerPath } of files) {
      const fileInfo = fileInfoMap.get(providerPath);
      if (!fileInfo || fileInfo.isDirectory) {
        throw new Error(`Sandbox preview file not found: ${providerPath}`);
      }
    }

    const sessionId = await createSandboxPreviewSession({
      sandboxId,
      sourceType,
      sourceId,
      userId,
      chatId
    });
    const result = files.map(({ filePath, relativePath }) => ({
      fileUrl: buildSandboxPreviewFileUrl({
        sandboxId,
        sessionId,
        filePath
      }),
      filename: path.posix.basename(relativePath)
    }));

    return { response: JSON.stringify(result) };
  }
});
