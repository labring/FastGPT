/**
 * Sandbox 领域共享配置派生。
 *
 * 这里只把已校验的环境配置换算为领域使用的字节限制，不依赖 interface、application
 * 或 infrastructure，供各层单向引用。
 */
import { serviceEnv } from '../../../env';

const MB_BYTES = 1024 * 1024;
const toRoundedMBBytes = (mb: number) => Math.round(mb) * MB_BYTES;

/** 获取 Agent sandbox 磁盘基准字节数，按 MB 四舍五入。 */
export const getAgentSandboxDiskBytes = () => toRoundedMBBytes(serviceEnv.AGENT_SANDBOX_DISK_MB);

/** 获取 sandbox 冷归档包大小上限，等于磁盘基准。 */
export const getAgentSandboxArchiveMaxBytes = getAgentSandboxDiskBytes;

/** 获取运行中 sandbox 自动暂停前允许的未活跃分钟数。 */
export const getAgentSandboxSuspendMinutes = () => serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES;

/** 获取已暂停 sandbox 自动归档前允许的未活跃天数。 */
export const getAgentSandboxArchiveInactiveDays = () =>
  serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS;

/** 获取 Skill 包大小上限，按磁盘基准的一半四舍五入。 */
export const getAgentSandboxSkillMaxBytes = () =>
  toRoundedMBBytes(serviceEnv.AGENT_SANDBOX_DISK_MB * 0.5);

/** 获取 IDE 单文件大小上限，复用 Skill 包大小上限。 */
export const getAgentSandboxMaxFileBytes = getAgentSandboxSkillMaxBytes;
