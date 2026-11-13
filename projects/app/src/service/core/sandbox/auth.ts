import { createHash, timingSafeEqual } from 'crypto';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { ChatAuthProxy, OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AGENT_SANDBOX_PROXY_SECRET_HEADER } from '@fastgpt/global/core/ai/sandbox/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';
import { serviceEnv } from '@fastgpt/service/env';

export type AuthSandboxSessionParams = {
  req: ApiRequestProps;
  sourceType: ChatSourceTypeEnum;
  sourceId?: string;
  chatId: string;
  customUid?: string;
  authProxy?: ChatAuthProxy;
  outLinkAuthData?: OutLinkChatAuthProps;
  per?: number;
};

export type SandboxSessionAuthResult = {
  uid: string;
  teamId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chat?: ChatSchemaType;
};

/**
 * 统一沙盒 API 会话访问控制鉴权。
 * API 边界已将 appId/skillId 转成 sourceType/sourceId；这里按标准 chat source
 * 分发到对应权限体系。Workflow Builder 复用 App 写权限，但保留独立聊天和 Sandbox 身份。
 */
export async function authSandboxSession({
  req,
  sourceType,
  sourceId,
  chatId,
  customUid,
  authProxy,
  outLinkAuthData,
  per = ReadPermissionVal
}: AuthSandboxSessionParams): Promise<SandboxSessionAuthResult> {
  if (sourceType === ChatSourceTypeEnum.skillEdit && chatId !== EDIT_DEBUG_SANDBOX_CHAT_ID) {
    throw new Error('Skill edit sandbox only supports edit-debug chat');
  }

  const authResult = await authChatTargetCrud({
    allowMissingChat: true,
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    customUid,
    authProxy,
    outLinkAuthData,
    per
  });

  // 普通 Chat 鉴权只证明会话可访问；写入沙盒文件时还需要显式校验 App 写权限。
  if (sourceType === ChatSourceTypeEnum.app && per !== ReadPermissionVal && !authResult.isProxy) {
    await authApp({
      req,
      authToken: true,
      authApiKey: true,
      authAppApiKey: true,
      appId: authResult.sourceId,
      per
    });
  }

  return {
    uid: authResult.uid,
    teamId: authResult.teamId,
    sourceType: authResult.sourceType,
    sourceId: authResult.sourceId,
    chat: authResult.chat
  };
}

/**
 * 校验 `opensandbox-proxy` 调用主站内部接口（`verifyTicket` / `keepalive`）的共享密钥。
 * 采用定长 SHA-256 摘要 + `timingSafeEqual` 常量时间比对，避免密钥长度泄露。
 */
export function authAgentSandboxProxy(req: ApiRequestProps): string {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET?.trim();
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }

  const rawHeader = req.headers[AGENT_SANDBOX_PROXY_SECRET_HEADER];
  if (typeof rawHeader !== 'string' || rawHeader.trim() === '') {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  const expectedDigest = createHash('sha256').update(secret).digest();
  const actualDigest = createHash('sha256').update(rawHeader).digest();
  if (!timingSafeEqual(actualDigest, expectedDigest)) {
    throw new Error(ERROR_ENUM.unAuthorization);
  }

  return secret;
}
