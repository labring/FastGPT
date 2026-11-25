import {
  getAgentSandboxDiskBytes,
  getAgentSandboxProxyConfig
} from '@fastgpt/service/core/ai/sandbox/config';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getAuthorizedSandboxClient } from '@/service/core/sandbox/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ApiHttpError } from '@fastgpt/service/common/http/apiError';
import jwt from 'jsonwebtoken';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  SandboxGetTicketBodySchema,
  SandboxGetTicketResponseSchema,
  type SandboxGetTicketBody,
  type SandboxTicketPermission,
  type SandboxGetTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const TICKET_EXPIRES_IN = '1m';

/** 鉴权、准备会话后签发通道专用连接地址；地址和文件限制统一由服务端配置派生。 */
async function handler(
  req: ApiRequestProps<SandboxGetTicketBody>
): Promise<SandboxGetTicketResponse> {
  const { secret, wsUrl: proxyUrl } = getAgentSandboxProxyConfig();
  if (!secret) {
    throw new ApiHttpError(500, 'Agent Sandbox proxy secret is not configured');
  }
  if (!proxyUrl) {
    throw new ApiHttpError(500, 'Agent Sandbox WebSocket proxy URL is not configured');
  }
  const wsUrl = new URL(proxyUrl);
  const {
    customUid,
    authProxy,
    sourceType,
    sourceId,
    chatId,
    channel,
    permission,
    outLinkAuthData
  } = parseApiInput({
    req,
    bodySchema: SandboxGetTicketBodySchema
  }).body;
  const ticketPermission: SandboxTicketPermission = channel === 'terminal' ? 'write' : permission;

  if (channel === 'terminal' && sourceType !== ChatSourceTypeEnum.skillEdit) {
    throw new ApiHttpError(400, 'Sandbox terminal is only available in edit debug sessions');
  }

  // 1. 鉴权、检查产品可用性并确保沙盒已拉起可用
  const {
    session: { uid, teamId, sourceType: resolvedSourceType, sourceId: resolvedSourceId },
    sandbox
  } = await getAuthorizedSandboxClient({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: ticketPermission === 'write' ? WritePermissionVal : ReadPermissionVal
  });
  const { workspaceRoot, sessionWorkDirectory } = sandbox.getRuntimePaths();

  // 用户级 Sandbox 可能由其它 Chat 创建，签发 Ticket 前确保当前 Chat 的 IDE 根目录存在。
  await sandbox.runWithRecovery(() =>
    sandbox.opensandbox.createDirectories([sessionWorkDirectory])
  );

  // 签发短期 HMAC 凭证，内含租户元数据，不包含任何物理寻址信息。
  const ticket = jwt.sign(
    {
      sourceType: resolvedSourceType,
      sourceId: resolvedSourceId,
      userId: uid,
      chatId,
      teamId,
      channel,
      permission: ticketPermission
    },
    secret,
    { algorithm: 'HS256', expiresIn: TICKET_EXPIRES_IN }
  );

  // 使用配置中的公开代理地址，保留部署路径前缀；Ticket 与请求通道绑定。
  wsUrl.pathname = `${wsUrl.pathname.replace(/\/+$/, '')}/${channel}`;
  wsUrl.hash = '';
  wsUrl.searchParams.set('ticket', ticket);

  return SandboxGetTicketResponseSchema.parse({
    wsUrl: wsUrl.toString(),
    maxFileBytes: getAgentSandboxDiskBytes(),
    workspaceRoot,
    sessionWorkDirectory
  });
}

export default NextAPI(handler);
