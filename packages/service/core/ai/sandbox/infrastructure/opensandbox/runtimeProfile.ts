/**
 * OpenSandbox 基础设施层：定义运行态 profile 与默认容器创建规格推导。
 */
import {
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  OPEN_SANDBOX_DEFAULT_ROOT_PATH
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SANDBOX_WS_MAX_FRAME_BYTES, SANDBOX_WS_MAX_MESSAGE_BYTES } from '../../constants';
import {
  getAgentSandboxCommonConfig,
  getAgentSandboxDiskBytes,
  getAgentSandboxOpenSandboxConfig
} from '../../config';
import { joinSandboxPath } from '../../utils';
import type { Volume } from '@alibaba-group/opensandbox';
import { SANDBOX_PROVIDER, type SandboxProviderType } from '../../type';
import type { ImageSpec, ResourceLimits, SandboxCreateSpec } from './type';
import { parseImageSpec } from './utils';

const OPEN_SANDBOX_ENTRYPOINT = '/usr/local/bin/entrypoint.sh';

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

const SANDBOX_STATIC_RUNTIME_PATHS = {
  workDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH,
  homeDirectory: OPEN_SANDBOX_DEFAULT_HOME_PATH,
  skillsRootPath: joinSandboxPath(OPEN_SANDBOX_DEFAULT_ROOT_PATH, 'skills'),
  builtinSkillsRootPath: joinSandboxPath(OPEN_SANDBOX_CONTAINER_RUNTIME_DIR, 'skills')
} as const;

export type SandboxRuntimeProfile = {
  provider: SandboxProviderType;
  defaultImage: ImageSpec;
  workDirectory: string;
  homeDirectory: string;
  entrypoint: string;
  skillsRootPath: string;
  builtinSkillsRootPath: string;
};

export type SandboxRuntimeCreateConfigInput = {
  opensandboxConfig?: ReturnType<typeof getAgentSandboxOpenSandboxConfig>;
  resourceLimits?: ResourceLimits;
  /** 覆盖 `createConfig.env` 的环境变量。 */
  env?: Record<string, string>;
  volumes?: Volume[];
  createConfig?: SandboxCreateSpec;
};

/** 读取不依赖部署镜像配置、无副作用的容器静态路径约定。 */
export const getSandboxStaticRuntimePaths = () => SANDBOX_STATIC_RUNTIME_PATHS;

/** 将 `createConfig.image`（字符串或结构化规格）规整为 `ImageSpec`，未指定时回退到默认镜像。 */
const resolveImageSpec = (
  image: string | ImageSpec | undefined,
  fallback: ImageSpec
): ImageSpec => {
  if (typeof image === 'string') {
    const trimmed = image.trim();
    return trimmed ? parseImageSpec(trimmed) : fallback;
  }
  return image?.repository ? image : fallback;
};

function buildOpenSandboxNetworkPolicy(policy?: SandboxCreateSpec['networkPolicy']) {
  const protectedTargets = new Set(
    OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES.map(({ target }) => target)
  );
  return {
    // 公网默认放行；调用方仅可追加 deny 规则，不得篡改或绕过平台内置内网封禁规则。
    defaultAction: 'allow' as const,
    egress: [
      ...OPEN_SANDBOX_PROTECTED_NETWORK_DENY_RULES,
      ...(policy?.egress?.filter(
        ({ action, target }) => action === 'deny' && (!target || !protectedTargets.has(target))
      ) ?? [])
    ]
  };
}

/** 获取 OpenSandbox 运行态 profile（含当前配置默认镜像）。 */
export function getSandboxRuntimeProfile(): SandboxRuntimeProfile {
  const defaultImage = parseImageSpec(getAgentSandboxOpenSandboxConfig().image.trim());

  return {
    provider: SANDBOX_PROVIDER,
    defaultImage,
    ...SANDBOX_STATIC_RUNTIME_PATHS,
    entrypoint: OPEN_SANDBOX_ENTRYPOINT
  };
}

/**
 * 构建 FastGPT 运行态在 OpenSandbox 容器内约定的基础环境变量。
 *
 * - 注入容器临时层运行态目录与 `fastgpt-ide-agent` WebSocket/单文件上限；
 * - 仅在 Docker 运行时注入 `FASTGPT_DISK_SOFT_LIMIT_BYTES` 开启卷容量软限制与终端 `RLIMIT_FSIZE`，
 *   Kubernetes 下不注入并交由原生 PVC 控制；
 * - 设置 `HOME`、`FASTGPT_WORKDIR`、`PIP_BREAK_SYSTEM_PACKAGES=1` 与 `PIP_NO_CACHE_DIR=1`。
 */
