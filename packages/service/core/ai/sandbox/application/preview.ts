/**
 * 沙盒业务层：创建并解析 workspace 只读预览 session。
 *
 * Preview token 为不含业务前缀的 24 位随机 session ID，运行态归属元数据仅保存在 Redis，
 * 静态文件与媒体 Range 流由边缘 `opensandbox-proxy` 直接向 `execd` `/files/download` 转发。
 */
import z from 'zod';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatIdSchema } from '@fastgpt/global/core/chat/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  SANDBOX_INTERNAL_RUNTIME_DIR_NAME,
  SANDBOX_PREVIEW_SESSION_ID_LENGTH,
  SANDBOX_PREVIEW_SESSION_ID_REGEX
} from '@fastgpt/global/core/ai/sandbox/constants';
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import {
  SANDBOX_PREVIEW_SESSION_TTL_SECONDS,
  SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX
} from '../constants';
import { getAgentSandboxPreviewProxyBaseUrl } from '../config';
import type { SandboxClient } from './runtime/client';
import { getSandboxRuntimeProfile } from '../infrastructure/opensandbox/runtimeProfile';
import { resolveSandboxRuntimePath, trimSandboxPathRight } from '../utils';

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

export const SandboxPreviewSessionIdSchema = z
  .string()
  .length(SANDBOX_PREVIEW_SESSION_ID_LENGTH)
  .regex(SANDBOX_PREVIEW_SESSION_ID_REGEX);

const SandboxPreviewSessionSchema = z.object({
  sandboxId: z.string().min(1),
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string().min(1),
  userId: z.string(),
  chatId: ChatIdSchema.min(1)
});
export type SandboxPreviewSession = z.infer<typeof SandboxPreviewSessionSchema>;

const getSandboxPreviewSessionIndexKey = (sandboxId: string) =>
  asRedisLogicalKey(`${SANDBOX_PREVIEW_SESSION_KEY_PREFIX}:${sandboxId}:active`);
const getPreviewSessionKey = (sessionId: string) =>
  asRedisLogicalKey(`${SANDBOX_PREVIEW_SESSION_KEY_PREFIX}:session:${sessionId}`);

export class SandboxPreviewSessionLimitError extends Error {
  constructor() {
    super(
      `Active sandbox preview session limit reached (${SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX})`
    );
    this.name = 'SandboxPreviewSessionLimitError';
  }
}

/** 预览路径越出 workspace 目录边界；供路由返回 403。 */
export class SandboxPreviewPathAccessError extends Error {
  constructor() {
    super('Sandbox preview path is outside the allowed directory');
    this.name = 'SandboxPreviewPathAccessError';
  }
}

/** 预览目标文件不存在或为目录；签发失败时不消耗 preview token。 */
export class SandboxPreviewFileNotFoundError extends Error {
  constructor() {
    super('Sandbox preview file not found');
    this.name = 'SandboxPreviewFileNotFoundError';
  }
}

/**
 * 创建短期 Preview session。
 *
 * 通过 Redis Lua 脚本原子执行：清理当前 sandbox 下已过期的活跃 session 索引、
 * 校验单沙盒并发活跃预览上限（`SANDBOX_PREVIEW_SESSION_MAX_PER_SANDBOX`）、
 * 写入带 TTL 的 session 上下文并登记到 ZSET 索引，避免并发签发击穿配额。
 */
