/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只派生已在入口校验的系统配置和环境配置，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 */
import { MB_BYTES, RESERVED_DISK_MB } from './constants';
import { serviceEnv } from '../../../env';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/controller';

type AgentSandboxInstanceConfig = ReturnType<
  typeof getSystemInstanceConfig
>['subservice']['agentSandbox'];

/** 实例配置中的 Agent Sandbox 域；运行期以该快照为唯一权威。 */
const getInstanceAgentSandboxConfig = (): AgentSandboxInstanceConfig =>
  getSystemInstanceConfig().subservice.agentSandbox;

/**
 * 当前生效的 provider。
 * 快照 provider 为 none 时回落 env：迁移完成前快照仍是默认值，旧部署靠 env 启动；
 * 迁移会把 env provider 写入实例配置，之后以快照为准。
 */
export const getAgentSandboxProvider = (): 'none' | 'sealosdevbox' | 'opensandbox' => {
  const configured = getInstanceAgentSandboxConfig().provider;
  if (configured === 'sealosdevbox' || configured === 'opensandbox') return configured;
  return serviceEnv.AGENT_SANDBOX_PROVIDER ?? 'none';
};

/**
 * 实例配置的公共资源与生命周期参数。
 * Schema 默认值在快照中恒存在；叶子缺省只出现在启动早期或测试种子，此时回落 env。
 */
export const getAgentSandboxCommonConfig = () => {
  const common = getInstanceAgentSandboxConfig().common;

  return {
    cpuCount: common.cpuCount ?? serviceEnv.AGENT_SANDBOX_CPU_COUNT,
    memoryMiB: common.memoryMiB ?? serviceEnv.AGENT_SANDBOX_MEMORY_MIB,
    storageSizeGi: common.storageSizeGi ?? serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI,
    suspendMinutes: common.suspendMinutes ?? serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES,
    archiveInactiveDays:
      common.archiveInactiveDays ?? serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS,
    entrypointTimeoutSeconds:
      common.entrypointTimeoutSeconds ?? serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS,
    wsMaxMessageBytes: common.wsMaxMessageBytes ?? serviceEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES,
    wsMaxFrameBytes: common.wsMaxFrameBytes ?? serviceEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES,
    // 使用 ?? 而不是 ||：管理员显式清空后不能再用 env 的旧值复活
    npmRegistry: common.npmRegistry ?? serviceEnv.AGENT_SANDBOX_NPM_REGISTRY,
    pypiIndexUrl: common.pypiIndexUrl ?? serviceEnv.AGENT_SANDBOX_PYPI_INDEX_URL,
    aptMirror: common.aptMirror ?? serviceEnv.AGENT_SANDBOX_APT_MIRROR
  };
};

/** Sealos Devbox 连接配置；实例配置优先，叶子缺省时回落 env。 */
export const getAgentSandboxSealosConfig = () => {
  const sealos = getInstanceAgentSandboxConfig().sealosdevbox;

  return {
    baseUrl: sealos.baseUrl ?? serviceEnv.AGENT_SANDBOX_SEALOS_BASEURL ?? '',
    token: sealos.token ?? serviceEnv.AGENT_SANDBOX_SEALOS_TOKEN ?? '',
    workDirectory:
      sealos.workDirectory ??
      serviceEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY ??
      '/home/devbox/workspace',
    image: sealos.image ?? serviceEnv.AGENT_SANDBOX_SEALOS_IMAGE
  };
};

/** OpenSandbox 连接配置；实例配置优先，叶子缺省时回落 env。 */
export const getAgentSandboxOpenSandboxConfig = () => {
  const opensandbox = getInstanceAgentSandboxConfig().opensandbox;

  return {
    baseUrl: opensandbox.baseUrl ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL ?? '',
    apiKey: opensandbox.apiKey ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ?? '',
    runtime: opensandbox.runtime ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
    image: opensandbox.image ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
    useServerProxy:
      opensandbox.useServerProxy ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY,
    volumeManagerUrl:
      opensandbox.volumeManagerUrl ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL,
    volumeManagerToken:
      opensandbox.volumeManagerToken ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN,
    volumeNamePrefix:
      opensandbox.volumeNamePrefix ?? serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX
  };
};

/** 获取 Agent sandbox 磁盘基准字节数，按存储容量换算并预留 150MB。 */
export const getAgentSandboxDiskBytes = () => {
  const storageMB = getAgentSandboxCommonConfig().storageSizeGi * 1024;
  const diskMB = Math.round(storageMB / 2 - RESERVED_DISK_MB);
  if (diskMB <= 0) {
    throw new Error(
      `AGENT_SANDBOX_STORAGE_SIZE_GI must be greater than ${RESERVED_DISK_MB * 2}MiB`
    );
  }
  return diskMB * MB_BYTES;
};

/** 获取 sandbox 冷归档包大小上限，等于磁盘基准。 */
export const getAgentSandboxArchiveMaxBytes = getAgentSandboxDiskBytes;

/** 获取运行中 sandbox 自动暂停前允许的未活跃分钟数。 */
export const getAgentSandboxSuspendMinutes = () => getAgentSandboxCommonConfig().suspendMinutes;

/** 获取已暂停 sandbox 自动归档前允许的未活跃天数。 */
export const getAgentSandboxArchiveInactiveDays = () =>
  getAgentSandboxCommonConfig().archiveInactiveDays;

/** 获取 Skill 包大小上限，等于磁盘基准。 */
export const getAgentSandboxSkillMaxBytes = getAgentSandboxDiskBytes;

/** 获取 IDE 单文件大小上限，等于磁盘基准。 */
export const getAgentSandboxMaxFileBytes = getAgentSandboxDiskBytes;

/**
 * 获取 Agent sandbox 活跃实例系统总上限（app 会话与技能编辑共用同一计数池）。
 * 服务端系统配置（管理台 systemEnv）优先，env 兜底；undefined 表示不限制。
 */
export const getAgentSandboxMax = (): number | undefined =>
  global.systemEnv?.agentSandboxMax ?? serviceEnv.AGENT_SANDBOX_MAX;

/**
 * 获取单团队 Agent sandbox 活跃实例配额；系统配置优先、env 兜底，undefined 表示不限制。
 *
 * null 是实例配置的显式"不限量"语义：必须在这里止住，不能再被 ?? 回落成 env 配额。
 */
export const getAgentSandboxMaxPerTeam = (): number | undefined => {
  const configured = global.systemEnv?.agentSandboxMaxPerTeam;
  if (configured === null) return undefined;
  return configured ?? serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM;
};
