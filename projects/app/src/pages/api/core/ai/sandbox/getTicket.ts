import jwt from 'jsonwebtoken';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { withAuthorizedSandboxClient } from '@/service/core/sandbox/client';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  SandboxGetTicketBodySchema,
  SandboxGetTicketResponseSchema,
  type SandboxGetTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { getAgentSandboxTerminalProxyUrl } from '@fastgpt/service/core/ai/sandbox/config';
import { ensureSandboxPtySession } from '@fastgpt/service/core/ai/sandbox/application/pty';

const TICKET_EXPIRES_IN_SECONDS = 60;

/**
 * 鉴权并唤醒沙盒容器，确保容器内 `execd` 存在存活的交互式 bash PTY 会话，
 * 签发有效期 60 秒的 HS256 JWT Ticket 供浏览器直连 `opensandbox-proxy`。
 */
async function handler(req: ApiRequestProps): Promise<SandboxGetTicketResponse> {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET?.trim();
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }
  const url = getAgentSandboxTerminalProxyUrl();

  const { customUid, authProxy, sourceType, sourceId, chatId, cols, rows, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxGetTicketBodySchema
    }).body;

  return withAuthorizedSandboxClient(
    {
      customUid,
      authProxy,
      req,
      sourceType,
      sourceId,
      chatId,
      outLinkAuthData,
      per: WritePermissionVal
    },
    async ({ sandbox, sandboxQuery, session }) => {
      const { ptySessionId, reused } = await ensureSandboxPtySession(sandbox, { cols, rows });

      // 签发短期 HS256 票据（仅携带逻辑归属元数据，不含内部物理寻址或 API Key）。
      const ticket = jwt.sign(
        {
          sandboxId: sandboxQuery.sandboxId,
          ptySessionId,
          sourceType: session.sourceType,
          sourceId: session.sourceId,
          userId: session.uid,
          chatId,
          ...(cols !== undefined ? { cols } : {}),
          ...(rows !== undefined ? { rows } : {})
        },
        secret,
        {
          algorithm: 'HS256',
          expiresIn: TICKET_EXPIRES_IN_SECONDS
        }
      );

      return SandboxGetTicketResponseSchema.parse({
        ticket,
        url,
        ptySessionId,
        reused
      });
    }
  );
}

export default NextAPI(handler);
