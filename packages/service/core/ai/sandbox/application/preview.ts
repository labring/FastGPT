/**
 * 沙盒业务层：创建并解析 workspace 只读预览 session。
 *
 * Preview session 只保存 sandbox 运行态查询参数，不包含 provider endpoint 或 IDE Agent
 * 内部口令。文件路径必须落在当前 provider 的 workDirectory 内，并以 URL path segment
 * 形式传给 agent-proxy。
 */
import z from 'zod';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { serviceEnv } from '../../../../env';
import { getAllKeysByPrefix, getGlobalRedisConnection } from '../../../../common/redis';
import { resolveSandboxWorkspacePath } from './file';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { trimSandboxPathRight } from '../utils';

export const SANDBOX_PREVIEW_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX = 500;
export const SANDBOX_PREVIEW_SESSION_ID_LENGTH = 24;
const SANDBOX_PREVIEW_SESSION_KEY_PREFIX = 'sandbox:preview';

const SandboxPreviewSandboxIdSchema = z.string().regex(/^(?:app|skilledit)-[a-f0-9]{16}$/);
const SandboxPreviewSessionIdSchema = z
  .string()
  .length(SANDBOX_PREVIEW_SESSION_ID_LENGTH)
  .regex(/^[a-z][a-zA-Z0-9]+$/);

export const SandboxPreviewSessionSchema = z.object({
  sandboxId: SandboxPreviewSandboxIdSchema,
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string().min(1),
  userId: z.string(),
  chatId: z.string().min(1)
});
export type SandboxPreviewSession = z.infer<typeof SandboxPreviewSessionSchema>;

const getSandboxPreviewSessionPrefix = (sandboxId: string) =>
  `${SANDBOX_PREVIEW_SESSION_KEY_PREFIX}:${sandboxId}`;
const getPreviewSessionKey = ({ sandboxId, sessionId }: { sandboxId: string; sessionId: string }) =>
  `${getSandboxPreviewSessionPrefix(sandboxId)}:${sessionId}`;

export class SandboxPreviewSessionLimitError extends Error {
  constructor() {
    super(
      `Active sandbox preview session limit reached (${SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX})`
    );
    this.name = 'SandboxPreviewSessionLimitError';
  }
}

/**
 * 创建短期 Preview session。
 *
 * 创建前按 sandboxId 前缀统计仍存在的 Redis key；达到上限时拒绝创建，不删除旧 session。
 * 每个 session key 独立设置 TTL，过期后由 Redis 自动清理。
 */
export async function createSandboxPreviewSession(context: SandboxPreviewSession): Promise<string> {
  const parsedContext = SandboxPreviewSessionSchema.parse(context);
  const redis = getGlobalRedisConnection();
  const sessionKeys = await getAllKeysByPrefix(
    getSandboxPreviewSessionPrefix(parsedContext.sandboxId)
  );
  if (sessionKeys.length >= SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX) {
    throw new SandboxPreviewSessionLimitError();
  }

  const sessionId = getNanoid(SANDBOX_PREVIEW_SESSION_ID_LENGTH);
  await redis.set(
    getPreviewSessionKey({ sandboxId: parsedContext.sandboxId, sessionId }),
    JSON.stringify(parsedContext),
    'EX',
    SANDBOX_PREVIEW_SESSION_TTL_SECONDS
  );

  return sessionId;
}

/**
 * 解析 Preview session。
 *
 * session 有效期完全由 Redis key TTL 管理；TTL 到期后 GET 返回空并按无效 session 拒绝。
 */
export async function resolveSandboxPreviewSession(
  credential: string
): Promise<SandboxPreviewSession> {
  const [rawSandboxId, rawSessionId, ...extraSegments] = credential.split(':');
  if (extraSegments.length > 0) {
    throw new Error('Invalid sandbox preview session');
  }
  const sandboxId = SandboxPreviewSandboxIdSchema.parse(rawSandboxId);
  const sessionId = SandboxPreviewSessionIdSchema.parse(rawSessionId);
  const redis = getGlobalRedisConnection();
  const serializedContext = await redis.get(getPreviewSessionKey({ sandboxId, sessionId }));

  if (!serializedContext) {
    throw new Error('Invalid or expired sandbox preview session');
  }
  const context = SandboxPreviewSessionSchema.parse(JSON.parse(serializedContext));
  if (context.sandboxId !== sandboxId) {
    throw new Error('Invalid sandbox preview session');
  }
  return context;
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
  const rawUrl = serviceEnv.AGENT_SANDBOX_PREVIEW_PROXY_URL;
  if (!rawUrl) {
    throw new Error('AGENT_SANDBOX_PREVIEW_PROXY_URL environment variable is missing');
  }

  const url = new URL(rawUrl);
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
};

/** 使用已创建的 Preview session 构建一个 workspace 文件 URL。 */
export function buildSandboxPreviewFileUrl({
  sandboxId,
  sessionId,
  filePath
}: {
  sandboxId: string;
  sessionId: string;
  filePath: string;
}): string {
  const { relativePath } = resolveSandboxPreviewPath(filePath);
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${getSandboxPreviewProxyBaseUrl()}/preview/${encodeURIComponent(sandboxId)}/${encodeURIComponent(sessionId)}/${encodedPath}`;
}

/** 为一个 workspace 文件创建 session 并返回完整 direct preview URL。 */
export async function createSandboxPreviewFileUrl({
  context,
  filePath
}: {
  context: SandboxPreviewSession;
  filePath: string;
}): Promise<string> {
  return buildSandboxPreviewFileUrl({
    sandboxId: context.sandboxId,
    sessionId: await createSandboxPreviewSession(context),
    filePath
  });
}
