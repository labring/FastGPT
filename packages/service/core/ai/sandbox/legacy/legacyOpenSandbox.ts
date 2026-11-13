/**
 * 隔离式 OpenSandbox 旧容器终止与短生命周期临时迁移容器执行器（legacy 专用目录，不耦合新版主运行时）。
 */
import {
  ConnectionConfig,
  ExecutionEventDispatcher,
  Sandbox,
  SandboxApiException,
  SandboxManager,
  type Execution,
  type FileEntryType,
  type Volume as OpenSandboxVolume
} from '@alibaba-group/opensandbox';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { getInstanceId } from '../../../../common/system/config/instanceId';
import { serviceEnv } from '../../../../env';
import { BoundedOutputBuffer } from '../infrastructure/opensandbox/utils';
import { getDefaultOpenSandboxEphemeralStorageSize } from '../infrastructure/opensandbox/runtimeProfile';
import { unmountSessionVolume } from '../infrastructure/volume/service';

const LEGACY_WORKSPACE_VOLUME_NAME = 'legacy-workspace';
export const LEGACY_WORKSPACE_MOUNT_PATH = '/legacy-workspace';
const TEMP_CONTAINER_TIMEOUT_SECONDS = 600;
const TEMP_CONTAINER_RENEW_INTERVAL_MS = 3 * 60_000;
const TEMP_CONTAINER_READY_TIMEOUT_SECONDS = 120;
const KILL_WAIT_TIMEOUT_MS = 60_000;
const KILL_POLL_INTERVAL_MS = 500;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;

export type LegacyOpenSandboxEndpoint = {
  baseUrl: string;
  apiKey?: string;
  image: string;
  runtime?: 'docker' | 'kubernetes';
};

export type TemporaryMigrationSandboxOps = {
  exec: (command: string, timeoutSeconds?: number) => Promise<{ stdout: string; stderr: string }>;
  uploadStream: (
    targetPath: string,
    stream: ReadableStream<Uint8Array>,
    mode?: number
  ) => Promise<void>;
  createDirectories: (entries: Array<{ path: string; mode?: number }>) => Promise<void>;
  setPermissions: (entries: Array<{ path: string; mode: number }>) => Promise<void>;
};

export type LegacyExportFileEntry = {
  path: string;
  type?: FileEntryType;
  size?: number;
  mode?: number;
};

export type LegacyExportSandboxOps = {
  exec: (command: string, timeoutSeconds?: number) => Promise<{ stdout: string; stderr: string }>;
  listDirectory: (path: string, depth?: number) => Promise<LegacyExportFileEntry[]>;
  openFileStream: (sourcePath: string) => ReadableStream<Uint8Array>;
};

function asyncIterableToWebStream(iterable: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    }
  });
}

function createOpenSandboxConnection(endpoint?: LegacyOpenSandboxEndpoint): {
  connectionConfig: ConnectionConfig;
  image: string;
  runtime: 'docker' | 'kubernetes';
} {
  if (endpoint) {
    const baseUrl = endpoint.baseUrl.trim();
    if (!baseUrl) {
      throw new Error('AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL is required');
    }
    const image = endpoint.image.trim();
    if (!image) {
      throw new Error('AGENT_SANDBOX_LEGACY_OPENSANDBOX_IMAGE is required');
    }
    const connectionConfig = new ConnectionConfig({
      domain: baseUrl,
      apiKey: endpoint.apiKey,
      requestTimeoutSeconds: 180,
      useServerProxy: true
    }).withTransportIfMissing();
    return {
      connectionConfig,
      image,
      runtime: endpoint.runtime ?? 'docker'
    };
  }

  const baseUrl = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim();
  if (!baseUrl) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL is required');
  }
  const image = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim();
  if (!image) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE is required');
  }

  const connectionConfig = new ConnectionConfig({
    domain: baseUrl,
    apiKey: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    requestTimeoutSeconds: 180,
    useServerProxy: true
  }).withTransportIfMissing();

  return {
    connectionConfig,
    image,
    runtime: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
  };
}

const isOpenSandboxNotFound = (error: unknown): boolean =>
  error instanceof SandboxApiException && error.statusCode === 404;

