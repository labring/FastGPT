import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
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
 * 校验 proxy ticket，并返回 IDE Agent 的代理连接地址和一次性 agent 口令。
 */
async function handler(req: ApiRequestProps) {
  const secret = authAgentSandboxProxy(req);

  const { ticket } = parseApiInput({
    req,
    querySchema: VerifyTicketQuerySchema
  }).query;

  let decoded: z.infer<typeof SandboxTicketClaimsSchema>;
  try {
    decoded = SandboxTicketClaimsSchema.parse(jwt.verify(ticket, secret));
  } catch (err: any) {
    throw new Error('Invalid ticket signature: ' + err.message);
  }

  const { appId, userId, chatId, teamId } = decoded;

  const sandbox = await getSandboxClient({ appId, userId, chatId, teamId });
  const agentPassword = await readIdeAgentPassword(sandbox);

  const endpoint = await sandbox.provider.getEndpoint(getIdeAgentPort());

  return {
    sandbox_url: endpoint.url,
    agent_token: agentPassword
  };
}

export default NextAPI(handler);
