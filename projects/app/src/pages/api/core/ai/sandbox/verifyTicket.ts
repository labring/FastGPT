import jwt from 'jsonwebtoken';
import z from 'zod';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatIdSchema } from '@fastgpt/global/core/chat/schema';
import { IntSchema } from '@fastgpt/global/common/zod';
import {
  SandboxVerifyTicketQuerySchema,
  SandboxVerifyTicketResponseSchema,
  type SandboxVerifyTicketQuery,
  type SandboxVerifyTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildSandboxClientQueryFromChatSource } from '@fastgpt/service/core/ai/sandbox/application/runtime';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { resolveVerifiedSandboxPtySession } from '@fastgpt/service/core/ai/sandbox/application/pty';
import { resolveSandboxPreviewSession } from '@fastgpt/service/core/ai/sandbox/application/preview';

const SandboxTerminalTicketClaimsSchema = z.object({
  sandboxId: z.string().min(1),
  ptySessionId: z.string().min(1),
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string().min(1),
  userId: z.string(),
  chatId: ChatIdSchema.min(1),
  cols: IntSchema.min(1).max(1000).optional(),
  rows: IntSchema.min(1).max(1000).optional()
});

/**
 * 面向 `opensandbox-proxy` 的内部凭证核验入口：
 * - 终端模式（`?ticket=...`）：验签 HS256 JWT，唤醒/确认沙盒与 PTY 会话并返回 `execd` 连接信息；
 * - 预览模式（`?previewSessionId=...`）：解析 Redis 预览会话，唤醒/确认沙盒并返回 `execd` 基地址与工作区根路径。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, SandboxVerifyTicketQuery>
): Promise<SandboxVerifyTicketResponse> {
  const secret = authAgentSandboxProxy(req);

  const { ticket, previewSessionId } = parseApiInput({
    req,
    querySchema: SandboxVerifyTicketQuerySchema
  }).query;

  // 1. 预览模式：解析 24 位随机 previewSessionId 并返回工作区只读代理寻址信息。
  if (previewSessionId !== undefined) {
    const sessionContext = await resolveSandboxPreviewSession(previewSessionId);
    const sandbox = await getSandboxClient(sessionContext);
    try {
      const endpoint = await sandbox.retryOnRecoverableError(() =>
        sandbox.opensandbox.getEndpoint()
      );
      const { workspaceRoot } = sandbox.getRuntimePaths();
      return SandboxVerifyTicketResponseSchema.parse({
        sandboxId: sessionContext.sandboxId,
        execdBaseUrl: endpoint.url.replace(/\/+$/, ''),
        execdHeaders: endpoint.headers ?? {},
        rootDirectory: workspaceRoot
      });
    } finally {
      await sandbox.close();
    }
  }

  // 2. 终端模式：验签短期 HS256 JWT 并恢复/校验对应的 PTY 会话；快路径遇到失效容器时自动自愈重试一次。
  const claims = (() => {
    try {
      return SandboxTerminalTicketClaimsSchema.parse(
        jwt.verify(ticket!, secret, { algorithms: ['HS256'] })
      );
    } catch {
      throw new Error(ERROR_ENUM.unAuthorization);
    }
  })();

  const sandboxQuery = buildSandboxClientQueryFromChatSource({
    sourceType: claims.sourceType,
    sourceId: claims.sourceId,
    userId: claims.userId,
    chatId: claims.chatId
  });

  const sandbox = await getSandboxClient(sandboxQuery);
  try {
    const { ptySessionId, httpBaseUrl, headers, reused } = await sandbox.retryOnRecoverableError(
      () =>
        resolveVerifiedSandboxPtySession({
          sandbox,
          expectedPtySessionId: claims.ptySessionId,
          cols: claims.cols,
          rows: claims.rows
        })
    );

    return SandboxVerifyTicketResponseSchema.parse({
      sandboxId: sandboxQuery.sandboxId,
      execdBaseUrl: httpBaseUrl,
      execdHeaders: headers,
      ptySessionId,
      reused
    });
  } finally {
    await sandbox.close();
  }
}

export default NextAPI(handler, {
  csrf: false,
  redactQueryParams: ['ticket']
});
