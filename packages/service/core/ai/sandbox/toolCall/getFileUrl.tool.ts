import z from 'zod';
import path from 'path';
import { Readable } from 'stream';
import { addHours } from 'date-fns';
import { defineTool } from './type';
import { getS3ChatSource } from '../../../../common/s3/sources/chat';
import { jwtSignS3ObjectKey } from '../../../../common/s3/utils';
import { SANDBOX_GET_FILE_URL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/constants';

const SandboxGetFileUrlToolSchema = z.object({
  paths: z.array(z.string())
});

export const sandboxGetFileUrlTool = defineTool({
  zodSchema: SandboxGetFileUrlToolSchema,
  execute: async ({ appId, userId, chatId, sandboxInstance, params }) => {
    const result = await Promise.all(
      params.paths.map(async (filePath) => {
        const filename = path.basename(filePath);
        const stream = sandboxInstance.provider.readFileStream(filePath);
        const readable = Readable.from(stream);

        const chatBucket = getS3ChatSource();
        const expiredTime = addHours(new Date(), 2);
        const { key } = await chatBucket.uploadChatFile({
          appId,
          chatId,
          uId: userId,
          filename,
          body: readable,
          expiredTime
        });
        const fileUrl = jwtSignS3ObjectKey(key, expiredTime);

        return { fileUrl, filename };
      })
    );

    return { response: JSON.stringify(result) };
  }
});

export const toolMap = {
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: sandboxGetFileUrlTool
};
