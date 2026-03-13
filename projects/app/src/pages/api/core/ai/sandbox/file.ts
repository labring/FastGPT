import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { SandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxFileOperationBodySchema,
  type SandboxFileOperationResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse<SandboxFileOperationResponse>
): Promise<SandboxFileOperationResponse> {
  // 解析请求体
  const body = SandboxFileOperationBodySchema.parse(req.body);
  const { appId, chatId, action, outLinkAuthData } = body;

  // 统一鉴权
  const { uid } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 创建沙盒实例
  const sandbox = new SandboxClient({
    appId,
    userId: uid,
    chatId
  });

  try {
    await sandbox.ensureAvailable();

    // 根据 action 分类执行
    switch (action) {
      case 'list': {
        const entries = await sandbox.provider.listDirectory(body.path);

        const files = entries.map((entry) => ({
          name: entry.name,
          path: entry.path,
          type: entry.isDirectory ? ('directory' as const) : ('file' as const),
          size: entry.isFile ? entry.size : undefined
        }));
        return { action: 'list', files };
      }

      case 'read': {
        const results = await sandbox.provider.readFiles([body.path]);
        const result = results[0];

        if (result.error) {
          return Promise.reject(result.error);
        }

        // 尝试将 Uint8Array 转换为 UTF-8 字符串
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          const content = decoder.decode(result.content);
          return { action: 'read', content };
        } catch (error) {
          // 非 UTF-8 内容,返回特殊标记
          return { action: 'read', content: '[Binary File - Cannot Display]' };
        }
      }

      case 'write': {
        const results = await sandbox.provider.writeFiles([
          {
            path: body.path,
            data: body.content
          }
        ]);
        const result = results[0];

        if (result.error) {
          return Promise.reject(result.error);
        }

        return { action: 'write', success: true };
      }

      default:
        return Promise.reject('Invalid action');
    }
  } catch (error: any) {
    if (error?.toJSON) {
      const err = error.toJSON();
      return Promise.reject(`[${err.name}] ${err.message}`);
    }
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
