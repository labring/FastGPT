/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type {
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import { createSandbox, type ISandbox, type OpenSandboxVolume } from '@fastgpt-sdk/sandbox-adapter';
import type { OpenSandboxConfigType, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { OpenSandboxAdapter } from '@fastgpt-sdk/sandbox-adapter';
import { env } from '../../env';

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

/**
 * App-side sandbox create config.
 * Providers may support only a subset of these fields.
 */
export type SandboxCreateConfig = OpenSandboxConfigType;

export type SandboxDefaults = {
  defaultImage: SandboxImageConfigType;
  workDirectory: string;
  targetPort: number;
  entrypoint: string;
};

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

function createUnsupportedCreateConfigError(provider: SandboxProviderType): Error {
  return new Error(
    `Sandbox provider "${provider}" does not support custom image/entrypoint/env/metadata through @fastgpt/sandbox. Agent skill sandboxes currently require those capabilities.`
  );
}

function toOpenSandboxCreateConfig(
  createConfig?: SandboxCreateConfig
): OpenSandboxConfigType | undefined {
  return createConfig;
}

/**
 * Get sandbox provider configuration from environment variables
 */
export function getSandboxProviderConfig(): SandboxProviderConfig {
  const provider = (env.AGENT_SANDBOX_PROVIDER ?? 'opensandbox') as SandboxProviderType;
  const runtime = (env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME ?? 'kubernetes') as SandboxRuntime;

  switch (provider) {
    case 'opensandbox':
      return {
        provider,
        baseUrl: env.AGENT_SANDBOX_OPENSANDBOX_BASEURL ?? 'http://127.0.0.1:8080',
        apiKey: env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
        runtime,
        useServerProxy: env.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      };

    case 'sealosdevbox':
      return {
        provider,
        baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL ?? '',
        token: env.AGENT_SANDBOX_SEALOS_TOKEN ?? '',
        runtime
      };

    case 'e2b':
      throw new Error('Sandbox provider "e2b" is not supported');

    default:
      return assertNever(provider);
  }
}

/**
 * Get sandbox default settings
 */
export function getSandboxDefaults(): SandboxDefaults {
  return {
    defaultImage: {
      repository: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO ?? 'fastgpt-agent-sandbox',
      tag: env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG ?? 'latest'
    },
    workDirectory: env.AGENT_SANDBOX_OPENSANDBOX_WORK_DIRECTORY ?? '/home/sandbox/workspace',
    targetPort: env.AGENT_SANDBOX_OPENSANDBOX_TARGET_PORT ?? 8080,
    entrypoint: env.AGENT_SANDBOX_OPENSANDBOX_ENTRYPOINT ?? '/home/sandbox/entrypoint.sh'
  };
}

/**
 * Get skill size limits from environment variables
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  return {
    maxUploadBytes: env.AGENT_SKILL_MAX_UPLOAD_SIZE ?? 50 * 1024 * 1024,
    maxUncompressedBytes: env.AGENT_SKILL_MAX_UNCOMPRESSED_SIZE ?? 200 * 1024 * 1024,
    maxDownloadBytes: env.AGENT_SKILL_MAX_DOWNLOAD_SIZE ?? 200 * 1024 * 1024,
    maxSandboxPackageBytes: env.AGENT_SKILL_MAX_SANDBOX_SIZE ?? 200 * 1024 * 1024
  };
}

/**
 * Validate sandbox configuration
 */
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

/**
 * Build a provider-specific sandbox adapter behind the unified ISandbox interface.
 * For providers that require a sandboxId at construction time, pass providerSandboxId.
 */
export function buildSandboxAdapter(
  providerConfig: SandboxProviderConfig,
  {
    providerSandboxId,
    createConfig
  }: {
    providerSandboxId?: string;
    createConfig?: SandboxCreateConfig;
  } = {}
): ISandbox {
  switch (providerConfig.provider) {
    case 'opensandbox':
      if (!providerSandboxId) {
        throw new Error(
          'Sandbox provider "opensandbox" requires providerSandboxId when initializing the adapter'
        );
      }
      return createSandbox(
        'opensandbox',
        {
          sessionId: providerSandboxId,
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy
        },
        toOpenSandboxCreateConfig(createConfig)
      );

    case 'sealosdevbox': {
      if (!providerSandboxId) {
        throw new Error(
          'Sandbox provider "sealosdevbox" requires providerSandboxId when initializing the adapter'
        );
      }
      if (createConfig) {
        throw createUnsupportedCreateConfigError(providerConfig.provider);
      }

      const connection = {
        baseUrl: providerConfig.baseUrl,
        token: providerConfig.token,
        sandboxId: providerSandboxId
      };

      return createSandbox('sealosdevbox', connection);
    }

    default:
      return assertNever(providerConfig);
  }
}

/**
 * Connect to an existing provider sandbox and return a unified adapter instance.
 *
 * OpenSandbox requires an explicit SDK connect call. Other providers, like
 * Sealos Devbox, identify the target sandbox during adapter construction.
 */
export async function connectToProviderSandbox(
  providerConfig: SandboxProviderConfig,
  providerSandboxId: string
): Promise<ISandbox> {
  const sandbox = buildSandboxAdapter(providerConfig, { providerSandboxId });

  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).connect(providerSandboxId);
  }

  return sandbox;
}

