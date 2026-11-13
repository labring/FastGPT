/**
 * 沙盒原子层：封装 volume-manager 的持久卷创建和删除。
 *
 * 只负责 volume API 调用和 OpenSandbox 卷配置转换，不管理 sandbox 生命周期。
 */
import { SESSION_VOLUME_GENERATION_LENGTH } from '../../constants';
import { randomUUID } from 'node:crypto';
import { asRedisLogicalKey, redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import type { Volume as OpenSandboxVolume } from '@alibaba-group/opensandbox';
import {
  SANDBOX_WORKSPACE_VOLUME_NAME,
  SandboxVolumeEnsureResponseSchema,
  SandboxVolumeListResponseSchema,
  SandboxVolumeNameSchema
} from '@fastgpt/global/core/ai/sandbox/volume';
import type { SandboxStorageType } from '../../type';
import { getVolumeManagerEnvConfig } from './config';
import { getInstanceId } from '../../../../../common/system/config/instanceId';

const ORPHAN_VOLUME_MARKER_PREFIX = 'sandbox:gc:orphan-volume';

/** 构造孤儿持久卷两阶段对账 GC 的 Redis 观察标记键。 */
export const getOrphanVolumeMarkerKey = (claimName: string) =>
  asRedisLogicalKey(`${ORPHAN_VOLUME_MARKER_PREFIX}:${claimName}`);

/**
 * 统一构造 volume-manager HTTP 请求（自动附加鉴权头与当前集群 `deploymentId`）。
 */
const requestVolumeManager = async ({
  path,
  method,
  jsonBody,
  includeDeploymentQuery = false,
  allowNotFound = false,
  errorPrefix = 'volume-manager error'
}: {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  jsonBody?: (params: { deploymentId: string; storageSize: string }) => Record<string, unknown>;
  includeDeploymentQuery?: boolean;
  allowNotFound?: boolean;
  errorPrefix?: string;
}): Promise<{ res: Response; volumeNamePrefix: string }> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const deploymentId = await getInstanceId();
  const headers: Record<string, string> = jsonBody ? { 'Content-Type': 'application/json' } : {};
  if (vmConfig.token) {
    headers['Authorization'] = `Bearer ${vmConfig.token}`;
  }

  const querySuffix = includeDeploymentQuery
    ? `?${new URLSearchParams({ deploymentId }).toString()}`
    : '';
  const res = await fetch(`${vmConfig.url}${path}${querySuffix}`, {
    method,
    headers,
    ...(jsonBody
      ? {
          body: JSON.stringify(
            jsonBody({
              deploymentId,
              storageSize: vmConfig.storageSize
            })
          )
        }
      : {})
  });
  if (!res.ok && !(allowNotFound && res.status === 404)) {
    throw new Error(`${errorPrefix}: ${res.status} ${await res.text()}`);
  }
  return { res, volumeNamePrefix: vmConfig.volumeNamePrefix };
};

export type VolumeManagerResult = {
  volumes: OpenSandboxVolume[];
  storage: SandboxStorageType;
};

/**
 * 将 volume-manager 返回的 PVC 名称转换成 OpenSandbox adapter 可识别的卷配置。
 *
 * OpenSandbox 的持久化工作区固定为 /workspace，避免 env 配置和镜像契约分叉。
 * 同时保留一份 storage metadata，方便后续在 Mongo 记录中还原真实挂载信息。
 */
export const buildVolumeConfig = (claimName: string): VolumeManagerResult => {
  return {
    volumes: [
      {
        name: SANDBOX_WORKSPACE_VOLUME_NAME,
        pvc: {
          claimName,
          createIfNotExists: false,
          deleteOnSandboxTermination: false
        },
        mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
      }
    ],
    storage: {
      volumes: [
        {
          name: SANDBOX_WORKSPACE_VOLUME_NAME,
          claimName,
          mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
        }
      ]
    }
  };
};

/**
 * 读取 Mongo storage 中当前已提交的 workspace claimName。
 *
 * 停止、唤醒和镜像重建均复用该持久卷，不从 sandboxId 重新推导卷名。
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
 * 确保指定 sandbox 会话拥有可挂载的持久卷。
 *
 * claimName 必须先由 FastGPT 生成并持久化，volume-manager 不理解 sandboxId。
 */
export const ensureSessionVolume = async (claimName: string): Promise<string> => {
  const { res } = await requestVolumeManager({
    path: '/v1/volumes/ensure',
    method: 'POST',
    jsonBody: ({ deploymentId, storageSize }) => ({
      claimName,
      deploymentId,
      storageSize
    })
  });
  const result = SandboxVolumeEnsureResponseSchema.parse(await res.json());
  if (result.claimName !== claimName) {
    throw new Error(
      `volume-manager returned unexpected claimName: expected ${claimName}, received ${result.claimName}`
    );
  }
  // 迁移重试等先建卷、后写 Mongo 的确定性卷名流程中，重置可能残留的孤儿观察窗口，防止拷贝期间被第二轮 GC 误删。
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
export const deleteSessionVolume = async (claimName: string): Promise<void> => {
  await requestVolumeManager({
    path: `/v1/volumes/${encodeURIComponent(claimName)}`,
    method: 'DELETE',
    includeDeploymentQuery: true,
    allowNotFound: true
  });
};

/**
 * 卸载指定 sandbox 会话在 Docker 宿主机的空闲 FUSE 挂载点（S3 数据保留，下次 ensure 自动重挂）。
 */
export const unmountSessionVolume = async (claimName: string): Promise<void> => {
  await requestVolumeManager({
    path: `/v1/volumes/${encodeURIComponent(claimName)}/unmount`,
    method: 'POST',
    includeDeploymentQuery: true,
    allowNotFound: true,
    errorPrefix: 'volume-manager unmount error'
  });
};

/**
 * 列出 volume-manager 中当前部署拥有的持久卷名称，供孤儿卷对账 GC 使用。
 */
export const listSessionVolumes = async (): Promise<string[]> => {
  const { res, volumeNamePrefix } = await requestVolumeManager({
    path: '/v1/volumes',
    method: 'GET',
    includeDeploymentQuery: true,
    errorPrefix: 'volume-manager list error'
  });
  const prefix = `${volumeNamePrefix.toLowerCase()}-`;
  return SandboxVolumeListResponseSchema.parse(await res.json()).items.filter((name) =>
    name.startsWith(prefix)
  );
};
