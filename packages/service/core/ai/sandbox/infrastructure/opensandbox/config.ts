/**
 * OpenSandbox 基础设施层：解析连接配置与运行态创建配置。
 *
 * 只负责把环境变量转换成 OpenSandbox 客户端可用的配置，不执行远端生命周期动作。
 */
import { serviceEnv } from '../../../../../env';
import type { SandboxCreateSpec } from './type';
import type { VolumeManagerResult } from '../volume/service';
import {
  buildBaseSandboxRuntimeEnv,
  buildOpenSandboxCreateConfig,
  getSandboxRuntimeProfile
} from './runtimeProfile';

export type OpenSandboxClientConfig = {
  baseUrl: string;
  apiKey: string;
};

export type OpenSandboxRuntimeConfig = {
  clientConfig: OpenSandboxClientConfig;
  createConfig?: SandboxCreateSpec;
};

/** 校验 OpenSandbox 控制面地址与 API Key 已配置，未配置时阻止后续沙盒调用。 */
export function getOpenSandboxClientConfig(): OpenSandboxClientConfig {
  const baseUrl = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim() ?? '';
  if (!baseUrl) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL is required when Agent Sandbox is used');
  }

  const apiKey = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY?.trim() ?? '';
  if (!apiKey) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_API_KEY is required for OpenSandbox');
  }

  return { baseUrl, apiKey };
}

/**
 * 获取构造 OpenSandbox 客户端所需的完整配置。
 *
 * 运行态创建规格统一交给 `runtimeProfile` 推导。
 */
export function getOpenSandboxRuntimeConfig({
  runtime = false,
  resourceLimits,
  vmConfig,
  createConfig,
  sessionId
}: {
  runtime?: boolean;
  resourceLimits?: SandboxCreateSpec['resourceLimits'];
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateSpec;
  sessionId?: string;
} = {}): OpenSandboxRuntimeConfig {
  const clientConfig = getOpenSandboxClientConfig();
  const profile = getSandboxRuntimeProfile();
  const resolvedImage = (createConfig?.image ?? profile.defaultImage)?.trim() || undefined;
  const baseEnv =
    runtime && sessionId
      ? buildBaseSandboxRuntimeEnv({
          sessionId,
          workDirectory: profile.workDirectory,
          image: resolvedImage
        })
      : undefined;

  return {
    clientConfig,
    createConfig: runtime
      ? buildOpenSandboxCreateConfig({
          resourceLimits,
          vmConfig,
          createConfig,
          env: {
            ...createConfig?.env,
            ...baseEnv
          }
        })
      : undefined
  };
}
