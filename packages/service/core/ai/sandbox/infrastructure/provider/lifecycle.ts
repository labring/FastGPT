/**
 * 沙盒原子层：封装 provider 连接、断开和运行态探测。
 *
 * 这里只操作远端 sandbox adapter，不维护 FastGPT 本地实例状态。
 */
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  type ISandbox,
  type SandboxEnsureRunningOptions,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import { buildSandboxAdapter } from './adapter';
import type { SandboxProviderConfig } from './config';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export type SandboxInfo = NonNullable<Awaited<ReturnType<ISandbox['getInfo']>>>;

/**
 * 连接指定 provider 下已知 sandboxId 的远端实例。
 *
 * 这个入口不会写数据库，只负责 provider 层生命周期；业务归属和实例状态由 service/instance 层维护。
 */
export async function connectToSandbox(
  providerConfig: SandboxProviderConfig,
  sandboxId: string,
  createConfig?: SandboxCreateSpec
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, {
    sandboxId,
    createConfig
  });

  await ensureConnectedSandboxRunning(sandbox);

  return sandbox;
}

/**
 * 确保 sandbox 的 provider 生命周期已进入可用路径。
 *
 * 各 provider 的 ready 细节由 SDK adapter 自己实现；`allowCreate: false` 用于无 lifecycle
 * lease 的连接快路径，避免并发删除后重新创建资源。
 */
export async function ensureConnectedSandboxRunning(
  sandbox: ISandbox,
  options: SandboxEnsureRunningOptions = {}
): Promise<void> {
  await sandbox.ensureRunning(options);
}

/**
 * 读取 ready 沙盒的 provider metadata；如果 provider info 接口短暂异常，则返回最小可用信息。
 *
 * 沙盒是否可用由 provider adapter 的 ensureRunning 保证，getInfo 只用于补写镜像、
 * 创建时间等展示型 metadata。不能让 devbox 网关的临时 503 再次中断已就绪的主流程。
 */
export async function getReadySandboxInfo(
  sandbox: ISandbox,
  fallback: {
    sandboxId: string;
    image?: SandboxInfo['image'];
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
    ...(fallback.image ? { image: fallback.image } : {}),
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
  },
  createConfig?: SandboxCreateSpec
): Promise<{
  sandbox: ISandbox;
  sandboxInfo: SandboxInfo;
}> {
  const sandbox = await connectToSandbox(providerConfig, instance.sandboxId, createConfig);

  try {
    const sandboxInfo = await getReadySandboxInfo(sandbox, {
      sandboxId: instance.sandboxId,
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
 * Provider without local transports implements close as an idempotent no-op.
 */
export async function disconnectSandbox(sandbox: ISandbox): Promise<void> {
  await sandbox.close();
}
