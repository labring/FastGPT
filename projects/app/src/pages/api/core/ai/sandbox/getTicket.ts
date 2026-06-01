import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/service/runtime';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import jwt from 'jsonwebtoken';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  SandboxGetTicketBodySchema,
  type SandboxTicketPermission,
  type SandboxGetTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '@fastgpt/service/core/ai/skill/edit/config';

const TICKET_EXPIRES_IN = '1m';

async function handler(req: ApiRequestProps): Promise<SandboxGetTicketResponse> {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }
  const { appId, chatId, outLinkAuthData, channel, permission } = parseApiInput({
    req,
    bodySchema: SandboxGetTicketBodySchema
  }).body;
  const ticketPermission: SandboxTicketPermission = channel === 'terminal' ? 'write' : permission;

  if (channel === 'terminal' && chatId !== EDIT_DEBUG_SANDBOX_CHAT_ID) {
    throw new Error('Sandbox terminal is only available in edit debug sessions');
  }

  // 1. 复用 FastGPT 现有的多租户与 Session 安全鉴权
  const { uid, teamId } = await authSandboxSession({
    req,
    appId,
    chatId,
    outLinkAuthData,
    per: ticketPermission === 'write' ? WritePermissionVal : ReadPermissionVal
  });

  // 2. 调度并确保沙盒已拉起可用
  await getSandboxClient({ appId, userId: uid, chatId, teamId });

  // 签发短期 HMAC 凭证，内含租户元数据，不包含任何物理寻址信息。
  const ticket = jwt.sign(
    {
      appId,
      userId: uid,
      chatId,
      teamId,
      channel,
      permission: ticketPermission
    },
    secret,
    { expiresIn: TICKET_EXPIRES_IN }
  );

  return { ticket };
}

export default NextAPI(handler);
