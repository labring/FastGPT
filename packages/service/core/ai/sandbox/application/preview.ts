/**
 * 沙盒业务层：签发并解析 workspace 只读预览链接。
 *
 * Preview token 只携带业务归属，不包含 provider endpoint 或 IDE Agent 内部口令。文件路径
 * 必须落在当前 provider 的 workDirectory 内，并以 URL path segment 形式传给 agent-proxy。
 */
import jwt from 'jsonwebtoken';
import z from 'zod';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { serviceEnv } from '../../../../env';
import { resolveSandboxWorkspacePath } from './file';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { trimSandboxPathRight } from '../utils';

export const SANDBOX_PREVIEW_CHANNEL = 'preview' as const;
export const SANDBOX_PREVIEW_PERMISSION = 'read' as const;
export const SANDBOX_PREVIEW_TOKEN_EXPIRES_SECONDS = 2 * 60 * 60;

export const SandboxPreviewTicketContextSchema = z.object({
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string().min(1),
  userId: z.string(),
  chatId: z.string().min(1),
  teamId: z.string().min(1)
});
export type SandboxPreviewTicketContext = z.infer<typeof SandboxPreviewTicketContextSchema>;

export const SandboxPreviewTicketClaimsSchema = SandboxPreviewTicketContextSchema.extend({
  channel: z.literal(SANDBOX_PREVIEW_CHANNEL),
  permission: z.literal(SANDBOX_PREVIEW_PERMISSION),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive()
});
export type SandboxPreviewTicketClaims = z.infer<typeof SandboxPreviewTicketClaimsSchema>;

const getPreviewSecret = () => {
  const secret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;
  if (!secret) {
    throw new Error('AGENT_SANDBOX_PROXY_SECRET environment variable is missing');
  }
  return secret;
};

/** 签发一个可读取当前 sandbox workspace 的短期 bearer token。 */
export function createSandboxPreviewTicket(context: SandboxPreviewTicketContext): string {
  const parsedContext = SandboxPreviewTicketContextSchema.parse(context);
  return jwt.sign(
    {
      ...parsedContext,
      channel: SANDBOX_PREVIEW_CHANNEL,
      permission: SANDBOX_PREVIEW_PERMISSION
    },
    getPreviewSecret(),
    { expiresIn: SANDBOX_PREVIEW_TOKEN_EXPIRES_SECONDS }
  );
}

/** 校验 preview token，并返回已收窄的业务 claims。 */
export function verifySandboxPreviewTicket(token: string): SandboxPreviewTicketClaims {
  return SandboxPreviewTicketClaimsSchema.parse(jwt.verify(token, getPreviewSecret()));
}

/**
 * 将工具/API 输入路径规整为 provider 绝对路径和 workspace 相对路径。
 *
 * 内部工具历史上允许传入 `/workspace/file` 绝对路径，因此这里兼容 workspace 内绝对路径；
 * workspace 外路径、空路径、反斜杠、控制字符和非规范 segment 一律拒绝。
 */
export function resolveSandboxPreviewPath(filePath: string): {
  providerPath: string;
  relativePath: string;
} {
  if (!filePath || filePath.includes('\\') || /[\u0000-\u001F\u007F]/.test(filePath)) {
    throw new Error('Invalid sandbox preview path');
  }

  const workDirectory = trimSandboxPathRight(getSandboxRuntimeProfile().workDirectory);
  const providerPath = resolveSandboxWorkspacePath(filePath, workDirectory || '/', {
    allowAbsolutePath: true
  });
  const relativePath = providerPath.slice(workDirectory.length).replace(/^\/+/, '');
  const segments = relativePath.split('/');
  if (
    !relativePath ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid sandbox preview path');
  }

  return { providerPath, relativePath };
}

const getSandboxPreviewProxyBaseUrl = () => {
  const rawUrl = serviceEnv.AGENT_SANDBOX_PROXY_URL;
  if (!rawUrl) {
    throw new Error('AGENT_SANDBOX_PROXY_URL environment variable is missing');
  }

  const url = new URL(rawUrl);
  url.protocol = (() => {
    if (url.protocol === 'ws:') return 'http:';
    if (url.protocol === 'wss:') return 'https:';
    throw new Error('AGENT_SANDBOX_PROXY_URL must start with ws:// or wss://');
  })();
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
};

/** 使用已签发的 token 构建一个 workspace 文件 URL。 */
export function buildSandboxPreviewFileUrl({
  ticket,
  filePath
}: {
  ticket: string;
  filePath: string;
}): string {
  const { relativePath } = resolveSandboxPreviewPath(filePath);
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${getSandboxPreviewProxyBaseUrl()}/preview/${encodeURIComponent(ticket)}/${encodedPath}`;
}

/** 为一个 workspace 文件签发 token 并返回完整 direct preview URL。 */
export function createSandboxPreviewFileUrl({
  context,
  filePath
}: {
  context: SandboxPreviewTicketContext;
  filePath: string;
}): string {
  return buildSandboxPreviewFileUrl({
    ticket: createSandboxPreviewTicket(context),
    filePath
  });
}