/**
 * Release any provider-specific client resources tied to the sandbox handle.
 *
 * `close()` is not part of the shared ISandbox contract today, so keep the
 * OpenSandbox branch here instead of leaking adapter-specific casts into
 * business code. Other providers currently have no equivalent method.
 */
export async function disconnectFromProviderSandbox(sandbox: ISandbox): Promise<void> {
  if (sandbox.provider === 'opensandbox') {
    await (sandbox as OpenSandboxAdapter).close();
  }
}

/**
 * Resolve the externally reachable endpoint for a sandbox service.
 *
 * `getEndpoint()` is an OpenSandbox-specific extension. If another provider adds
 * a similar capability later, extend this function instead of branching again
 * in application code.
 */
export async function getProviderSandboxEndpoint(
  sandbox: ISandbox,
  port: number
): Promise<SkillSandboxEndpointType> {
  if (sandbox.provider === 'opensandbox') {
    const endpoint = await (sandbox as OpenSandboxAdapter).getEndpoint(port);
    return {
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol,
      url: endpoint.url
    };
  }

  throw new Error(
    `Sandbox provider "${sandbox.provider}" does not expose endpoint capability through @fastgpt/sandbox. This edit-debug workflow currently requires opensandbox-compatible endpoint support.`
  );
}

// ---- Volume Manager integration ----

export type VolumeManagerConfig = {
  url: string;
  token: string;
  mountPath: string;
};

/**
 * Read Volume Manager configuration from environment variables.
 * Throws when any required field is missing.
 */
export function getVolumeManagerConfig(): VolumeManagerConfig {
  const {
    AGENT_SANDBOX_VOLUME_MANAGER_URL,
    AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
  } = env;
  if (
    !AGENT_SANDBOX_VOLUME_MANAGER_URL ||
    !AGENT_SANDBOX_VOLUME_MANAGER_TOKEN ||
    !AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
  ) {
    throw new Error(
      'Missing required Volume Manager configuration: AGENT_SANDBOX_VOLUME_MANAGER_URL, AGENT_SANDBOX_VOLUME_MANAGER_TOKEN, AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH must be set'
    );
  }
  return {
    url: AGENT_SANDBOX_VOLUME_MANAGER_URL,
    token: AGENT_SANDBOX_VOLUME_MANAGER_TOKEN,
    mountPath: AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
  };
}

/**
 * Call volume-manager HTTP API to idempotently create a volume for the session.
 * Returns the claimName (PVC name or Docker volume name).
 */
export async function ensureSessionVolume(
  sessionId: string,
  vmConfig: VolumeManagerConfig
): Promise<string> {
  const res = await fetch(`${vmConfig.url}/v1/volumes/ensure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vmConfig.token}`
    },
    body: JSON.stringify({ sessionId })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Volume Manager error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { claimName: string };
  return data.claimName;
}

/**
 * Build the volumes entry for the sandbox create config.
 *
 * Both Docker and Kubernetes runtimes use the `pvc` backend:
 * - Kubernetes: pvc.claimName is the K8s PVC name
 * - Docker: pvc.claimName is the Docker named volume name (docker volume create)
 *
 * The `host` backend is for bind mounts (absolute paths) only and is not used here.
 */
export function buildVolumeConfig(
  _runtime: SandboxRuntime,
  sessionId: string,
  claimName: string,
  mountPath: string
): OpenSandboxVolume {
  // Volume name must match DNS label format: ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$
  const name = sessionId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '');
  return { name, pvc: { claimName }, mountPath, readOnly: false };
}

/**
 * Build container env vars for the sandbox process.
 */
export function buildBaseContainerEnv(
  sessionId: string,
  workDirectory: string,
  enableCodeServer: boolean
): Record<string, string> {
  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory,
    FASTGPT_ENABLE_CODE_SERVER: enableCodeServer ? 'true' : 'false'
  };
}
