/**
 * 沙盒原子层：封装 volume-manager 的持久卷创建和删除。
 *
 * 只负责 volume API 调用和 provider 卷配置转换，不管理 sandbox 生命周期。
 */
import {
  MANAGED_SESSION_VOLUME_CLAIM_REST_RE,
  SESSION_VOLUME_GENERATION_LENGTH
} from '../../constants';
import { randomUUID } from 'node:crypto';
import { Agent } from 'undici';
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SANDBOX_WORKSPACE_VOLUME_NAME,
  SandboxVolumeEnsureResponseSchema,
  SandboxVolumeInspectResponseSchema,
  SandboxVolumeListResponseSchema,
  SandboxVolumeNameSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { Volume } from '@alibaba-group/opensandbox';
import { shouldForwardAllowLegacyUnlabeled } from '../../legacy';
import type { SandboxStorageType } from '../../type';
import { getVolumeManagerEnvConfig } from './config';

const ORPHAN_VOLUME_MARKER_PREFIX = 'agent-sandbox:orphan-volume';
const VOLUME_MANAGER_REQUEST_TIMEOUT_MS = 350_000;
const volumeManagerDispatcher = new Agent({
  headersTimeout: 360_000,
  bodyTimeout: 360_000
});

/** 构造孤儿持久卷两阶段对账 GC 的 Redis 观察标记键。 */
export const getOrphanVolumeMarkerKey = (claimName: string) =>
  asRedisLogicalKey(`${ORPHAN_VOLUME_MARKER_PREFIX}:${claimName}`);

export type VolumeManagerResult = {
  volumes: Volume[];
  storage: SandboxStorageType;
};

const requestVolumeManager = async ({
  path,
  method,
  vmConfig = getVolumeManagerEnvConfig(),
  signal,
  jsonBody,
  allowNotFound = false,
  errorPrefix = 'volume-manager error'
}: {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  vmConfig?: ReturnType<typeof getVolumeManagerEnvConfig>;
  signal?: AbortSignal;
  jsonBody?: (params: { storageSize: string }) => Record<string, unknown>;
  allowNotFound?: boolean;
  errorPrefix?: string;
}): Promise<{ res: Response; volumeNamePrefix: string }> => {
  const baseUrl = vmConfig.url.replace(/\/+$/, '');
  const headers: Record<string, string> = jsonBody ? { 'Content-Type': 'application/json' } : {};
  if (vmConfig.token) headers['Authorization'] = `Bearer ${vmConfig.token}`;
  const timeoutSignal = AbortSignal.timeout(VOLUME_MANAGER_REQUEST_TIMEOUT_MS);
  const effectiveSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    signal: effectiveSignal,
    dispatcher: volumeManagerDispatcher,
    ...(jsonBody
      ? {
          body: JSON.stringify(
            jsonBody({
              storageSize: vmConfig.storageSize
            })
          )
        }
      : {})
  } as RequestInit);
  if (!res.ok && !(allowNotFound && res.status === 404)) {
    throw new Error(`${errorPrefix}: ${res.status} ${await res.text()}`);
  }
  return { res, volumeNamePrefix: vmConfig.volumeNamePrefix };
};

/**
 * 将 volume-manager 返回的 PVC 名称转换成 OpenSandbox 可识别的卷配置。
 *
 * OpenSandbox 持久卷固定挂载到 `$HOME`（`/home/sandbox`），工作区位于 `/home/sandbox/workspace`。
 */
export const buildVolumeConfig = (claimName: string): VolumeManagerResult => {
  const mountPath = OPEN_SANDBOX_DEFAULT_HOME_PATH;
  return {
    volumes: [
      {
        name: SANDBOX_WORKSPACE_VOLUME_NAME,
        pvc: {
          claimName,
          createIfNotExists: false,
          deleteOnSandboxTermination: false
        },
        mountPath
      }
    ],
    storage: {
      volumes: [
        {
          name: SANDBOX_WORKSPACE_VOLUME_NAME,
          claimName,
          mountPath
        }
      ],
      mountPath
    }
  };
};

/**
 * 从 volume-manager 管理的 PVC 名称中反解逻辑 `sandboxId`（兼容初始 `-0` 与 8 位 hex 代次后缀）。
 */
export const parseSandboxIdFromVolumeClaimName = ({
  claimName,
  volumeNamePrefix
}: {
  claimName: string;
  volumeNamePrefix: string;
}): string | undefined => {
  const normalizedPrefix = `${volumeNamePrefix.toLowerCase()}-`;
  if (!claimName.startsWith(normalizedPrefix)) {
    return undefined;
  }
  const rest = claimName.slice(normalizedPrefix.length);
  const match = MANAGED_SESSION_VOLUME_CLAIM_REST_RE.exec(rest);
  return match?.[1] || undefined;
};

/**
 * 读取 Mongo storage 中当前已提交的 workspace claimName。
 *
 * stopped/running 只能复用这个名称；archived restore 会先生成并持久化下一代名称。
 */
export const getSessionVolumeClaimName = (storage?: SandboxStorageType | null) =>
  storage?.volumes?.find((volume) => volume.name === SANDBOX_WORKSPACE_VOLUME_NAME)?.claimName;

/**
 * 为一次新的 workspace generation 生成唯一 claimName。
 */
