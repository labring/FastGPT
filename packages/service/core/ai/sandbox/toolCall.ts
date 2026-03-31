import {
  SANDBOX_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SandboxShellToolSchema,
  SandboxGetFileUrlToolSchema
} from '@fastgpt/global/core/ai/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { parseJsonArgs } from '../utils';
import { getSandboxClient } from './controller';
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import path from 'path';
import { jwtSignS3ObjectKey } from '../../../common/s3/utils';
import { addHours } from 'date-fns';
import { Readable } from 'stream';
import { getLogger } from '@fastgpt-sdk/otel';
import { LogCategories } from '../../../common/logger';

type SandboxToolCallParams = {
  toolName: string;
  rawArgs: string;
  appId: string;
  userId: string;
  chatId: string;
};

export type SandboxToolCallResult = {
  input: Record<string, any>;
  response: string;
  durationSeconds: number;
};

/**
 * 纯沙盒工具执行层。
 * 只负责调用沙盒、上传 S3 等底层操作，返回统一的执行结果，不绑定任何业务响应格式。
 */
export const callSandboxTool = async ({
  toolName,
  rawArgs,
  appId,
  userId,
  chatId
}: SandboxToolCallParams): Promise<SandboxToolCallResult> => {
  const startTime = Date.now();
  const getDuration = () => +((Date.now() - startTime) / 1000).toFixed(2);

  if (toolName === SANDBOX_TOOL_NAME) {
    const parsed = SandboxShellToolSchema.safeParse(parseJsonArgs(rawArgs));
    if (!parsed.success) {
      return { input: {}, response: parsed.error.message, durationSeconds: getDuration() };
    }
    const { command, timeout } = parsed.data;

    try {
      const instance = await getSandboxClient({ appId, userId, chatId });
      const result = await instance.exec(command, timeout);

      return {
        input: { command, timeout },
        response: JSON.stringify({
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        }),
        durationSeconds: getDuration()
      };
    } catch (error: any) {
      getLogger(LogCategories.MODULE.AI.AGENT).error('[Sandbox Shell] Execution failed', { error });
      return {
        input: { command, timeout },
        response: getErrText(error),
        durationSeconds: getDuration()
      };
    }
  }

  if (toolName === SANDBOX_GET_FILE_URL_TOOL_NAME) {
    const parsed = SandboxGetFileUrlToolSchema.safeParse(parseJsonArgs(rawArgs));
    if (!parsed.success) {
      return { input: {}, response: parsed.error.message, durationSeconds: getDuration() };
    }

    const { paths } = parsed.data;

    try {
      const instance = await getSandboxClient({ appId, userId, chatId });

      const result = await Promise.all(
        paths.map(async (url) => {
          const filename = path.basename(url);
          const stream = instance.provider.readFileStream(url);
          const readable = Readable.from(stream); // AsyncIterable<Uint8Array> → Readable

          const chatBucket = getS3ChatSource();
          const expiredTime = addHours(new Date(), 2);
          const { key } = await chatBucket.uploadChatFile({
            appId,
            chatId,
            uId: userId,
            filename,
            body: readable,
            expiredTime: expiredTime
          });
          const fileUrl = jwtSignS3ObjectKey(key, expiredTime);

          return {
            fileUrl,
            filename
          };
        })
      );

      return {
        input: { paths },
        response: JSON.stringify(result),
        durationSeconds: getDuration()
      };
    } catch (error) {
      getLogger(LogCategories.MODULE.AI.AGENT).error('[Sandbox Get File URL] failed', { error });

      return {
        input: { paths },
        response: `Get file URL error: ${getErrText(error)}`,
        durationSeconds: getDuration()
      };
    }
  }

  return {
    input: {},
    response: `Unknown sandbox tool: ${toolName}`,
    durationSeconds: getDuration()
  };
};
