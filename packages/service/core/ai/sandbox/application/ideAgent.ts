import { Readable } from 'node:stream';
import { Agent } from 'undici';
import z from 'zod';
import { isRedisLeaseError } from '@fastgpt/dal/redis/caches';
import {
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  SANDBOX_IDE_AGENT_HTTP_PORT
} from '@fastgpt/global/core/ai/sandbox/constants';
import { delayWithSignal, throwIfAborted } from '@fastgpt/global/common/system/utils';
import { SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS } from '../constants';
import {
  hasMatchingErrorInCauseChain,
  isConfirmedSandboxUnavailableError,
  isRecoverableSandboxError
} from '../infrastructure/opensandbox/errors';
import type { OpenSandboxClient } from '../infrastructure/opensandbox/opensandbox';
import { getSandboxStaticRuntimePaths } from '../infrastructure/opensandbox/runtimeProfile';

/** `fastgpt-ide-agent` 1318 WebSocket 与 1319 HTTP 监听共同校验的认证请求头。 */
const IDE_AGENT_TOKEN_HEADER = 'x-fastgpt-agent-token';

/** 容器临时层 `/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password` 路径，由 `fastgpt-ide-agent` 启动时生成并设权 `0600`。 */
const IDE_AGENT_PASSWORD_FILE_PATH = `${OPEN_SANDBOX_CONTAINER_RUNTIME_DIR}/.fastgpt-ide-agent-password`;

const IDE_AGENT_PASSWORD_CACHE_MAX_SIZE = 512;
const IDE_AGENT_PASSWORD_CACHE_TTL_MS = 30_000;
const IDE_AGENT_PASSWORD_READ_MAX_ATTEMPTS = 5;
const IDE_AGENT_PASSWORD_READ_RETRY_DELAY_MS = 200;

type IdeAgentEndpoint = Awaited<ReturnType<OpenSandboxClient['getEndpoint']>>;
type IdeAgentPasswordClient = Pick<OpenSandboxClient, 'id' | 'readFiles'>;
export type IdeAgentEndpointClient = IdeAgentPasswordClient &
  Pick<OpenSandboxClient, 'getEndpoint'>;

// 以 OpenSandbox 远端容器实例 id 为键缓存密码并设短 TTL；即使同容器内进程重启轮换了密码也能及时失效。
const passwordCache = new Map<string, { password: string; expiresAt: number }>();

/**
 * 清除指定容器实例缓存的 `fastgpt-ide-agent` 认证密码；未传 `sandboxId` 时清空全部缓存。
 */
export function invalidateIdeAgentPasswordCache(sandboxId?: string): void {
  if (sandboxId) {
    passwordCache.delete(sandboxId);
    return;
  }
  passwordCache.clear();
}

/**
 * 从运行中容器临时层读取 `/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password`；容器刚启动时文件可能尚未落盘，做有限次退避重试。
 */
async function readIdeAgentPassword(params: {
  sandbox: IdeAgentPasswordClient;
  forceRefresh?: boolean;
  maxAttempts?: number;
  signal?: AbortSignal;
}): Promise<string> {
  throwIfAborted(params.signal);

  const cacheKey = params.sandbox.id;
  if (cacheKey) {
    if (params.forceRefresh) {
      passwordCache.delete(cacheKey);
    } else {
      const cached = passwordCache.get(cacheKey);
      if (cached) {
        passwordCache.delete(cacheKey);
        if (cached.expiresAt > Date.now()) {
          passwordCache.set(cacheKey, cached);
          return cached.password;
        }
      }
    }
  }

  const maxAttempts = params.maxAttempts ?? IDE_AGENT_PASSWORD_READ_MAX_ATTEMPTS;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await delayWithSignal(IDE_AGENT_PASSWORD_READ_RETRY_DELAY_MS * (attempt - 1), params.signal);
    }
    throwIfAborted(params.signal);

    const [result] = await params.sandbox.readFiles([IDE_AGENT_PASSWORD_FILE_PATH]);
    if (result && !result.error) {
      const password = Buffer.from(result.content).toString('utf8').trim();
      if (password) {
        if (cacheKey) {
          if (
            passwordCache.size >= IDE_AGENT_PASSWORD_CACHE_MAX_SIZE &&
            !passwordCache.has(cacheKey)
          ) {
            const oldestKey = passwordCache.keys().next().value;
            if (oldestKey) passwordCache.delete(oldestKey);
          }
          passwordCache.delete(cacheKey);
          passwordCache.set(cacheKey, {
            password,
            expiresAt: Date.now() + IDE_AGENT_PASSWORD_CACHE_TTL_MS
          });
        }
        return password;
      }
      lastError = new Error('IDE Agent password file is empty');
    } else {
      lastError = result?.error ?? new Error('Failed to read IDE Agent password file');
      if (result?.error && isRecoverableSandboxError(result.error)) {
        throw new Error(
          `Failed to read IDE Agent password at ${IDE_AGENT_PASSWORD_FILE_PATH}: ${lastError.message}`,
          { cause: result.error }
        );
      }
    }
  }

  throw new Error(
    `Failed to read IDE Agent password at ${IDE_AGENT_PASSWORD_FILE_PATH}: ${lastError?.message ?? 'unknown error'}`,
    { cause: lastError ?? undefined }
  );
}

