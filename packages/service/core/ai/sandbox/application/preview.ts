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
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { serviceEnv } from '../../../../env';
import { resolveSandboxWorkspacePath } from './file';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { trimSandboxPathRight } from '../utils';

export const SANDBOX_PREVIEW_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX = 500;
export const SANDBOX_PREVIEW_SESSION_ID_LENGTH = 24;
const SANDBOX_PREVIEW_SESSION_KEY_PREFIX = 'sandbox:preview';
const CREATE_SANDBOX_PREVIEW_SESSION_SCRIPT = `
redis.call("zremrangebyscore", KEYS[1], "-inf", ARGV[1])
if redis.call("zcard", KEYS[1]) >= tonumber(ARGV[2]) then
  return 0
end
redis.call("set", KEYS[2], ARGV[3], "EX", ARGV[4])
redis.call("zadd", KEYS[1], tonumber(ARGV[1]) + tonumber(ARGV[4]) * 1000, ARGV[5])
redis.call("expire", KEYS[1], ARGV[4])
return 1
`;

const SandboxPreviewSandboxIdSchema = z
  .string()
  .regex(/^(?:app|workflowbuilder|skilledit)-[a-f0-9]{16}$/);
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
const getSandboxPreviewSessionIndexKey = (sandboxId: string) =>
  asRedisLogicalKey(`${getSandboxPreviewSessionPrefix(sandboxId)}:active`);
const getPreviewSessionKey = ({ sandboxId, sessionId }: { sandboxId: string; sessionId: string }) =>
  asRedisLogicalKey(`${getSandboxPreviewSessionPrefix(sandboxId)}:${sessionId}`);

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
 * Lua 脚本在一次原子操作内清理过期索引、检查限额并写入 session，避免扫描 Redis 全库，
 * 也防止并发签发突破单 Sandbox 上限。session key 和活动索引均按 TTL 自动清理。
 */
export async function createSandboxPreviewSession(context: SandboxPreviewSession): Promise<string> {
  const parsedContext = SandboxPreviewSessionSchema.parse(context);
  const sessionId = getNanoid(SANDBOX_PREVIEW_SESSION_ID_LENGTH);
  const created = await redisCacheAdapter.evalScript({
    script: CREATE_SANDBOX_PREVIEW_SESSION_SCRIPT,
    keys: [
      getSandboxPreviewSessionIndexKey(parsedContext.sandboxId),
      getPreviewSessionKey({ sandboxId: parsedContext.sandboxId, sessionId })
    ],
    args: [
      Date.now(),
      SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX,
      JSON.stringify(parsedContext),
      SANDBOX_PREVIEW_SESSION_TTL_SECONDS,
      sessionId
    ]
  });
  if (Number(created) !== 1) {
    throw new SandboxPreviewSessionLimitError();
  }

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
  const serializedContext = await redisCacheAdapter.get(
    getPreviewSessionKey({ sandboxId, sessionId })
  );

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
    allowAbsolutePath: true,
    allowOutsideWorkspace: false
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
