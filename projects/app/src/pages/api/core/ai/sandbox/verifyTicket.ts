import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authAgentSandboxProxy } from '@/service/core/sandbox/proxyAuth';
import { FASTGPT_IDE_AGENT_PORT } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SandboxChannelSchema,
  SandboxTicketPermissionSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';

const VerifyTicketQuerySchema = z.object({
  ticket: z.string()
});

const SandboxTicketClaimsSchema = z.object({
  appId: z.string(),
  userId: z.string(),
  chatId: z.string(),
  teamId: z.string(),
  channel: SandboxChannelSchema,
  permission: SandboxTicketPermissionSchema
});

/**
 * 校验 Ticket 并实时置换返回 Sandbox 的真实内网/公网 Endpoint 物理寻址参数
 * 该接口属于 Proxy 反向向主站发起的高安全内部通道，实现对客户端 100% 隐藏内网网络拓扑
 */
async function handler(req: ApiRequestProps) {
  const secret = authAgentSandboxProxy(req);

  const { ticket } = parseApiInput({
    req,
    querySchema: VerifyTicketQuerySchema
  }).query;

  // 1. JWT 验签并解密租户凭证
  let decoded: z.infer<typeof SandboxTicketClaimsSchema>;
  try {
    decoded = SandboxTicketClaimsSchema.parse(jwt.verify(ticket, secret));
  } catch (err: any) {
    throw new Error('Invalid ticket signature: ' + err.message);
  }

  const { appId, userId, chatId, teamId } = decoded;

  // 2. 实时查询并确保沙盒处于可用拉起状态
  const sandbox = await getSandboxClient({ appId, userId, chatId, teamId });

  // 3. 实时提取 Endpoint
  const endpoint = await sandbox.provider.getEndpoint(FASTGPT_IDE_AGENT_PORT);

  return {
    sandbox_ip: endpoint.host,
    sandbox_port: endpoint.port,
    sandbox_id: sandbox.getSandboxId(),
    sandbox_url: endpoint.url
  };
}

export default NextAPI(handler);