/**
 * 获取已附加 `x-fastgpt-agent-token` 请求头的 `fastgpt-ide-agent` 端点信息，避免任何调用方遗漏实例认证。
 */
export async function getAuthenticatedIdeAgentEndpoint(params: {
  sandbox: IdeAgentEndpointClient;
  port: number;
  forceRefreshPassword?: boolean;
  passwordMaxAttempts?: number;
  signal?: AbortSignal;
}): Promise<IdeAgentEndpoint> {
  const [endpoint, password] = await Promise.all([
    params.sandbox.getEndpoint(params.port),
    readIdeAgentPassword({
      sandbox: params.sandbox,
      forceRefresh: params.forceRefreshPassword,
      maxAttempts: params.passwordMaxAttempts,
      signal: params.signal
    })
  ]);

  return {
    ...endpoint,
    headers: {
      ...endpoint.headers,
      [IDE_AGENT_TOKEN_HEADER]: password
    }
  };
}

const IDE_AGENT_HTTP_MAX_ATTEMPTS = 5;
const IDE_AGENT_HTTP_RETRY_DELAY_MS = 250;
const IDE_AGENT_DISK_USAGE_TIMEOUT_MS = 3_000;
const IDE_AGENT_ARCHIVE_TARGET_DIR_HEADER = 'x-fastgpt-archive-target-dir-b64';

type IdeAgentHttpRoute =
  | '/archive/pack'
  | '/archive/extract'
  | '/disk-usage'
  | '/disk-usage?refresh=1';

const IdeAgentDiskUsageResponseSchema = z.object({
  usedBytes: z.number().nonnegative(),
  limitBytes: z.number().nonnegative().nullable().optional()
});
type SandboxDiskUsageSnapshot = z.infer<typeof IdeAgentDiskUsageResponseSchema>;

type RequestInitWithDuplex = RequestInit & { duplex?: 'half'; dispatcher?: Agent };

// Node fetch 默认 headersTimeout 为 300s；大模型工作区与 Skill 包流式打包/解压需要覆盖整个归档命令超时窗口。
const ideAgentHttpDispatcher = new Agent({
  headersTimeout: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS + 30_000,
  bodyTimeout: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS
});

/** 判断 HTTP 状态码是否属于网关或容器刚拉起时的瞬时状态，用于 IDE Agent 连接建立阶段的退避重试。 */
const isTransientIdeAgentEndpointStatus = (status: number): boolean =>
  status === 502 || status === 503 || status === 504;

/** 拼接 `fastgpt-ide-agent` 1319 端口路径，保留 OpenSandbox proxy 模式自带的路径前缀。 */
const resolveIdeAgentHttpUrl = (
  endpoint: Pick<IdeAgentEndpoint, 'url' | 'protocol'>,
  routePath: IdeAgentHttpRoute
): string => {
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(endpoint.url)
    ? endpoint.url
    : `${endpoint.protocol}://${endpoint.url}`;
  return `${withScheme.replace(/\/+$/, '')}${routePath}`;
};

/**
 * 将沙盒内目标目录（绝对路径或相对 `$HOME` 根的路径）规整为 `$HOME`（`/home/sandbox`）下的相对路径；
 * 未指定或就是 `$HOME` 根目录时返回 `undefined`，不在 `$HOME` 内时抛错。
 */
