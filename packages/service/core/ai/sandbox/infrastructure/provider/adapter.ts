/**
 * 沙盒原子层：构造不同 provider 的 SDK adapter。
 *
 * 只做 provider 配置到 SDK 入参的转换，不编排运行态、归档或数据库状态。
 */
import {
  createSandbox,
  type ISandbox,
  type ResourceLimits,
  type SandboxCreateSpec,
  type SandboxProviderType
} from '@fastgpt-sdk/sandbox-adapter';
import { getSandboxAdapterConfig, type SandboxProviderConfig } from './config';
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
    case 'opensandbox': {
      const createConfig = (() => {
        const spec = props.createConfig;
        if (!spec) return undefined;
        if (!spec.image) {
          throw new Error('OpenSandbox create config requires an image');
        }

        return {
          image: spec.image,
          entrypoint: spec.entrypoint,
          timeoutSeconds: spec.timeoutSeconds,
          resourceLimits: spec.resourceLimits,
          env: spec.env,
          metadata: spec.metadata,
          volumes: spec.volumes,
          networkPolicy: spec.networkPolicy,
          extensions: spec.extensions,
          skipHealthCheck: spec.skipHealthCheck,
          readyTimeoutSeconds: spec.readyTimeoutSeconds,
          healthCheckPollingInterval: spec.healthCheckPollingInterval
        };
      })();

      return createSandbox({
        provider: 'opensandbox',
        connectionConfig: {
          apiKey: providerConfig.apiKey,
          baseUrl: providerConfig.baseUrl,
          runtime: providerConfig.runtime,
          useServerProxy: providerConfig.useServerProxy,
          sessionId: props.sandboxId
        },
        createConfig
      });
    }

    case 'sealosdevbox': {
      const createConfig = props.createConfig
        ? {
            image: props.createConfig.image,
            env: props.createConfig.env,
            labels: props.createConfig.labels,
            lifecycle: props.createConfig.lifecycle,
            kubeAccess: props.createConfig.kubeAccess,
            workingDir: props.createConfig.workingDir,
            upstreamID: props.createConfig.upstreamID
          }
        : undefined;

      return createSandbox({
        provider: 'sealosdevbox',
        connectionConfig: {
          baseUrl: providerConfig.baseUrl,
          token: providerConfig.token,
          sandboxId: props.sandboxId
        },
        createConfig
      });
    }

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
