import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/types';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { serviceEnv } from '@fastgpt/service/env';
import { timingSafeEqual } from 'crypto';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  buildSandboxClientQueryFromChatSource,
  createAgentSandboxPermissionDeniedError
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';

/**
 * 统一沙盒 API 会话访问控制鉴权。
 * API 边界已将 appId/skillId 转成 sourceType/sourceId；这里仅按标准 chat source
 * 分发到 App Chat 或 Skill Edit 权限体系。
 */
export async function authSandboxSession({
  req,
  sourceType,
  sourceId,
  chatId,
  outLinkAuthData,
  per = ReadPermissionVal
}: {
  req: ApiRequestProps;
  sourceType: ChatSourceTypeEnum;
  sourceId?: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  per?: number;
}): Promise<{ uid: string; teamId: string; sourceType: ChatSourceTypeEnum; sourceId: string }> {
  const result = await (async () => {
    if (sourceType === ChatSourceTypeEnum.skillEdit) {
      if (chatId !== EDIT_DEBUG_SANDBOX_CHAT_ID) {
        throw new Error('Skill edit sandbox only supports edit-debug chat');
      }
    }

    const authResult = await authChatTargetCrud({
      req,
      authToken: true,
      authApiKey: true,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per
    });

    // 普通 Chat 鉴权只证明会话可访问；写入沙盒文件时还需要显式校验 App 写权限。
    if (sourceType === ChatSourceTypeEnum.app && per !== ReadPermissionVal) {
      await authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: authResult.sourceId,
        per
      });
    }

    return {
      uid: authResult.uid,
      teamId: authResult.teamId,
      sourceType: authResult.sourceType,
      sourceId: authResult.sourceId
    };
  })();

  try {
    await checkTeamSandboxPermission(result.teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

  return result;
}

export { buildSandboxClientQueryFromChatSource };

export const AGENT_SANDBOX_PROXY_HEADER = 'x-proxy-token';

/**
 * 校验 agent-sandbox-proxy 调用主站内部 API 的共享密钥。
 * 这层只服务 proxy 到 Next API 的反向通道，浏览器侧访问仍走 ticket 鉴权。
 */
export function authAgentSandboxProxy(req: ApiRequestProps): string {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }

  const proxyToken = req.headers[AGENT_SANDBOX_PROXY_HEADER];
  if (typeof proxyToken !== 'string') {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  const expected = Buffer.from(secret);
  const actual = Buffer.from(proxyToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  return secret;
}
