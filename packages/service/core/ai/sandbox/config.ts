import { env } from '../../../env';
import type {
  OpenSandboxConfigType,
  OpenSandboxConnectionConfig
} from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxStorageType } from './type';

// ---- sealosdevbox ----
export type SealosConnectionConfig = {
  baseUrl: string;
  token: string;
  sandboxId: string;
};

export const getSealosConnectionConfig = (sandboxId: string): SealosConnectionConfig => {
  if (!env.AGENT_SANDBOX_SEALOS_BASEURL || !env.AGENT_SANDBOX_SEALOS_TOKEN) {
    throw new Error('AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required');
  }
  return {
    baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL,
    token: env.AGENT_SANDBOX_SEALOS_TOKEN,
    sandboxId
  };
};

// ---- opensandbox ----
export const getOpenSandboxConnectionConfig = ({
  sessionId
}: {
  sessionId: string;
}): OpenSandboxConnectionConfig => {
  if (!env.AGENT_SANDBOX_OPENSANDBOX_BASEURL) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL is required');
  }
  return {
    sessionId,
    useServerProxy: env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY,
    baseUrl: env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
    apiKey: env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    runtime: env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
  };
};

export const buildOpenSandboxCreateConfig = (
  opts: {
    volumes?: OpenSandboxConfigType['volumes'];
    resourceLimits?: OpenSandboxConfigType['resourceLimits'];
  } = {}
): OpenSandboxConfigType => {
  if (!env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO is required for opensandbox provider');
  }
  return {
    image: {
      repository: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      tag: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    },
    ...(opts.resourceLimits ? { resourceLimits: opts.resourceLimits } : {}),
    ...(opts.volumes ? { volumes: opts.volumes } : {})
  };
};

// ---- volume-manager ----
export type VolumeManagerConfig = {
  url: string;
  token?: string;
  mountPath: string;
};
export type VolumeManagerResult = {
  volumes: OpenSandboxConfigType['volumes'];
  storage: SandboxStorageType;
};
const vmConfig = {
  enable: env.AGENT_SANDBOX_ENABLE_VOLUME,
  url: env.AGENT_SANDBOX_VOLUME_MANAGER_URL!,
  token: env.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
  mountPath: env.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
};
export const buildVolumeConfig = (claimName: string, mountPath: string): VolumeManagerResult => {
  return {
    volumes: [{ name: 'workspace', pvc: { claimName }, mountPath }],
    storage: {
      volumes: [{ name: 'workspace', claimName, mountPath }],
      mountPath
    }
  };
};
export const ensureSessionVolume = async (sessionId: string): Promise<string> => {
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
export const deleteSessionVolume = async (sessionId: string): Promise<void> => {
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

export const getVolumeManagerConfig = async (
  sandboxId: string
): Promise<VolumeManagerResult | undefined> => {
  if (!vmConfig.enable) return undefined;
  if (!vmConfig.url) {
    throw new Error(
      'AGENT_SANDBOX_VOLUME_MANAGER_URL is required when AGENT_SANDBOX_ENABLE_VOLUME=true'
    );
  }
  const claimName = await ensureSessionVolume(sandboxId);
  const volumeResult = buildVolumeConfig(claimName, vmConfig.mountPath);

  return volumeResult;
};
