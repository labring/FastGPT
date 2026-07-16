/**
 * 沙盒业务层：定义 sandbox 文件临时下载链接工具。
 *
 * 只负责把 sandbox 文件流转存到 chat S3 临时对象，不处理运行态生命周期。
 */
import z from 'zod';
import path from 'path';
import { Readable } from 'stream';
import { addHours } from 'date-fns';
import { defineTool } from './type';
import { getS3ChatSource } from '../../../../../common/s3/sources/chat';
import { SANDBOX_GET_FILE_URL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

const SandboxGetFileUrlToolSchema = z.object({
  paths: z.array(z.string())
});

export const sandboxGetFileUrlTool = defineTool({
  zodSchema: SandboxGetFileUrlToolSchema,
  execute: async ({ sandboxInstance, params }) => {
    const { sourceType, sourceId, userId, chatId } = sandboxInstance.getContext();

    if (!sourceType || !sourceId || !userId || !chatId) {
      return { response: 'Sandbox file export context is not available.' };
    }

    const result = await Promise.all(
      params.paths.map(async (filePath) => {
        const filename = path.basename(filePath);
        const providerPath = sandboxInstance.resolveRuntimePath(filePath, {
          allowAbsolutePath: true
        });
        const stream = sandboxInstance.provider.readFileStream(providerPath);
        const readable = Readable.from(stream);

        const chatBucket = getS3ChatSource();
        const expiredTime = addHours(new Date(), 2);
        const { key } = await chatBucket.uploadChatFile({
          sourceType,
          sourceId,
          chatId,
          uId: userId,
          filename,
          body: readable,
          expiredTime
        });
        const { url: fileUrl } = await chatBucket.createGetChatFileURL({
          key,
          expiredHours: 2,
          external: true
        });

        return {
          responseFile: { fileUrl, filename },
          fileRef: { key, filename, url: fileUrl }
        };
      })
    );

    return {
      response: JSON.stringify(result.map((item) => item.responseFile)),
      fileRefs: result.map((item) => item.fileRef)
    };
  }
});

export const toolMap = {
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: sandboxGetFileUrlTool
};
