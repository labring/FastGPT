import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  getSandboxClient,
  type SandboxClient
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authAgentSandboxProxy } from '@/service/core/sandbox/auth';
import { IntSchema } from '@fastgpt/global/common/zod';
import {
  SandboxChannelSchema,
  SandboxTicketPermissionSchema
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { serviceEnv } from '@fastgpt/service/env';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildSandboxClientQueryFromChatSource } from '@/service/core/sandbox/auth';
import {
  SANDBOX_PREVIEW_CHANNEL,
  SandboxPreviewTicketClaimsSchema
} from '@fastgpt/service/core/ai/sandbox/application/preview';

const DEFAULT_IDE_AGENT_PORT = 1318;
const DEFAULT_IDE_AGENT_PREVIEW_PORT = 1319;
const IDE_AGENT_PASSWORD_READ_COMMAND = 'sh -c "cat ~/.fastgpt-ide-agent-password"';

const VerifyTicketQuerySchema = z.object({
  ticket: z.string().min(1).optional()
});
const SANDBOX_TICKET_HEADER = 'x-sandbox-ticket';

const SandboxVerifyTicketResponseSchema = z.object({
  sandbox_url: z.string().min(1),
  agent_token: z.string(),
  ws_limits: z.object({
    max_message_bytes: IntSchema.min(1),
    max_frame_bytes: IntSchema.min(1)
  })
});
type SandboxVerifyTicketResponse = z.infer<typeof SandboxVerifyTicketResponseSchema>;

const BaseSandboxTicketClaimsSchema = z.object({
  userId: z.string(),
  chatId: z.string(),
  teamId: z.string(),
  channel: SandboxChannelSchema,
  permission: SandboxTicketPermissionSchema
});
const SandboxTicketClaimsSchema = BaseSandboxTicketClaimsSchema.extend({
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string()
});
const SandboxProxyTicketClaimsSchema = z.union([
  SandboxTicketClaimsSchema,
  SandboxPreviewTicketClaimsSchema
]);

/** 根据 ticket 通道选择 IDE Agent 的内部监听端口。 */
const getIdeAgentPort = (channel: z.infer<typeof SandboxProxyTicketClaimsSchema>['channel']) => {
  const isPreview = channel === SANDBOX_PREVIEW_CHANNEL;
  const bindAddr = isPreview
    ? serviceEnv.IDE_AGENT_PREVIEW_BIND_ADDR
    : serviceEnv.IDE_AGENT_BIND_ADDR;
  const defaultPort = isPreview ? DEFAULT_IDE_AGENT_PREVIEW_PORT : DEFAULT_IDE_AGENT_PORT;
  if (!bindAddr) return defaultPort;

  const port = parseInt(bindAddr.split(':').pop() || '', 10);
  return Number.isFinite(port) ? port : defaultPort;
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
async function handler(req: ApiRequestProps): Promise<SandboxVerifyTicketResponse> {
  const secret = authAgentSandboxProxy(req);

  const { ticket: queryTicket } = parseApiInput({
    req,
    querySchema: VerifyTicketQuerySchema
  }).query;
  const headerTicket = req.headers[SANDBOX_TICKET_HEADER];
  const ticket = z
    .string()
    .min(1)
    .parse((typeof headerTicket === 'string' ? headerTicket : undefined) ?? queryTicket);

  let decoded: z.infer<typeof SandboxProxyTicketClaimsSchema>;
  try {
    decoded = SandboxProxyTicketClaimsSchema.parse(jwt.verify(ticket, secret));
  } catch (err: any) {
    throw new Error('Invalid ticket signature: ' + err.message);
  }

  const { sourceType, sourceId, userId, chatId } = decoded;

  const sandbox = await getSandboxClient(
    buildSandboxClientQueryFromChatSource({
      sourceType,
      sourceId,
      userId,
      chatId
    })
  );
  const agentPassword = await readIdeAgentPassword(sandbox);

  const endpoint = await sandbox.provider.getEndpoint(getIdeAgentPort(decoded.channel));

  return SandboxVerifyTicketResponseSchema.parse({
    sandbox_url: endpoint.url,
    agent_token: agentPassword,
    ws_limits: {
      max_message_bytes: serviceEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES,
      max_frame_bytes: serviceEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES
    }
  });
}

export default NextAPI(handler);
