/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import type {
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import { createSandbox, type ISandbox } from '@fastgpt-sdk/sandbox-adapter';
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
  entrypoint: {
    editDebugKubernetes: string; // SANDBOX_K8S_ENTRYPOINT
    sessionKubernetes: string; // SANDBOX_SESSION_K8S_ENTRYPOINT
    docker: string; // SANDBOX_DOCKER_ENTRYPOINT
  };
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
  const runtime = (env.AGENT_SANDBOX_RUNTIME ?? 'kubernetes') as SandboxRuntime;

  switch (provider) {
    case 'opensandbox':
      return {
        provider,
        baseUrl: env.AGENT_SANDBOX_BASE_URL ?? 'http://127.0.0.1:8080',
        apiKey: env.AGENT_SANDBOX_API_KEY,
        runtime
      };

    case 'sealosdevbox':
      return {
        provider,
        baseUrl: env.AGENT_SANDBOX_SEALOS_BASEURL ?? env.AGENT_SANDBOX_BASE_URL ?? '',
        token: env.AGENT_SANDBOX_SEALOS_TOKEN ?? env.AGENT_SANDBOX_API_KEY ?? '',
        runtime
      };

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
      repository: env.AGENT_SANDBOX_DEFAULT_IMAGE ?? 'fastgpt-agent-sandbox',
      tag: env.AGENT_SANDBOX_DEFAULT_IMAGE_TAG ?? 'docker'
    },
    workDirectory: env.AGENT_SANDBOX_WORK_DIRECTORY ?? '/home/sandbox/workspace',
    targetPort: 8080,
    entrypoint: {
      editDebugKubernetes: env.AGENT_SANDBOX_K8S_ENTRYPOINT ?? '/home/sandbox/entrypoint.sh',
      sessionKubernetes:
        env.AGENT_SANDBOX_SESSION_K8S_ENTRYPOINT ?? '/opt/sync-agent/docker-entrypoint.sh',
      docker: env.AGENT_SANDBOX_DOCKER_ENTRYPOINT ?? '/opt/sync-agent/docker-entrypoint.sh'
    }
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
      return createSandbox(
        'opensandbox',
        {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime
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

/**
 * Select the correct entrypoint based on runtime and sandbox type.
 * Centralises the kubernetes/docker branching that was duplicated in two files.
 */
export function selectSandboxEntrypoint(
  runtime: SandboxProviderConfig['runtime'],
  defaults: SandboxDefaults,
  type: 'editDebug' | 'sessionRuntime'
): string {
  if (runtime === 'kubernetes') {
    return type === 'editDebug'
      ? defaults.entrypoint.editDebugKubernetes
      : defaults.entrypoint.sessionKubernetes;
  }
  return defaults.entrypoint.docker;
}

/**
 * Docker 运行时下注入 Sync Agent 所需的环境变量
 *
 * K8s 运行时不需要此函数：SESSION_ID 由 Sync Agent Sidecar 从 Pod label 读取，
 * MinIO 凭证通过 K8s Secret 挂载到 Sidecar 容器，FastGPT 侧只需在 metadata 传 sessionId。
 *
 * @param sessionId  会话唯一 ID，作为 MinIO 存储路径前缀（sessions/{sessionId}/）
 * @param syncPath   沙箱内需要同步的目录，通常为 workDirectory
 * @param enableCodeServer 是否启动 code-server，editDebug 模式为 true，session-runtime 为 false
 */
export function buildDockerSyncEnv(
  sessionId: string,
  syncPath: string,
  enableCodeServer: boolean
): Record<string, string> {
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const accessKey = process.env.STORAGE_ACCESS_KEY_ID;
  const secretKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  const bucket = process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private';

  if (!endpoint || !accessKey || !secretKey) {
    throw new Error(
      'Missing required storage configuration: STORAGE_S3_ENDPOINT, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY must be set'
    );
  }

  return {
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_MINIO_ENDPOINT: endpoint,
    FASTGPT_MINIO_ACCESS_KEY: accessKey,
    FASTGPT_MINIO_SECRET_KEY: secretKey,
    FASTGPT_MINIO_BUCKET: bucket,
    FASTGPT_WORKDIR: syncPath,
    FASTGPT_SYNC_PATH: syncPath,
    FASTGPT_ENABLE_CODE_SERVER: enableCodeServer ? 'true' : 'false'
  };
}
