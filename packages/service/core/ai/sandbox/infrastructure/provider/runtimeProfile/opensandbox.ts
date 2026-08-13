/**
 * 沙盒原子层：定义 OpenSandbox 的运行态 profile。
 *
 * 只负责 OpenSandbox createConfig 映射，不连接远端实例。
 */
import { serviceEnv } from '../../../../../../env';
import type { SandboxRuntimeCreateConfigInput, SandboxRuntimeProfile } from './types';
import { getSandboxSkillsRootPath, mergeStringRecord, normalizeEntrypoint } from './utils';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH, parseImageSpec } from '@fastgpt-sdk/sandbox-adapter';

const OPEN_SANDBOX_ENTRYPOINT = '/home/sandbox/entrypoint.sh';
const OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES = [
  { action: 'deny' as const, target: 'localhost' },
  { action: 'deny' as const, target: '127.0.0.0/8' },
  { action: 'deny' as const, target: '::1/128' },
  { action: 'deny' as const, target: '10.0.0.0/8' },
  { action: 'deny' as const, target: '100.64.0.0/10' },
  { action: 'deny' as const, target: '169.254.0.0/16' },
  { action: 'deny' as const, target: '172.16.0.0/12' },
  { action: 'deny' as const, target: '192.168.0.0/16' },
  { action: 'deny' as const, target: '198.18.0.0/15' },
  { action: 'deny' as const, target: '224.0.0.0/4' },
  { action: 'deny' as const, target: 'fc00::/7' },
  { action: 'deny' as const, target: 'fe80::/10' },
  { action: 'deny' as const, target: '*.local' },
  { action: 'deny' as const, target: 'host.docker.internal' },
  { action: 'deny' as const, target: 'host.orb.internal' },
  { action: 'deny' as const, target: 'docker.orb.internal' },
  { action: 'deny' as const, target: 'gateway.orb.internal' },
  { action: 'deny' as const, target: 'proxyproxy.orb.internal' },
  { action: 'deny' as const, target: '*.orb.internal' },
  { action: 'deny' as const, target: '*.orb.local' }
];

const OPEN_SANDBOX_NETWORK_POLICY = {
  defaultAction: 'allow' as const,
  egress: OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES
};

/** Keep internal network targets denied while allowing all unmatched public destinations. */
function buildOpenSandboxNetworkPolicy(
  policy?: NonNullable<SandboxRuntimeCreateConfigInput['createConfig']>['networkPolicy']
) {
  const protectedTargets = new Set(
    OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES.map(({ target }) => target)
  );

  return {
    // Public egress is intentionally open. Create callers may add deny rules, but
    // cannot replace the platform default with deny or override protected targets.
    defaultAction: OPEN_SANDBOX_NETWORK_POLICY.defaultAction,
    egress: [
      ...OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES,
      ...(policy?.egress?.filter(
        ({ action, target }) => action === 'deny' && !protectedTargets.has(target)
      ) ?? [])
    ]
  };
}

/**
 * 构建 OpenSandbox 的 FastGPT 运行态 profile。
 *
 * OpenSandbox 需要在 createConfig 中显式注入镜像、入口脚本、资源限制和 volume。
 */
export function buildOpenSandboxRuntimeProfile(): SandboxRuntimeProfile {
  const workDirectory = OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  const defaultImage = parseImageSpec(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim());

  return {
    provider: 'opensandbox',
    defaultImage,
    workDirectory,
    entrypoint: OPEN_SANDBOX_ENTRYPOINT,
    skillsRootPath: getSandboxSkillsRootPath(workDirectory),
    buildConfig(input = {}) {
      // OpenSandbox create 必须带镜像；调用方显式传入的镜像优先，其次才使用运行态默认镜像。
      const createConfig = input.createConfig ?? {};
      const isKubernetesRuntime = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes';
      const { networkPolicy: requestedNetworkPolicy, ...createConfigWithoutNetworkPolicy } =
        createConfig;
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
      // Kubernetes Sandbox Pod 由 Helm 管理的 CiliumNetworkPolicy 隔离；不能向 OpenSandbox
      // 透传 networkPolicy，否则会重新注入需要额外权限的 egress sidecar。
      const networkPolicy = isKubernetesRuntime
        ? undefined
        : buildOpenSandboxNetworkPolicy(requestedNetworkPolicy);

      return {
        ...createConfigWithoutNetworkPolicy,
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