export const createSessionVolumeClaimName = (params: {
  sandboxId: string;
  generationId?: string;
}) => {
  const { volumeNamePrefix } = getVolumeManagerEnvConfig();
  const generationId =
    params.generationId ??
    randomUUID().replaceAll('-', '').slice(0, SESSION_VOLUME_GENERATION_LENGTH);
  return SandboxVolumeNameSchema.parse(
    `${volumeNamePrefix}-${params.sandboxId}-${generationId}`.toLowerCase()
  );
};

/**
 * 只读核验指定持久卷已存在且归属当前 volume-manager（绝不触发新建卷）。
 *
 * 用于 4.18.0 存量 `/workspace` 卷迁移前校验：避免旧卷缺失时停掉旧容器或隐式创建空卷后提交空归档。
 */
export const assertSessionVolumeExists = async (
  claimName: string,
  options?: { allowLegacyUnlabeled?: boolean; signal?: AbortSignal }
): Promise<string> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const allowLegacyUnlabeled = shouldForwardAllowLegacyUnlabeled({
    claimName,
    volumeNamePrefix: vmConfig.volumeNamePrefix,
    allowLegacyUnlabeled: options?.allowLegacyUnlabeled
  });
  const query = allowLegacyUnlabeled ? '?allowLegacyUnlabeled=true' : '';
  const { res } = await requestVolumeManager({
    path: `/v1/volumes/${encodeURIComponent(claimName)}${query}`,
    method: 'GET',
    vmConfig,
    signal: options?.signal,
    errorPrefix: 'volume-manager inspect error'
  });
  const result = SandboxVolumeInspectResponseSchema.parse(await res.json());
  if (result.claimName !== claimName) {
    throw new Error(
      `volume-manager returned unexpected claimName: expected ${claimName}, received ${result.claimName}`
    );
  }
  return result.claimName;
};

/**
 * 确保指定 sandbox 会话拥有可挂载的持久卷。
 *
 * claimName 必须先由 FastGPT 生成并持久化，volume-manager 不理解 sandboxId。
 * `options.allowLegacyUnlabeled` 仅用于 4.18.0 过渡期无标签存量卷复用（`>= 4.19.0` 移除）。
 */
export const ensureSessionVolume = async (
  claimName: string,
  options?: { allowLegacyUnlabeled?: boolean; signal?: AbortSignal }
): Promise<string> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const allowLegacyUnlabeled = shouldForwardAllowLegacyUnlabeled({
    claimName,
    volumeNamePrefix: vmConfig.volumeNamePrefix,
    allowLegacyUnlabeled: options?.allowLegacyUnlabeled
  });
  const { res } = await requestVolumeManager({
    path: '/v1/volumes/ensure',
    method: 'POST',
    vmConfig,
    signal: options?.signal,
    jsonBody: ({ storageSize }) => ({
      claimName,
      storageSize,
      ...(allowLegacyUnlabeled ? { allowLegacyUnlabeled: true } : {})
    })
  });
  const result = SandboxVolumeEnsureResponseSchema.parse(await res.json());
  if (result.claimName !== claimName) {
    throw new Error(
      `volume-manager returned unexpected claimName: expected ${claimName}, received ${result.claimName}`
    );
  }
  // 清除可能残留的孤儿卷观察标记，防止新挂载/重挂卷被下一轮 GC 误删。
  await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(result.claimName)).catch(() => undefined);
  return result.claimName;
};

/**
 * 删除指定 sandbox 会话关联的持久卷。
 *
 * 删除目标始终使用 Mongo 中持久化的完整 claimName。
 * 404 视为已清理，volume-manager 的成功响应表示 driver 已完成对应 runtime 的删除语义
 * （Kubernetes 会等待目标 PVC generation 结束）。
 */
export const deleteSessionVolume = async (
  claimName: string,
  options?: { allowLegacyUnlabeled?: boolean; signal?: AbortSignal }
): Promise<void> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const allowLegacyUnlabeled = shouldForwardAllowLegacyUnlabeled({
    claimName,
    volumeNamePrefix: vmConfig.volumeNamePrefix,
    allowLegacyUnlabeled: options?.allowLegacyUnlabeled
  });
  const query = allowLegacyUnlabeled ? '?allowLegacyUnlabeled=true' : '';
  await requestVolumeManager({
    path: `/v1/volumes/${encodeURIComponent(claimName)}${query}`,
    method: 'DELETE',
    vmConfig,
    signal: options?.signal,
    allowNotFound: true
  });
  await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(claimName)).catch(() => undefined);
};

/**
 * 列出 volume-manager 中符合命名前缀的持久卷名称，供孤儿卷对账 GC 使用。
 */
export const listSessionVolumes = async (options?: { signal?: AbortSignal }): Promise<string[]> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const { res, volumeNamePrefix } = await requestVolumeManager({
    path: '/v1/volumes',
    method: 'GET',
    vmConfig,
    signal: options?.signal,
    errorPrefix: 'volume-manager list error'
  });
  const prefix = `${volumeNamePrefix.toLowerCase()}-`;
  return SandboxVolumeListResponseSchema.parse(await res.json()).items.filter((name) =>
    name.startsWith(prefix)
  );
};

/**
 * 为运行态 sandbox 准备持久卷配置。
 *
 * 确保指定 claim 后返回必需的卷配置；连接配置缺失由 config 边界报错。
 */
export const getSessionVolumeConfig = async (
  claimName: string,
  options?: { allowLegacyUnlabeled?: boolean; signal?: AbortSignal }
): Promise<VolumeManagerResult> => {
  const ensuredClaimName = await ensureSessionVolume(claimName, options);
  return buildVolumeConfig(ensuredClaimName);
};
