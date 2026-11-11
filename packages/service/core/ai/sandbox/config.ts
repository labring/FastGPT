/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只派生已在入口校验的系统配置，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 *
 * 所有字段以实例配置快照为唯一运行时来源；ENV 只在启动迁移时一次性 seed 进 DB。
 */
import { MB_BYTES, RESERVED_DISK_MB } from './constants';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';

type AgentSandboxInstanceConfig = ReturnType<
  typeof getSystemInstanceConfig
>['subservice']['agentSandbox'];

/** 实例配置中的 Agent Sandbox 域；运行期以该快照为唯一权威。 */
const getInstanceAgentSandboxConfig = (): AgentSandboxInstanceConfig =>
  getSystemInstanceConfig().subservice.agentSandbox;

/** 当前生效的 provider；none 表示未启用 Agent Sandbox。 */
export const getAgentSandboxProvider = (): 'none' | 'sealosdevbox' | 'opensandbox' =>
  getInstanceAgentSandboxConfig().provider;

/** 实例配置的公共资源与生命周期参数。 */
export const getAgentSandboxCommonConfig = () => {
  const common = getInstanceAgentSandboxConfig().common;

  return {
    cpuCount: common.cpuCount,
    memoryMiB: common.memoryMiB,
    storageSizeGi: common.storageSizeGi,
    suspendMinutes: common.suspendMinutes,
    archiveInactiveDays: common.archiveInactiveDays,
    entrypointTimeoutSeconds: common.entrypointTimeoutSeconds,
    wsMaxMessageBytes: common.wsMaxMessageBytes,
    wsMaxFrameBytes: common.wsMaxFrameBytes,
    npmRegistry: common.npmRegistry,
    pypiIndexUrl: common.pypiIndexUrl,
    aptMirror: common.aptMirror
  };
};

/** Sealos Devbox 连接配置。 */
export const getAgentSandboxSealosConfig = () => {
  const sealos = getInstanceAgentSandboxConfig().sealosdevbox;

  return {
    baseUrl: sealos.baseUrl,
    token: sealos.token,
    workDirectory: sealos.workDirectory,
    image: sealos.image
  };
};

/** OpenSandbox 连接配置。 */
export const getAgentSandboxOpenSandboxConfig = () => {
  const opensandbox = getInstanceAgentSandboxConfig().opensandbox;

  return {
    baseUrl: opensandbox.baseUrl,
    apiKey: opensandbox.apiKey,
    runtime: opensandbox.runtime,
    image: opensandbox.image,
    useServerProxy: opensandbox.useServerProxy,
    volumeManagerUrl: opensandbox.volumeManagerUrl,
    volumeManagerToken: opensandbox.volumeManagerToken,
    volumeNamePrefix: opensandbox.volumeNamePrefix
  };
};

/** 获取 Agent sandbox 磁盘基准字节数，按存储容量换算并预留 150MB。 */
export const getAgentSandboxDiskBytes = () => {
  const storageMB = getAgentSandboxCommonConfig().storageSizeGi * 1024;
  const diskMB = Math.round(storageMB / 2 - RESERVED_DISK_MB);
  if (diskMB <= 0) {
    throw new Error(`Agent Sandbox storage size must be greater than ${RESERVED_DISK_MB * 2} MiB`);
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
 * undefined 表示不限制。
 */
export const getAgentSandboxMax = (): number | undefined =>
  getInstanceAgentSandboxConfig().common.maxEditDebug;

/**
 * 获取单团队 Agent sandbox 活跃实例配额；undefined 表示不限制。
 * null 是实例配置的显式「不限量」语义，不能再回落成其它来源的配额。
 */
export const getAgentSandboxMaxPerTeam = (): number | undefined =>
  getInstanceAgentSandboxConfig().common.maxPerTeam ?? undefined;
