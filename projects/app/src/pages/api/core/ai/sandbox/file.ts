import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/controller';
import {
  SandboxFileOperationBodySchema,
  type SandboxFileOperationResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { listSandboxDirectory, writeSandboxFile } from '@/service/core/sandbox/fileService';

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
  const sandbox = await getSandboxClient({
    appId,
    userId: uid,
    chatId
  });

  try {
    await sandbox.ensureAvailable();

    // 根据 action 分类执行
    switch (action) {
      case 'list': {
        const files = await listSandboxDirectory(sandbox, body.path);
        return { action: 'list', files };
      }

      case 'write': {
        await writeSandboxFile(sandbox, body.path, body.content);
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
