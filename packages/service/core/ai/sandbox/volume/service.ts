import {
  OPEN_SANDBOX_DEFAULT_ROOT_PATH,
  type OpenSandboxConfigType
} from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxStorageType } from '../type';
import { getVolumeManagerEnvConfig } from './config';

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
    volumes: [{ name: 'workspace', pvc: { claimName }, mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH }],
    storage: {
      volumes: [{ name: 'workspace', claimName, mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH }],
      mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
    }
  };
};

/**
 * 确保指定 sandbox 会话拥有可挂载的持久卷。
 *
 * 返回值是 volume-manager 分配的 PVC 名称，调用方再转换成 provider 的 volumes 配置。
 */
export const ensureSessionVolume = async (sessionId: string): Promise<string> => {
  const vmConfig = getVolumeManagerEnvConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (vmConfig.token) headers['Authorization'] = `Bearer ${vmConfig.token}`;

  const res = await fetch(`${vmConfig.url}/v1/volumes/ensure`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) {
    throw new Error(`volume-manager error: ${res.status} ${await res.text()}`);
  }
  const { claimName } = (await res.json()) as { claimName: string };
  return claimName;
};

/**
 * 删除指定 sandbox 会话关联的持久卷。
 *
 * 未启用 volume-manager 时直接跳过；404 视为已清理，避免资源删除流程被重复清理中断。
 */
export const deleteSessionVolume = async (sessionId: string): Promise<void> => {
  const vmConfig = getVolumeManagerEnvConfig();
  if (!vmConfig.enable) return;
  const headers: Record<string, string> = {};
  if (vmConfig.token) headers['Authorization'] = `Bearer ${vmConfig.token}`;

  const res = await fetch(`${vmConfig.url}/v1/volumes/${encodeURIComponent(sessionId)}`, {
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
  sandboxId: string
): Promise<VolumeManagerResult | undefined> => {
  const vmConfig = getVolumeManagerEnvConfig();
  if (!vmConfig.enable) return undefined;
  if (!vmConfig.url) {
    throw new Error(
      'AGENT_SANDBOX_VOLUME_MANAGER_URL is required when AGENT_SANDBOX_ENABLE_VOLUME=true'
    );
  }
  const claimName = await ensureSessionVolume(sandboxId);
  const volumeResult = buildVolumeConfig(claimName);

  return volumeResult;
};