function resolveAgentTargetDir(targetDirectory: string | undefined): string | undefined {
  if (!targetDirectory) return undefined;
  const normalizedTarget = targetDirectory.replace(/\/+$/, '');
  const normalizedRoot = getSandboxStaticRuntimePaths().homeDirectory.replace(/\/+$/, '');

  if (!normalizedTarget || normalizedTarget === '.' || normalizedTarget === normalizedRoot) {
    return undefined;
  }

  const rootPrefix = `${normalizedRoot}/`;
  if (normalizedTarget.startsWith(rootPrefix)) {
    return normalizedTarget.slice(rootPrefix.length).replace(/^\/+/, '') || undefined;
  }

  if (!normalizedTarget.startsWith('/')) {
    return normalizedTarget.replace(/^(?:\.\/)+/, '') || undefined;
  }

  throw new Error(
    `Target directory must reside under sandbox home root (${normalizedRoot}): ${targetDirectory}`
  );
}

/**
 * 请求 `fastgpt-ide-agent` 1319 端口 HTTP 路由，并对容器刚拉起时的瞬时失败有限次退避重试。
 *
 * - 仅重试建连异常与 502/503/504 网关状态；401 时强制刷新实例口令后重放一次；
 * - 每次尝试都会重新 `openBody`（请求体流不可重放）；请求体自身报错（如 S3 读取、ZIP 转码、体积超限）
 *   保留原始错误立即抛出，不当作瞬时错误重试；
 * - 租约丢失、容器已不存在/非运行态或外部中断不会重试。
 */
