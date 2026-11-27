/**
 * OpenSandbox 基础设施层：解析连接配置与运行态创建配置。
 *
 * 只负责把环境变量转换成 OpenSandbox 客户端可用的配置，不执行远端生命周期动作。
 */
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { getAgentSandboxOpenSandboxConfig } from '../../config';
import type { Volume } from '@alibaba-group/opensandbox';
import type { ImageSpec, OpenSandboxRuntime, ResourceLimits, SandboxCreateSpec } from './type';
import { buildBaseSandboxRuntimeEnv, buildOpenSandboxCreateConfig } from './runtimeProfile';

export type OpenSandboxClientConfig = {
  baseUrl: string;
  apiKey: string;
  runtime: OpenSandboxRuntime;
  useServerProxy: boolean;
};

export type OpenSandboxRuntimeConfig = {
  clientConfig: OpenSandboxClientConfig;
  image: ImageSpec;
  createConfig: SandboxCreateSpec & { image: ImageSpec };
};

const resolveOpenSandboxClientConfig = (
  opensandbox: ReturnType<typeof getAgentSandboxOpenSandboxConfig>
): OpenSandboxClientConfig => {
  if (!opensandbox.baseUrl) {
    throw new Error('OpenSandbox baseUrl is required when Agent Sandbox is enabled');
  }
  if (!opensandbox.apiKey) {
    throw new Error('OpenSandbox apiKey is required when Agent Sandbox is enabled');
  }

  return {
    baseUrl: opensandbox.baseUrl,
    apiKey: opensandbox.apiKey,
    runtime: opensandbox.runtime,
    useServerProxy: opensandbox.useServerProxy
  };
};

/**
 * 读取 OpenSandbox 控制面连接配置，未启用 Agent Sandbox 时阻止后续沙盒调用。
 *
 * 实例配置为运行时唯一来源，不再直接读取环境变量。
 */
export function getOpenSandboxClientConfig(): OpenSandboxClientConfig {
  return resolveOpenSandboxClientConfig(getAgentSandboxOpenSandboxConfig());
}

/**
 * 获取构造运行态 OpenSandbox 客户端所需的连接配置、目标镜像与容器创建规格。
 */
export function getOpenSandboxRuntimeConfig({
  resourceLimits,
  volumes,
  createConfig
}: {
  resourceLimits?: ResourceLimits;
  volumes?: Volume[];
  createConfig?: SandboxCreateSpec;
} = {}): OpenSandboxRuntimeConfig {
  const opensandboxConfig = getAgentSandboxOpenSandboxConfig();
  const clientConfig = resolveOpenSandboxClientConfig(opensandboxConfig);

  const targetCreateConfig = buildOpenSandboxCreateConfig({
    opensandboxConfig,
    resourceLimits,
    volumes,
    createConfig,
    env: {
      ...buildBaseSandboxRuntimeEnv({
        workDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH
      }),
      ...createConfig?.env
    }
  });

  return {
    clientConfig,
    image: targetCreateConfig.image,
    createConfig: targetCreateConfig
  };
}
