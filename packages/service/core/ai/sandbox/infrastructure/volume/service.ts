/**
 * 沙盒原子层：封装 volume-manager 的持久卷创建和删除。
 *
 * 只负责 volume API 调用和 provider 卷配置转换，不管理 sandbox 生命周期。
 */
import { randomUUID } from 'node:crypto';
import {
  OPEN_SANDBOX_DEFAULT_ROOT_PATH,
  type OpenSandboxConfigType
} from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxStorageType } from '../../type';
import { getVolumeManagerEnvConfig } from './config';

const SESSION_VOLUME_NAME_PREFIX = 'fastgpt-session';
const SESSION_VOLUME_GENERATION_LENGTH = 12;

export type VolumeManagerResult = {
  volumes: OpenSandboxConfigType['volumes'];
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
        name: 'workspace',
        pvc: {
          claimName,
          createIfNotExists: false,
          deleteOnSandboxTermination: false
        },
        mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
      }
    ],
    storage: {
      volumes: [{ name: 'workspace', claimName, mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH }],
      mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
    }
  };
};

/**
 * 读取 Mongo storage 中当前已提交的 workspace claimName。
 *
 * stopped/running 只能复用这个名称；archived restore 会先生成并持久化下一代名称。
 */
export const getSessionVolumeClaimName = (storage?: SandboxStorageType | null) =>
  storage?.volumes?.find((volume) => volume.name === 'workspace')?.claimName;

/**
 * 为一次新的 workspace generation 生成唯一 claimName。
 */
export const createSessionVolumeClaimName = (params: {
  sandboxId: string;
  generationId?: string;
}) => {
  const generationId =
    params.generationId ??
    randomUUID().replaceAll('-', '').slice(0, SESSION_VOLUME_GENERATION_LENGTH);
  return `${SESSION_VOLUME_NAME_PREFIX}-${params.sandboxId}-${generationId}`.toLowerCase();
};

/**
 * 确保指定 sandbox 会话拥有可挂载的持久卷。
 *
 * claimName 必须先由 FastGPT 生成并持久化，volume-manager 不理解 sandboxId。
 */
export const ensureSessionVolume = async (claimName: string): Promise<string> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (vmConfig.token) headers['Authorization'] = `Bearer ${vmConfig.token}`;

  const res = await fetch(`${vmConfig.url}/v1/volumes/ensure`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      claimName,
      storageSize: vmConfig.storageSize
    })
  });
  if (!res.ok) {
    throw new Error(`volume-manager error: ${res.status} ${await res.text()}`);
  }
  const result = (await res.json()) as { claimName: string };
  if (result.claimName !== claimName) {
    throw new Error(
      `volume-manager returned unexpected claimName: expected ${claimName}, received ${result.claimName}`
    );
  }
  return result.claimName;
};

/**
 * 删除指定 sandbox 会话关联的持久卷。
 *
 * 未启用 volume-manager 时直接跳过；404 视为已清理，volume-manager 的成功响应表示
 * driver 已完成对应 runtime 的删除语义（Kubernetes 会等待目标 PVC generation 结束）。
 */
export const deleteSessionVolume = async (claimName: string): Promise<void> => {
  const vmConfig = getVolumeManagerEnvConfig();
  if (!vmConfig.enable) return;
  const headers: Record<string, string> = {};
  if (vmConfig.token) headers['Authorization'] = `Bearer ${vmConfig.token}`;

  const res = await fetch(`${vmConfig.url}/v1/volumes/${encodeURIComponent(claimName)}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`volume-manager error: ${res.status} ${await res.text()}`);
  }
};

/**
 * 为运行态 sandbox 准备持久卷配置。
 *
 * volume-manager 未开启时返回 undefined，调用方可直接透传给 provider 配置构造。
 */
export const getSessionVolumeConfig = async (
  claimName: string
): Promise<VolumeManagerResult | undefined> => {
  const vmConfig = getVolumeManagerEnvConfig();
  if (!vmConfig.enable) return undefined;
  if (!vmConfig.url) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL is required');
  }
  const ensuredClaimName = await ensureSessionVolume(claimName);
  const volumeResult = buildVolumeConfig(ensuredClaimName);

  return volumeResult;
};
