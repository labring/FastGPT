/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只把已校验的环境配置换算为领域使用的字节限制，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 */
import { serviceEnv } from '../../../env';

const MB_BYTES = 1024 * 1024;
const RESERVED_DISK_MB = 150;

/** 获取 Agent sandbox 磁盘基准字节数，按存储容量换算并预留 150MB。 */
export const getAgentSandboxDiskBytes = () => {
  const storageMB = serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI * 1024;
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
export const getAgentSandboxSuspendMinutes = () => serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES;

/** 获取已暂停 sandbox 自动归档前允许的未活跃天数。 */
export const getAgentSandboxArchiveInactiveDays = () =>
  serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS;

/** 获取 Skill 包大小上限，等于磁盘基准。 */
export const getAgentSandboxSkillMaxBytes = getAgentSandboxDiskBytes;

/** 获取 IDE 单文件大小上限，等于磁盘基准。 */
export const getAgentSandboxMaxFileBytes = getAgentSandboxDiskBytes;

/** 判定管理台配置值是否生效：只接受正数，避免空值/0 意外收紧配额。 */
const resolveConfiguredLimit = (configured: number | undefined, envLimit: number | undefined) =>
  typeof configured === 'number' && configured > 0 ? configured : envLimit;

/**
 * 获取 Agent sandbox 活跃实例系统总上限（app 会话与技能编辑共用同一计数池）。
 * 系统配置（管理台 feConfigs.limit）优先，env 兜底；undefined 表示不限制。
 */
export const getAgentSandboxMax = (): number | undefined =>
  resolveConfiguredLimit(global.feConfigs?.limit?.agentSandboxMax, serviceEnv.AGENT_SANDBOX_MAX);

/**
 * 获取单团队 Agent sandbox 活跃实例配额；系统配置优先、env 兜底，undefined 表示不限制。
 */
export const getAgentSandboxMaxPerTeam = (): number | undefined =>
  resolveConfiguredLimit(
    global.feConfigs?.limit?.agentSandboxMaxPerTeam,
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM
  );
