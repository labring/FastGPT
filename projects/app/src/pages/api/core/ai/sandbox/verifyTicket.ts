import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authAgentSandboxProxy } from '@/service/core/sandbox/proxyAuth';
import {
  SandboxChannelSchema,
  SandboxTicketPermissionSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { serviceEnv } from '@fastgpt/service/env';

const DEFAULT_IDE_AGENT_PORT = 1318;
const IDE_AGENT_PASSWORD_READ_COMMAND = 'sh -c "cat ~/.fastgpt-ide-agent-password"';

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

const getIdeAgentPort = () => {
  const bindAddr = serviceEnv.IDE_AGENT_BIND_ADDR;
  if (!bindAddr) return DEFAULT_IDE_AGENT_PORT;

  const port = parseInt(bindAddr.split(':').pop() || '', 10);
  return Number.isFinite(port) ? port : DEFAULT_IDE_AGENT_PORT;
};

async function readIdeAgentPassword(sandbox: SandboxClient) {
  const maxRetries = 3;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await sandbox.exec(IDE_AGENT_PASSWORD_READ_COMMAND, 2);
      const password = result.stdout.trim();

      if (result.exitCode === 0 && password) {
        return password;
      }

      throw new Error(result.stderr || result.stdout || 'empty password file');
    } catch (err: any) {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to read IDE Agent password after ${maxRetries} attempts: ${err.message}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Failed to read IDE Agent password: unknown error');
}

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
  const sandboxId = sandbox.getSandboxId();
  const agentPassword = await readIdeAgentPassword(sandbox);

  // 3. 实时提取 Endpoint
  const endpoint = await sandbox.provider.getEndpoint(getIdeAgentPort());

  return {
    sandbox_ip: endpoint.host,
    sandbox_port: endpoint.port,
    sandbox_id: sandboxId,
    sandbox_url: endpoint.url,
    agent_token: agentPassword
  };
}

export default NextAPI(handler);
