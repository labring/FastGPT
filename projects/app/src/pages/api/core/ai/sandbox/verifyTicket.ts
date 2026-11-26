import { ChatIdSchema } from '@fastgpt/global/core/chat/schema';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { buildSandboxClientQueryFromChatSource } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { getAuthenticatedIdeAgentEndpoint } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import {
  ApiRequestInputParseError,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
import {
  SandboxChannelSchema,
  SandboxTicketPermissionSchema,
  SandboxVerifyTicketQuerySchema,
  SandboxVerifyTicketResponseSchema,
  type SandboxVerifyTicketQuery,
  type SandboxVerifyTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import {
  SANDBOX_WS_MAX_MESSAGE_BYTES,
  SANDBOX_WS_MAX_FRAME_BYTES
} from '@fastgpt/service/core/ai/sandbox/constants';
import {
  SANDBOX_IDE_AGENT_HTTP_PORT,
  SANDBOX_IDE_AGENT_WS_PORT
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { resolveSandboxPreviewSession } from '@fastgpt/service/core/ai/sandbox/application/preview';

const SANDBOX_PREVIEW_SESSION_HEADER = 'x-sandbox-preview-session';

const SandboxPreviewSessionHeaderSchema = z.string().trim().min(1);
const SandboxRequiredTicketQuerySchema = SandboxVerifyTicketQuerySchema.extend({
  ticket: z.string().min(1)
});

const SandboxTicketClaimsSchema = z.object({
  userId: z.string(),
  chatId: ChatIdSchema,
  teamId: z.string(),
  channel: SandboxChannelSchema,
  permission: SandboxTicketPermissionSchema,
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string()
});

/**
 * 校验 WebSocket ticket 或 Preview session，并返回 IDE Agent 的代理连接地址及上游数据面鉴权头。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, SandboxVerifyTicketQuery>
): Promise<SandboxVerifyTicketResponse> {
  const secret = authAgentSandboxProxy(req);

  const resolveVerifyTicketTarget = async () => {
    const headerPreviewSession = req.headers[SANDBOX_PREVIEW_SESSION_HEADER];
    if (headerPreviewSession !== undefined) {
      const { forceRefresh } = parseApiInput({
        req,
        querySchema: SandboxVerifyTicketQuerySchema
      }).query;
      // 显式传入空值或多值 preview session 请求头时按 header 入参错误处理（400）
      const parsedPreviewSession =
        SandboxPreviewSessionHeaderSchema.safeParse(headerPreviewSession);
      if (!parsedPreviewSession.success) {
        throw new ApiRequestInputParseError(parsedPreviewSession.error, { inputSource: 'header' });
      }

      return {
        sandboxQuery: await resolveSandboxPreviewSession(parsedPreviewSession.data),
        ideAgentPort: SANDBOX_IDE_AGENT_HTTP_PORT,
        forceRefresh
      };
    }

    const { ticket, forceRefresh } = parseApiInput({
      req,
      querySchema: SandboxRequiredTicketQuerySchema
    }).query;

    try {
      const { sourceType, sourceId, userId, chatId } = SandboxTicketClaimsSchema.parse(
        jwt.verify(ticket, secret, { algorithms: ['HS256'] })
      );
      return {
        sandboxQuery: buildSandboxClientQueryFromChatSource({
          sourceType,
          sourceId,
          userId,
          chatId
        }),
        ideAgentPort: SANDBOX_IDE_AGENT_WS_PORT,
        forceRefresh
      };
    } catch {
      throw new ApiHttpError(401, 'Invalid ticket signature');
    }
  };

  const authContext = await resolveVerifyTicketTarget();

  const sandbox = await getSandboxClient(authContext.sandboxQuery);

  const endpoint = await sandbox.runWithRecovery(() =>
    getAuthenticatedIdeAgentEndpoint({
      sandbox: sandbox.opensandbox,
      port: authContext.ideAgentPort,
      forceRefreshPassword: authContext.forceRefresh === 'true'
    })
  );

  return SandboxVerifyTicketResponseSchema.parse({
    sandbox_url: endpoint.url,
    upstream_headers: endpoint.headers,
    ws_limits: {
      max_message_bytes: SANDBOX_WS_MAX_MESSAGE_BYTES,
      max_frame_bytes: SANDBOX_WS_MAX_FRAME_BYTES
    }
  });
}

export default NextAPI(handler);
