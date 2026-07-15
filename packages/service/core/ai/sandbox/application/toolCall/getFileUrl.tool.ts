/**
 * 沙盒业务层：定义 sandbox 文件临时下载链接工具。
 *
 * 只负责确认 workspace 文件存在并返回 agent-proxy 直连链接，不处理运行态生命周期。
 */
import z from 'zod';
import path from 'path';
import { defineTool } from './type';
import { SANDBOX_GET_FILE_URL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import {
  buildSandboxPreviewFileUrl,
  createSandboxPreviewTicket,
  resolveSandboxPreviewPath
} from '../preview';

const SandboxGetFileUrlToolSchema = z.object({
  paths: z.array(z.string())
});

export const sandboxGetFileUrlTool = defineTool({
  zodSchema: SandboxGetFileUrlToolSchema,
  execute: async ({ sourceType, sourceId, userId, chatId, teamId, sandboxInstance, params }) => {
    const files = params.paths.map((filePath) => ({
      filePath,
      ...resolveSandboxPreviewPath(filePath)
    }));
    const fileInfoMap = await sandboxInstance.provider.getFileInfo(
      files.map(({ providerPath }) => providerPath)
    );
    for (const { providerPath } of files) {
      const fileInfo = fileInfoMap.get(providerPath);
      if (!fileInfo || fileInfo.isDirectory) {
        throw new Error(`Sandbox preview file not found: ${providerPath}`);
      }
    }

    const ticket = createSandboxPreviewTicket({
      sourceType,
      sourceId,
      userId,
      chatId,
      teamId
    });
    const result = files.map(({ filePath, relativePath }) => ({
      fileUrl: buildSandboxPreviewFileUrl({ ticket, filePath }),
      filename: path.posix.basename(relativePath)
    }));

    return { response: JSON.stringify(result) };
  }
});

export const toolMap = {
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: sandboxGetFileUrlTool
};
