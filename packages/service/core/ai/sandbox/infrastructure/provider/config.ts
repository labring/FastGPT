/**
 * 沙盒原子层：解析 provider 连接配置和创建配置。
 *
 * 只负责把实例配置转换成 adapter 可用的配置，不执行远端生命周期动作。
 */
import {
  getAgentSandboxCommonConfig,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxOpenSandboxConfig,
  getAgentSandboxProvider,
  getAgentSandboxSealosConfig
} from '../../config';
import type { SandboxCreateSpec, SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import type { VolumeManagerResult } from '../volume/service';
import { getSandboxRuntimeProfile } from './runtimeProfile';
import { buildBaseSandboxRuntimeEnv } from './runtimeProfile/utils';

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

export type SandboxProviderConfig = OpenSandboxProviderConfig | SealosDevboxProviderConfig;

export type SandboxCreateConfig = SandboxCreateSpec;

export type SandboxAdapterConfig = {
  providerConfig: SandboxProviderConfig;
  createConfig?: SandboxCreateConfig;
};

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

export function getConfiguredSandboxProvider(): SandboxProviderType {
  const provider = getAgentSandboxProvider();
  if (provider === 'none') {
    throw new Error('Configure the provider in Agent Sandbox admin settings before using it');
  }
  return provider;
}

/**
 * 获取当前或指定 provider 的连接配置。
 *
 * 这个入口只返回 provider 认证和连接信息，不包含运行态 createConfig；
 * 适合权限校验、历史资源查询等只需要 provider 名称的场景。
 */
export function getSandboxProviderConfig(
  provider: SandboxProviderType = getConfiguredSandboxProvider()
): SandboxProviderConfig {
  return getSandboxAdapterConfig({ provider }).providerConfig;
}

/**
 * 校验 provider 连接配置是否足够构造 adapter。
 *
 * 启动运行态和清理历史资源都会经过这层校验，错误应直接暴露为环境配置问题。
 */
export function validateSandboxConfig(config: SandboxProviderConfig): void {
  if (!config.baseUrl) {
    throw new Error('Sandbox provider base URL is required');
  }

  if (config.provider === 'opensandbox' && !config.apiKey) {
    throw new Error('Sandbox provider apiKey is required for opensandbox');
  }

  if (config.provider === 'sealosdevbox' && !config.token) {
    throw new Error('Sandbox provider token is required for sealosdevbox');
  }
}

/**
 * 获取构造 sandbox adapter 所需的完整配置。
 *
 * 这里只处理 provider 连接配置和校验；运行态 createConfig 统一交给
 * SandboxRuntimeProfile.buildConfig，避免这里再散落 provider 运行时分支。
 */
export function getSandboxAdapterConfig({
  provider = getConfiguredSandboxProvider(),
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
  const profile = getSandboxRuntimeProfile(provider);
  const common = getAgentSandboxCommonConfig();
  const baseEnv =
    runtime && sessionId
      ? buildBaseSandboxRuntimeEnv({
          sessionId,
          workDirectory: profile.workDirectory,
          ideAgentMaxFileBytes: getAgentSandboxMaxFileBytes(),
          ideAgentWsLimits: {
            maxMessageBytes: common.wsMaxMessageBytes,
            maxFrameBytes: common.wsMaxFrameBytes
          }
        })
      : undefined;

  switch (provider) {
    case 'opensandbox': {
      const opensandbox = getAgentSandboxOpenSandboxConfig();
      const providerConfig: OpenSandboxProviderConfig = {
        provider,
        baseUrl: opensandbox.baseUrl,
        apiKey: opensandbox.apiKey,
        runtime: opensandbox.runtime,
        useServerProxy: opensandbox.useServerProxy
      };
      validateSandboxConfig(providerConfig);

      return {
        providerConfig,
        createConfig: runtime
          ? profile.buildConfig({
              resourceLimits,
              vmConfig,
              createConfig,
              entrypoint: createConfig?.entrypoint ?? (profile.entrypoint || undefined),
              env: {
                ...createConfig?.env,
                ...baseEnv
              }
            })
          : undefined
      };
    }

    case 'sealosdevbox': {
      const sealos = getAgentSandboxSealosConfig();
      const providerConfig: SealosDevboxProviderConfig = {
        provider,
        baseUrl: sealos.baseUrl,
        token: sealos.token
      };
      validateSandboxConfig(providerConfig);

      return {
        providerConfig,
        createConfig: runtime
          ? profile.buildConfig({
              createConfig,
              sessionId,
              resourceLimits,
              env: {
                ...createConfig?.env,
                ...baseEnv
              }
            })
          : undefined
      };
    }

    default:
      return assertNever(provider);
  }
}
