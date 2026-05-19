import { serviceEnv } from '../../../env';
import type {
  OpenSandboxConfigType,
  OpenSandboxConnectionConfig,
  SandboxCreateSpec,
  SandboxProviderType
} from '@fastgpt-sdk/sandbox-adapter';
import type { SandboxStorageType } from './type';

type SandboxRuntime = 'kubernetes' | 'docker';

type BaseSandboxProviderConfig = {
  provider: SandboxProviderType;
  baseUrl: string;
  runtime: SandboxRuntime;
};

export type OpenSandboxProviderConfig = BaseSandboxProviderConfig & {
  provider: 'opensandbox';
  apiKey?: string;
  useServerProxy?: boolean;
};

export type SealosDevboxProviderConfig = BaseSandboxProviderConfig & {
  provider: 'sealosdevbox';
  token: string;
};

export type SandboxProviderConfig = OpenSandboxProviderConfig | SealosDevboxProviderConfig;

export type SandboxCreateConfig = SandboxCreateSpec;

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

export function getSandboxProviderConfig(
  provider: SandboxProviderType = serviceEnv.AGENT_SANDBOX_PROVIDER
): SandboxProviderConfig {
  const runtime = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME;

  switch (provider) {
    case 'opensandbox':
      return {
        provider,
        baseUrl: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
        apiKey: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
        runtime,
        useServerProxy: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      };

    case 'sealosdevbox':
      return {
        provider,
        baseUrl:
          serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL ??
          serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL ??
          '',
        token:
          serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN ??
          serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ??
          '',
        runtime
      };

    case 'e2b':
      throw new Error('Sandbox provider "e2b" is not supported');

    default:
      return assertNever(provider);
  }
}

export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (!['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }

  if (config.provider === 'sealosdevbox' && !config.token) {
    throw new Error('Sandbox provider token is required for sealosdevbox');
  }
}

// ---- sealosdevbox ----
export type SealosConnectionConfig = {
  baseUrl: string;
  token: string;
  sandboxId: string;
};

export const getSealosConnectionConfig = (sandboxId: string): SealosConnectionConfig => {
  if (!serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL || !serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN) {
    throw new Error('AGENT_SANDBOX_SEALOS_BASEURL / AGENT_SANDBOX_SEALOS_TOKEN required');
  }
  return {
    baseUrl: serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL,
    token: serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN,
    sandboxId
  };
};

// ---- opensandbox ----
export const getOpenSandboxConnectionConfig = ({
  sessionId
}: {
  sessionId: string;
}): OpenSandboxConnectionConfig => {
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL is required');
  }
  return {
    sessionId,
    useServerProxy: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY,
    replaceDockerInternalWithLocalhost:
      serviceEnv.SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST,
    baseUrl: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
    apiKey: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
    runtime: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
  } as OpenSandboxConnectionConfig;
};

export const buildOpenSandboxCreateConfig = (
  opts: {
    volumes?: OpenSandboxConfigType['volumes'];
    resourceLimits?: SandboxCreateSpec['resourceLimits'];
    createConfig?: SandboxCreateSpec;
  } = {}
): OpenSandboxConfigType => {
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO && !opts.createConfig?.image) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO is required for opensandbox provider');
  }
  const { image, entrypoint, env, metadata } = opts.createConfig ?? {};
  return {
    image: {
      repository: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
      tag: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    },
    ...(opts.resourceLimits ? { resourceLimits: opts.resourceLimits } : {}),
    ...(image ? { image } : {}),
    ...(entrypoint ? { entrypoint } : {}),
    ...(env ? { env } : {}),
    ...(metadata ? { metadata: metadata as OpenSandboxConfigType['metadata'] } : {}),
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
  enable: serviceEnv.AGENT_SANDBOX_ENABLE_VOLUME,
  url: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_URL!,
  token: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
  mountPath: serviceEnv.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
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
