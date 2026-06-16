import { authChatCrud } from '@/service/support/permission/auth/chat';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { serviceEnv } from '@fastgpt/service/env';
import { timingSafeEqual } from 'crypto';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { createAgentSandboxPermissionDeniedError } from '@fastgpt/service/core/ai/sandbox/error';

/**
 * 统一沙盒 API 会话访问控制鉴权。
 * 支持普通聊天会话（authChatCrud）及编辑调试态（authSkill）的自动感知和鉴权路由。
 */
export async function authSandboxSession({
  req,
  appId,
  chatId,
  outLinkAuthData,
  per = ReadPermissionVal
}: {
  req: ApiRequestProps;
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
  per?: number;
}): Promise<{ uid: string; teamId: string }> {
  const result = await (async () => {
    if (chatId === 'edit-debug') {
      const authResult = await authSkill({
        req,
        authToken: true,
        authApiKey: true,
        skillId: appId,
        per
      });
      return {
        uid: authResult.tmbId,
        teamId: authResult.teamId
      };
    }

    const authResult = await authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      shareId: outLinkAuthData?.shareId,
      outLinkUid: outLinkAuthData?.outLinkUid,
      teamId: outLinkAuthData?.teamId,
      teamToken: outLinkAuthData?.teamToken
    });

    // 普通 Chat 鉴权只证明会话可访问；写入沙盒文件时还需要显式校验 App 写权限。
    if (per !== ReadPermissionVal) {
      await authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId,
        per
      });
    }

    return {
      uid: authResult.uid,
      teamId: authResult.teamId
    };
  })();

  try {
    await checkTeamSandboxPermission(result.teamId);
  } catch {
    throw createAgentSandboxPermissionDeniedError();
  }

  return result;
}

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
