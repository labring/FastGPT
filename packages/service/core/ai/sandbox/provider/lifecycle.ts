import { getLogger, LogCategories } from '../../../../common/logger';
import { type ISandbox, type OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import { buildSandboxAdapter } from './adapter';
import type { SandboxProviderConfig } from './config';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type SandboxInfo = NonNullable<Awaited<ReturnType<ISandbox['getInfo']>>>;

const SANDBOX_COMMAND_READY_TIMEOUT_MS = 120_000;
const SANDBOX_COMMAND_READY_INTERVAL_MS = 1_000;
const SANDBOX_COMMAND_READY_PROBE_TIMEOUT_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isSandboxCommandChannelNotReadyError(error: unknown): boolean {
  const pending: unknown[] = [error];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!(current instanceof Error)) continue;

    const errorLike = current as Error & {
      commandError?: unknown;
      cause?: unknown;
    };
    const message = errorLike.message.toLowerCase();

    if (
      message.includes('pod is not running') ||
      message.includes('exec command timeout') ||
      message.includes('command execution failed: exec command timeout')
    ) {
      return true;
    }

    pending.push(errorLike.commandError, errorLike.cause);
  }

  return false;
}

/**
 * 等待 sandbox 的命令通道真正可执行。
 *
 * Sealos devbox 的 provider info 可能已经是 Running，但 exec API 仍短暂返回
 * "pod is not running: Pending" 或 exec 超时。这里用无副作用的 `true` 命令补齐
 * 命令通道 ready 判定，避免后续 writeFiles/execute 抢跑。
 */
async function waitUntilSandboxCommandReady(
  sandbox: ISandbox,
  timeoutMs = SANDBOX_COMMAND_READY_TIMEOUT_MS,
  intervalMs = SANDBOX_COMMAND_READY_INTERVAL_MS
): Promise<void> {
  const startTime = Date.now();
  let lastError: unknown;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await sandbox.execute('true', {
        timeoutMs: SANDBOX_COMMAND_READY_PROBE_TIMEOUT_MS
      });
      if (result.exitCode === 0) return;

      const error = new Error(result.stderr || result.stdout || 'Sandbox command probe failed');
      lastError = error;
      if (!isSandboxCommandChannelNotReadyError(error)) {
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (!isSandboxCommandChannelNotReadyError(error)) {
        throw error;
      }
    }

    await sleep(intervalMs);
  }

  logger.warn('Sandbox command channel retry exhausted', {
    provider: sandbox.provider,
    sandboxId: sandbox.id,
    error: lastError
  });
  throw lastError;
}

/**
 * 连接指定 provider 下已知 sandboxId 的远端实例，并等待其可执行命令。
 *
 * 这个入口不会写数据库，只负责 provider 层生命周期；业务归属和实例状态由 service/instance 层维护。
 */
export async function connectToSandbox(
  providerConfig: SandboxProviderConfig,
  sandboxId: string
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, {
    sandboxId
  });

  await ensureConnectedSandboxRunning(sandbox);

  return sandbox;
}

/**
 * 确保沙盒不仅处于 provider 的 Running 状态，也已经可以执行命令。
 *
 * 生命周期恢复交给 adapter.ensureRunning 处理，避免外层直接 getInfo 绕过
 * provider adapter 内部对临时网关错误（如 devbox 503/no healthy upstream）的重试。
 * Running 状态仍额外等待命令通道 ready，避免底层 Pod/exec 通道未就绪时抢跑。
 */
export async function ensureConnectedSandboxRunning(sandbox: ISandbox): Promise<void> {
  await sandbox.ensureRunning();
  await sandbox.waitUntilReady();
  if (sandbox.provider === 'sealosdevbox') {
    await waitUntilSandboxCommandReady(sandbox);
  }
}

/**
 * 读取 ready 沙盒的 provider metadata；如果 provider info 接口短暂异常，则返回最小可用信息。
 *
 * 沙盒是否可用由 ensureRunning/waitUntilReady 保证，getInfo 只用于补写镜像、
 * 创建时间等展示型 metadata。不能让 devbox 网关的临时 503 再次中断已就绪的主流程。
 */
export async function getReadySandboxInfo(
  sandbox: ISandbox,
  fallback: {
    sandboxId: string;
    image: SandboxInfo['image'];
    entrypoint?: SandboxInfo['entrypoint'];
    status?: SandboxInfo['status'];
    createdAt?: SandboxInfo['createdAt'];
  }
): Promise<SandboxInfo> {
  try {
    const sandboxInfo = await sandbox.getInfo();
    if (sandboxInfo) return sandboxInfo;
  } catch (error) {
    logger.warn('Failed to read ready sandbox info, using fallback metadata', {
      provider: sandbox.provider,
      sandboxId: fallback.sandboxId,
      error
    });
  }

  return {
    id: sandbox.id ?? fallback.sandboxId,
    image: fallback.image,
    entrypoint: fallback.entrypoint ?? [],
    status: fallback.status ?? sandbox.status,
    createdAt: fallback.createdAt ?? new Date()
  };
}

/**
 * 连接实例记录对应的 ready sandbox，并返回展示用 provider metadata。
 *
 * 如果 metadata 读取失败以 fallback 兜底；如果连接后的补充流程失败，会关闭 OpenSandbox 连接。
 */
export async function connectReadySandboxByInstance(
  providerConfig: SandboxProviderConfig,
  instance: {
    sandboxId: string;
  }
): Promise<{
  sandbox: ISandbox;
  sandboxInfo: SandboxInfo;
}> {
  const sandbox = await connectToSandbox(providerConfig, instance.sandboxId);

  try {
    const sandboxInfo = await getReadySandboxInfo(sandbox, {
      sandboxId: instance.sandboxId,
      image: { repository: '' },
      status: sandbox.status
    });
    return {
      sandbox,
      sandboxInfo
    };
  } catch (error) {
    await disconnectSandbox(sandbox).catch(() => undefined);
    throw error;
  }
}

/**
 * 断开需要显式关闭连接的 provider adapter。
 *
 * 目前只有 OpenSandbox adapter 需要 close；其它 provider 没有长连接资源。
 */
export async function disconnectSandbox(sandbox: ISandbox): Promise<void> {
  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).close();
  }
}