async function waitUntilContainerDeleted(params: {
  manager: SandboxManager;
  remoteId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const deadline = Date.now() + KILL_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    params.signal?.throwIfAborted();
    const info = await params.manager.getSandboxInfo(params.remoteId).catch((error) => {
      if (isOpenSandboxNotFound(error)) return undefined;
      throw error;
    });
    if (!info || info.status.state.toLowerCase() === 'deleted') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, KILL_POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for OpenSandbox container ${params.remoteId} to terminate`);
}

/** 预检 OpenSandbox 控制面配置完整且 API 可连通（支持可选独立旧版源端点）。 */
export async function checkOpenSandboxConnectivity(
  endpoint?: LegacyOpenSandboxEndpoint
): Promise<void> {
  const { connectionConfig } = createOpenSandboxConnection(endpoint);
  const manager = SandboxManager.create({ connectionConfig });
  try {
    await manager.listSandboxInfos({ pageSize: 1, page: 1 });
  } finally {
    await manager.close().catch(() => {});
  }
}

/**
 * 查找并终止旧版无 `deploymentId` 的 OpenSandbox 容器，等待彻底销毁以释放 RWO 块存储 / Docker 卷锁。
 *
 * 严格跳过带有 `deploymentId` 的新版 `v3` 容器，绝不干扰已迁移实例或并发临时迁移容器。
 */
export async function terminateLegacyOpenSandboxContainers(params: {
  sandboxId: string;
  endpoint?: LegacyOpenSandboxEndpoint;
  signal?: AbortSignal;
}): Promise<number> {
  const { connectionConfig } = createOpenSandboxConnection(params.endpoint);
  const manager = SandboxManager.create({ connectionConfig });
  let terminatedCount = 0;

  try {
    const legacyIds: string[] = [];
    for (let page = 1; ; page++) {
      params.signal?.throwIfAborted();
      const res = await manager.listSandboxInfos({
        metadata: { sessionId: params.sandboxId },
        pageSize: 100,
        page
      });
      for (const item of res.items) {
        if (
          item.metadata?.sessionId === params.sandboxId &&
          !item.metadata?.deploymentId &&
          item.status.state.toLowerCase() !== 'deleted'
        ) {
          legacyIds.push(item.id);
        }
      }
      if (!res.pagination?.hasNextPage) break;
    }

    for (const remoteId of legacyIds) {
      params.signal?.throwIfAborted();
      await manager.killSandbox(remoteId).catch((error) => {
        if (!isOpenSandboxNotFound(error)) throw error;
      });
      await waitUntilContainerDeleted({ manager, remoteId, signal: params.signal });
      terminatedCount += 1;
    }
    return terminatedCount;
  } finally {
    await manager.close().catch(() => {});
  }
}

async function runCheckedCommandInSandbox(params: {
  sandbox: Sandbox;
  command: string;
  workingDirectory?: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  const stdoutBuf = new BoundedOutputBuffer(MAX_COMMAND_OUTPUT_BYTES, '\n');
  const stderrBuf = new BoundedOutputBuffer(MAX_COMMAND_OUTPUT_BYTES, '\n');
  const execution: Execution = { logs: { stdout: [], stderr: [] }, result: [] };
  const dispatcher = new ExecutionEventDispatcher(execution, {
    skipAccumulation: true,
    onStdout: (msg) => stdoutBuf.append(msg.text),
    onStderr: (msg) => stderrBuf.append(msg.text)
  });

  const streamController = new AbortController();
  const onCallerAbort = () => streamController.abort(params.signal?.reason);
  if (params.signal?.aborted) {
    throw params.signal.reason ?? new Error('Migration command aborted');
  }
  params.signal?.addEventListener('abort', onCallerAbort, { once: true });

  let terminalReceived = false;
  try {
    const stream = params.sandbox.commands.runStream(
      params.command,
      {
        workingDirectory: params.workingDirectory ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH,
        timeoutSeconds: params.timeoutSeconds ?? TEMP_CONTAINER_TIMEOUT_SECONDS
      },
      streamController.signal
    );
    for await (const event of stream) {
      await dispatcher.dispatch(event);
      if (event.type === 'execution_complete' || event.type === 'error') {
        terminalReceived = true;
        streamController.abort();
        break;
      }
    }
  } finally {
    params.signal?.removeEventListener('abort', onCallerAbort);
    if (!streamController.signal.aborted) {
      streamController.abort();
    }
  }

  if (!terminalReceived) {
    throw new Error('Temporary migration container command stream ended without terminal event');
  }

  const exitCode = (() => {
    if (!execution.error) return execution.complete ? 0 : null;
    if (typeof execution.error.exitCode === 'number') return execution.error.exitCode;
    const raw = execution.error.value?.trim();
    return raw && /^-?\d+$/.test(raw) ? Number(raw) : 1;
  })();

  const stdout = stdoutBuf.toString();
  const stderr = stderrBuf.toString();
  if (exitCode !== 0) {
    const rawDetail = (stderr || stdout || execution.error?.value || `exitCode=${exitCode}`).trim();
    // 保留首尾关键行（兼容长 Python/tar Traceback 末尾的真实异常原因），最终长度由上层 sanitizeMigrationErrorMessage 收敛。
    const detail =
      rawDetail.length > 600 ? `${rawDetail.slice(0, 160)}\n${rawDetail.slice(-400)}` : rawDetail;
    throw new Error(`Migration container command failed (${exitCode}): ${detail}`);
  }
  return { stdout, stderr };
}

/**
 * 周期性为临时迁移容器续期（600s 滑动窗口），避免迁移耗时超过初始 10 分钟后容器被提前销毁；
 * 若进程异常退出，定时器随进程消失，容器至多 10 分钟后自动到期回收。
 */
function startTempSandboxRenewHeartbeat(
  sandbox: Partial<Pick<Sandbox, 'renew'>>,
  signal?: AbortSignal
): () => void {
  if (typeof sandbox.renew !== 'function') {
    return () => {};
  }
  const timer = setInterval(() => {
    if (signal?.aborted) return;
    void sandbox.renew?.(TEMP_CONTAINER_TIMEOUT_SECONDS).catch(() => {});
  }, TEMP_CONTAINER_RENEW_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * 拉起挂载新 JuiceFS 卷（及可选只读旧卷）的短生命周期临时迁移容器，执行完数据搬迁后确保彻底销毁。
 */
export async function withTemporaryMigrationSandbox<T>(params: {
  sandboxId: string;
  newClaimName: string;
  legacyClaimName?: string;
  ephemeralStorageWorkspaceMultiplier?: number;
  signal?: AbortSignal;
  fn: (ops: TemporaryMigrationSandboxOps) => Promise<T>;
}): Promise<T> {
  const { connectionConfig, image } = createOpenSandboxConnection();
  const deploymentId = await getInstanceId();
  const isKubernetes = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes';
  const ephemeralStorageSize = isKubernetes
    ? getDefaultOpenSandboxEphemeralStorageSize({
        workspaceMultiplier: params.ephemeralStorageWorkspaceMultiplier
      })
    : undefined;

  const volumes: OpenSandboxVolume[] = [
    {
      name: SANDBOX_WORKSPACE_VOLUME_NAME,
      pvc: {
        claimName: params.newClaimName,
        createIfNotExists: false,
        deleteOnSandboxTermination: false
      },
      mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH,
      readOnly: false
    },
    ...(params.legacyClaimName
      ? [
          {
            name: LEGACY_WORKSPACE_VOLUME_NAME,
            pvc: {
              claimName: params.legacyClaimName,
              createIfNotExists: false,
              deleteOnSandboxTermination: false
            },
            mountPath: LEGACY_WORKSPACE_MOUNT_PATH,
            readOnly: true
          }
        ]
      : [])
  ];

  const sandbox = await Sandbox.create({
    connectionConfig,
    image,
    entrypoint: ['sleep', 'infinity'],
    timeoutSeconds: TEMP_CONTAINER_TIMEOUT_SECONDS,
    readyTimeoutSeconds: TEMP_CONTAINER_READY_TIMEOUT_SECONDS,
    healthCheck: async (sbx) => {
      const info = await sbx.files.getFileInfo([OPEN_SANDBOX_DEFAULT_ROOT_PATH]);
      const rootEntry = info[OPEN_SANDBOX_DEFAULT_ROOT_PATH];
      return !rootEntry || rootEntry.type === 'directory';
    },
    resource: {
      cpu: String(serviceEnv.AGENT_SANDBOX_CPU_COUNT),
      memory: `${serviceEnv.AGENT_SANDBOX_MEMORY_MIB}Mi`,
      ...(ephemeralStorageSize ? { 'ephemeral-storage': ephemeralStorageSize } : {})
    },
    metadata: {
      app: 'fastgpt',
      deploymentId,
      sessionId: params.sandboxId,
      migration: 'v2-to-v3'
    },
    volumes
  });

  const manager = SandboxManager.create({ connectionConfig });
  const stopRenewHeartbeat = startTempSandboxRenewHeartbeat(sandbox, params.signal);
  try {
    return await params.fn({
      exec: (command, timeoutSeconds) =>
        runCheckedCommandInSandbox({
          sandbox,
          command,
          timeoutSeconds,
          signal: params.signal
        }),
      uploadStream: async (targetPath, stream, mode) => {
        await sandbox.files.writeFiles([
          {
            path: targetPath,
            data: stream,
            ...(mode !== undefined ? { mode } : {})
          }
        ]);
      },
      createDirectories: async (entries) => {
        if (entries.length === 0) return;
        await sandbox.files.createDirectories(entries);
      },
      setPermissions: async (entries) => {
        if (entries.length === 0) return;
        await sandbox.files.setPermissions(entries);
      }
    });
  } finally {
    stopRenewHeartbeat();
    const remoteId = sandbox.id;
    await sandbox.kill().catch(async () => {
      if (remoteId) {
        await manager.killSandbox(remoteId).catch(() => {});
      }
    });
    if (remoteId) {
      await waitUntilContainerDeleted({ manager, remoteId }).catch(() => {});
    }
    await sandbox.close().catch(() => {});
    await manager.close().catch(() => {});

    if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
      await unmountSessionVolume(params.newClaimName).catch(() => {});
    }
  }
}

/**
 * 在跨运行时 / 跨集群旧版 OpenSandbox 源端（如旧 Docker OpenSandbox -> 新 K8s OpenSandbox）
 * 拉起仅只读挂载旧卷的短生命周期导出容器，供通过 `execd` 直接枚举工作区与流式传输文件。
 *
 * 全程以 `readOnly: true` + `createIfNotExists: false` + `deleteOnSandboxTermination: false` 挂载旧卷，
 * 绝不修改或销毁旧卷数据，确保任务 2 触发前 100% 可无损回滚。
 */
export async function withLegacyExportOpenSandbox<T>(params: {
  sandboxId: string;
  legacyClaimName: string;
  endpoint: LegacyOpenSandboxEndpoint;
  signal?: AbortSignal;
  fn: (ops: LegacyExportSandboxOps) => Promise<T>;
}): Promise<T> {
  const { connectionConfig, image, runtime } = createOpenSandboxConnection(params.endpoint);
  const deploymentId = await getInstanceId();
  const ephemeralStorageSize =
    runtime === 'kubernetes' ? getDefaultOpenSandboxEphemeralStorageSize() : undefined;

  const sandbox = await Sandbox.create({
    connectionConfig,
    image,
    entrypoint: ['sleep', 'infinity'],
    timeoutSeconds: TEMP_CONTAINER_TIMEOUT_SECONDS,
    readyTimeoutSeconds: TEMP_CONTAINER_READY_TIMEOUT_SECONDS,
    healthCheck: async (sbx) => {
      const info = await sbx.files.getFileInfo([LEGACY_WORKSPACE_MOUNT_PATH]);
      const rootEntry = info[LEGACY_WORKSPACE_MOUNT_PATH];
      return Boolean(rootEntry && rootEntry.type === 'directory');
    },
    resource: {
      cpu: String(serviceEnv.AGENT_SANDBOX_CPU_COUNT),
      memory: `${serviceEnv.AGENT_SANDBOX_MEMORY_MIB}Mi`,
      ...(ephemeralStorageSize ? { 'ephemeral-storage': ephemeralStorageSize } : {})
    },
    metadata: {
      app: 'fastgpt',
      deploymentId,
      sessionId: params.sandboxId,
      migration: 'v2-to-v3-export'
    },
    volumes: [
      {
        name: LEGACY_WORKSPACE_VOLUME_NAME,
        pvc: {
          claimName: params.legacyClaimName,
          createIfNotExists: false,
          deleteOnSandboxTermination: false
        },
        mountPath: LEGACY_WORKSPACE_MOUNT_PATH,
        readOnly: true
      }
    ]
  });

  const manager = SandboxManager.create({ connectionConfig });
  const stopRenewHeartbeat = startTempSandboxRenewHeartbeat(sandbox, params.signal);
  try {
    return await params.fn({
      exec: (command, timeoutSeconds) =>
        runCheckedCommandInSandbox({
          sandbox,
          command,
          workingDirectory: '/tmp',
          timeoutSeconds,
          signal: params.signal
        }),
      listDirectory: async (path, depth) =>
        (
          await sandbox.files.listDirectory({ path, ...(depth !== undefined ? { depth } : {}) })
        ).map((entry) => ({
          path: entry.path,
          type: entry.type,
          size: entry.size,
          mode: entry.mode
        })),
      openFileStream: (sourcePath) =>
        asyncIterableToWebStream(sandbox.files.readBytesStream(sourcePath))
    });
  } finally {
    stopRenewHeartbeat();
    const remoteId = sandbox.id;
    await sandbox.kill().catch(async () => {
      if (remoteId) {
        await manager.killSandbox(remoteId).catch(() => {});
      }
    });
    if (remoteId) {
      await waitUntilContainerDeleted({ manager, remoteId }).catch(() => {});
    }
    await sandbox.close().catch(() => {});
    await manager.close().catch(() => {});
  }
}