export function buildBaseSandboxRuntimeEnv({
  workDirectory = OPEN_SANDBOX_DEFAULT_ROOT_PATH,
  ideAgentMaxFileBytes = getAgentSandboxDiskBytes(),
  ideAgentWsLimits = {
    maxMessageBytes: SANDBOX_WS_MAX_MESSAGE_BYTES,
    maxFrameBytes: SANDBOX_WS_MAX_FRAME_BYTES
  }
}: {
  workDirectory?: string;
  ideAgentMaxFileBytes?: number;
  ideAgentWsLimits?: {
    maxMessageBytes: number;
    maxFrameBytes: number;
  };
} = {}): Record<string, string> {
  const normalizedWorkDir = workDirectory.replace(/\/+$/, '') || OPEN_SANDBOX_DEFAULT_ROOT_PATH;

  return {
    HOME: OPEN_SANDBOX_DEFAULT_HOME_PATH,
    FASTGPT_WORKDIR: normalizedWorkDir,
    FASTGPT_RUNTIME_DIR: OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
    FASTGPT_IDE_MAX_FILE_BYTES: String(ideAgentMaxFileBytes),
    ...(getAgentSandboxOpenSandboxConfig().runtime === 'docker'
      ? { FASTGPT_DISK_SOFT_LIMIT_BYTES: String(ideAgentMaxFileBytes) }
      : {}),
    FASTGPT_IDE_WS_MAX_MESSAGE_BYTES: String(ideAgentWsLimits.maxMessageBytes),
    FASTGPT_IDE_WS_MAX_FRAME_BYTES: String(ideAgentWsLimits.maxFrameBytes),
    PIP_BREAK_SYSTEM_PACKAGES: '1',
    PIP_NO_CACHE_DIR: '1'
  };
}

/**
 * 推导 OpenSandbox 容器创建规格，显式补齐入口脚本、资源限制/超售请求和网络策略。
 *
 * - entrypoint 默认使用 `/usr/local/bin/entrypoint.sh`，位于系统目录不受 `/home/sandbox` 挂卷覆盖；
 * - Kubernetes 下不下发 `ephemeral-storage`（由集群侧自行控制），仅在配置了 CPU/内存超售倍数时下发对应 `resourceRequests`；
 * - Kubernetes 下不下发 `networkPolicy`（交由 Helm `CiliumNetworkPolicy` 统一隔离，避免触发 `NET_ADMIN` sidecar）。
 */
export function buildOpenSandboxCreateConfig(
  input: SandboxRuntimeCreateConfigInput = {}
): SandboxCreateSpec & { image: ImageSpec } {
  const opensandboxConfig = input.opensandboxConfig ?? getAgentSandboxOpenSandboxConfig();
  const commonConfig = getAgentSandboxCommonConfig();
  const createConfig = input.createConfig ?? {};
  const isKubernetesRuntime = opensandboxConfig.runtime === 'kubernetes';
  const {
    networkPolicy: requestedNetworkPolicy,
    resourceRequests: requestedResourceRequests,
    ...createConfigWithoutPolicies
  } = createConfig;

  const resolvedImage = resolveImageSpec(
    createConfig.image,
    parseImageSpec(opensandboxConfig.image.trim())
  );
  if (!resolvedImage.repository) {
    throw new Error('OpenSandbox image is required when Agent Sandbox is enabled');
  }

  const deriveResourceRequests = (limits: { cpuCount: number; memoryMiB: number }) => {
    const cpuFactor = opensandboxConfig.cpuOvercommitFactor;
    const memoryFactor = opensandboxConfig.memoryOvercommitFactor;
    if (cpuFactor === 1 && memoryFactor === 1) {
      return undefined;
    }

    return {
      cpuCount:
        cpuFactor > 1
          ? Math.max(1, Math.floor((limits.cpuCount * 1000) / cpuFactor)) / 1000
          : limits.cpuCount,
      memoryMiB:
        memoryFactor > 1
          ? Math.max(1, Math.floor(limits.memoryMiB / memoryFactor))
          : limits.memoryMiB
    };
  };

  const entrypoint = createConfig.entrypoint ?? [OPEN_SANDBOX_ENTRYPOINT];

  const cpuCount =
    input.resourceLimits?.cpuCount ??
    createConfig.resourceLimits?.cpuCount ??
    commonConfig.cpuCount;
  const memoryMiB =
    input.resourceLimits?.memoryMiB ??
    createConfig.resourceLimits?.memoryMiB ??
    commonConfig.memoryMiB;

  const resourceLimits: ResourceLimits = {
    cpuCount,
    memoryMiB
  };

  const resourceRequests = isKubernetesRuntime
    ? (requestedResourceRequests ??
      deriveResourceRequests({
        cpuCount,
        memoryMiB
      }))
    : undefined;

  const env = input.env || createConfig.env ? { ...createConfig.env, ...input.env } : undefined;
  const volumes = input.volumes ?? createConfig.volumes;
  const networkPolicy = isKubernetesRuntime
    ? undefined
    : buildOpenSandboxNetworkPolicy(requestedNetworkPolicy);

  return {
    ...createConfigWithoutPolicies,
    image: resolvedImage,
    readyTimeoutSeconds: createConfig.readyTimeoutSeconds ?? 120,
    resourceLimits,
    ...(resourceRequests ? { resourceRequests } : {}),
    entrypoint,
    ...(env ? { env } : {}),
    ...(networkPolicy ? { networkPolicy } : {}),
    ...(volumes ? { volumes } : {})
  };
}
