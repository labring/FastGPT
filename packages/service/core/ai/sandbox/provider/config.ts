import { serviceEnv } from '../../../../env';
import type { SandboxCreateSpec, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { VolumeManagerResult } from '../volume/service';
import { getSandboxRuntimeProfile } from '../runtime/profile';

type SandboxRuntime = 'kubernetes' | 'docker';

export type OpenSandboxProviderConfig = {
  provider: 'opensandbox';
  baseUrl: string;
  apiKey: string;
  runtime: SandboxRuntime;
  useServerProxy?: boolean;
};

export type SealosDevboxProviderConfig = {
  provider: 'sealosdevbox';
  baseUrl: string;
  token: string;
};

export type E2BProviderConfig = {
  provider: 'e2b';
  apiKey: string;
};

export type SandboxProviderConfig =
  | OpenSandboxProviderConfig
  | SealosDevboxProviderConfig
  | E2BProviderConfig;

export type SandboxCreateConfig = SandboxCreateSpec;

export type SandboxAdapterConfig = {
  providerConfig: SandboxProviderConfig;
  createConfig?: SandboxCreateConfig;
};

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

/**
 * 获取当前或指定 provider 的连接配置。
 *
 * 这个入口只返回 provider 认证和连接信息，不包含运行态 createConfig；
 * 适合权限校验、历史资源查询等只需要 provider 名称的场景。
 */
export function getSandboxProviderConfig(
  provider: SandboxProviderType = serviceEnv.AGENT_SANDBOX_PROVIDER
): SandboxProviderConfig {
  return getSandboxAdapterConfig({ provider }).providerConfig;
}

/**
 * 校验 provider 连接配置是否足够构造 adapter。
 *
 * 启动运行态和清理历史资源都会经过这层校验，错误应直接暴露为环境配置问题。
 */
export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (config.provider !== 'e2b' && !config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (config.provider === 'opensandbox' && !['kubernetes', 'docker'].includes(config.runtime)) {
    throw new Error(`Invalid runtime: ${config.runtime}`);
  }

  if (config.provider === 'opensandbox' && !config.apiKey) {
    throw new Error('Sandbox provider apiKey is required for opensandbox');
  }

  if (config.provider === 'sealosdevbox' && !config.token) {
    throw new Error('Sandbox provider token is required for sealosdevbox');
  }

  if (config.provider === 'e2b' && !config.apiKey) {
    throw new Error('Sandbox provider apiKey is required for e2b');
  }
}

/**
 * 获取构造 sandbox adapter 所需的完整配置。
 *
 * 这里只处理 provider 连接配置和校验；运行态 createConfig 统一交给
 * SandboxRuntimeProfile.buildConfig，避免这里再散落 provider 运行时分支。
 */
export function getSandboxAdapterConfig({
  provider = serviceEnv.AGENT_SANDBOX_PROVIDER,
  runtime = false,
  resourceLimits,
  vmConfig,
  createConfig,
  sessionId
}: {
  provider?: SandboxProviderType;
  runtime?: boolean;
  resourceLimits?: SandboxCreateSpec['resourceLimits'];
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateConfig;
  sessionId?: string;
} = {}): SandboxAdapterConfig {
  switch (provider) {
    case 'opensandbox': {
      const providerConfig: OpenSandboxProviderConfig = {
        provider,
        baseUrl: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL ?? '',
        apiKey: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ?? '',
        runtime: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
        useServerProxy: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY
      };
      validateSandboxConfig(providerConfig);

      return {
        providerConfig,
        createConfig: runtime
          ? getSandboxRuntimeProfile(provider).buildConfig({
              resourceLimits,
              vmConfig,
              createConfig
            })
          : undefined
      };
    }

    case 'sealosdevbox': {
      const providerConfig: SealosDevboxProviderConfig = {
        provider,
        baseUrl: serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL ?? '',
        token: serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN ?? ''
      };
      validateSandboxConfig(providerConfig);

      return {
        providerConfig,
        createConfig: runtime
          ? getSandboxRuntimeProfile(provider).buildConfig({
              createConfig,
              sessionId
            })
          : undefined
      };
    }

    case 'e2b': {
      const providerConfig: E2BProviderConfig = {
        provider,
        apiKey: serviceEnv.AGENT_SANDBOX_E2B_API_KEY ?? ''
      };
      validateSandboxConfig(providerConfig);

      return {
        providerConfig,
        createConfig: runtime
          ? getSandboxRuntimeProfile(provider).buildConfig({
              createConfig
            })
          : undefined
      };
    }

    default:
      return assertNever(provider);
  }
}