async function fetchIdeAgentRoute(params: {
  sandbox: IdeAgentEndpointClient;
  routePath: IdeAgentHttpRoute;
  signal: AbortSignal;
  method?: 'GET' | 'POST';
  maxAttempts?: number;
  assertValid?: () => void;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  openBody?: () => Promise<Readable>;
}): Promise<Response> {
  const { signal, routePath } = params;
  const method = params.method ?? 'POST';
  const maxAttempts = params.maxAttempts ?? IDE_AGENT_HTTP_MAX_ATTEMPTS;
  let lastError: unknown;

  // 区分请求体流自身的异常，避免被下方的 IDE Agent 就绪重试循环吞掉或掩盖为 fetch failed。
  class OpenBodyError {
    constructor(readonly cause: unknown) {}
  }

  const isNonRetryableIdeAgentError = (value: unknown): boolean =>
    isConfirmedSandboxUnavailableError(value) ||
    hasMatchingErrorInCauseChain({
      error: value,
      predicate: isRedisLeaseError
    });

  const requestOnce = async (forceRefreshPassword: boolean): Promise<Response> => {
    const endpoint = await getAuthenticatedIdeAgentEndpoint({
      sandbox: params.sandbox,
      port: SANDBOX_IDE_AGENT_HTTP_PORT,
      forceRefreshPassword,
      passwordMaxAttempts: maxAttempts > 1 ? 1 : undefined,
      signal
    });
    let body: Readable | undefined;
    try {
      body = await params.openBody?.();
    } catch (error) {
      throw new OpenBodyError(error);
    }

    let bodyStreamError: unknown;
    body?.on('error', (error) => {
      bodyStreamError = error;
    });

    try {
      params.assertValid?.();
      throwIfAborted(signal);

      const isGet = method === 'GET';
      const init: RequestInitWithDuplex = {
        method,
        headers: {
          ...endpoint.headers,
          ...params.headers,
          ...(isGet ? {} : { 'Content-Type': body ? 'application/zstd' : 'application/json' })
        },
        // Node fetch 发送流式 POST 请求体时必须声明 half duplex；同时注入加长超时 dispatcher。
        ...(isGet
          ? {}
          : {
              ...(body
                ? { body: Readable.toWeb(body) as RequestInit['body'], duplex: 'half' }
                : { body: JSON.stringify(params.jsonBody ?? {}) }),
              dispatcher: ideAgentHttpDispatcher
            }),
        signal
      };
      return await fetch(resolveIdeAgentHttpUrl(endpoint, routePath), init);
    } catch (fetchError) {
      if (!signal.aborted && bodyStreamError !== undefined) {
        throw new OpenBodyError(bodyStreamError);
      }
      throw fetchError;
    } finally {
      if (body && !body.destroyed) body.destroy();
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await delayWithSignal(IDE_AGENT_HTTP_RETRY_DELAY_MS * (attempt - 1), signal);
    }
    params.assertValid?.();
    throwIfAborted(signal);

    let response: Response;
    try {
      response = await requestOnce(false);
      if (response.status === 401) {
        await response.body?.cancel().catch(() => undefined);
        invalidateIdeAgentPasswordCache(params.sandbox.id);
        response = await requestOnce(true);
      }
    } catch (error) {
      if (error instanceof OpenBodyError) throw error.cause;
      if (signal.aborted || isNonRetryableIdeAgentError(error) || attempt === maxAttempts) {
        throw error;
      }
      // 刚拉起容器时 1319 端口/网关可能仍在就绪，对响应头建立前的瞬时建连失败有限次重试。
      lastError = error;
      continue;
    }

    if (!isTransientIdeAgentEndpointStatus(response.status) || attempt === maxAttempts) {
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).trim();
        throw new Error(detail || `IDE Agent ${routePath} failed (${response.status})`);
      }
      return response;
    }
    await response.body?.cancel().catch(() => undefined);
    lastError = new Error(`IDE Agent ${routePath} returned ${response.status}`);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to reach IDE Agent ${routePath}`);
}

/** 叠加请求超时，避免卡死的容器或网关长期占用连接或租约。 */
const withTimeout = (signal: AbortSignal | undefined, timeoutMs: number) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

/**
 * 通过 `POST /archive/pack` 把沙盒目录（缺省为 `$HOME`，可指定子目录如工作区）流式打包为 `.tar.zst`。
 *
 * `excludePatterns` 为 `.gitignore` 语法，相对被打包目录求值；目录不存在或排除后为空时返回 `null`（agent `204`）。
 * 返回流的生命周期由调用方负责（消费完或出错时销毁）。
 */
export async function packSandboxDirectory(params: {
  sandbox: IdeAgentEndpointClient;
  /** 沙盒内绝对路径或相对 `$HOME` 的路径，缺省为 `$HOME` 根目录。 */
  targetDirectory?: string;
  excludePatterns?: string[];
  skipSymlinks?: boolean;
  signal?: AbortSignal;
  assertValid?: () => void;
}): Promise<Readable | null> {
  const targetDir = resolveAgentTargetDir(params.targetDirectory);
  const response = await fetchIdeAgentRoute({
    sandbox: params.sandbox,
    routePath: '/archive/pack',
    signal: withTimeout(params.signal, SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS),
    assertValid: params.assertValid,
    jsonBody: {
      targetDir,
      excludePatterns: params.excludePatterns ?? [],
      ...(params.skipSymlinks ? { skipSymlinks: true } : {})
    }
  });
  if (response.status === 204 || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  return Readable.fromWeb(response.body as import('node:stream/web').ReadableStream<Uint8Array>);
}

/**
 * 通过 `POST /archive/extract` 把 `.tar.zst` 流解压到沙盒目录（缺省为 `$HOME` 根目录），覆盖同名条目、保留无关条目。
 *
 * `openBody` 在每次重试时重新打开请求体（S3 下载流或 ZIP 实时转码流）。
 */
export async function extractToSandboxDirectory(params: {
  sandbox: IdeAgentEndpointClient;
  /** 沙盒内绝对路径或相对 `$HOME` 的路径，缺省为 `$HOME` 根目录。 */
  targetDirectory?: string;
  openBody: () => Promise<Readable>;
  signal?: AbortSignal;
  assertValid?: () => void;
}): Promise<void> {
  const targetDir = resolveAgentTargetDir(params.targetDirectory);
  const response = await fetchIdeAgentRoute({
    sandbox: params.sandbox,
    routePath: '/archive/extract',
    signal: withTimeout(params.signal, SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS),
    assertValid: params.assertValid,
    headers: targetDir
      ? { [IDE_AGENT_ARCHIVE_TARGET_DIR_HEADER]: Buffer.from(targetDir, 'utf8').toString('base64') }
      : undefined,
    openBody: params.openBody
  });
  await response.body?.cancel().catch(() => undefined);
}

/**
 * 通过 `GET /disk-usage` 查询运行中容器 `$HOME` 持久卷的占盘字节数。
 *
 * 复用统一 HTTP 路由鉴权（含 401 刷新一次口令）并施加短超时，不重试瞬时失败以保证探针快速返回。
 */
export async function getSandboxDiskUsage(params: {
  sandbox: IdeAgentEndpointClient;
  refresh?: boolean;
  signal?: AbortSignal;
}): Promise<SandboxDiskUsageSnapshot> {
  const response = await fetchIdeAgentRoute({
    sandbox: params.sandbox,
    routePath: params.refresh ? '/disk-usage?refresh=1' : '/disk-usage',
    method: 'GET',
    maxAttempts: 1,
    signal: withTimeout(params.signal, IDE_AGENT_DISK_USAGE_TIMEOUT_MS)
  });
  return IdeAgentDiskUsageResponseSchema.parse(await response.json());
}
