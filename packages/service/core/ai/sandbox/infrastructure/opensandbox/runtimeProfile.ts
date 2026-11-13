/**
 * OpenSandbox 基础设施层：定义运行态 profile 与默认容器创建规格推导。
 */
import {
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  OPEN_SANDBOX_DEFAULT_ROOT_PATH
} from '@fastgpt/global/core/ai/sandbox/constants';
import { serviceEnv } from '../../../../../env';
import type { SandboxResourceLimitsType } from '../../type';
import type { SandboxCreateSpec } from './type';
import type { VolumeManagerResult } from '../volume/service';

type SandboxRuntimeCreateConfigInput = {
  image?: string;
  entrypoint?: string | string[];
  resourceLimits?: SandboxResourceLimitsType;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
  volumes?: SandboxCreateSpec['volumes'];
  vmConfig?: VolumeManagerResult | undefined;
  createConfig?: SandboxCreateSpec;
};

export type SandboxRuntimeProfile = {
  defaultImage?: string;
  workDirectory: string;
  homeDirectory: string;
};

const OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES = [
  { action: 'deny' as const, target: 'localhost' },
  { action: 'deny' as const, target: '127.0.0.0/8' },
  { action: 'deny' as const, target: '::1/128' },
  { action: 'deny' as const, target: '10.0.0.0/8' },
  { action: 'deny' as const, target: '100.64.0.0/10' },
  { action: 'deny' as const, target: '169.254.0.0/16' },
  { action: 'deny' as const, target: '172.16.0.0/12' },
  { action: 'deny' as const, target: '192.168.0.0/16' },
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

const mergeStringRecord = (
  base?: Record<string, string>,
  override?: Record<string, string>
): Record<string, string> | undefined => {
  const merged = { ...(base ?? {}), ...(override ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

const normalizeEntrypoint = (entrypoint?: string | string[]) => {
  if (!entrypoint) return undefined;
  const normalized = Array.isArray(entrypoint) ? entrypoint : [entrypoint];
  return normalized.length > 0 ? normalized : undefined;
};

function buildOpenSandboxNetworkPolicy(
  policy?: NonNullable<SandboxRuntimeCreateConfigInput['createConfig']>['networkPolicy']
) {
  const protectedTargets = new Set(
    OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES.map(({ target }) => target)
  );
  return {
    defaultAction: 'allow' as const,
    egress: [
      ...OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES,
      ...(policy?.egress?.filter(
        ({ action, target }) => action === 'deny' && (!target || !protectedTargets.has(target))
      ) ?? [])
    ]
  };
}

/**
 * 构建 FastGPT 运行态在 OpenSandbox 容器内约定的基础环境变量。
 *
 * - 固定 `HOME` 为 `/home/sandbox`，统一兼容 `nonroot` 与 `root` 镜像而无需启动后探测 `$HOME`；
 * - 不覆盖镜像自带 `PATH`，避免冲掉基础镜像预装工具路径（官方镜像已在 Dockerfile 预置 `.fastgpt/{python,npm,bun}/bin`）；
 * - 将用户态 Python (`PYTHONUSERBASE`)、Node (`NPM_CONFIG_PREFIX`) 与 Bun (`BUN_INSTALL`) 指向持久化 `.fastgpt` 目录（下载缓存保留在容器本地 `/tmp`）。
 */
export function buildBaseSandboxRuntimeEnv({
  sessionId,
  workDirectory,
  image
}: {
  sessionId: string;
  workDirectory: string;
  image?: string;
}): Record<string, string> {
  const normalizedWorkDir = workDirectory.replace(/\/+$/, '') || OPEN_SANDBOX_DEFAULT_ROOT_PATH;
  const pythonUserBase = `${normalizedWorkDir}/.fastgpt/python`;
  const npmPrefix = `${normalizedWorkDir}/.fastgpt/npm`;
  const bunInstall = `${normalizedWorkDir}/.fastgpt/bun`;
  const trimmedImage = image?.trim();

  return {
    HOME: OPEN_SANDBOX_DEFAULT_HOME_PATH,
    FASTGPT_SESSION_ID: sessionId,
    FASTGPT_WORKDIR: workDirectory,
    PYTHONUSERBASE: pythonUserBase,
    PIP_BREAK_SYSTEM_PACKAGES: '1',
    NPM_CONFIG_PREFIX: npmPrefix,
    BUN_INSTALL: bunInstall,
    BUN_INSTALL_CACHE_DIR: '/tmp/.bun-cache',
    ...(trimmedImage ? { FASTGPT_RUNTIME_IMAGE: trimmedImage } : {})
  };
}

/** 获取 OpenSandbox 的 FastGPT 运行态契约元数据。 */
export function getSandboxRuntimeProfile(): SandboxRuntimeProfile {
  return {
    defaultImage: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim() || undefined,
    workDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH,
    homeDirectory: OPEN_SANDBOX_DEFAULT_HOME_PATH
  };
}

const DEFAULT_OPEN_SANDBOX_EPHEMERAL_STORAGE_BUFFER_GI = 0.5;

/**
 * 计算 Kubernetes 运行态下容器可写层（ephemeral-storage）默认上限。
 * 默认按 `AGENT_SANDBOX_STORAGE_SIZE_GI + 0.5`（单位 Gi）预留运行期缓存缓冲；
 * 支持通过 `workspaceMultiplier` 放大工作区中转基数（例如 Devbox / S3 归档迁移临时容器按 `2 * AGENT_SANDBOX_STORAGE_SIZE_GI + 0.5` 计算）。
 */
export function getDefaultOpenSandboxEphemeralStorageSize(options?: {
  workspaceMultiplier?: number;
}): string {
  const workspaceMultiplier = options?.workspaceMultiplier ?? 1;
  const totalGi = Number(
    (
      serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI * workspaceMultiplier +
      DEFAULT_OPEN_SANDBOX_EPHEMERAL_STORAGE_BUFFER_GI
    ).toFixed(3)
  );
  return `${totalGi}Gi`;
}

/**
 * 推导 OpenSandbox 容器创建规格：合并默认镜像、资源配额/超售比、Docker 网络策略与 JuiceFS 持久卷。
 * 信任容器镜像自身的 `ENTRYPOINT` 与 `PATH`，仅在调用方显式指定 `entrypoint` 时才透传覆盖。
 */
export function buildOpenSandboxCreateConfig(
  input: SandboxRuntimeCreateConfigInput = {}
): SandboxCreateSpec {
  const defaultImage = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim() || undefined;
  const createConfig = input.createConfig ?? {};
  const isKubernetesRuntime = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'kubernetes';
  const {
    networkPolicy: requestedNetworkPolicy,
    resourceRequests: requestedResourceRequests,
    ...createConfigWithoutNetworkPolicy
  } = createConfig;
  const image = (input.image ?? createConfig.image ?? defaultImage)?.trim();
  if (!image) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE is required for OpenSandbox');
  }

  const deriveResourceRequests = (limits: {
    cpuCount: number;
    memoryMiB: number;
    ephemeralStorageSize?: string;
  }) => {
    const cpuFactor = serviceEnv.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR;
    const memoryFactor = serviceEnv.AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR;
    if (cpuFactor === 1 && memoryFactor === 1) return undefined;

    return {
      cpuCount:
        cpuFactor > 1
          ? Math.max(1, Math.floor((limits.cpuCount * 1000) / cpuFactor)) / 1000
          : limits.cpuCount,
      memoryMiB:
        memoryFactor > 1
          ? Math.max(1, Math.floor(limits.memoryMiB / memoryFactor))
          : limits.memoryMiB,
      ...(limits.ephemeralStorageSize !== undefined
        ? { ephemeralStorageSize: limits.ephemeralStorageSize }
        : {})
    };
  };

  const entrypoint = createConfig.entrypoint ?? normalizeEntrypoint(input.entrypoint);
  const ephemeralStorageSize = isKubernetesRuntime
    ? (input.resourceLimits?.ephemeralStorageSize ??
      createConfig.resourceLimits?.ephemeralStorageSize ??
      getDefaultOpenSandboxEphemeralStorageSize())
    : undefined;
  const resourceLimits = {
    cpuCount:
      input.resourceLimits?.cpuCount ??
      createConfig.resourceLimits?.cpuCount ??
      serviceEnv.AGENT_SANDBOX_CPU_COUNT,
    memoryMiB:
      input.resourceLimits?.memoryMiB ??
      createConfig.resourceLimits?.memoryMiB ??
      serviceEnv.AGENT_SANDBOX_MEMORY_MIB,
    ...(ephemeralStorageSize !== undefined ? { ephemeralStorageSize } : {})
  };
  const resourceRequests = isKubernetesRuntime
    ? requestedResourceRequests
      ? {
          ...(ephemeralStorageSize !== undefined ? { ephemeralStorageSize } : {}),
          ...requestedResourceRequests
        }
      : deriveResourceRequests(resourceLimits)
    : undefined;
  const env = mergeStringRecord(createConfig.env, input.env);
  const metadata = mergeStringRecord(createConfig.metadata, input.metadata);
  const volumes = input.volumes ?? input.vmConfig?.volumes ?? createConfig.volumes;
  const networkPolicy = isKubernetesRuntime
    ? undefined
    : buildOpenSandboxNetworkPolicy(requestedNetworkPolicy);

  return {
    ...createConfigWithoutNetworkPolicy,
    image,
    resourceLimits,
    ...(resourceRequests ? { resourceRequests } : {}),
    readyTimeoutSeconds: createConfig.readyTimeoutSeconds ?? 120,
    ...(entrypoint ? { entrypoint } : {}),
    ...(env ? { env } : {}),
    ...(metadata ? { metadata } : {}),
    ...(networkPolicy ? { networkPolicy } : {}),
    ...(volumes ? { volumes } : {})
  };
}
