/**
 * 沙盒原子层：定义 OpenSandbox 的运行态 profile。
 *
 * 只负责 OpenSandbox createConfig 映射，不连接远端实例。
 */
import { serviceEnv } from '../../../../../../env';
import type { SandboxRuntimeProfile } from './types';
import { getSandboxSkillsRootPath, mergeStringRecord, normalizeEntrypoint } from './utils';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH, parseImageSpec } from '@fastgpt-sdk/sandbox-adapter';

const OPEN_SANDBOX_ENTRYPOINT = '/home/sandbox/entrypoint.sh';
const OPEN_SANDBOX_DOCKER_LOCAL_NETWORK_POLICY = {
  defaultAction: 'allow' as const,
  egress: [
    { action: 'deny' as const, target: 'localhost' },
    { action: 'deny' as const, target: 'host.docker.internal' },
    { action: 'deny' as const, target: 'host.orb.internal' },
    { action: 'deny' as const, target: 'docker.orb.internal' },
    { action: 'deny' as const, target: 'gateway.orb.internal' },
    { action: 'deny' as const, target: 'proxyproxy.orb.internal' },
    { action: 'deny' as const, target: '*.orb.internal' },
    { action: 'deny' as const, target: '*.orb.local' }
  ]
};

/**
 * 构建 OpenSandbox 的 FastGPT 运行态 profile。
 *
 * OpenSandbox 需要在 createConfig 中显式注入镜像、入口脚本、资源限制和 volume。
 */
export function buildOpenSandboxRuntimeProfile(): SandboxRuntimeProfile {
  const workDirectory = OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  const defaultImage = (() => {
    const image = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim();
    if (image) return parseImageSpec(image);

    const repository = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO?.trim() ?? '';
    if (!repository) return { repository };
    return {
      repository,
      tag: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG?.trim() || 'latest'
    };
  })();

  return {
    provider: 'opensandbox',
    defaultImage,
    workDirectory,
    entrypoint: OPEN_SANDBOX_ENTRYPOINT,
    skillsRootPath: getSandboxSkillsRootPath(workDirectory),
    buildConfig(input = {}) {
      // OpenSandbox create 必须带镜像；调用方显式传入的镜像优先，其次才使用运行态默认镜像。
      const createConfig = input.createConfig ?? {};
      const image = input.image ?? createConfig.image ?? defaultImage;
      if (!image?.repository) {
        throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE is required for opensandbox provider');
      }

      const entrypoint = createConfig.entrypoint ?? normalizeEntrypoint(input.entrypoint);
      const storageLimit = (() => {
        if (input.resourceLimits?.storageSize !== undefined) {
          return { storageSize: input.resourceLimits.storageSize };
        }
        if (createConfig.resourceLimits?.storageSize !== undefined) {
          return { storageSize: createConfig.resourceLimits.storageSize };
        }
        return {};
      })();
      const resourceLimits = {
        cpuCount:
          input.resourceLimits?.cpuCount ??
          createConfig.resourceLimits?.cpuCount ??
          serviceEnv.AGENT_SANDBOX_CPU_COUNT,
        memoryMiB:
          input.resourceLimits?.memoryMiB ??
          createConfig.resourceLimits?.memoryMiB ??
          serviceEnv.AGENT_SANDBOX_MEMORY_MIB,
        ...storageLimit
      };
      const env = mergeStringRecord(createConfig.env, input.env);
      const metadata = mergeStringRecord(createConfig.metadata, input.metadata);
      // volume 既可能来自 volume manager，也可能来自调用方透传的 createConfig；运行态 VM 配置优先。
      const volumes = input.volumes ?? input.vmConfig?.volumes ?? createConfig.volumes;
      // Docker 模式下默认拒绝常见宿主机别名；公网默认保持放行，私网 CIDR 需依赖部署网络边界。
      const networkPolicy =
        createConfig.networkPolicy ??
        (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_DISABLE_NETWORK_POLICY &&
        serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker'
          ? OPEN_SANDBOX_DOCKER_LOCAL_NETWORK_POLICY
          : undefined);

      return {
        ...createConfig,
        image,
        resourceLimits,
        readyTimeoutSeconds: createConfig.readyTimeoutSeconds ?? 120,
        ...(entrypoint ? { entrypoint } : {}),
        ...(env ? { env } : {}),
        ...(metadata ? { metadata } : {}),
        ...(networkPolicy ? { networkPolicy } : {}),
        ...(volumes ? { volumes } : {})
      };
    }
  };
}
