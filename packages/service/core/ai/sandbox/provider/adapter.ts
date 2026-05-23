import { serviceEnv } from '../../../../env';
import {
  createSandbox,
  type ISandbox,
  type ResourceLimits,
  type SandboxCreateSpec
} from '@fastgpt-sdk/sandbox-adapter';
import { getSandboxAdapterConfig, type SandboxProviderConfig } from './config';
import type { SandboxProviderType } from '../type';
import type { VolumeManagerResult } from '../volume/service';

function assertNever(value: never): never {
  throw new Error(`Unsupported sandbox provider: ${String(value)}`);
}

/**
 * 根据明确的 provider 配置构造底层 sandbox adapter。
 *
 * 这个函数只负责把 FastGPT 的 provider 配置转换成 SDK adapter，不访问数据库，
 * 也不执行 ensure/create/resume 等生命周期动作。
 */
export function buildSandboxAdapter(
  providerConfig: SandboxProviderConfig,
  props: {
    sandboxId: string;
    createConfig?: SandboxCreateSpec;
  }
): ISandbox {
  switch (providerConfig.provider) {
    case 'opensandbox':
      return createSandbox(
        'opensandbox',
        {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy,
          replaceDockerInternalWithLocalhost:
            serviceEnv.SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST,
          sessionId: props.sandboxId
        },
        props.createConfig
      );

    case 'sealosdevbox':
      return createSandbox(
        'sealosdevbox',
        {
          baseUrl: providerConfig.baseUrl,
          token: providerConfig.token,
          sandboxId: props.sandboxId
        },
        props.createConfig
      );

    case 'e2b':
      if (!providerConfig.apiKey) {
        throw new Error('AGENT_SANDBOX_E2B_API_KEY required');
      }
      return createSandbox('e2b', {
        apiKey: providerConfig.apiKey,
        sandboxId: props.sandboxId
      });

    default:
      return assertNever(providerConfig);
  }
}

/**
 * 构造当前运行态会话使用的 sandbox adapter。
 *
 * 运行态会话需要带 createConfig/volume/resourceLimits，因为 ensureAvailable 可能创建
 * 或恢复 sandbox；历史资源清理不要走这个入口。
 */
export function buildRuntimeSandboxAdapter(
  providerName: SandboxProviderType,
  sandboxId: string,
  opts: {
    resourceLimits?: ResourceLimits;
    vmConfig?: VolumeManagerResult | undefined;
    createConfig?: SandboxCreateSpec;
  } = {}
): ISandbox {
  const config = getSandboxAdapterConfig({
    provider: providerName,
    runtime: true,
    sessionId: sandboxId,
    resourceLimits: opts.resourceLimits,
    vmConfig: opts.vmConfig,
    createConfig: opts.createConfig
  });

  return buildSandboxAdapter(config.providerConfig, {
    sandboxId,
    createConfig: config.createConfig
  });
}

/**
 * 构造历史资源清理用的 adapter。
 *
 * 清理入口只按资源记录里的 provider/sandboxId 操作已有资源，不补运行态 createConfig，
 * 避免 stop/delete 反向依赖镜像、volume 或当前系统 provider。
 */
export function buildSandboxResourceAdapter(props: {
  provider: SandboxProviderType;
  sandboxId: string;
}): ISandbox {
  const config = getSandboxAdapterConfig({
    provider: props.provider
  });

  return buildSandboxAdapter(config.providerConfig, {
    sandboxId: props.sandboxId,
    createConfig: config.createConfig
  });
}