export async function createSandboxPreviewSession(context: SandboxPreviewSession): Promise<string> {
  const parsedContext = SandboxPreviewSessionSchema.parse(context);
  const sessionId = getNanoid(SANDBOX_PREVIEW_SESSION_ID_LENGTH);
  const created = await redisCacheAdapter.evalScript({
    script: CREATE_SANDBOX_PREVIEW_SESSION_SCRIPT,
    keys: [
      getSandboxPreviewSessionIndexKey(parsedContext.sandboxId),
      getPreviewSessionKey(sessionId)
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
 * 解析随机 24 位 Preview session 凭证（`sandbox:preview:session:<sessionId>`）。
 */
export async function resolveSandboxPreviewSession(
  credential: string
): Promise<SandboxPreviewSession> {
  const parsedId = SandboxPreviewSessionIdSchema.safeParse(credential);
  if (!parsedId.success) {
    throw new UserError(SandboxErrEnum.agentSandboxPermissionDenied);
  }
  const serializedContext = await redisCacheAdapter.get(getPreviewSessionKey(parsedId.data));
  if (!serializedContext) {
    throw new UserError(SandboxErrEnum.agentSandboxPermissionDenied);
  }
  try {
    return SandboxPreviewSessionSchema.parse(JSON.parse(serializedContext));
  } catch {
    throw new UserError(SandboxErrEnum.agentSandboxPermissionDenied);
  }
}

/**
 * 将工具/API 输入路径词法规整为 provider 绝对路径和 `/workspace` 相对路径。
 */
function resolveSandboxPreviewPath(filePath: string): {
  providerPath: string;
  relativePath: string;
} {
  if (!filePath || filePath.includes('\\') || /[\u0000-\u001F\u007F]/.test(filePath)) {
    throw new Error('Invalid sandbox preview path');
  }

  const workDirectory = trimSandboxPathRight(getSandboxRuntimeProfile().workDirectory);
  const providerPath = resolveSandboxRuntimePath(
    filePath,
    { sessionWorkDirectory: workDirectory || '/' },
    { allowAbsolutePath: true }
  );
  if (providerPath !== workDirectory && !providerPath.startsWith(`${workDirectory}/`)) {
    throw new Error('Sandbox path is outside workspace');
  }
  const relativePath = providerPath.slice(workDirectory.length).replace(/^\/+/, '');
  const segments = relativePath.split('/');
  if (
    !relativePath ||
    segments[0] === SANDBOX_INTERNAL_RUNTIME_DIR_NAME ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid sandbox preview path');
  }

  return { providerPath, relativePath };
}

/**
 * IDE 与 Agent 工具共用签发前校验：词法检查路径落在 `/workspace` 内并单次批量查询 `getFileInfo` 确认文件存在且非目录。
 */
export async function resolveSandboxPreviewFiles({
  sandbox,
  paths
}: {
  sandbox: SandboxClient;
  paths: string[];
}): Promise<Array<{ providerPath: string; relativePath: string }>> {
  const files = paths.map((inputPath) => {
    try {
      const filePath = sandbox.resolveRuntimePath(inputPath, { allowAbsolutePath: true });
      return resolveSandboxPreviewPath(filePath);
    } catch {
      throw new SandboxPreviewPathAccessError();
    }
  });

  if (files.length === 0) {
    return [];
  }

  const infoMap = await sandbox.opensandbox.getFileInfo(files.map((item) => item.providerPath));
  for (const { providerPath } of files) {
    const info = infoMap.get(providerPath);
    if (!info || info.type !== 'file') {
      throw new SandboxPreviewFileNotFoundError();
    }
  }

  return files;
}

/** 使用已创建的 Preview session 与已校验的 `/workspace` 相对路径构建面向 `opensandbox-proxy` 的文件预览 URL。 */
export function buildSandboxPreviewFileUrl({
  sessionId,
  relativePath
}: {
  sessionId: string;
  relativePath: string;
}): string {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${getAgentSandboxPreviewProxyBaseUrl()}/preview/${encodeURIComponent(sessionId)}/${encodedPath}`;
}

/** 为一个已校验的 `/workspace` 相对路径文件创建 session 并返回完整预览 URL。 */
export async function createSandboxPreviewFileUrl({
  context,
  relativePath
}: {
  context: SandboxPreviewSession;
  relativePath: string;
}): Promise<string> {
  return buildSandboxPreviewFileUrl({
    sessionId: await createSandboxPreviewSession(context),
    relativePath
  });
}
